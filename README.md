# my-browser

منسّق ملفات تعريف متصفح بسيط مبني على Electron، مقتصر على ما تحتاجه فعليًا:

- عمليات CRUD للملفات الشخصية (إنشاء / قائمة / تحديث / حذف)
- تشغيل / إيقاف / حالة كل ملف شخصي (كل واحد هو Chromium منفصل مع `--user-data-dir` خاص به)
- عمليات CRUD للوكيل مع ترحيل تلقائي للوكلاء الذين يتطلبون مصادقة (عبر `proxy-chain`)
- واجهة HTTP API على `127.0.0.1:50326`
- نافذة لوحة تحكم صغيرة (عارض Electron)؛ يمكن التشغيل بدون واجهة أيضًا
- تبديل النواة لكل ملف شخصي — وجّهها إلى أي نسخة Chrome / Chromium / Edge لديك

هذا المجلد يضم نواة Chrome 152 (`kernel/chrome_152/SunBrowser.exe`) وواجهة GUI. التوثيق الكامل لاستدعاء API بالعربية موجود في `[APIالوثائق.md](./APIالوثائق.md)`.

`chrome.dll` (~306MB) **ليس داخل المستودع**. صفحة GitHub ترفض رفع أي ملف أكبر من 25MB، لذلك يُنشر كملف مرفق في **Releases**. بعد التنزيل ضعه هنا:

`kernel/chrome_152/152.0.7977.54/chrome.dll`

بدون هذا الملف لن يعمل المتصفح.

## البدء السريع

```cmd
:: تثبيت مرة واحدة
npm install

:: مع نافذة لوحة التحكم
npm start

:: أو بدون واجهة (واجهة API فقط، بدون GUI)
npm run start:nogui

:: أو حتى بدون Electron، Node.js فقط
npm run api
```

ستكون واجهة API على `http://127.0.0.1:50326`.

## الإعداد (متغيرات البيئة)


| المتغير          | الافتراضي                                 | الغرض                                                       |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `MYADS_PORT`     | `50326`                                   | منفذ API                                                    |
| `MYADS_HOST`     | `127.0.0.1`                               | عنوان الربط                                                 |
| `MYADS_TOKEN`    | *فارغ*                                    | إن وُجد، يجب أن يرسل كل طلب `Authorization: Bearer <token>` |
| `MYADS_DATA_DIR` | `<repo>\data`                             | مكان مجلدات بيانات الملفات الشخصية و`store.json`            |
| `MYADS_KERNEL`   | `<repo>\kernel\chrome_152\SunBrowser.exe` | مسار ملف النواة الافتراضي                                   |


يمكن للملف الشخصي تجاوز النواة عبر حقل `kernel`. أمثلة:

- `C:\Program Files\Google\Chrome\Application\chrome.exe` — Chrome النظام (تم التحقق من عمله)
- `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` — Edge
- أي Chromium محمول / Ungoogled-Chromium / Brave تشحنه بنفسك

في هذا المجلد تُحل نواة `152` تلقائيًا إلى `kernel/chrome_152/SunBrowser.exe`.

## مرجع API

### الصحة

- `GET /status` → `{ code:0, data: { version } }`

### الملفات الشخصية

- `GET  /api/v1/browser/list?page=1&page_size=50&q=&group=`
- `POST /api/v1/browser/create`
  ```json
  {
    "name": "shop-account-1",
    "group": "default",
    "remark": "",
    "kernel": null,
    "kernel_version": "152",
    "proxy_id": null,
    "fingerprint": { "lang": "en-US", "user_agent": "...", "window_size": "1280,800" },
    "tabs": ["https://example.com"]
  }
  ```
- `POST /api/v1/browser/update` — نفس الشكل، و`id` إلزامي
- `POST /api/v1/browser/delete` — `{ "ids": ["k…","k…"] }`

### التحكم في المتصفح

- `GET /api/v1/browser/start?id=<id>` — يُرجع `wsEndpoint` الحي
- `GET /api/v1/browser/stop?id=<id>&force=0`
- `GET /api/v1/browser/stop-all`
- `GET /api/v1/browser/active` — قائمة قيد التشغيل
- `GET /api/v1/browser/active/one?id=<id>`

مثال استجابة التشغيل:

```json
{
  "code": 0, "msg": "success",
  "data": {
    "profile_id": "kact99ka",
    "pid": 2076,
    "ws": {
      "puppeteer": "ws://127.0.0.1:5127/devtools/browser/49e8…",
      "selenium":  "127.0.0.1:5127"
    },
    "debug_port": "5127",
    "user_data_dir": "<repo>\\data\\profiles\\kact99ka"
  }
}
```

ثم:

```js
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(wsEndpoint);
```

### الوكلاء

- `GET  /api/v1/proxy/list`
- `POST /api/v1/proxy/create`
  ```json
  { "type": "socks5", "host": "1.2.3.4", "port": "1080", "user": "x", "password": "y", "remark": "" }
  ```
- `POST /api/v1/proxy/update` — `id` إلزامي
- `POST /api/v1/proxy/delete` — `{ "ids": [] }`

عندما يكون للملف الشخصي `proxy_id`، يستخدم المشغّل `[proxy-chain](https://www.npmjs.com/package/proxy-chain)` لإنشاء ترحيل HTTP محلي بلا مصادقة يشير إلى الوكيل العلوي، ويُمرَّر عنوان هذا الترحيل فقط إلى Chromium عبر `--proxy-server=`. هذا يسمح لـ Chrome باستخدام وكلاء http/https/socks5 بمصادقة، رغم أن Chrome نفسه لا يقبل مصادقة الوكيل في سطر الأوامر.

التوثيق التفصيلي بالعربية: `[APIالوثائق.md](./APIالوثائق.md)`.

## البنية

```
┌─────────────────────────────────────────────────────────────────────┐
│  electron main (src/main.js)                                        │
│  ─ http api server (express, src/api.js)        :50326              │
│  ─ json store (src/store.js)                   data/store.json      │
│  ─ launcher (src/launcher.js)                                       │
│  ─ small dashboard window (renderer/index.html, optional)           │
└─────────────────────────────────────────────────────────────────────┘
                            │ child_process.spawn
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  N × Chromium / Chrome / Edge processes                             │
│  each with its own --user-data-dir = data/profiles/<profile_id>     │
│  --remote-debugging-port=0  (chromium picks; we read from stderr)   │
│  optional --proxy-server=<proxy-chain anonymized URL>               │
└─────────────────────────────────────────────────────────────────────┘
```

`data/store.json` هو المصدر الوحيد للحقيقة للملفات الشخصية والوكلاء. `data/profiles/<id>/` هو مجلد بيانات Chromium الدائم لكل ملف شخصي (ملفات تعريف الارتباط / localStorage / الإضافات / ذاكرة التظليل / كل شيء).

## تشغيل `SunBrowser.exe`

1. يتطلّب SunBrowser علامة سطر أوامر `--extended-parameters=<token>`
2. الرمز هو `JSON.stringify(config)` مرمّز باستبدال أبجدية base64 مخصصة
3. يشير الإعداد إلى 5 ملفات دعم يجب أن تكون موجودة (StaticConfig و DynamicConfig و CookiesFile و WebGLFP و CustomIcon)
4. لا حاجة لعملية خارجية أو توقيعات — تُولَّد الملفات محليًا

يكشف المشغّل (`src/launcher.js`) تلقائيًا عندما تكون النواة `SunBrowser.exe` ويستدعي `src/sun_token.js` لتوليد الرمز وملفات الدعم.

### معاملات البصمة (تُضبط في كائن `fingerprint` للملف الشخصي)


| الحقل                  | حقل StaticConfig          | مثال                     |
| ---------------------- | ------------------------- | ------------------------ |
| `canvas_mark`          | CanvasMark + CanvasMarkEx | `"5070"`                 |
| `webgl_mark`           | WebGLMark + WebGLMarkEx   | `"5577"`                 |
| `audio_fp`             | AudioFp                   | `1712`                   |
| `hardware_concurrency` | HardwareConcurrency       | `16`                     |
| `device_memory`        | DeviceMemory              | `16`                     |
| `timezone`             | TimeZone                  | `"America/Los_Angeles"`  |
| `geoposition`          | Geoposition               | `"37.77,-122.42,1000"`   |
| `webgl_vendor`         | ملف WebGLFP               | `"Google Inc. (NVIDIA)"` |
| `webgl_renderer`       | ملف WebGLFP               | `"ANGLE (NVIDIA, ...)"`  |
| `platform`             | Platform                  | `"Win32"` أو `"iPhone"`  |
| `lang`                 | `--lang=`                 | `"en-US"`                |
| `accept_lang`          | AcceptLang                | `["en-US","en"]`         |
| `user_agent`           | `--user-agent=`           | سلسلة UA كاملة           |
| `disable_webrtc`       | DisableWebRTC             | `true` (افتراضي)         |
| `client_rect_fp`       | ClientRectFp              | `-115`                   |


## الملفات

```
.
├─ package.json
├─ README.md
├─ APIالوثائق.md             وثائق استدعاء API
├─ .gitignore
├─ renderer\
│  └─ index.html             واجهة لوحة التحكم
├─ src\
│  ├─ main.js                نقطة دخول Electron (يشغّل API والنافذة)
│  ├─ headless.js            تشغيل API بدون Electron
│  ├─ api.js                 واجهة HTTP عبر express
│  ├─ launcher.js            تشغيل / إيقاف / تنظيم proxy-chain
│  ├─ sun_token.js           توليد رمز تشغيل SunBrowser
│  ├─ store.js               مخزن JSON ذري
│  ├─ config.js              متغيرات البيئة والمسارات
│  └─ util.js                أدوات مساعدة صغيرة
├─ kernel\
│  └─ chrome_152\            نواة Chrome 152 (SunBrowser.exe)
└─ data\                     يُنشأ عند أول تشغيل؛ مستبعد من git
   ├─ store.json
   └─ profiles\<id>\         مجلد بيانات Chromium لكل ملف شخصي
```

## ما هو غير موجود عمدًا

أمور تُركت عمدًا:

- حساب / مزامنة سحابية — كل شيء محلي
- مجموعات أوسع من حقل نصي واحد (`group`) — أضف واجهة لاحقًا إن أردت
- وسوم / تصنيفات / RPA / متجر إضافات / مزامنة ملفات تعريف الارتباط
- تخصيص بصمة معقّد يتجاوز مفاتيح سطر الأوامر البسيطة (UA، اللغة، حجم النافذة، accept-lang). النواة تتولى العمل الثقيل، لذا هذا محدود بطبيعته
- واجهة ويب متعددة المستخدمين (لوحة التحكم لمستخدم واحد وجهاز واحد)

إن كانت أي من هذه مهمة، يسهل بناؤها فوق واجهة API الحالية — المخزن JSON عادي، والمشغّل مباشر.