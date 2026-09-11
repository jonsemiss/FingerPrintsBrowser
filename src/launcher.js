// Browser launcher: spawn SunBrowser.exe (or any Chromium) for a given profile,
// parse the random CDP port from stderr, manage proxy-chain anonymizer if needed.
//
// SunBrowser support: when the kernel's exe basename is SunBrowser.exe, we
// auto-generate the --extended-parameters token + 5 support
// files (StaticConfig / DynamicConfig / CookiesFile / WebGLFP / CustomIcon).
// See src/sun_token.js.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const proxyChain = require('proxy-chain');

const { PROFILES_DIR, DEFAULT_KERNEL, resolveKernel } = require('./config');
const { buildProfile: buildSunBrowserProfile } = require('./sun_token');
const { getTimezoneForIp } = require('./ip_timezone');

// In-memory: profileId → { pid, wsEndpoint, debugPort, anonymizedProxyUrl, child, startedAt }
const RUNNING = new Map();

// Auto-pick a platform-appropriate WebGL vendor+renderer
function autoWebGL(platform) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (platform === 'iPhone' || platform === 'iPad') {
        return { vendor: 'Apple Inc.', renderer: 'Apple GPU' };
    }
    if (platform === 'Linux armv81') {
        const android = [
            { vendor: 'Qualcomm', renderer: 'Adreno(TM) 640' },
            { vendor: 'Qualcomm', renderer: 'Adreno(TM) 650' },
            { vendor: 'Qualcomm', renderer: 'Adreno(TM) 620' },
            { vendor: 'Qualcomm', renderer: 'Adreno(TM) 730' },
            { vendor: 'ARM', renderer: 'Mali-G76' },
            { vendor: 'ARM', renderer: 'Mali-G78' },
            { vendor: 'ARM', renderer: 'Mali-G72' },
        ];
        return pick(android);
    }
    if (platform === 'MacIntel') {
        const mac = [
            { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
            { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
            { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)' },
            { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)' },
        ];
        return pick(mac);
    }
    // Win32, Linux x86_64 — default
    const desktop = [
        { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001B83) Direct3D11 vs_5_0 ps_5_0, D3D11-23.21.13.9135)' },
        { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E98) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.7990)' },
        { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, Radeon RX 580 Series (0x000067DF) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.14535.1000)' },
    ];
    return pick(desktop);
}

// Auto-fill all missing fingerprint fields based on platform (mirrors frontend randomFingerprint logic)
function autoFillFingerprint(fp) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const platform = fp.platform || 'Win32';
    const isMobile = ['iPhone', 'iPad', 'Linux armv81'].includes(platform);

    // Touch points
    if (fp.max_touch_points === undefined || fp.max_touch_points === null) {
        fp.max_touch_points = isMobile ? 5 : 0;
    }
    // WebGL
    if (!fp.webgl_vendor || !fp.webgl_renderer) {
        const w = autoWebGL(platform);
        if (!fp.webgl_vendor) fp.webgl_vendor = w.vendor;
        if (!fp.webgl_renderer) fp.webgl_renderer = w.renderer;
    }
    // Screen resolution
    if (!fp.screen_resolution) {
        if (platform === 'iPhone') fp.screen_resolution = pick(['393x852', '390x844', '430x932', '428x926', '360x780']);
        else if (platform === 'iPad') fp.screen_resolution = pick(['1024x1366', '834x1194', '820x1180']);
        else if (platform === 'Linux armv81') fp.screen_resolution = pick(['360x800', '393x873', '360x780', '384x755', '412x915']);
        else fp.screen_resolution = '1920x1080';
    }
    // DPR
    if (!fp.device_pixel_ratio) {
        if (platform === 'iPhone') fp.device_pixel_ratio = 3;
        else if (platform === 'iPad') fp.device_pixel_ratio = 2;
        else if (platform === 'Linux armv81') fp.device_pixel_ratio = pick([2, 2.75, 3]);
        else fp.device_pixel_ratio = 1;
    }
    // CPU
    if (!fp.hardware_concurrency) {
        fp.hardware_concurrency = (platform === 'iPhone') ? 0 : 4;
    }
    // Memory
    if (!fp.device_memory) {
        fp.device_memory = (platform === 'iPhone' || platform === 'iPad') ? 4 : 8;
    }
    // Vendor
    if (!fp.vendor) {
        fp.vendor = (platform === 'iPhone' || platform === 'iPad') ? 'Apple Computer, Inc.' : 'Google Inc.';
    }
    // Canvas/WebGL/Audio seeds
    if (!fp.canvas_mark) fp.canvas_mark = String(1000 + Math.floor(Math.random() * 9000));
    if (!fp.webgl_mark) fp.webgl_mark = String(1000 + Math.floor(Math.random() * 9000));
    if (fp.audio_fp === undefined) fp.audio_fp = Math.floor(Math.random() * 5000) - 2500;
    if (fp.client_rect_fp === undefined) fp.client_rect_fp = Math.floor(Math.random() * 6000) - 3000;
}

// Generate a UA string based on platform and kernel version (used when profile has no user_agent set)
function generateUA(platform, kernelVersion) {
    const randPatch = Math.floor(Math.random() * 131) + 40;
    const buildMap = { '146': '7680', '147': '7727', '148': '7778' };
    const build = buildMap[kernelVersion] || '7778';
    const templates = {
        'Win32': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
        'MacIntel': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
        'Linux x86_64': `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
        'iPhone': `Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${kernelVersion}.0.${build}.${randPatch} Mobile/15E148 Safari/604.1`,
        'iPad': `Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${kernelVersion}.0.${build}.${randPatch} Mobile/15E148 Safari/604.1`,
        'Linux armv81': `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Mobile Safari/537.36`,
    };
    return templates[platform] || templates['Win32'];
}

function userDataDirFor(profileId) {
    return path.join(PROFILES_DIR, profileId);
}

function isRunning(profileId) {
    const r = RUNNING.get(profileId);
    if (!r) return false;
    try { process.kill(r.pid, 0); return true; } catch { RUNNING.delete(profileId); return false; }
}

function getRunning(profileId) {
    return isRunning(profileId) ? RUNNING.get(profileId) : null;
}

function listRunning() {
    const out = [];
    for (const [id] of RUNNING) {
        if (isRunning(id)) {
            const r = RUNNING.get(id);
            out.push({
                profile_id: id,
                pid: r.pid,
                ws: r.wsEndpoint,
                debug_port: r.debugPort,
                started_at: r.startedAt,
            });
        }
    }
    return out;
}

// Build chromium switches from the profile's fingerprint + proxy hint.
// Also auto-generates SunBrowser's required --extended-parameters when the kernel is SunBrowser.exe.
async function buildArgs(profile, opts) {
    const args = [
        `--user-data-dir=${userDataDirFor(profile.id)}`,
        `--remote-debugging-port=0`,                    // let chromium pick; we'll parse from stderr
        `--disable-features=ChromeWhatsNewUI`,
        `--no-first-run`,
        `--no-default-browser-check`,
    ];

    const fp = profile.fingerprint || {};
    // Auto-generate complete fingerprint if key fields are missing (same logic as GUI's randomFingerprint)
    if (!fp.user_agent || !fp.webgl_vendor || !fp.screen_resolution) {
        const { randomFingerprint } = require('./fingerprint');
        const generated = randomFingerprint(fp.platform || 'Win32', profile.kernel_version || '148');
        // Only fill in missing fields, don't overwrite what user explicitly set
        for (const [k, v] of Object.entries(generated)) {
            if (fp[k] === undefined || fp[k] === null || fp[k] === '') {
                fp[k] = v;
            }
        }
    }
    // Pass --user-agent and --window-size for all platforms
    if (fp.user_agent) args.push(`--user-agent=${fp.user_agent}`);
    if (fp.lang) args.push(`--lang=${fp.lang}`);
    if (Array.isArray(fp.accept_lang) && fp.accept_lang.length) {
        args.push(`--accept-lang=${fp.accept_lang.join(',')}`);
    }
    // Screen resolution → --window-size (format: WxH → W,H)
    const resolution = fp.window_size || fp.screen_resolution;
    if (resolution) {
        const wh = resolution.replace('x', ',');
        args.push(`--window-size=${wh}`);
    }
    if (fp.window_position) args.push(`--window-position=${fp.window_position}`);

    // SunBrowser/DeepChrome auto-detection: if kernel is our custom chromium, build the token + support files.
    if (opts.exePath && /(?:SunBrowser|DeepChrome)\.exe$/i.test(opts.exePath)) {
        const { token } = await buildSunBrowserProfile({
            profileId: profile.id,
            cacheDir: userDataDirFor(profile.id),
            serialNumber: profile.serial_number || 0,
            fingerprint: {
                langs: fp.lang ? (fp.lang.includes(',') ? fp.lang : fp.lang + ',' + fp.lang.split('-')[0]) : 'en-US,en',
                accept_lang: Array.isArray(fp.accept_lang) ? fp.accept_lang.join(',') : undefined,
                timezone: fp.timezone,
                geoposition: fp.geoposition,
                webgl_vendor: fp.webgl_vendor,
                webgl_renderer: fp.webgl_renderer,
                hardware_concurrency: fp.hardware_concurrency,
                device_memory: fp.device_memory,
                platform: fp.platform,
                vendor: fp.vendor,
                canvas_mark: fp.canvas_mark,
                webgl_mark: fp.webgl_mark,
                audio_fp: fp.audio_fp,
                client_rect_fp: fp.client_rect_fp,
                max_touch_points: fp.max_touch_points,
                disable_webrtc: fp.disable_webrtc,
            },
        });
        args.push(`--extended-parameters=${token}`);
        // SunBrowser-specific flags; harmless on stock chrome too but keep them gated
        args.push('--password-store=basic', '--use-mock-keychain', '--no-sandbox', '--disable-background-mode', '--force-color-profile=srgb');
    }

    if (opts.proxy_for_chrome) {
        args.push(`--proxy-server=${opts.proxy_for_chrome}`);
    }

    if (Array.isArray(opts.extra_args)) args.push(...opts.extra_args);

    // Content blocking flags based on fingerprint settings
    if (fp.block_images) args.push('--blink-settings=imagesEnabled=false');
    if (fp.block_autoplay) args.push('--autoplay-policy=user-gesture-required');
    if (fp.mute_audio) args.push('--mute-audio');
    if (fp.block_translate) args.push('--disable-features=Translate');
    if (fp.block_password_popup) args.push('--disable-save-password-bubble');
    if (fp.block_notifications) args.push('--disable-notifications');
    // Clipboard blocking is handled via Chrome Preferences (content_settings) before launch

    // Initial tab(s)
    if (Array.isArray(profile.tabs) && profile.tabs.length) args.push(...profile.tabs);

    return args;
}

// proxy-chain converts http/https/socks5 (with or without auth) into a local no-auth http proxy
// that any Chromium can consume via --proxy-server. Returns null if no proxy.
async function prepareProxy(proxyConfig) {
    if (!proxyConfig || !proxyConfig.type || proxyConfig.type === 'no_proxy') return null;
    const { type, host, port, user, password } = proxyConfig;
    if (!host || !port) return null;
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@` : '';
    const upstream = `${type}://${auth}${host}:${port}`;
    const anonymizedProxyUrl = await proxyChain.anonymizeProxy(upstream);
    return { upstream, anonymizedProxyUrl };
}

async function tearDownProxy(anonymizedProxyUrl) {
    if (!anonymizedProxyUrl) return;
    try { await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true); } catch { /* ignore */ }
}

// Check proxy connectivity by fetching ipinfo.io through the proxy
async function checkProxyConnectivity(proxyConfig) {
    const http = require('http');

    const { type, host, port, user, password } = proxyConfig;
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@` : '';
    const upstream = `${type}://${auth}${host}:${port}`;
    const localProxy = await proxyChain.anonymizeProxy(upstream);

    try {
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('代理连接超时 (15s)')), 15000);
            const proxyUrl = new URL(localProxy);
            const connectOpts = {
                hostname: proxyUrl.hostname,
                port: proxyUrl.port,
                method: 'CONNECT',
                path: 'ip-api.com:80',
            };
            const connectReq = http.request(connectOpts);
            connectReq.on('connect', (res, socket) => {
                if (res.statusCode !== 200) { clearTimeout(timeout); reject(new Error(`CONNECT failed: ${res.statusCode}`)); return; }
                const reqData = 'GET /json/?fields=query,country,regionName,city,timezone,lat,lon HTTP/1.1\r\nHost: ip-api.com\r\nUser-Agent: curl/8.0\r\nConnection: close\r\n\r\n';
                socket.write(reqData);
                let data = '';
                socket.on('data', c => data += c.toString());
                socket.on('end', () => {
                    clearTimeout(timeout);
                    const bodyStart = data.indexOf('\r\n\r\n');
                    const body = bodyStart >= 0 ? data.slice(bodyStart + 4) : data;
                    try { resolve(JSON.parse(body.trim())); }
                    catch { reject(new Error('响应解析失败')); }
                });
                socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
            });
            connectReq.on('error', (e) => { clearTimeout(timeout); reject(new Error(`代理连接失败: ${e.message}`)); });
            connectReq.end();
        });

        await proxyChain.closeAnonymizedProxy(localProxy, true);

        return {
            ip: result.query,
            country: result.country,
            region: result.regionName,
            city: result.city,
            timezone: result.timezone,
            geoposition: `${result.lat},${result.lon},1000`,
        };
    } catch (e) {
        await proxyChain.closeAnonymizedProxy(localProxy, true).catch(() => {});
        throw e;
    }
}

// Parses 'DevTools listening on ws://127.0.0.1:9222/devtools/browser/<uuid>' line.
function parseWsEndpoint(stderrChunk) {
    const m = String(stderrChunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
    return m ? m[1] : null;
}

// Inject cookies into the browser via CDP Network.setCookies
async function injectCookies(debugPort, cookies) {
    const http = require('http');
    // Convert to CDP format
    const cdpCookies = cookies.map(c => {
        const out = { name: c.name, value: c.value, domain: c.domain };
        if (c.path) out.path = c.path;
        if (c.secure) out.secure = true;
        if (c.httpOnly) out.httpOnly = true;
        if (c.expires) out.expires = typeof c.expires === 'number' ? c.expires : Math.floor(new Date(c.expires).getTime() / 1000);
        if (c.sameSite) out.sameSite = c.sameSite;
        return out;
    });

    // Get the browser websocket url
    const wsUrl = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${debugPort}/json/version`, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d).webSocketDebuggerUrl); } catch (e) { reject(e); } });
        }).on('error', reject);
    });

    // Connect and send Network.setCookies
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.once('open', r));
    const msg = JSON.stringify({ id: 1, method: 'Network.setCookies', params: { cookies: cdpCookies } });
    ws.send(msg);
    await new Promise((resolve) => {
        ws.once('message', () => resolve());
        setTimeout(resolve, 2000); // timeout fallback
    });
    ws.close();
}

// Apply mobile device emulation via CDP (Emulation.setDeviceMetricsOverride + setUserAgentOverride)
async function applyMobileEmulation(debugPort, fp) {
    const http = require('http');
    const WebSocket = require('ws');

    // Get page targets (not browser target)
    const pages = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${debugPort}/json`, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });

    // Apply to all page targets
    for (const page of pages.filter(p => p.type === 'page' && p.webSocketDebuggerUrl)) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => ws.once('open', r));

        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        let width, height, dpr, ua, mobile = true;

        if (fp.platform === 'iPhone') {
            const screens = [[393,852,3],[390,844,3],[430,932,3],[428,926,3],[375,812,3],[414,896,3]];
            const s = pick(screens);
            width = s[0]; height = s[1]; dpr = s[2];
            const patch = 40 + Math.floor(Math.random() * 130);
            ua = fp.user_agent || `Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.7778.${patch} Mobile/15E148 Safari/604.1`;
        } else if (fp.platform === 'iPad') {
            const screens = [[1024,1366,2],[834,1194,2],[820,1180,2]];
            const s = pick(screens);
            width = s[0]; height = s[1]; dpr = s[2];
            const patch = 40 + Math.floor(Math.random() * 130);
            ua = fp.user_agent || `Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.7778.${patch} Mobile/15E148 Safari/604.1`;
        } else {
            const screens = [[360,800,3],[384,755,2.8125],[393,873,2.75],[360,727,3],[412,915,2.625]];
            const s = pick(screens);
            width = s[0]; height = s[1]; dpr = s[2];
            ua = fp.user_agent || `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36`;
        }

        let msgId = 1;
        ws.send(JSON.stringify({ id: msgId++, method: 'Emulation.setDeviceMetricsOverride', params: {
            width, height, deviceScaleFactor: dpr, mobile,
            screenWidth: width, screenHeight: height,
        }}));
        ws.send(JSON.stringify({ id: msgId++, method: 'Emulation.setUserAgentOverride', params: {
            userAgent: ua,
            platform: fp.platform,
        }}));
        ws.send(JSON.stringify({ id: msgId++, method: 'Emulation.setTouchEmulationEnabled', params: {
            enabled: true, maxTouchPoints: 5,
        }}));

        await new Promise(r => setTimeout(r, 300));
        ws.close();
    }
}

// Write Chrome Preferences for settings that can't be set via command line flags
// (e.g. clipboard permission, video preloading)
function applyContentPreferences(profile) {
    const fp = profile.fingerprint || {};
    const prefsDir = path.join(userDataDirFor(profile.id), 'Default');
    const prefsFile = path.join(prefsDir, 'Preferences');
    fs.mkdirSync(prefsDir, { recursive: true });

    let prefs = {};
    try { prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8')); } catch { /* file doesn't exist yet */ }

    // Ensure nested structures
    if (!prefs.profile) prefs.profile = {};
    if (!prefs.profile.content_settings) prefs.profile.content_settings = {};
    if (!prefs.profile.content_settings.exceptions) prefs.profile.content_settings.exceptions = {};
    if (!prefs.profile.default_content_setting_values) prefs.profile.default_content_setting_values = {};

    const defaults = prefs.profile.default_content_setting_values;

    // Block clipboard read: 1=allow, 2=block
    if (fp.block_clipboard) {
        defaults.clipboard = 2;
    }

    // Block notifications: 1=allow, 2=block
    if (fp.block_notifications) {
        defaults.notifications = 2;
    }

    // Disable password manager UI completely
    if (fp.block_password_popup || fp.disable_save_password) {
        if (!prefs.credentials_enable_service) prefs.credentials_enable_service = false;
        prefs.credentials_enable_service = false;
        if (!prefs.profile.password_manager_enabled) prefs.profile.password_manager_enabled = false;
        prefs.profile.password_manager_enabled = false;
    }

    // Disable translate
    if (fp.block_translate) {
        if (!prefs.translate) prefs.translate = {};
        prefs.translate.enabled = false;
    }

    // Disable video preloading when autoplay is blocked
    if (fp.block_autoplay) {
        if (!prefs.media) prefs.media = {};
        prefs.media.autoplay_allowed = false;
    }

    // Force Intl locale to match the browser language (prevents zh-CN system locale leaking)
    const lang = fp.lang || 'en-US';
    if (!prefs.intl) prefs.intl = {};
    prefs.intl.accept_languages = fp.accept_lang || `${lang},${lang.split('-')[0]}`;
    prefs.intl.selected_languages = fp.accept_lang || `${lang},${lang.split('-')[0]}`;

    fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2), 'utf8');
}

async function launch(profile, { kernel, extra_args, proxy } = {}) {
    if (isRunning(profile.id)) {
        return getRunning(profile.id);
    }

    const exePath = kernel || resolveKernel(profile.kernel_version) || profile.kernel || DEFAULT_KERNEL;
    if (!fs.existsSync(exePath)) {
        throw new Error(`Kernel not found: ${exePath}. Set MYADS_KERNEL or profile.kernel.`);
    }

    fs.mkdirSync(userDataDirFor(profile.id), { recursive: true });

    // Write Chrome Preferences for content blocking (clipboard, etc.)
    applyContentPreferences(profile);

    let proxyForChrome = null;
    let anonymizedProxyUrl = null;
    if (proxy) {
        // Verify proxy connectivity and get geo info through the proxy
        try {
            const geoInfo = await checkProxyConnectivity(proxy);
            if (geoInfo) {
                // Always update timezone from proxy's actual exit IP
                const fp2 = profile.fingerprint || {};
                fp2.timezone = geoInfo.timezone;
                if (geoInfo.geoposition) fp2.geoposition = geoInfo.geoposition;
                console.log(`[proxy] ${proxy.host}:${proxy.port} → ${geoInfo.ip} (${geoInfo.country}/${geoInfo.city}, tz=${geoInfo.timezone})`);
            }
        } catch (e) {
            throw new Error(`代理不可用: ${e.message}`);
        }

        const prepared = await prepareProxy(proxy);
        if (prepared) {
            anonymizedProxyUrl = prepared.anonymizedProxyUrl;
            proxyForChrome = anonymizedProxyUrl;
        }
    }

    // Auto-detect timezone from public IP if no proxy and timezone not set
    const fp = profile.fingerprint || {};
    if (!fp.timezone && !proxy) {
        try {
            const geo = await getTimezoneForIp(null);
            if (geo) {
                fp.timezone = geo.timezone;
                if (!fp.geoposition && geo.geoposition) fp.geoposition = geo.geoposition;
            }
        } catch { /* use default in sun_token */ }
    }

    const args = await buildArgs(profile, { exePath, proxy_for_chrome: proxyForChrome, extra_args });
    const child = spawn(exePath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });

    const startedAt = Date.now();
    const wsPromise = new Promise((resolve, reject) => {
        const onErrData = (chunk) => {
            const ws = parseWsEndpoint(chunk);
            if (ws) {
                child.stderr.off('data', onErrData);
                resolve(ws);
            }
        };
        child.stderr.on('data', onErrData);
        child.once('exit', (code) => reject(new Error(`Browser exited (code=${code}) before DevTools became ready`)));
        setTimeout(() => reject(new Error('Timed out waiting for DevTools listener')), 30_000);
    });

    let ws;
    try {
        ws = await wsPromise;
    } catch (e) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        await tearDownProxy(anonymizedProxyUrl);
        throw e;
    }

    const debugPort = (() => { try { return new URL(ws).port; } catch { return null; } })();

    // Inject cookies via CDP if profile has them
    if (Array.isArray(profile.cookies) && profile.cookies.length && debugPort) {
        try { await injectCookies(debugPort, profile.cookies); } catch (e) { /* non-fatal */ }
    }

    const record = {
        pid: child.pid,
        wsEndpoint: ws,
        debugPort,
        anonymizedProxyUrl,
        child,
        startedAt,
    };
    RUNNING.set(profile.id, record);

    child.once('exit', async () => {
        RUNNING.delete(profile.id);
        await tearDownProxy(anonymizedProxyUrl);
    });

    return record;
}

async function stop(profileId, { force = false } = {}) {
    const r = RUNNING.get(profileId);
    if (!r) return false;
    try {
        if (force) r.child.kill('SIGKILL');
        else r.child.kill();
    } catch { /* ignore */ }
    return true;
}

async function stopAll() {
    const ids = Array.from(RUNNING.keys());
    await Promise.all(ids.map((id) => stop(id)));
    return ids;
}

module.exports = {
    launch,
    stop,
    stopAll,
    isRunning,
    getRunning,
    listRunning,
    userDataDirFor,
};
