# FOCUS TRACKER V6 — ONE URL

Энэ хувилбарын зорилго:
- Web app + Push Server = НЭГ URL
- Гар утасны системийн цаг
- “Дууссан” = оноо автоматаар нэмэгдэнэ
- Эхлэх цагаас 10 минут өнгөрвөл бүртгэл хаалттай
- Өмнөх өдрүүдийн мэдээлэл хадгална
- Өдөр/7 хоног/сар статистик
- HSK4 → HSK5 120 хоног
- HTTPS Web Push + түгжээтэй үед notification

## Ажиллуулах
Node.js 18+:

    npm install
    npm start

Дараа нь:
    http://localhost:8787

## HTTPS / Production
Түгжээтэй үед Web Push ажиллуулахын тулд app-аа HTTPS URL дээр байршуулна.
Жишээ:
    https://your-focus-app.example

Тэр URL-ээс л app, /api/*, /sw.js, manifest бүгд ажиллана.
Frontend дээр Push Server URL тусдаа оруулах шаардлагагүй.

## Тогтвортой хадгалалт
Server-ийн VAPID key, push subscription, schedule data нь `data/data.json`-д хадгалагдана.
Production host дээр `DATA_DIR`-ийг persistent storage руу зааж өгөөрэй.
Жишээ:
    DATA_DIR=/data

## Утас дээр
1. HTTPS URL-ээ Chrome/Safari-аар нээ.
2. Add to Home Screen.
3. Тохиргоо → “Push асаах” → Allow.
4. “Хуваарь синк”.
5. “Test” дарж notification шалга.

## Яагаад сервер хэрэгтэй вэ?
Утасны browser хаалттай эсвэл дэлгэц түгжээтэй үед web page өөрөө цаг барьж чадахгүй.
Push server нь цагийг сервер дээр шалгаж, Web Push илгээдэг.
