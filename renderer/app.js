// DeepBrowser — Renderer app logic
const API = 'http://127.0.0.1:50326';

// ---- Custom Dialog (replaces native alert/confirm) ----
function showDialog({ icon = '✅', title = '', body = '', buttons = ['确定'], danger = -1 }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('dialog-overlay');
        document.getElementById('dialog-icon').textContent = icon;
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-body').textContent = body;
        const footer = document.getElementById('dialog-footer');
        footer.innerHTML = '';
        buttons.forEach((label, i) => {
            const btn = document.createElement('button');
            btn.className = 'btn' + (i === danger ? ' btn-danger' : (i === buttons.length - 1 ? ' btn-primary' : ''));
            btn.textContent = label;
            btn.onclick = () => { overlay.style.display = 'none'; resolve(i); };
            footer.appendChild(btn);
        });
        overlay.style.display = 'flex';
    });
}
async function dialogAlert(body, { icon = '✅', title = '提示' } = {}) {
    await showDialog({ icon, title, body, buttons: ['确定'] });
}
async function dialogConfirm(body, { icon = '⚠️', title = '确认' } = {}) {
    const i = await showDialog({ icon, title, body, buttons: ['取消', '确定'], danger: -1 });
    return i === 1;
}
async function dialogSuccess(body) { await dialogAlert(body, { icon: '✅', title: '成功' }); }
async function dialogError(body) { await dialogAlert(body, { icon: '❌', title: '错误' }); }

async function api(method, path, body) {
    const r = await fetch(API + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
}

// ---- State ----
let profiles = [];
let proxies = [];
let editingProfileId = null;

// ---- Navigation ----
document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar nav a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + a.dataset.page).classList.add('active');
    });
});

// ---- Cookie parsing & validation ----
function parseCookies(raw, domain) {
    raw = (raw || '').trim();
    if (!raw) return [];

    // Try JSON array
    if (raw.startsWith('[')) {
        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) throw new Error('not array');
            for (const c of arr) {
                if (!c.name || !c.value) throw new Error('cookie missing name/value');
                if (!c.domain) throw new Error('cookie missing domain: ' + c.name);
            }
            return arr;
        } catch (e) { throw new Error('JSON 格式错误: ' + e.message); }
    }

    // Try Netscape format (tab-separated, lines starting with domain or #)
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length && lines[0].split('\t').length >= 7) {
        const cookies = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 7) continue;
            cookies.push({
                domain: parts[0],
                httpOnly: parts[1].toUpperCase() === 'TRUE',
                path: parts[2],
                secure: parts[3].toUpperCase() === 'TRUE',
                expires: parseInt(parts[4]) || 0,
                name: parts[5],
                value: parts[6],
            });
        }
        if (cookies.length) return cookies;
    }

    // Try simple key=value; key2=value2 format
    if (raw.includes('=')) {
        if (!domain) throw new Error('name=value 格式需要填写 Cookie 域名');
        const pairs = raw.split(';').map(s => s.trim()).filter(Boolean);
        const cookies = [];
        for (const pair of pairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx < 1) continue;
            cookies.push({
                name: pair.slice(0, eqIdx).trim(),
                value: pair.slice(eqIdx + 1).trim(),
                domain: domain,
                path: '/',
                secure: false,
                httpOnly: false,
                expires: Math.floor(Date.now() / 1000) + 365 * 86400,
            });
        }
        if (cookies.length) return cookies;
    }

    throw new Error('无法识别的 cookie 格式');
}

// Real-time validation hint
document.getElementById('fp-cookie').addEventListener('input', (e) => {
    const hint = document.getElementById('cookie-hint');
    const raw = e.target.value.trim();
    if (!raw) { hint.textContent = '支持 JSON数组 / Netscape / name=value 三种格式'; hint.style.color = 'var(--muted)'; return; }
    try {
        const domain = document.getElementById('fp-cookie-domain').value.trim();
        const parsed = parseCookies(raw, domain);
        hint.textContent = `✓ 解析成功: ${parsed.length} 条 cookie`;
        hint.style.color = 'var(--success)';
    } catch (err) {
        hint.textContent = `✗ ${err.message}`;
        hint.style.color = 'var(--danger)';
    }
});

// ---- Modal Tab switching ----
document.querySelectorAll('.modal-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        btn.closest('.modal-tabs').querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.closest('.modal').querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

// ---- Modal helpers ----
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    // Don't close modals on outside click (too easy to lose work)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            // Only allow closing if it's not the profile or proxy modal
            if (overlay.id !== 'modal-profile' && overlay.id !== 'modal-proxy') {
                overlay.style.display = 'none';
            }
        }
    });
});

// ---- API status ----
async function checkStatus() {
    try {
        const r = await api('GET', '/status');
        const dot = document.getElementById('api-dot');
        const txt = document.getElementById('api-status');
        if (r.code === 0) { dot.classList.add('online'); txt.textContent = `v${r.data.version} 已连接`; }
        else { dot.classList.remove('online'); txt.textContent = '异常'; }
    } catch { document.getElementById('api-dot').classList.remove('online'); document.getElementById('api-status').textContent = '未连接'; }
}

// ---- Profiles ----
async function loadProfiles() {
    const r = await api('GET', '/api/v1/browser/list?page_size=200');
    profiles = r.data ? r.data.list : [];
    renderProfiles();
}

let profileSortDesc = false; // false = 正序 (旧在前), true = 倒序 (新在前)

document.getElementById('btn-sort-profiles').addEventListener('click', () => {
    profileSortDesc = !profileSortDesc;
    const btn = document.getElementById('btn-sort-profiles');
    btn.textContent = profileSortDesc ? '倒序' : '正序';
    renderProfiles();
});

function renderProfiles() {
    const el = document.getElementById('profile-list');
    if (!profiles.length) {
        el.innerHTML = '<div class="empty-state">暂无 Profile，点击"新建"创建一个</div>';
        return;
    }
    const sorted = profileSortDesc ? [...profiles].reverse() : profiles;
    el.innerHTML = sorted.map(p => {
        const fp = p.fingerprint || {};
        const proxy = proxies.find(x => x.id === p.proxy_id);
        const initial = (p.name || p.id).charAt(0).toUpperCase();
        const serial = p.serial_number || '-';
        return `<div class="profile-card" data-id="${p.id}">
            <div class="avatar">${serial}</div>
            <div class="info">
                <div class="name">${esc(p.name || p.id)} <small style="color:var(--muted)">#${serial}</small></div>
                <div class="meta">
                    <span>${fp.lang || 'en-US'}</span>
                    <span>${fp.hardware_concurrency || 8}C / ${fp.device_memory || 8}GB</span>
                    <span>${proxy ? proxy.host + ':' + proxy.port : '直连'}</span>
                    <span>${p.group || 'default'}</span>
                </div>
            </div>
            <span class="status ${p.running ? 'running' : 'stopped'}">${p.running ? '运行中' : '已停止'}</span>
            <div class="actions">
                ${p.running
                    ? `<button class="btn btn-sm btn-danger" data-act="stop">停止</button>`
                    : `<button class="btn btn-sm btn-success" data-act="start">启动</button>`}
                <button class="btn btn-sm" data-act="edit">编辑</button>
                <button class="btn btn-sm btn-danger" data-act="delete">删除</button>
            </div>
        </div>`;
    }).join('');
}

document.getElementById('profile-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('.profile-card');
    const id = card.dataset.id;
    const act = btn.dataset.act;
    if (act === 'start') { await api('GET', `/api/v1/browser/start?id=${id}`); await refresh(); }
    else if (act === 'stop') { await api('GET', `/api/v1/browser/stop?id=${id}`); await refresh(); }
    else if (act === 'delete') { if (await dialogConfirm(`确定删除 Profile "${id}" ？\n\n此操作不可恢复。`, {icon: '🗑️', title: '删除确认'})) { await api('POST', '/api/v1/browser/delete', { ids: [id] }); await refresh(); } }
    else if (act === 'edit') { openEditProfile(id); }
});

document.getElementById('btn-create-profile').addEventListener('click', () => {
    editingProfileId = null;
    document.getElementById('modal-profile-title').textContent = '新建 Profile';
    // Reset all fields
    document.getElementById('fp-device-template').value = '';
    document.getElementById('fp-name').value = '';
    document.getElementById('fp-group').value = 'default';
    document.getElementById('fp-remark').value = '';
    document.getElementById('fp-tabs').value = 'https://www.browserscan.net/';
    document.getElementById('fp-proxy').value = '';
    document.getElementById('fp-ua').value = '';
    document.getElementById('fp-platform').value = 'Win32';
    document.getElementById('fp-lang').value = 'en-US';
    document.getElementById('fp-accept-lang').value = 'en-US,en;q=0.9';
    document.getElementById('fp-resolution').value = '1920x1080';
    document.getElementById('fp-timezone').value = '';
    document.getElementById('fp-geoposition').value = '';
    document.getElementById('fp-vendor').value = 'Google Inc.';
    document.getElementById('fp-cpu').value = '8';
    document.getElementById('fp-memory').value = '8';
    document.getElementById('fp-canvas').value = '';
    document.getElementById('fp-webgl-seed').value = '';
    document.getElementById('fp-audio').value = '';
    document.getElementById('fp-client-rect').value = '';
    document.getElementById('fp-webgl-vendor').value = 'Google Inc. (NVIDIA)';
    document.getElementById('fp-webgl-renderer').value = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001B83) Direct3D11 vs_5_0 ps_5_0, D3D11-23.21.13.9135)';
    document.getElementById('fp-touch-points').value = '0';
    document.getElementById('fp-dpr').value = '1';
    document.getElementById('fp-webrtc').value = 'disabled';
    document.getElementById('fp-geolocation').value = 'allow';
    document.getElementById('fp-port-scan').value = '1';
    document.getElementById('fp-dnt').value = 'default';
    document.getElementById('fp-flash').value = 'block';
    document.getElementById('fp-save-password').value = '0';
    document.getElementById('fp-mic-count').value = '1';
    document.getElementById('fp-cam-count').value = '1';
    document.getElementById('fp-speaker-count').value = '1';
    document.getElementById('fp-gpu').value = '1';
    document.getElementById('fp-fonts').value = '';
    document.getElementById('fp-launch-args').value = '';
    // Reset to first tab
    document.querySelector('#modal-profile .modal-tabs button').click();
    refreshProxySelect();
    showModal('modal-profile');
});

function openEditProfile(id) {
    const p = profiles.find(x => x.id === id); if (!p) return;
    editingProfileId = id;
    document.getElementById('modal-profile-title').textContent = '编辑 Profile';
    document.getElementById('fp-device-template').value = '';
    const fp = p.fingerprint || {};
    document.getElementById('fp-name').value = p.name || '';
    document.getElementById('fp-group').value = p.group || 'default';
    document.getElementById('fp-remark').value = p.remark || '';
    document.getElementById('fp-tabs').value = (p.tabs || []).join(', ');
    document.getElementById('fp-proxy').value = p.proxy_id || '';
    document.getElementById('fp-ua').value = fp.user_agent || '';
    document.getElementById('fp-platform').value = fp.platform || 'Win32';
    document.getElementById('fp-lang').value = fp.lang || 'en-US';
    document.getElementById('fp-accept-lang').value = fp.accept_lang || 'en-US,en;q=0.9';
    document.getElementById('fp-resolution').value = fp.screen_resolution || '1920x1080';
    document.getElementById('fp-timezone').value = fp.timezone || '';
    document.getElementById('fp-geoposition').value = fp.geoposition || '';
    document.getElementById('fp-vendor').value = fp.vendor || 'Google Inc.';
    document.getElementById('fp-cpu').value = fp.hardware_concurrency || 8;
    document.getElementById('fp-memory').value = fp.device_memory || 8;
    document.getElementById('fp-canvas').value = fp.canvas_mark || '';
    document.getElementById('fp-webgl-seed').value = fp.webgl_mark || '';
    document.getElementById('fp-audio').value = fp.audio_fp || '';
    document.getElementById('fp-client-rect').value = fp.client_rect_fp || '';
    document.getElementById('fp-webgl-vendor').value = fp.webgl_vendor || '';
    document.getElementById('fp-webgl-renderer').value = fp.webgl_renderer || '';
    document.getElementById('fp-touch-points').value = String(fp.max_touch_points ?? 0);
    document.getElementById('fp-dpr').value = String(fp.device_pixel_ratio || 1);
    document.getElementById('fp-webrtc').value = fp.webrtc_mode || (fp.disable_webrtc ? 'disabled' : 'disabled');
    document.getElementById('fp-geolocation').value = fp.geolocation_setting || 'allow';
    document.getElementById('fp-port-scan').value = fp.port_scan_protection || '1';
    document.getElementById('fp-dnt').value = fp.do_not_track || 'default';
    document.getElementById('fp-flash').value = fp.flash_setting || 'block';
    document.getElementById('fp-save-password').value = fp.disable_save_password !== false ? '0' : '1';
    // Content blocking
    document.getElementById('fp-block-images').value = fp.block_images ? '1' : '0';
    document.getElementById('fp-block-autoplay').value = fp.block_autoplay !== false ? '1' : '0';
    document.getElementById('fp-mute-audio').value = fp.mute_audio ? '1' : '0';
    document.getElementById('fp-block-translate').value = fp.block_translate !== false ? '1' : '0';
    document.getElementById('fp-block-password-popup').value = fp.block_password_popup !== false ? '1' : '0';
    document.getElementById('fp-block-notifications').value = fp.block_notifications !== false ? '1' : '0';
    document.getElementById('fp-block-clipboard').value = fp.block_clipboard !== false ? '1' : '0';
    const md = fp.media_devices || {};
    document.getElementById('fp-mic-count').value = String(md.audioinput || 1);
    document.getElementById('fp-cam-count').value = String(md.videoinput || 1);
    document.getElementById('fp-speaker-count').value = String(md.audiooutput || 1);
    document.getElementById('fp-gpu').value = fp.gpu || '1';
    document.getElementById('fp-fonts').value = (fp.fonts || []).join(', ');
    document.getElementById('fp-launch-args').value = (fp.launch_args || []).join(', ');
    // Reset to first tab
    document.querySelector('#modal-profile .modal-tabs button').click();
    refreshProxySelect();
    showModal('modal-profile');
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const fingerprint = {};
    const v = (id) => (document.getElementById(id).value || '').trim();

    if (v('fp-lang')) fingerprint.lang = v('fp-lang');
    if (v('fp-accept-lang')) fingerprint.accept_lang = v('fp-accept-lang');
    if (v('fp-timezone')) fingerprint.timezone = v('fp-timezone');
    if (v('fp-geoposition')) fingerprint.geoposition = v('fp-geoposition');
    if (v('fp-platform')) fingerprint.platform = v('fp-platform');
    if (v('fp-vendor')) fingerprint.vendor = v('fp-vendor');
    if (v('fp-ua')) fingerprint.user_agent = v('fp-ua');
    if (v('fp-resolution')) fingerprint.screen_resolution = v('fp-resolution');

    const cpu = parseInt(v('fp-cpu'));
    if (cpu) fingerprint.hardware_concurrency = cpu;
    const mem = parseInt(v('fp-memory'));
    if (mem) fingerprint.device_memory = mem;

    if (v('fp-canvas')) fingerprint.canvas_mark = v('fp-canvas');
    if (v('fp-webgl-seed')) fingerprint.webgl_mark = v('fp-webgl-seed');
    if (v('fp-audio')) fingerprint.audio_fp = parseInt(v('fp-audio'));
    if (v('fp-client-rect')) fingerprint.client_rect_fp = parseInt(v('fp-client-rect'));
    if (v('fp-webgl-vendor')) fingerprint.webgl_vendor = v('fp-webgl-vendor');
    if (v('fp-webgl-renderer')) fingerprint.webgl_renderer = v('fp-webgl-renderer');

    const touchPoints = parseInt(v('fp-touch-points'));
    fingerprint.max_touch_points = touchPoints;
    if (v('fp-dpr')) fingerprint.device_pixel_ratio = parseFloat(v('fp-dpr'));

    // Privacy
    fingerprint.disable_webrtc = v('fp-webrtc') === 'disabled';
    fingerprint.webrtc_mode = v('fp-webrtc');
    fingerprint.geolocation_setting = v('fp-geolocation');
    fingerprint.port_scan_protection = v('fp-port-scan');
    fingerprint.do_not_track = v('fp-dnt');
    fingerprint.flash_setting = v('fp-flash');
    fingerprint.disable_save_password = v('fp-save-password') === '0';

    // Content blocking
    fingerprint.block_images = v('fp-block-images') === '1';
    fingerprint.block_autoplay = v('fp-block-autoplay') === '1';
    fingerprint.mute_audio = v('fp-mute-audio') === '1';
    fingerprint.block_translate = v('fp-block-translate') === '1';
    fingerprint.block_password_popup = v('fp-block-password-popup') === '1';
    fingerprint.block_notifications = v('fp-block-notifications') === '1';
    fingerprint.block_clipboard = v('fp-block-clipboard') === '1';

    // Advanced
    fingerprint.media_devices = {
        audioinput: parseInt(v('fp-mic-count')) || 1,
        videoinput: parseInt(v('fp-cam-count')) || 1,
        audiooutput: parseInt(v('fp-speaker-count')) || 1,
    };
    fingerprint.gpu = v('fp-gpu');
    if (v('fp-fonts')) fingerprint.fonts = v('fp-fonts').split(',').map(s => s.trim()).filter(Boolean);
    if (v('fp-launch-args')) fingerprint.launch_args = v('fp-launch-args').split(',').map(s => s.trim()).filter(Boolean);

    const tabs = v('fp-tabs').split(',').map(s => s.trim()).filter(Boolean);

    // Parse cookies
    let cookies = null;
    const cookieRaw = document.getElementById('fp-cookie').value.trim();
    if (cookieRaw) {
        try {
            const domain = v('fp-cookie-domain');
            cookies = parseCookies(cookieRaw, domain);
        } catch (err) {
            dialogError('Cookie 格式错误: ' + err.message);
            return;
        }
    }

    const body = {
        name: v('fp-name') || undefined,
        group: v('fp-group') || 'default',
        remark: v('fp-remark') || '',
        proxy_id: document.getElementById('fp-proxy').value || null,
        kernel_version: document.getElementById('fp-kernel').value || null,
        fingerprint,
        tabs,
        cookies: cookies || undefined,
    };

    if (editingProfileId) {
        body.id = editingProfileId;
        await api('POST', '/api/v1/browser/update', body);
    } else {
        await api('POST', '/api/v1/browser/create', body);
    }
    hideModal('modal-profile');
    await refresh();
});

document.getElementById('btn-start-all').addEventListener('click', async () => {
    const stopped = profiles.filter(p => !p.running);
    await Promise.all(stopped.map(p => api('GET', `/api/v1/browser/start?id=${p.id}`)));
    await refresh();
});
document.getElementById('btn-stop-all').addEventListener('click', async () => {
    await api('GET', '/api/v1/browser/stop-all');
    await refresh();
});

// ---- Proxies ----
async function loadProxies() {
    const r = await api('GET', '/api/v1/proxy/list');
    const newList = r.data ? r.data.list : [];
    // Preserve check state across refreshes (from API data or local state)
    for (const p of newList) {
        // Use server-cached check result if available
        if (p.check_ok !== undefined) {
            p._checkOk = p.check_ok;
            p._checkIp = p.check_ip || '';
            p._checkCountry = p.check_country || '';
        } else {
            const old = proxies.find(x => x.id === p.id);
            if (old) {
                if (old._checkOk !== undefined) p._checkOk = old._checkOk;
                if (old._checkIp) p._checkIp = old._checkIp;
                if (old._checkCountry) p._checkCountry = old._checkCountry;
            }
        }
    }
    proxies = newList;
    renderProxies();
}

function renderProxies() {
    if (window._proxyCheckInProgress) return; // Don't re-render during batch check
    const tb = document.querySelector('#proxy-table tbody');
    if (!proxies.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">暂无代理</td></tr>'; return; }
    tb.innerHTML = proxies.map(p => {
        const checkState = p._checkOk === true ? 'background:var(--success,#4caf50);color:#fff;' : p._checkOk === false ? 'background:var(--danger,#e53935);color:#fff;' : '';
        const exitInfo = p._checkIp ? `<div style="font-size:12px;line-height:1.4">${p._checkIp}<br><span style="color:var(--muted)">${p._checkCountry || ''}</span></div>` : '<span style="color:var(--muted);font-size:12px">未检测</span>';
        return `<tr data-id="${p.id}">
        <td>${p.id}</td>
        <td>${p.type}</td>
        <td>${p.user ? p.user + ':' + (p.password || '') + '@' : ''}${p.host}:${p.port}</td>
        <td>${exitInfo}</td>
        <td>
            <button class="btn btn-sm" data-act="check" style="${checkState}">检测</button>
            <button class="btn btn-sm" data-act="edit">编辑</button>
            <button class="btn btn-sm btn-danger" data-act="delete">删除</button>
        </td>
    </tr>`;
    }).join('');
}

document.getElementById('proxy-table').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    if (btn.dataset.act === 'delete' && await dialogConfirm('确定删除代理 ' + id + ' ？', {icon: '🗑️', title: '删除确认'})) {
        await api('POST', '/api/v1/proxy/delete', { ids: [id] });
        await refresh();
    } else if (btn.dataset.act === 'check') {
        await checkSingleProxy(id, btn);
    } else if (btn.dataset.act === 'edit') {
        const p = proxies.find(x => x.id === id);
        if (!p) return;
        document.getElementById('px-type').value = p.type || 'http';
        document.getElementById('px-host').value = p.host || '';
        document.getElementById('px-port').value = p.port || '';
        document.getElementById('px-user').value = p.user || '';
        document.getElementById('px-pass').value = p.password || '';
        document.getElementById('modal-proxy').dataset.editId = id;
        document.querySelector('#modal-proxy .modal-header h2').textContent = '编辑代理';
        showModal('modal-proxy');
    }
});

document.getElementById('btn-create-proxy').addEventListener('click', () => {
    document.getElementById('px-host').value = '';
    document.getElementById('px-port').value = '';
    document.getElementById('px-user').value = '';
    document.getElementById('px-pass').value = '';
    document.getElementById('modal-proxy').dataset.editId = '';
    document.querySelector('#modal-proxy .modal-header h2').textContent = '添加代理';
    showModal('modal-proxy');
});

document.getElementById('btn-save-proxy').addEventListener('click', async () => {
    const body = {
        type: document.getElementById('px-type').value,
        host: document.getElementById('px-host').value.trim(),
        port: document.getElementById('px-port').value.trim(),
        user: document.getElementById('px-user').value.trim(),
        password: document.getElementById('px-pass').value,
    };
    if (!body.host || !body.port) { dialogError('主机和端口必填'); return; }
    const editId = document.getElementById('modal-proxy').dataset.editId;
    if (editId) {
        body.id = editId;
        await api('POST', '/api/v1/proxy/update', body);
    } else {
        await api('POST', '/api/v1/proxy/create', body);
    }
    hideModal('modal-proxy');
    await refresh();
});

// ---- Proxy Check ----
async function checkSingleProxy(id, btn) {
    const proxy = proxies.find(x => x.id === id);
    if (btn) { btn.disabled = true; btn.style.background = '#f0ad4e'; btn.style.color = '#fff'; }
    try {
        const r = await api('GET', `/api/v1/proxy/check?id=${id}`);
        if (r.code === 0 && r.data) {
            const d = r.data;
            if (proxy) { proxy._checkOk = true; proxy._checkIp = d.ip; proxy._checkCountry = d.country; }
            if (btn) { btn.style.background = 'var(--success, #4caf50)'; btn.disabled = false; }
        } else {
            if (proxy) { proxy._checkOk = false; proxy._checkIp = ''; proxy._checkCountry = ''; }
            if (btn) { btn.style.background = 'var(--danger, #e53935)'; btn.disabled = false; }
        }
    } catch (err) {
        if (proxy) { proxy._checkOk = false; proxy._checkIp = ''; proxy._checkCountry = ''; }
        if (btn) { btn.style.background = 'var(--danger, #e53935)'; btn.disabled = false; }
    }
    // Update only the exit cell of this row (don't re-render entire table)
    if (btn) {
        const row = btn.closest('tr');
        if (row) {
            const exitCell = row.cells[3]; // 4th column = exit info
            if (proxy && proxy._checkIp) {
                exitCell.innerHTML = '<div style="font-size:12px;line-height:1.4">' + proxy._checkIp + '<br><span style="color:var(--muted)">' + (proxy._checkCountry || '') + '</span></div>';
            }
        }
    }
}

document.getElementById('btn-check-all-proxy').addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-all-proxy');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    window._proxyCheckInProgress = true; // Prevent refresh loop from re-rendering
    // Turn all check buttons yellow and disable them
    const rows = document.querySelectorAll('#proxy-table tbody tr[data-id]');
    rows.forEach(row => {
        const b = row.querySelector('[data-act="check"]');
        if (b) { b.disabled = true; b.style.background = '#f0ad4e'; b.style.color = '#fff'; }
    });
    // Check all proxies sequentially
    for (const row of rows) {
        const id = row.dataset.id;
        const checkBtn = row.querySelector('[data-act="check"]');
        await checkSingleProxy(id, checkBtn);
    }
    window._proxyCheckInProgress = false;
    btn.disabled = false;
    btn.style.opacity = '';
    renderProxies();
});

// ---- Import Proxy ----
document.getElementById('btn-import-proxy').addEventListener('click', () => {
    document.getElementById('import-proxy-text').value = '';
    showModal('modal-import-proxy');
});

function parseProxyLine(line) {
    line = line.trim();
    if (!line) return null;

    // Format: type://user:pass@host:port  or  type://host:port  or  host:port
    let type = 'http';
    let user = '';
    let password = '';
    let host = '';
    let port = '';

    // Extract type prefix
    const typeMatch = line.match(/^(https?|socks5):\/\//i);
    if (typeMatch) {
        type = typeMatch[1].toLowerCase();
        line = line.slice(typeMatch[0].length);
    }

    // Check for user:pass@
    const atIdx = line.lastIndexOf('@');
    if (atIdx > 0) {
        const authPart = line.slice(0, atIdx);
        const hostPart = line.slice(atIdx + 1);
        const colonIdx = authPart.indexOf(':');
        if (colonIdx > 0) {
            user = authPart.slice(0, colonIdx);
            password = authPart.slice(colonIdx + 1);
        } else {
            user = authPart;
        }
        line = hostPart;
    }

    // Parse host:port (support IPv6 [host]:port)
    if (line.startsWith('[')) {
        const closeBracket = line.indexOf(']');
        if (closeBracket > 0) {
            host = line.slice(1, closeBracket);
            const rest = line.slice(closeBracket + 1);
            if (rest.startsWith(':')) port = rest.slice(1);
        }
    } else {
        const lastColon = line.lastIndexOf(':');
        if (lastColon > 0) {
            host = line.slice(0, lastColon);
            port = line.slice(lastColon + 1);
        } else {
            host = line;
        }
    }

    if (!host || !port) return null;
    return { type, host, port, user, password };
}

document.getElementById('btn-do-import-proxy').addEventListener('click', async () => {
    const text = document.getElementById('import-proxy-text').value;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { dialogError('请输入至少一条代理'); return; }

    const parsed = [];
    const errors = [];
    for (let i = 0; i < lines.length; i++) {
        const result = parseProxyLine(lines[i]);
        if (result) parsed.push(result);
        else errors.push(`第 ${i + 1} 行格式错误: ${lines[i].slice(0, 50)}`);
    }

    if (errors.length && parsed.length === 0) {
        dialogError(errors.join('\n'));
        return;
    }

    // Create all parsed proxies
    let success = 0;
    for (const p of parsed) {
        const r = await api('POST', '/api/v1/proxy/create', p);
        if (r.code === 0) success++;
    }

    hideModal('modal-import-proxy');
    await refresh();
    await dialogSuccess(`成功导入 ${success} 条代理${errors.length ? `\n\n${errors.length} 条格式错误已跳过` : ''}`);
});

function refreshProxySelect() {
    const sel = document.getElementById('fp-proxy');
    sel.innerHTML = '<option value="">(无代理 - 直连)</option>' + proxies.map(p => {
        const auth = p.user ? `${p.user}:${p.password || '***'}@` : '';
        const label = `${p.type}://${auth}${p.host}:${p.port}${p.remark ? ' (' + p.remark + ')' : ''}`;
        return `<option value="${p.id}">${label}</option>`;
    }).join('');
}

// ---- Utility ----
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---- Refresh loop ----
async function refresh() {
    await Promise.all([loadProfiles(), loadProxies()]);
}

async function init() {
    await loadPresets();
    await checkStatus();
    await refresh();
    setInterval(checkStatus, 5000);
    setInterval(refresh, 3000);
}

// ---- Random UA button ----
document.getElementById('btn-random-ua').addEventListener('click', async () => {
    await loadPresets();
    const platform = document.getElementById('fp-platform').value;
    const kernel = document.getElementById('fp-kernel').value;
    document.getElementById('fp-ua').value = randomUA(platform, kernel);
});

// ---- Random fingerprint button ----
document.getElementById('btn-random-fp').addEventListener('click', async () => {
    await loadPresets();
    const platform = document.getElementById('fp-platform').value;
    const kernel = document.getElementById('fp-kernel') ? document.getElementById('fp-kernel').value : '146';
    const fp = randomFingerprint(platform);
    // UA
    document.getElementById('fp-ua').value = randomUA(platform, kernel);
    // Platform & Vendor (make sure they stay in sync)
    document.getElementById('fp-platform').value = platform;
    document.getElementById('fp-vendor').value = fp.vendor || 'Google Inc.';
    // WebGL
    if (fp.webgl_vendor) document.getElementById('fp-webgl-vendor').value = fp.webgl_vendor;
    if (fp.webgl_renderer) document.getElementById('fp-webgl-renderer').value = fp.webgl_renderer;
    // Resolution - set value, if not in options add it
    const resSel = document.getElementById('fp-resolution');
    if (fp.screen_resolution) {
        const exists = Array.from(resSel.options).some(o => o.value === fp.screen_resolution);
        if (!exists) { const o = document.createElement('option'); o.value = fp.screen_resolution; o.textContent = fp.screen_resolution; resSel.appendChild(o); }
        resSel.value = fp.screen_resolution;
    }
    // Hardware
    document.getElementById('fp-cpu').value = String(fp.hardware_concurrency || '8');
    document.getElementById('fp-memory').value = String(fp.device_memory || '8');
    document.getElementById('fp-vendor').value = fp.vendor || 'Google Inc.';
    document.getElementById('fp-canvas').value = fp.canvas_mark || '';
    document.getElementById('fp-webgl-seed').value = fp.webgl_mark || '';
    document.getElementById('fp-audio').value = String(fp.audio_fp || '');
    document.getElementById('fp-client-rect').value = String(fp.client_rect_fp || '');
    document.getElementById('fp-touch-points').value = String(fp.max_touch_points || 0);
    if (fp.accept_lang) document.getElementById('fp-accept-lang').value = fp.accept_lang;
});

// ---- Device template selection ----
document.getElementById('fp-device-template').addEventListener('change', (e) => {
    const deviceName = e.target.value;
    if (!deviceName) return; // "(不使用设备模板)" selected, do nothing
    applyDeviceTemplate(deviceName);
});

// When kernel changes and a device template is active, re-generate UA
document.getElementById('fp-kernel').addEventListener('change', () => {
    const deviceName = document.getElementById('fp-device-template').value;
    if (deviceName) {
        // Re-apply to get a fresh UA with the new kernel version
        const platform = document.getElementById('fp-platform').value;
        const kernel = document.getElementById('fp-kernel').value;
        document.getElementById('fp-ua').value = randomUA(platform, kernel);
    }
});

// When platform changes manually, reset device template to "(none)" and update vendor
document.getElementById('fp-platform').addEventListener('change', () => {
    document.getElementById('fp-device-template').value = '';
    const platform = document.getElementById('fp-platform').value;
    // Auto-switch vendor based on platform
    if (platform === 'iPhone' || platform === 'iPad') {
        document.getElementById('fp-vendor').value = 'Apple Computer, Inc.';
    } else {
        document.getElementById('fp-vendor').value = 'Google Inc.';
    }
});

init();
