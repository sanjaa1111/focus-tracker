
import express from "express";
import cors from "cors";
import webpush from "web-push";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:focus-tracker@example.com";

function initialDB(){
  return { vapid: null, devices: {}, sent: {} };
}
function loadDB(){
  try{
    fs.mkdirSync(DATA_DIR,{recursive:true});
    if(!fs.existsSync(DATA_FILE)) return initialDB();
    return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
  }catch{
    return initialDB();
  }
}
let db = loadDB();

function saveDB(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db,null,2));
  fs.renameSync(tmp,DATA_FILE);
}

if(!db.vapid){
  const keys = webpush.generateVAPIDKeys();
  db.vapid = {publicKey:keys.publicKey, privateKey:keys.privateKey};
  saveDB();
}
webpush.setVapidDetails(VAPID_SUBJECT, db.vapid.publicKey, db.vapid.privateKey);

const app = express();
app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health",(req,res)=>res.json({
  ok:true,
  service:"focus-tracker-one-url",
  time:new Date().toISOString(),
  devices:Object.keys(db.devices).length
}));

app.get("/api/vapid-public-key",(req,res)=>res.json({publicKey:db.vapid.publicKey}));

function deviceIdFor(subscription){
  return crypto.createHash("sha256").update(subscription.endpoint).digest("hex").slice(0,24);
}

app.post("/api/subscribe",(req,res)=>{
  const {subscription,timezone} = req.body || {};
  if(!subscription?.endpoint) return res.status(400).json({error:"subscription required"});
  const id = deviceIdFor(subscription);
  db.devices[id] = {
    subscription,
    timezone: timezone || "UTC",
    schedule: db.devices[id]?.schedule || [],
    reminderMinutes: Number(db.devices[id]?.reminderMinutes ?? 10),
    updatedAt: Date.now()
  };
  saveDB();
  res.json({ok:true,deviceId:id});
});

app.post("/api/unsubscribe",(req,res)=>{
  const endpoint = req.body?.endpoint;
  if(endpoint){
    const id = deviceIdFor({endpoint});
    delete db.devices[id];
    saveDB();
  }
  res.json({ok:true});
});

app.post("/api/schedule",(req,res)=>{
  const {tasks,timezone,reminderMinutes=10} = req.body || {};
  const subscription = req.body?.subscription;
  let id = subscription?.endpoint ? deviceIdFor(subscription) : req.body?.deviceId;
  if(!id || !db.devices[id]) return res.status(400).json({error:"subscribe first"});
  if(!Array.isArray(tasks)) return res.status(400).json({error:"tasks must be array"});
  db.devices[id].schedule = tasks;
  db.devices[id].timezone = timezone || db.devices[id].timezone || "UTC";
  db.devices[id].reminderMinutes = Math.max(0,Number(reminderMinutes)||0);
  db.devices[id].updatedAt = Date.now();
  saveDB();
  res.json({ok:true,deviceId:id,count:tasks.length});
});

app.post("/api/test",async(req,res)=>{
  let sent=0, removed=0;
  for(const [id,device] of Object.entries(db.devices)){
    try{
      await webpush.sendNotification(
        device.subscription,
        JSON.stringify({
          title:"🔔 Focus Tracker",
          body:"Push notification ажиллаж байна.",
          tag:"focus-test"
        })
      );
      sent++;
    }catch(err){
      if(err.statusCode===404 || err.statusCode===410){
        delete db.devices[id]; removed++;
      }
    }
  }
  saveDB();
  res.json({ok:true,sent,removed});
});

function zonedParts(timezone){
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone:timezone, year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(now);
  const clockParts = new Intl.DateTimeFormat("en-GB", {
    timeZone:timezone, hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  }).formatToParts(now);
  const get=(parts,type)=>parts.find(p=>p.type===type)?.value || "";
  return {
    date:`${get(dateParts,"year")}-${get(dateParts,"month")}-${get(dateParts,"day")}`,
    hour:Number(get(clockParts,"hour")),
    minute:Number(get(clockParts,"minute"))
  };
}

function addDays(isoDate, delta){
  const [y,m,d]=isoDate.split("-").map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  dt.setUTCDate(dt.getUTCDate()+delta);
  return dt.toISOString().slice(0,10);
}

async function schedulerTick(){
  const minuteNow=Math.floor(Date.now()/60000);
  for(const [id,device] of Object.entries(db.devices)){
    const tz=device.timezone || "UTC";
    const p=zonedParts(tz);
    const today=p.date;
    const currentMinute=p.hour*60+p.minute;
    const rm=Math.max(0,Number(device.reminderMinutes)||0);
    for(const task of (device.schedule||[])){
      if(!task?.date || !task?.time) continue;
      let [h,m]=task.time.split(":").map(Number);
      let target=h*60+m-rm;
      let targetDate=task.date;
      while(target<0){target+=1440; targetDate=addDays(targetDate,-1);}
      while(target>=1440){target-=1440; targetDate=addDays(targetDate,1);}
      if(targetDate!==today || target!==currentMinute) continue;

      const sendKey=`${id}|${task.date}|${task.time}|${task.name}|${rm}`;
      if(db.sent[sendKey]) continue;

      try{
        await webpush.sendNotification(
          device.subscription,
          JSON.stringify({
            title:"⏰ Focus Tracker",
            body:`${task.time} — ${task.name}`,
            tag:`focus-${task.date}-${task.time}`,
            data:{url:"/"}
          })
        );
        db.sent[sendKey]=minuteNow;
      }catch(err){
        if(err.statusCode===404 || err.statusCode===410){
          delete db.devices[id];
        }
      }
    }
  }
  // Keep sent cache small.
  const cutoff=minuteNow-60*24*31;
  for(const [k,v] of Object.entries(db.sent)){
    if(v<cutoff) delete db.sent[k];
  }
  saveDB();
}

setInterval(()=>schedulerTick().catch(()=>{}),15000);
schedulerTick().catch(()=>{});

// SPA/PWA fallback
app.get("*",(req,res)=>{
  if(req.path.startsWith("/api/")) return res.status(404).end();
  res.sendFile(path.join(PUBLIC_DIR,"index.html"));
});

app.listen(PORT,()=>console.log(`Focus Tracker V6 running on port ${PORT}`));
