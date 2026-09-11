# وثائق DeepBrowser HTTP API

**العنوان الأساسي (Base URL)**: `http://127.0.0.1:50326`

**المصادقة**: إذا تم تعيين متغير البيئة `MYADS_TOKEN`، يجب أن تتضمن جميع الطلبات الترويسة: `Authorization: Bearer <token>`

**صيغة الاستجابة العامة**:
```json
{
  "code": 0,       // 0 = نجاح، غير 0 = فشل
  "msg": "success",
  "data": { ... }
}
```

---

## المحتويات

- [فحص الصحة](#فحص-الصحة)
- [إدارة الملف الشخصي (Profile)](#إدارة-الملف-الشخصي-profile)
  - [القائمة](#القائمة)
  - [الإنشاء](#الإنشاء)
  - [التحديث](#التحديث)
  - [الحذف](#الحذف)
- [التحكم في المتصفح](#التحكم-في-المتصفح)
  - [التشغيل](#التشغيل)
  - [الإيقاف](#الإيقاف)
  - [إيقاف الكل](#إيقاف-الكل)
  - [قائمة المتصفحات قيد التشغيل](#قائمة-المتصفحات-قيد-التشغيل)
  - [الاستعلام عن حالة واحدة](#الاستعلام-عن-حالة-واحدة)
- [إدارة الوكيل](#إدارة-الوكيل)
  - [قائمة الوكلاء](#قائمة-الوكلاء)
  - [إنشاء وكيل](#إنشاء-وكيل)
  - [تحديث وكيل](#تحديث-وكيل)
  - [حذف وكيل](#حذف-وكيل)
- [مرجع حقول fingerprint](#مرجع-حقول-fingerprint)
- [أمثلة الاستخدام](#أمثلة-الاستخدام)

---

## فحص الصحة

### `GET /status`

التحقق مما إذا كانت واجهة API متصلة وتعمل.

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": { "version": "0.1.0" }
}
```

---

## إدارة الملف الشخصي (Profile)

### القائمة

#### `GET /api/v1/browser/list`

**المعاملات** (Query String):

| المعامل | النوع | الافتراضي | الوصف |
|---|---|---|---|
| `page` | int | 1 | رقم الصفحة |
| `page_size` | int | 50 | عدد العناصر في الصفحة (الحد الأقصى 200) |
| `q` | string | - | كلمة البحث (تطابق `name` أو `id`) |
| `group` | string | - | التصفية حسب المجموعة |

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": "khwseajh",
        "name": "shop-account-1",
        "group": "default",
        "remark": "",
        "kernel": null,
        "kernel_version": "148",
        "proxy_id": null,
        "fingerprint": { ... },
        "tabs": ["https://www.browserscan.net/"],
        "cookies": null,
        "created_at": 1780918908336,
        "updated_at": 1780918908336,
        "running": false
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 50
  }
}
```

---

### الإنشاء

#### `POST /api/v1/browser/create`

**جسم الطلب** (JSON):

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| `name` | string | لا | اسم الملف الشخصي؛ إن تُرك فارغًا يُستخدم المعرّف التلقائي |
| `group` | string | لا | المجموعة، الافتراضي `"default"` |
| `remark` | string | لا | ملاحظة |
| `kernel_version` | string | لا | إصدار النواة `"146"` أو `"148"` أو `"152"`؛ إن تُرك فارغًا يُستخدم الافتراضي |
| `proxy_id` | string | لا | معرّف الوكيل المرتبط؛ `null` = اتصال مباشر |
| `fingerprint` | object | لا | إعدادات بصمة المتصفح (انظر مرجع الحقول أدناه) |
| `tabs` | string[] | لا | قائمة عناوين URL التي تُفتح عند التشغيل |
| `cookies` | object[] | لا | ملفات تعريف الارتباط التي تُحقَن عند التشغيل (صيغة CDP) |

**مثال الطلب**:
```json
{
  "name": "shop-account-1",
  "kernel_version": "152",
  "fingerprint": {
    "lang": "en-US",
    "accept_lang": "en-US,en;q=0.9",
    "platform": "Win32",
    "vendor": "Google Inc.",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "screen_resolution": "1920x1080",
    "hardware_concurrency": 8,
    "device_memory": 16,
    "canvas_mark": "5070",
    "webgl_mark": "5577",
    "audio_fp": 3052,
    "webgl_vendor": "Google Inc. (NVIDIA)",
    "webgl_renderer": "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001B83) Direct3D11 vs_5_0 ps_5_0, D3D11-23.21.13.9135)",
    "block_images": false,
    "block_autoplay": true,
    "mute_audio": false,
    "block_translate": true,
    "block_password_popup": true,
    "block_notifications": true,
    "block_clipboard": true
  },
  "tabs": ["https://www.browserscan.net/"],
  "cookies": [
    {"name": "session", "value": "abc123", "domain": ".example.com", "path": "/"}
  ]
}
```

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "k3tn8vl3",
    "name": "shop-account-1",
    "group": "default",
    "kernel_version": "152",
    "fingerprint": { ... },
    "tabs": ["https://www.browserscan.net/"],
    "created_at": 1780919940905,
    "updated_at": 1780919940905
  }
}
```

---

### التحديث

#### `POST /api/v1/browser/update`

**جسم الطلب** (JSON):

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| `id` | string | **نعم** | معرّف الملف الشخصي |
| بقية الحقول كما في الإنشاء | - | لا | أرسل فقط الحقول المراد تعديلها |

**مثال الطلب**:
```json
{
  "id": "k3tn8vl3",
  "name": "new-name",
  "fingerprint": { "lang": "zh-CN" }
}
```

**الاستجابة**: نفس صيغة الإنشاء، وتُرجع كائن الملف الشخصي الكامل بعد التحديث.

---

### الحذف

#### `POST /api/v1/browser/delete`

يحذف الملف الشخصي ويمسح مجلد `data/profiles/<id>/` المقابل. إذا كان المتصفح قيد التشغيل فسيتم إيقافه بالقوة أولًا.

**جسم الطلب**:
```json
{ "ids": ["k3tn8vl3", "k9abc123"] }
```

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": { "removed": ["k3tn8vl3", "k9abc123"] }
}
```

---

## التحكم في المتصفح

### التشغيل

#### `GET /api/v1/browser/start?id=<profile_id>`

يشغّل نسخة متصفح. يُرجع نقطة نهاية WebSocket للتصحيح، ويمكن لـ Playwright / Puppeteer الاتصال بها.

**المعامل**: `id` (Query String، إلزامي)

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "profile_id": "k3tn8vl3",
    "pid": 50888,
    "ws": {
      "puppeteer": "ws://127.0.0.1:10056/devtools/browser/00779295-1992-4ca9-9baf-7c1c63021e22",
      "selenium": "127.0.0.1:10056"
    },
    "debug_port": "10056",
    "user_data_dir": "<repo>\\data\\profiles\\k3tn8vl3"
  }
}
```

**السلوك التلقائي**:
- إذا لم يُضبط `timezone` في fingerprint، يُستنتج تلقائيًا من عنوان IP للخروج (أو IP الوكيل) مع خط الطول والعرض
- إذا كان هناك `proxy_id` مرتبط، يُنشأ تلقائيًا وكيل ترحيل محلي بلا مصادقة عبر `proxy-chain`
- إذا وُجد حقل `cookies`، تُحقَن ملفات تعريف الارتباط تلقائيًا عبر CDP بعد التشغيل

---

### الإيقاف

#### `GET /api/v1/browser/stop?id=<profile_id>`

**المعاملات**:

| المعامل | النوع | الوصف |
|---|---|---|
| `id` | string | معرّف الملف الشخصي |
| `force` | "0"/"1" | `1` = إنهاء قسري بـ SIGKILL |

**الاستجابة**:
```json
{ "code": 0, "msg": "success", "data": { "stopped": true, "id": "k3tn8vl3" } }
```

---

### إيقاف الكل

#### `GET /api/v1/browser/stop-all`

يوقف جميع نسخ المتصفح قيد التشغيل.

**الاستجابة**:
```json
{ "code": 0, "msg": "success", "data": { "stopped": ["k3tn8vl3", "khwseajh"] } }
```

---

### قائمة المتصفحات قيد التشغيل

#### `GET /api/v1/browser/active`

يُرجع معلومات جميع المتصفحات قيد التشغيل.

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "profile_id": "k3tn8vl3",
        "pid": 50888,
        "ws": "ws://127.0.0.1:10056/devtools/browser/...",
        "debug_port": "10056",
        "started_at": 1780919947931
      }
    ]
  }
}
```

---

### الاستعلام عن حالة واحدة

#### `GET /api/v1/browser/active/one?id=<profile_id>`

**الاستجابة (قيد التشغيل)**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "running": true,
    "id": "k3tn8vl3",
    "pid": 50888,
    "ws": { "puppeteer": "ws://...", "selenium": "127.0.0.1:10056" },
    "debug_port": "10056",
    "started_at": 1780919947931
  }
}
```

**الاستجابة (غير قيد التشغيل)**:
```json
{ "code": 0, "msg": "success", "data": { "running": false, "id": "k3tn8vl3" } }
```

---

## إدارة الوكيل

### قائمة الوكلاء

#### `GET /api/v1/proxy/list`

**الاستجابة**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": "p1abc",
        "type": "socks5",
        "host": "1.2.3.4",
        "port": "1080",
        "user": "myuser",
        "password": "mypass",
        "remark": "عقدة الولايات المتحدة",
        "created_at": 1780900000000
      }
    ],
    "total": 1
  }
}
```

---

### إنشاء وكيل

#### `POST /api/v1/proxy/create`

**جسم الطلب**:

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| `type` | string | **نعم** | `"http"` / `"https"` / `"socks5"` |
| `host` | string | **نعم** | عنوان IP أو اسم نطاق مضيف الوكيل |
| `port` | string | **نعم** | المنفذ |
| `user` | string | لا | اسم مستخدم المصادقة |
| `password` | string | لا | كلمة مرور المصادقة |
| `remark` | string | لا | ملاحظة |

**مثال الطلب**:
```json
{
  "type": "socks5",
  "host": "1.2.3.4",
  "port": "1080",
  "user": "myuser",
  "password": "mypass",
  "remark": "عقدة الولايات المتحدة"
}
```

**الاستجابة**: تُرجع كائن الوكيل الذي تم إنشاؤه (يتضمن `id` المُولَّد تلقائيًا).

---

### تحديث وكيل

#### `POST /api/v1/proxy/update`

**جسم الطلب**: نفس حقول الإنشاء، و`id` إلزامي.

---

### حذف وكيل

#### `POST /api/v1/proxy/delete`

**جسم الطلب**:
```json
{ "ids": ["p1abc", "p2def"] }
```

---

## مرجع حقول fingerprint

### بصمة المتصفح

| الحقل | النوع | الوصف | مثال |
|---|---|---|---|
| `user_agent` | string | سلسلة User-Agent كاملة | `"Mozilla/5.0 (Windows NT 10.0; ..."` |
| `platform` | string | navigator.platform | `"Win32"` / `"MacIntel"` / `"Linux x86_64"` / `"iPhone"` / `"iPad"` / `"Linux armv81"` |
| `vendor` | string | navigator.vendor | `"Google Inc."` / `"Apple Computer, Inc."` |
| `lang` | string | لغة المتصفح | `"en-US"` |
| `accept_lang` | string | ترويسة Accept-Language | `"en-US,en;q=0.9"` |
| `timezone` | string | المنطقة الزمنية (فارغ = استنتاج تلقائي) | `"America/Los_Angeles"` |
| `geoposition` | string | خط العرض، خط الطول، الدقة | `"37.39,-121.96,1000"` |
| `screen_resolution` | string | دقة الشاشة | `"1920x1080"` |

### بصمة العتاد

| الحقل | النوع | الوصف | مثال |
|---|---|---|---|
| `hardware_concurrency` | int | عدد أنوية المعالج | `8` |
| `device_memory` | int | ذاكرة الجهاز بالجيجابايت | `16` |
| `canvas_mark` | string | بذرة ضوضاء Canvas | `"5070"` |
| `webgl_mark` | string | بذرة ضوضاء WebGL | `"5577"` |
| `audio_fp` | int | بذرة ضوضاء الصوت | `3052` |
| `client_rect_fp` | int | بذرة ضوضاء ClientRect | `172` |
| `webgl_vendor` | string | WebGL UNMASKED_VENDOR | `"Google Inc. (NVIDIA)"` |
| `webgl_renderer` | string | WebGL UNMASKED_RENDERER | `"ANGLE (NVIDIA, ...)"` |
| `max_touch_points` | int | الحد الأقصى لنقاط اللمس | `0` (سطح مكتب) / `5` (هاتف) |
| `device_pixel_ratio` | float | نسبة بكسل الجهاز (DPR) | `1` / `2` / `3` |

### إعدادات الخصوصية

| الحقل | النوع | الوصف | الافتراضي |
|---|---|---|---|
| `disable_webrtc` | bool | تعطيل WebRTC | `true` |
| `webrtc_mode` | string | وضع WebRTC | `"disabled"` / `"forward"` / `"local"` |
| `geolocation_setting` | string | الموقع الجغرافي | `"allow"` / `"ask"` / `"block"` |
| `port_scan_protection` | string | حماية من فحص المنافذ | `"1"` |
| `do_not_track` | string | DNT | `"default"` / `"true"` / `"false"` |
| `flash_setting` | string | Flash | `"block"` |
| `disable_save_password` | bool | تعطيل حفظ كلمة المرور | `true` |

### حظر المحتوى

| الحقل | النوع | الوصف | الافتراضي |
|---|---|---|---|
| `block_images` | bool | منع تحميل الصور | `false` |
| `block_autoplay` | bool | منع التشغيل التلقائي للفيديو | `true` |
| `mute_audio` | bool | كتم الصوت | `false` |
| `block_translate` | bool | منع نافذة الترجمة | `true` |
| `block_password_popup` | bool | منع نافذة حفظ كلمة المرور | `true` |
| `block_notifications` | bool | منع الإشعارات | `true` |
| `block_clipboard` | bool | منع قراءة الحافظة | `true` |

### متقدم

| الحقل | النوع | الوصف | مثال |
|---|---|---|---|
| `media_devices` | object | عدد أجهزة الوسائط | `{"audioinput":1,"videoinput":1,"audiooutput":1}` |
| `gpu` | string | تسريع GPU | `"1"` (تشغيل) / `"2"` (إيقاف) / `"0"` (حسب النظام) |
| `fonts` | string[] | قائمة خطوط مخصصة | `["Arial","Helvetica"]` |
| `launch_args` | string[] | معاملات تشغيل إضافية | `["--disable-extensions"]` |

### صيغة Cookie

حقل `cookies` عبارة عن مصفوفة، وصيغة كل عنصر:

```json
{
  "name": "session_id",
  "value": "abc123",
  "domain": ".example.com",
  "path": "/",
  "secure": true,
  "httpOnly": false,
  "expires": 1780000000,
  "sameSite": "Lax"
}
```

بعد تشغيل المتصفح تُحقَن تلقائيًا عبر CDP `Network.setCookies`.

---

## أمثلة الاستخدام

### cURL

```bash
# التحقق من الحالة
curl http://127.0.0.1:50326/status

# إنشاء ملف شخصي
curl -X POST http://127.0.0.1:50326/api/v1/browser/create \
  -H "Content-Type: application/json" \
  -d '{"name":"test","kernel_version":"152","fingerprint":{"lang":"en-US","platform":"Win32","hardware_concurrency":8},"tabs":["https://www.browserscan.net/"]}'

# التشغيل
curl "http://127.0.0.1:50326/api/v1/browser/start?id=k3tn8vl3"

# الإيقاف
curl "http://127.0.0.1:50326/api/v1/browser/stop?id=k3tn8vl3"

# الحذف
curl -X POST http://127.0.0.1:50326/api/v1/browser/delete \
  -H "Content-Type: application/json" \
  -d '{"ids":["k3tn8vl3"]}'
```

### PowerShell

```powershell
# إنشاء ملف شخصي
$body = @{
    name = "shop-1"
    kernel_version = "152"
    fingerprint = @{
        lang = "en-US"
        platform = "Win32"
        hardware_concurrency = 8
        device_memory = 16
        canvas_mark = "5070"
        webgl_vendor = "Google Inc. (NVIDIA)"
        webgl_renderer = "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001B83) Direct3D11 vs_5_0 ps_5_0, D3D11-23.21.13.9135)"
        block_notifications = $true
        block_translate = $true
    }
    tabs = @("https://www.browserscan.net/")
} | ConvertTo-Json -Depth 3

$profile = Invoke-RestMethod "http://127.0.0.1:50326/api/v1/browser/create" -Method POST -ContentType "application/json" -Body $body
$id = $profile.data.id

# تشغيل المتصفح
$result = Invoke-RestMethod "http://127.0.0.1:50326/api/v1/browser/start?id=$id"
$wsEndpoint = $result.data.ws.puppeteer
Write-Host "WebSocket: $wsEndpoint"

# الإيقاف بعد الانتهاء
Invoke-RestMethod "http://127.0.0.1:50326/api/v1/browser/stop?id=$id"
```

### Node.js + Playwright

```javascript
const { chromium } = require('playwright');

async function main() {
    // إنشاء ملف شخصي
    const createRes = await fetch('http://127.0.0.1:50326/api/v1/browser/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'playwright-test',
            kernel_version: '152',
            fingerprint: {
                lang: 'en-US',
                platform: 'Win32',
                hardware_concurrency: 8,
                device_memory: 16,
                block_notifications: true,
            },
            tabs: ['https://www.browserscan.net/'],
        }),
    }).then(r => r.json());

    const profileId = createRes.data.id;
    console.log('Created profile:', profileId);

    // تشغيل المتصفح
    const startRes = await fetch(`http://127.0.0.1:50326/api/v1/browser/start?id=${profileId}`)
        .then(r => r.json());

    const wsEndpoint = startRes.data.ws.puppeteer;
    console.log('Connecting to:', wsEndpoint);

    // الاتصال عبر Playwright
    const browser = await chromium.connectOverCDP(wsEndpoint);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    await page.waitForLoadState('domcontentloaded');
    console.log('Page title:', await page.title());

    // نفّذ عملياتك هنا...
    await page.screenshot({ path: 'screenshot.png' });

    // قطع الاتصال (دون إغلاق المتصفح)
    await browser.close();

    // أوقف المتصفح عند الحاجة
    await fetch(`http://127.0.0.1:50326/api/v1/browser/stop?id=${profileId}`);
}

main().catch(console.error);
```

### Python + requests

```python
import requests

API = "http://127.0.0.1:50326"

# الإنشاء
profile = requests.post(f"{API}/api/v1/browser/create", json={
    "name": "python-test",
    "kernel_version": "152",
    "fingerprint": {
        "lang": "en-US",
        "platform": "Win32",
        "hardware_concurrency": 8,
    },
    "tabs": ["https://www.browserscan.net/"],
}).json()

profile_id = profile["data"]["id"]
print(f"Created: {profile_id}")

# التشغيل
start = requests.get(f"{API}/api/v1/browser/start?id={profile_id}").json()
ws_url = start["data"]["ws"]["puppeteer"]
debug_port = start["data"]["debug_port"]
print(f"WS: {ws_url}")
print(f"Debug port: {debug_port}")

# يمكن الاتصال عبر playwright-python:
# from playwright.sync_api import sync_playwright
# with sync_playwright() as p:
#     browser = p.chromium.connect_over_cdp(ws_url)
#     page = browser.contexts[0].pages[0]
#     print(page.title())

# الإيقاف
requests.get(f"{API}/api/v1/browser/stop?id={profile_id}")

# الحذف
requests.post(f"{API}/api/v1/browser/delete", json={"ids": [profile_id]})
```

---

## استجابات الخطأ

| code | الوصف | مثال |
|---|---|---|
| 0 | نجاح | - |
| -1 | خطأ في المعاملات / خطأ في المنطق | `"ids[] required"` / `"profile not found: xxx"` |
| 401 | غير مصرّح | `"unauthorized"` |
| 404 | نقطة النهاية غير موجودة | `"not found: GET /xxx"` |
| 500 | خطأ داخلي | - |

---

## ملاحظات

1. **تخصيص المنفذ عشوائيًا**: عند التشغيل يُستخدم `--remote-debugging-port=0` ليختار Chromium المنفذ بنفسه، ثم يُستخرج عنوان DevTools من stderr
2. **مصادقة الوكيل**: سطر أوامر Chrome لا يدعم الوكيل بمصادقة، لذلك يُنشئ `proxy-chain` ترحيلًا محليًا بلا مصادقة ويمرّر المصادقة إلى الوكيل العلوي
3. **استنتاج المنطقة الزمنية تلقائيًا**: إذا لم يُضبط `timezone`، يُستعلم قبل التشغيل من ip-api.com عن المنطقة الزمنية والإحداثيات الخاصة بعنوان IP للخروج
4. **توقيت حقن Cookie**: تُحقَن ملفات تعريف الارتباط عبر CDP بعد جاهزية منفذ DevTools، وقبل التنقل إلى الصفحة
5. **استمرارية الملف الشخصي**: مجلد بيانات Chromium لكل ملف شخصي هو `data/profiles/<id>/`، ويحتوي حالة التصفح كاملة (Cookie و localStorage والإضافات وغيرها)
6. **التشغيل المتزامن**: تم اختبار تشغيل 5 ملفات شخصية معًا في أقل من 500ms؛ يُتوقع أن تدعم آلة واحدة بذاكرة 64GB نحو 20–30 نسخة متزامنة
