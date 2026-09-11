// SunBrowser token + support files generator.
// Pure JSON inside an alphabet-substitution base64 wrapper. No signatures, no IPC.

const fs = require('fs');
const path = require('path');

// ---- Token alphabet codec ----
const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ADS = 'hTy1bfRJz4nLPcBCO7WtmNIaGvVeul5Zo8kq32UxrYw_-0gsjp96SDFXQiEMKdHA';

function adsEncode(str) {
    const b64 = Buffer.from(str, 'utf8').toString('base64');
    return b64.split('').map(ch => {
        const i = STD.indexOf(ch);
        return i < 0 ? ch : ADS[i];
    }).join('');
}
function adsDecode(token) {
    const b64 = token.split('').map(ch => {
        const i = ADS.indexOf(ch);
        return i < 0 ? ch : STD[i];
    }).join('');
    return Buffer.from(b64, 'base64').toString('utf8');
}

// ---- Platform-specific StaticConfig extras (UserAgentMetadata, fonts, TTS, device name) ----
function buildPlatformExtras(platform) {
    const extras = {};

    if (platform === 'MacIntel') {
        const macVersions = ['15.1.1', '15.2', '15.0.1', '14.6.1', '14.5'];
        const macChips = ['Apple M1', 'Apple M1 Pro', 'Apple M1 Max', 'Apple M2', 'Apple M2 Pro', 'Apple M3'];
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        const chip = pick(macChips);
        const firstName = pick(['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Chris', 'Jamie', 'Pat']);
        extras.UserAgentMetadata = {
            platform: 'macOS',
            platformVersion: pick(macVersions),
            architecture: chip.includes('M') ? 'arm' : 'x86',
            model: '',
            mobile: false,
            wow64: false,
            bitness: '64',
        };
        extras.DeviceName = `${firstName}'s MacBook Air`;
        extras.ProductType = `${firstName}'s MacBook Air`;
        // Mac fonts: map macOS fonts to their Windows equivalents (so font detection sees Mac fonts)
        extras.Fakefonts = {
            'Al Bayan': 'Arial', 'Al Nile': 'Calibri', 'American Typewriter': 'Cambria',
            'Andale Mono': 'Candara', 'Apple Braille': 'Comic Sans MS', 'Apple Chancery': 'Consolas',
            'Apple Color Emoji': 'Constantia', 'Apple SD Gothic Neo': 'Corbel',
            'Apple Symbols': 'Courier New', 'AppleGothic': 'Ebrima', 'AppleMyungjo': 'Franklin Gothic',
            'Arial Hebrew': 'Georgia', 'Arial Rounded MT Bold': 'Times New Roman',
            'Avenir Next': 'MS PGothic', 'Avenir': 'MV Boli', 'Baskerville': 'Microsoft New Tai Lue',
            'Big Caslon': 'Microsoft Sans Serif', 'Bradley Hand': 'Microsoft YaHei',
            'Brush Script MT': 'MingLiU-ExtB', 'Chalkboard SE': 'Mongolian Baiti',
            'Chalkboard': 'PMingLiU-ExtB', 'Cochin': 'Segoe Print', 'Copperplate': 'Segoe UI Symbol',
            'Courier': 'Sylfaen', 'Damascus': 'Trebuchet MS', 'Didot': 'Gadugi',
            'Futura': 'MS UI Gothic', 'Geneva': 'Segoe UI Emoji', 'Gill Sans': 'Bahnschrift',
            'Helvetica Neue': 'Consolas', 'Helvetica': 'Constantia', 'Herculanum': 'Corbel',
            'Hoefler Text': 'Franklin Gothic', 'Impact': 'Georgia', 'Lucida Grande': 'Microsoft PhagsPa',
            'Marker Felt': 'Microsoft YaHei', 'Menlo': 'Microsoft Yi Baiti',
            'Monaco': 'PMingLiU-ExtB', 'Optima': 'SimSun', 'Palatino': 'Microsoft JhengHei UI',
            'Papyrus': 'Myanmar Text', 'PingFang HK': 'Yu Gothic', 'Songti SC': 'Lucida Sans Unicode',
            'STSong': 'Corbel', 'Symbol': 'MS PGothic', 'Zapfino': 'Microsoft Yi Baiti',
        };
        // Mac TTS engines
        extras.TTSEngines = [
            { name: 'Alex', lang: 'en-US', default: true, localService: true },
            { name: 'Samantha', lang: 'en-US', default: false, localService: false },
            { name: 'Daniel', lang: 'en-GB', default: false, localService: false },
            { name: 'Karen', lang: 'en-AU', default: false, localService: false },
            { name: 'Thomas', lang: 'fr-FR', default: false, localService: false },
            { name: 'Anna', lang: 'de-DE', default: false, localService: false },
            { name: 'Kyoko', lang: 'ja-JP', default: false, localService: false },
            { name: 'Ting-Ting', lang: 'zh-CN', default: false, localService: false },
            { name: 'Google US English', lang: 'en-US', default: false, localService: false },
            { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false },
        ];
    } else if (platform === 'Win32') {
        const winVersions = ['10.0.0', '10.0.1', '15.0.0', '15.0.1'];
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        const firstName = pick(['DESKTOP', 'LAPTOP', 'PC']);
        const suffix = Math.random().toString(36).slice(2, 9).toUpperCase();
        extras.UserAgentMetadata = {
            platform: 'Windows',
            platformVersion: pick(winVersions),
            architecture: 'x86',
            model: '',
            mobile: false,
            wow64: false,
            bitness: '64',
        };
        extras.DeviceName = `${firstName}-${suffix}`;
        extras.ProductType = `${firstName}-${suffix}`;
        // Windows TTS
        extras.TTSEngines = [
            { name: 'Microsoft David', lang: 'en-US', default: true, localService: true },
            { name: 'Microsoft Zira', lang: 'en-US', default: false, localService: true },
            { name: 'Microsoft Mark', lang: 'en-US', default: false, localService: true },
            { name: 'Google US English', lang: 'en-US', default: false, localService: false },
            { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false },
        ];
    } else if (platform === 'Linux x86_64') {
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        extras.UserAgentMetadata = {
            platform: 'Linux',
            platformVersion: pick(['6.1.0', '6.5.0', '5.15.0', '6.8.0']),
            architecture: 'x86',
            model: '',
            mobile: false,
            wow64: false,
            bitness: '64',
        };
        const firstName = pick(['dev', 'user', 'admin', 'ubuntu', 'fedora']);
        extras.DeviceName = `${firstName}-workstation`;
        extras.ProductType = `${firstName}-workstation`;
        extras.TTSEngines = [
            { name: 'Google US English', lang: 'en-US', default: true, localService: false },
            { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false },
        ];
    } else if (platform === 'iPhone') {
        const iosVersions = ['18.2.1', '18.5', '17.6.1', '17.5', '16.5.1'];
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        extras.UserAgentMetadata = {
            platform: 'iOS',
            platformVersion: pick(iosVersions),
            architecture: 'arm',
            model: 'iPhone',
            mobile: true,
            wow64: false,
            bitness: '64',
        };
        const firstName = pick(['Alex', 'Jordan', 'Taylor', 'Morgan', 'Sam']);
        extras.DeviceName = `${firstName}'s iPhone`;
        extras.ProductType = `${firstName}'s iPhone`;

        // DevtoolsPreferences for mobile emulation
        const screens = [
            { w: 393, h: 852, dpr: 3 },
            { w: 390, h: 844, dpr: 3 },
            { w: 430, h: 932, dpr: 3 },
            { w: 428, h: 926, dpr: 3 },
            { w: 375, h: 812, dpr: 3 },
            { w: 414, h: 896, dpr: 3 },
        ];
        const screen = pick(screens);
        const iosVer = pick(['18_2_1', '18_5', '17_6_1', '17_5', '16_5_1']);
        const build = '7778';
        const patch = 40 + Math.floor(Math.random() * 130);
        const uaForDevtools = `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.${build}.${patch} Mobile/15E148 Safari/604.1`;
        extras.DevtoolsPreferences = {
            'emulation.deviceHeight': String(screen.h),
            'emulation.deviceWidth': String(screen.w),
            'emulation.deviceScaleFactor': String(screen.dpr),
            'emulation.deviceUserAgent': JSON.stringify(uaForDevtools),
            'emulation.showDeviceMode': 'true',
            'emulation.deviceModeValue': '{"device":"","orientation":"","mode":""}',
            'lastDockState': '"right"',
            'currentDockState': '"right"',
            'standardEmulatedDeviceList': '[]',
        };
    } else if (platform === 'iPad') {
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        extras.UserAgentMetadata = {
            platform: 'iOS',
            platformVersion: pick(['18.2', '17.6', '16.6']),
            architecture: 'arm',
            model: 'iPad',
            mobile: true,
            wow64: false,
            bitness: '64',
        };
        const firstName = pick(['Alex', 'Jordan', 'Taylor', 'Morgan', 'Sam']);
        extras.DeviceName = `${firstName}'s iPad`;
        extras.ProductType = `${firstName}'s iPad`;
    } else if (platform === 'Linux armv81') {
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        // Device models grouped by compatible Android version
        const devices14 = ['SM-S928B', 'SM-S924U', 'SM-A556B', 'RMX3853', 'V2254A', 'M2012K11AC', '22081212C', 'CPH2591'];
        const devices15 = ['Pixel 9', 'Pixel 8 Pro', 'SM-S928B', 'SM-S926B'];
        // Randomly pick version, then matching device
        const version = pick(['14.0.0', '15.0.0']);
        const model = version === '15.0.0' ? pick(devices15) : pick(devices14);
        const firstName = pick(['Alex', 'Jordan', 'Taylor', 'Morgan', 'Sam', 'Chris', 'Riley', 'Casey']);
        extras.UserAgentMetadata = {
            platform: 'Android',
            platformVersion: version,
            architecture: '',
            model: model,
            mobile: true,
            wow64: false,
            bitness: '',
        };
        extras.DeviceName = `${model}-${firstName}`;
        extras.ProductType = `${model}-${firstName}`;

        // DevtoolsPreferences for mobile emulation
        const widths = [360, 384, 393, 411, 412];
        const heights = [727, 755, 779, 800, 850, 873];
        const dprs = [2.0, 2.625, 2.75, 2.8125, 3.0, 3.5];
        const w = pick(widths), h = pick(heights), dpr = pick(dprs);
        const uaForDevtools = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36`;
        extras.DevtoolsPreferences = {
            'emulation.deviceHeight': String(h),
            'emulation.deviceWidth': String(w),
            'emulation.deviceScaleFactor': String(dpr),
            'emulation.deviceUserAgent': JSON.stringify(uaForDevtools),
            'emulation.showDeviceMode': 'true',
            'emulation.deviceModeValue': '{"device":"","orientation":"","mode":""}',
            'lastDockState': '"right"',
            'currentDockState': '"right"',
            'standardEmulatedDeviceList': '[]',
        };

        // Sensor data for mobile
        extras.gyroscope = { x: [-0.15, 0.15], y: [-0.15, 0.15], z: [-0.15, 0.15] };
        extras.deviceorientationdata = {
            alpha: Math.random() * 360,
            beta: -10 + Math.random() * 20,
            gamma: -5 + Math.random() * 10,
            absolute: false,
        };
        extras.DeviceMotion = {
            acceleration: { x: [-0.05, 0.05], y: [-0.05, 0.05], z: [-0.05, 0.05] },
            accelerationIncludingGravity: { x: [-0.2, 0.2], y: [-0.2, 0.2], z: [9.78, 9.81] },
        };
    }

    return extras;
}

// ---- Builders for the 5 support files SunBrowser checks via the token ----
function defaultStaticConfig({ cacheDir, fingerprint = {}, params = {} }) {
    const componentsPath = path.join(__dirname, '..', 'kernel', 'chrome_152', 'components');

    // Base config
    const cfg = {
        CookiesExportPath: path.join(cacheDir, 'sf_cookie.txt'),
        SecurePreferenceSync: true,
        PasswordExportPath: path.join(cacheDir, 'password_list_out.csv'),
        AutomationControlled: true,
        PersistExtensions: 'extensionCenter',
        GOOGLE_API_KEY: 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw',
        FoceSafeBrowsing: true,
        RestoreLastSession: true,
        ComponentPreinstallPath: componentsPath,
        RegistryExtensions: 'Software\\DeepBrowser\\Extensions',
        command_line: { 'do-not-de-elevate': '' },
        SunBrowserPolicys: { GenAILocalFoundationalModelSettings: 1 },
        // Canvas/WebGL marks mirroring the token values (critical for correct noise behavior)
        CanvasMarkEx: params.CanvasMark || fingerprint.canvas_mark || String(1000 + Math.floor(Math.random() * 9000)),
        WebGLMarkEx: params.WebGLMark || fingerprint.webgl_mark || String(1000 + Math.floor(Math.random() * 9000)),
        WebRTCAllowScanPorts: '',
        MaxTouchPoints: fingerprint.max_touch_points ?? 0,
        MediaDevices: [
            { kind: 'audioinput', label: '' },
            { kind: 'videoinput', label: '' },
            { kind: 'audiooutput', label: '' },
        ],
    };

    // Merge token params into StaticConfig (all params except file paths)
    const skipKeys = ['CustomIcon', 'WebGLFP', 'StaticConfig', 'CookiesFile', 'DynamicConfig', 'Geoposition', 'TimeZone'];
    for (const [k, v] of Object.entries(params)) {
        if (!skipKeys.includes(k) && cfg[k] === undefined) {
            cfg[k] = v;
        }
    }

    // Add platform-specific metadata (critical for BrowserScan OS detection)
    const platformExtras = buildPlatformExtras(fingerprint.platform || params.Platform || 'Win32');
    Object.assign(cfg, platformExtras);

    return cfg;
}

function defaultDynamicConfig({ timezone = 'America/Los_Angeles', geoposition = '37.3541,-121.9555,1000' } = {}) {
    return {
        BlockList: { Version: String(Math.floor(Date.now() / 1000)), Domains: [] },
        TimeZone: timezone,
        Geoposition: geoposition,
        StrongBlockList: { Version: '1', Domains: [] },
    };
}

function defaultWebGLFP({ vendor = 'Google Inc. (Intel)', renderer = 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' } = {}) {
    return {
        UNMASKED_VENDOR_WEBGL: vendor,
        UNMASKED_RENDERER_WEBGL: renderer,
        GPUAdapterInfo: { vendor: 'intel', architecture: 'gen-12lp' },
        SUPPORTED_EXTENSIONS: [],
    };
}

function defaultCookiesFile({ profileId, ipcHost = '127.0.0.1:20725' } = {}) {
    const expires = Math.floor(Date.now() / 1000) + 365 * 86400;
    return [
        { name: 'BROWSER_ID', value: profileId, domain: '.localhost', path: '/', sameSite: 'Unspecified', storeId: '0', id: '0', httpOnly: false, secure: false, expires },
        { name: 'CLIENT_HOST', value: ipcHost, domain: '.localhost', path: '/', sameSite: 'Unspecified', storeId: '0', id: '0', httpOnly: false, secure: false, expires },
    ];
}

// Browser taskbar icon. Generate a numbered icon with the profile's serial number.
const { generateNumberedIcon } = require('./icon_gen');
const BROWSER_ICON_FALLBACK = path.join(__dirname, '..', 'renderer', 'chrome.ico');

async function writeBrowserIcon(filePath, serialNumber) {
    try {
        await generateNumberedIcon(serialNumber || 0, filePath);
    } catch {
        // Fallback: copy plain chrome.ico if generation fails
        if (fs.existsSync(BROWSER_ICON_FALLBACK)) {
            fs.copyFileSync(BROWSER_ICON_FALLBACK, filePath);
        }
    }
}

// ---- Compose the full sunBrowserParams object + write the 5 files ----
function md5(str) { return require('crypto').createHash('md5').update(str).digest('hex'); }

// Map platform to WebGLFP file suffix (controls OS-level fingerprint emulation in the kernel)
function platformToWebGLSuffix(platform) {
    switch (platform) {
        case 'MacIntel': return '_MacOS';
        case 'iPhone': return '_iPhone';
        case 'iPad': return '_iPad';
        case 'Linux armv81': return '_Android';
        default: return '_Other'; // Win32, Linux x86_64
    }
}

async function buildProfile({
    profileId,
    inviteCode = 'invite',
    cacheDir,
    fingerprint = {},
    serialNumber = 0,
}) {
    fs.mkdirSync(cacheDir, { recursive: true });

    const fileName = (suffix) => md5(profileId + '_' + suffix);
    const paths = {
        StaticConfig:  path.join(cacheDir, fileName('static')),
        DynamicConfig: path.join(cacheDir, fileName('dynamic')),
        CookiesFile:   path.join(cacheDir, fileName('cookies')),
        WebGLFP:       path.join(cacheDir, fileName('webgl_fp') + platformToWebGLSuffix(fingerprint.platform)),
        CustomIcon:    path.join(cacheDir, fileName('icon') + '.ico'),
    };

    // Build params FIRST (needed by StaticConfig)
    const params = {
        UserId: profileId,
        StartTime: Math.floor(Date.now() / 1000),
        Langs: fingerprint.langs || 'en-US,en',
        AcceptLang: fingerprint.accept_lang || 'en-US,en;q=0.9',
        TimeZone: fingerprint.timezone || 'America/Los_Angeles',
        Geoposition: fingerprint.geoposition || '37.3541,-121.9555,1000',
        Platform: fingerprint.platform || 'Win32',
        ...((['iPhone', 'iPad'].includes(fingerprint.platform)) ? { Vendor: 'Apple Computer, Inc.' } : {}),
        HardwareConcurrency: fingerprint.hardware_concurrency || 8,
        DeviceMemory: fingerprint.device_memory || 8,
        CanvasMark: fingerprint.canvas_mark || String(1000 + Math.floor(Math.random() * 9000)),
        AudioFp: fingerprint.audio_fp ?? Math.floor(Math.random() * 5000),
        WebGLMark: fingerprint.webgl_mark || String(1000 + Math.floor(Math.random() * 9000)),
        ClientRectFp: fingerprint.client_rect_fp ?? -100 - Math.floor(Math.random() * 200),
        DisableContainer: true,
        DisableSavePassword: true,
        LoadExtensionErrorBox: false,
        ForceProcessExit: true,
        DisableBackgroundMode: true,
        DisableWebRTC: fingerprint.disable_webrtc !== false,
        AllowScanPorts: '',
        GeolocationSetting: fingerprint.geolocation_setting || 'ask',
        FlashPluginSetting: 'block',
        // Critical: paths to the support files
        CustomIcon:    paths.CustomIcon,
        WebGLFP:       paths.WebGLFP,
        CookiesFile:   paths.CookiesFile,
        DynamicConfig: paths.DynamicConfig,
        StaticConfig:  paths.StaticConfig,
    };

    // Now write files (StaticConfig uses params)
    fs.writeFileSync(paths.StaticConfig,  adsEncode(JSON.stringify(defaultStaticConfig({ cacheDir, fingerprint, params }))));
    fs.writeFileSync(paths.DynamicConfig, adsEncode(JSON.stringify(defaultDynamicConfig({
        timezone: fingerprint.timezone,
        geoposition: fingerprint.geoposition,
    }))));
    fs.writeFileSync(paths.CookiesFile,   JSON.stringify(defaultCookiesFile({ profileId })));
    fs.writeFileSync(paths.WebGLFP,       JSON.stringify(defaultWebGLFP({
        vendor: fingerprint.webgl_vendor,
        renderer: fingerprint.webgl_renderer,
    })));
    await writeBrowserIcon(paths.CustomIcon, serialNumber);

    const token = adsEncode(JSON.stringify(params));
    return { params, token, paths };
}

module.exports = { adsEncode, adsDecode, buildProfile, defaultStaticConfig, defaultDynamicConfig, defaultWebGLFP, defaultCookiesFile, writeBrowserIcon };
