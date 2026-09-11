// Server-side fingerprint randomizer — mirrors renderer/presets.js logic exactly.
// Used by launcher.js to auto-fill missing fingerprint fields.

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, '..', 'data', 'presets');
let _webgl = null;
let _uaAll = null;

function loadPresets() {
    if (!_webgl) {
        try { _webgl = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, 'webgl.json'), 'utf8')); } catch { _webgl = []; }
    }
    if (!_uaAll) {
        try { _uaAll = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, 'ua_all.json'), 'utf8')); } catch { _uaAll = []; }
    }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function isMobilePlatform(p) { return ['iPhone', 'iPad', 'Linux armv81'].includes(p); }

function randomWebGL(platform) {
    loadPresets();
    if (!_webgl.length) return { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)' };
    let candidates;
    if (platform === 'iPhone' || platform === 'iPad') {
        candidates = _webgl.filter(w => w.vendor === 'Apple Inc.');
    } else if (platform === 'Linux armv81') {
        candidates = _webgl.filter(w => w.vendor === 'Qualcomm' || w.vendor === 'ARM');
    } else if (platform === 'MacIntel') {
        candidates = _webgl.filter(w => w.vendor === 'Google Inc. (Apple)');
    } else if (platform === 'Linux x86_64') {
        candidates = _webgl.filter(w => w.vendor.includes('(Intel)') || w.vendor.includes('(AMD)'));
        if (!candidates.length) candidates = _webgl.filter(w => w.renderer.includes('ANGLE'));
    } else {
        candidates = _webgl.filter(w => w.renderer.includes('Direct3D'));
    }
    if (!candidates.length) candidates = _webgl;
    return pick(candidates);
}

function randomUA(platform, kernelVersion) {
    loadPresets();
    kernelVersion = kernelVersion || '148';

    if (_uaAll.length) {
        const platformFilters = {
            'Win32': u => u.includes('Windows NT') && !u.includes('Android'),
            'MacIntel': u => u.includes('Macintosh'),
            'Linux x86_64': u => u.includes('X11; Linux'),
            'iPhone': u => u.includes('iPhone'),
            'iPad': u => u.includes('iPad'),
            'Linux armv81': u => u.includes('Linux; Android'),
        };
        const filter = platformFilters[platform] || platformFilters['Win32'];
        let candidates = _uaAll.filter(filter);
        if (candidates.length) {
            let ua = pick(candidates);
            if (!isMobilePlatform(platform)) {
                ua = ua.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${kernelVersion}.0.0.0`);
            } else if (platform === 'Linux armv81') {
                ua = ua.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${kernelVersion}.0.0.0`);
            } else {
                const buildMap = { '146': '7680', '147': '7727', '148': '7778', '152': '7977' };
                const build = buildMap[kernelVersion] || '7778';
                ua = ua.replace(/CriOS\/\d+\.\d+\.\d+\.\d+/, `CriOS/${kernelVersion}.0.${build}.${randInt(40, 170)}`);
            }
            return ua;
        }
    }

    // Fallback
    if (!isMobilePlatform(platform)) {
        const templates = {
            'Win32': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
            'MacIntel': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
            'Linux x86_64': `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Safari/537.36`,
        };
        return templates[platform] || templates['Win32'];
    } else {
        const buildMap = { '146': '7680', '147': '7727', '148': '7778', '152': '7977' };
        const build = buildMap[kernelVersion] || '7778';
        const fullVer = `${kernelVersion}.0.${build}.${randInt(40, 170)}`;
        if (platform === 'Linux armv81') return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${kernelVersion}.0.0.0 Mobile Safari/537.36`;
        if (platform === 'iPhone') return `Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${fullVer} Mobile/15E148 Safari/604.1`;
        return `Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${fullVer} Mobile/15E148 Safari/604.1`;
    }
}

function randomFingerprint(platform, kernelVersion) {
    loadPresets();
    platform = platform || 'Win32';
    kernelVersion = kernelVersion || '148';
    const webgl = randomWebGL(platform);
    const isMobile = isMobilePlatform(platform);

    let res;
    if (isMobile) {
        if (platform === 'iPhone') res = pick(['393x852', '390x844', '375x812', '414x896', '430x932', '428x926', '360x780']);
        else if (platform === 'iPad') res = pick(['1024x1366', '834x1194', '820x1180', '810x1080']);
        else res = pick(['360x727', '360x792', '384x755', '360x800', '412x915', '393x873']);
    } else {
        res = '1920x1080';
    }

    let cpu;
    if (platform === 'iPhone' || platform === 'iPad') cpu = 0;
    else cpu = 4;

    let dpr;
    if (platform === 'iPhone') dpr = 3;
    else if (platform === 'iPad') dpr = 2;
    else if (platform === 'Linux armv81') dpr = 1;
    else dpr = 1;

    const vendor = (platform === 'iPhone' || platform === 'iPad') ? 'Apple Computer, Inc.' : 'Google Inc.';

    return {
        platform,
        vendor,
        user_agent: randomUA(platform, kernelVersion),
        webgl_vendor: webgl.vendor,
        webgl_renderer: webgl.renderer,
        screen_resolution: res,
        hardware_concurrency: cpu,
        device_memory: 8,
        device_pixel_ratio: dpr,
        canvas_mark: String(randInt(1000, 9999)),
        webgl_mark: String(randInt(1000, 9999)),
        audio_fp: randInt(-3000, 5000),
        client_rect_fp: randInt(-3000, 3000),
        max_touch_points: isMobile ? 5 : 0,
        lang: 'en-US',
        accept_lang: 'en-US,en;q=0.9',
    };
}

module.exports = { randomFingerprint, randomUA, randomWebGL };
