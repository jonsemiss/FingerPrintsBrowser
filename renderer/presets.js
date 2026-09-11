// Presets data loader — reads from data/presets/ and provides helper functions
// for random generation and UI population.

let PRESETS = null;

async function loadPresets() {
    if (PRESETS) return PRESETS;
    const base = '../data/presets/';
    const [webgl, names, devices, resolutions, uas, fonts, timezones, languages, uaAll, fontsExtracted, devicesFull] = await Promise.all([
        fetch(base + 'webgl.json').then(r => r.json()),
        fetch(base + 'first_names.json').then(r => r.json()),
        fetch(base + 'device_templates.json').then(r => r.json()),
        fetch(base + 'resolutions.json').then(r => r.json()),
        fetch(base + 'ua_templates.json').then(r => r.json()),
        fetch(base + 'fonts.json').then(r => r.json()),
        fetch(base + 'timezones.json').then(r => r.json()).catch(() => []),
        fetch(base + 'languages.json').then(r => r.json()).catch(() => []),
        fetch(base + 'ua_all.json').then(r => r.json()).catch(() => []),
        fetch(base + 'fonts_extracted.json').then(r => r.json()).catch(() => []),
        fetch(base + 'devices_full.json').then(r => r.json()).catch(() => []),
    ]);
    // Merge fonts
    const allFonts = [...new Set([...fonts, ...fontsExtracted])].sort();
    PRESETS = { webgl, names, devices, resolutions, uas, fonts: allFonts, timezones, languages, uaAll, devicesFull };
    // Populate timezone dropdown
    const tzSel = document.getElementById('fp-timezone');
    if (tzSel && timezones.length) {
        timezones.forEach(tz => { const o = document.createElement('option'); o.value = tz; o.textContent = tz; tzSel.appendChild(o); });
    }
    // Populate language dropdown
    const langSel = document.getElementById('fp-lang');
    if (langSel && languages.length) {
        langSel.innerHTML = '';
        const common = ['en-US','en','zh-CN','zh-TW','ja','ko','fr','de','es','pt-BR','ru','ar','hi','it','nl','pl','th','vi','tr','id'];
        common.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; if (l === 'en-US') o.selected = true; langSel.appendChild(o); });
        const rest = languages.filter(l => !common.includes(l));
        if (rest.length) {
            const optg = document.createElement('optgroup'); optg.label = '全部语言';
            rest.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; optg.appendChild(o); });
            langSel.appendChild(optg);
        }
    }
    // Populate device template dropdown
    const devSel = document.getElementById('fp-device-template');
    if (devSel && devicesFull.length) {
        devSel.innerHTML = '<option value="">(不使用设备模板)</option>';
        // Categorize devices
        const iphones = devicesFull.filter(d => d.name.includes('iPhone'));
        const ipads = devicesFull.filter(d => d.name.includes('iPad'));
        const androids = devicesFull.filter(d => !iphones.includes(d) && !ipads.includes(d) && (d.ua.includes('Android') || d.name.includes('Galaxy') || d.name.includes('Pixel') || d.name.includes('Nexus') || d.name.includes('Moto')));
        const others = devicesFull.filter(d => !iphones.includes(d) && !ipads.includes(d) && !androids.includes(d));

        const addGroup = (label, items) => {
            if (!items.length) return;
            const optg = document.createElement('optgroup');
            optg.label = label;
            items.forEach(d => {
                const o = document.createElement('option');
                o.value = d.name;
                o.textContent = `${d.name} (${d.width}×${d.height} @${d.dpr}x)`;
                optg.appendChild(o);
            });
            devSel.appendChild(optg);
        };
        addGroup('iPhone', iphones);
        addGroup('iPad', ipads);
        addGroup('Android', androids);
        if (others.length) addGroup('其它', others);
    }
    return PRESETS;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomDeviceName(platform) {
    const p = PRESETS;
    if (!p) return 'DESKTOP-XXXXXXX';
    const templates = p.devices.filter(d => d.platform === platform || !platform);
    if (!templates.length) return 'DESKTOP-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const tpl = pick(templates);
    return tpl.template
        .replace('{NAME}', pick(p.names))
        .replace('{ID}', Math.random().toString(36).slice(2, 9).toUpperCase());
}

function randomMAC() {
    // Generate a valid unicast MAC (bit 0 of first octet = 0, bit 1 = 0 for globally unique)
    const octets = Array.from({ length: 6 }, () => randInt(0, 255));
    octets[0] = octets[0] & 0xFC; // clear multicast + locally administered bits
    return octets.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-');
}

function randomWebGL(platform) {
    const p = PRESETS;
    if (!p || !p.webgl.length) return { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)' };
    let candidates;
    if (platform === 'iPhone' || platform === 'iPad') {
        candidates = p.webgl.filter(w => w.vendor === 'Apple Inc.');
    } else if (platform === 'Linux armv81') {
        candidates = p.webgl.filter(w => w.vendor === 'Qualcomm' || w.vendor === 'ARM');
    } else if (platform === 'MacIntel') {
        // Use Apple GPU renderers only — Intel Metal renderers expose hardware mismatch on non-Mac
        candidates = p.webgl.filter(w => w.vendor === 'Google Inc. (Apple)');
    } else if (platform === 'Linux x86_64') {
        candidates = p.webgl.filter(w => w.vendor.includes('(Intel)') || w.vendor.includes('(AMD)'));
        if (!candidates.length) candidates = p.webgl.filter(w => w.renderer.includes('ANGLE'));
    } else {
        // Win32: Intel, NVIDIA, AMD with Direct3D
        candidates = p.webgl.filter(w => w.renderer.includes('Direct3D'));
    }
    if (!candidates.length) candidates = p.webgl;
    return pick(candidates);
}

function randomFingerprint(platform) {
    const p = PRESETS;
    if (!p) return {};
    platform = platform || 'Win32';
    const webgl = randomWebGL(platform);
    const isMobile = ['iPhone', 'iPad', 'Linux armv81'].includes(platform);

    // Desktop uses a fixed 1920x1080; mobile uses device-specific sizes.
    let res;
    if (isMobile) {
        if (platform === 'iPhone') {
            res = pick(['393x852', '390x844', '375x812', '414x896', '430x932', '428x926', '360x780']);
        } else if (platform === 'iPad') {
            res = pick(['1024x1366', '834x1194', '820x1180', '810x1080']);
        } else {
            res = pick(['360x727', '360x792', '384x755', '360x800', '412x915', '393x873']);
        }
    } else {
        res = '1920x1080';
    }

    // CPU: 4 for desktop/Android, 0 for iPhone.
    let cpu;
    if (platform === 'iPhone' || platform === 'iPad') cpu = '0';
    else cpu = '4';

    // DPR: desktop=1, iPhone=3, Android=1 (can't truly emulate high DPR on Windows)
    let dpr;
    if (platform === 'iPhone') dpr = '3';
    else if (platform === 'iPad') dpr = '2';
    else dpr = '1';

    // Vendor: Apple for iOS/iPad, Google for everything else (including Mac!)
    const vendor = (platform === 'iPhone' || platform === 'iPad') ? 'Apple Computer, Inc.' : 'Google Inc.';

    // Touch: 5 for mobile, 0 for desktop
    const touchPoints = isMobile ? 5 : 0;

    return {
        platform,
        vendor,
        webgl_vendor: webgl.vendor,
        webgl_renderer: webgl.renderer,
        screen_resolution: res,
        hardware_concurrency: cpu,
        device_memory: '4',
        device_pixel_ratio: dpr,
        device_name: randomDeviceName(platform),
        mac_address: randomMAC(),
        canvas_mark: String(randInt(1000, 9999)),
        webgl_mark: String(randInt(1000, 9999)),
        audio_fp: randInt(100, 5000),
        client_rect_fp: randInt(-300, 300),
        max_touch_points: touchPoints,
        lang: 'en-US',
        accept_lang: 'en-US,en;q=0.9',
    };
}

// Generate a random UA based on kernel version + platform
// - Desktop: Chrome/<ver>.0.0.0 (no patch version)
// - iPhone/iPad CriOS: full version like CriOS/152.0.7977.166
// - Android: Reduced UA format (Linux; Android 10; K)
function randomUA(platform, kernelVersion) {
    kernelVersion = kernelVersion || '148';
    const p = PRESETS;

    if (p && p.uaAll && p.uaAll.length) {
        const platformFilters = {
            'Win32': u => u.includes('Windows NT') && !u.includes('Android'),
            'MacIntel': u => u.includes('Macintosh'),
            'Linux x86_64': u => u.includes('X11; Linux'),
            'iPhone': u => u.includes('iPhone'),
            'iPad': u => u.includes('iPad'),
            'Linux armv81': u => u.includes('Linux; Android'),
        };
        const filter = platformFilters[platform] || platformFilters['Win32'];
        let candidates = p.uaAll.filter(filter);

        if (candidates.length) {
            let ua = pick(candidates);
            // Desktop UA: just replace major version (format: Chrome/148.0.0.0)
            if (!isMobilePlatform(platform)) {
                ua = ua.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${kernelVersion}.0.0.0`);
            } else if (platform === 'Linux armv81') {
                // Android: same as desktop, Chrome/148.0.0.0
                ua = ua.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${kernelVersion}.0.0.0`);
            } else {
                // iPhone/iPad: CriOS with full version
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

function isMobilePlatform(platform) {
    return ['iPhone', 'iPad', 'Linux armv81'].includes(platform);
}


// ---- Device template application ----
// Given a device name from devices_full.json, determine the corresponding platform
function deviceToPlatform(device) {
    const name = device.name.toLowerCase();
    const ua = device.ua.toLowerCase();
    if (name.includes('iphone')) return 'iPhone';
    if (name.includes('ipad')) return 'iPad';
    if (ua.includes('android') || ua.includes('linux')) return 'Linux armv81';
    if (ua.includes('windows phone')) return 'Win32';
    // Fallback: mobile Linux-based = Android
    if (device.mobile) return 'Linux armv81';
    return 'Win32';
}

// Apply a device template: fills resolution, DPR, touch points, platform, vendor, and UA
function applyDeviceTemplate(deviceName) {
    if (!PRESETS || !PRESETS.devicesFull) return;
    const device = PRESETS.devicesFull.find(d => d.name === deviceName);
    if (!device) return;

    const platform = deviceToPlatform(device);
    const kernel = document.getElementById('fp-kernel').value || '148';

    // Set platform
    document.getElementById('fp-platform').value = platform;

    // Set vendor
    const vendor = (platform === 'iPhone' || platform === 'iPad') ? 'Apple Computer, Inc.' : 'Google Inc.';
    document.getElementById('fp-vendor').value = vendor;

    // Set resolution - add as custom option if not in list
    const resValue = device.width + 'x' + device.height;
    const resSel = document.getElementById('fp-resolution');
    const exists = Array.from(resSel.options).some(o => o.value === resValue);
    if (!exists) {
        const o = document.createElement('option');
        o.value = resValue;
        o.textContent = `${device.width}×${device.height} (${device.name})`;
        resSel.appendChild(o);
    }
    resSel.value = resValue;

    // Set DPR - add as custom option if not in list
    const dprSel = document.getElementById('fp-dpr');
    const dprStr = String(device.dpr);
    const dprExists = Array.from(dprSel.options).some(o => o.value === dprStr);
    if (!dprExists) {
        const o = document.createElement('option');
        o.value = dprStr;
        o.textContent = dprStr;
        dprSel.appendChild(o);
    }
    dprSel.value = dprStr;

    // Set touch points
    document.getElementById('fp-touch-points').value = device.touch ? '5' : '0';

    // Generate a proper UA for this device using the current kernel version
    // The device's UA is often outdated, so we generate a fresh Chrome UA for the correct platform
    document.getElementById('fp-ua').value = randomUA(platform, kernel);

    // For mobile devices, adjust hardware to realistic values
    if (device.mobile) {
        // Mobile typically has 4-8 cores and 4-8 GB RAM
        const cpuSel = document.getElementById('fp-cpu');
        const currentCpu = parseInt(cpuSel.value);
        if (currentCpu > 8) cpuSel.value = '8';

        const memSel = document.getElementById('fp-memory');
        const currentMem = parseInt(memSel.value);
        if (currentMem > 8) memSel.value = '8';
    }
}
