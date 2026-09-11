// HTTP API for profile, browser, and proxy control.
//
//   GET  /status
//   GET  /api/v1/browser/list                       ?page=1&page_size=50&group=&q=
//   POST /api/v1/browser/create
//   POST /api/v1/browser/update                     { id, ... }
//   POST /api/v1/browser/delete                     { ids: [] }
//   GET  /api/v1/browser/start                      ?id=<id>&headless=0
//   GET  /api/v1/browser/stop                       ?id=<id>&force=0
//   GET  /api/v1/browser/stop-all
//   GET  /api/v1/browser/active                     -> running list
//   GET  /api/v1/browser/active/one                 ?id=<id>
//   GET  /api/v1/proxy/list
//   POST /api/v1/proxy/create
//   POST /api/v1/proxy/update
//   POST /api/v1/proxy/delete                       { ids: [] }

const express = require('express');
const path = require('path');
const fs = require('fs');

const { API_PORT, API_HOST, API_TOKEN } = require('./config');
const store = require('./store');
const launcher = require('./launcher');
const { shortId, nowMs, ok, err } = require('./util');

function authMiddleware(req, res, next) {
    if (!API_TOKEN) return next();
    const h = req.headers['authorization'] || '';
    if (h === `Bearer ${API_TOKEN}`) return next();
    return res.status(401).json(err('unauthorized', 401));
}

function findProfile(id) {
    const db = store.load();
    return db.profiles.find((p) => p.id === id);
}
function findProxy(id) {
    if (!id) return null;
    const db = store.load();
    return db.proxies.find((p) => p.id === id) || null;
}

// Check proxy connectivity using proxy-chain + http.get (works for HTTP and SOCKS5)
async function checkProxy(proxyConfig) {
    const proxyChain = require('proxy-chain');
    const http = require('http');
    const { HttpProxyAgent } = (() => { try { return require('http-proxy-agent'); } catch { return {}; } })();

    const { type, host, port, user, password } = proxyConfig;
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@` : '';
    const upstream = `${type}://${auth}${host}:${port}`;

    // proxy-chain converts any proxy (including socks5) to a local HTTP proxy
    const localProxy = await proxyChain.anonymizeProxy(upstream);

    const startTime = Date.now();
    try {
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('代理连接超时 (15s)')), 15000);

            // Use CONNECT tunnel through the local proxy to reach ip-api.com:80
            const proxyUrl = new URL(localProxy);
            const connectOpts = {
                hostname: proxyUrl.hostname,
                port: proxyUrl.port,
                method: 'CONNECT',
                path: 'ip-api.com:80',
            };

            const connectReq = http.request(connectOpts);
            connectReq.on('connect', (res, socket) => {
                if (res.statusCode !== 200) {
                    clearTimeout(timeout);
                    reject(new Error(`CONNECT failed: ${res.statusCode}`));
                    return;
                }
                // Send HTTP request through the tunnel
                const reqData = 'GET /json/?fields=query,country,regionName,city,timezone,lat,lon HTTP/1.1\r\nHost: ip-api.com\r\nUser-Agent: curl/8.0\r\nConnection: close\r\n\r\n';
                socket.write(reqData);
                let data = '';
                socket.on('data', c => data += c.toString());
                socket.on('end', () => {
                    clearTimeout(timeout);
                    // Extract JSON body from HTTP response
                    const bodyStart = data.indexOf('\r\n\r\n');
                    const body = bodyStart >= 0 ? data.slice(bodyStart + 4) : data;
                    try { resolve(JSON.parse(body.trim())); }
                    catch { reject(new Error('响应解析失败')); }
                });
                socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
            });
            connectReq.on('error', (e) => { clearTimeout(timeout); reject(new Error(`连接失败: ${e.message}`)); });
            connectReq.end();
        });

        const latency = Date.now() - startTime;
        await proxyChain.closeAnonymizedProxy(localProxy, true);

        return {
            ip: result.query,
            country: result.country,
            region: result.regionName,
            city: result.city,
            timezone: result.timezone,
            lat: result.lat,
            lon: result.lon,
            latency_ms: latency,
        };
    } catch (e) {
        await proxyChain.closeAnonymizedProxy(localProxy, true).catch(() => {});
        throw e;
    }
}

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use(authMiddleware);

    app.get('/status', (req, res) => res.json(ok({ version: '0.1.0' })));

    // ---- Profiles ----
    app.get('/api/v1/browser/list', (req, res) => {
        const db = store.load();
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query.page_size || '50', 10)));
        const q = (req.query.q || '').toString().toLowerCase();
        const group = (req.query.group || '').toString();

        let list = db.profiles;
        if (q) list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || p.id.includes(q));
        if (group) list = list.filter((p) => p.group === group);

        const total = list.length;
        const start = (page - 1) * pageSize;
        const items = list.slice(start, start + pageSize).map((p) => ({
            ...p,
            running: launcher.isRunning(p.id),
        }));
        res.json(ok({ list: items, total, page, page_size: pageSize }));
    });

    app.post('/api/v1/browser/create', (req, res) => {
        const body = req.body || {};
        const id = body.id || shortId('f');
        const now = nowMs();
        const db = store.load();
        const maxSerial = db.profiles.reduce((max, p) => Math.max(max, p.serial_number || 0), 0);
        const serialNumber = body.serial_number || (maxSerial + 1);

        // Auto-fill fingerprint if key fields are missing (same as GUI's randomFingerprint)
        const fp = body.fingerprint || {};
        if (!fp.user_agent || !fp.webgl_vendor || !fp.screen_resolution) {
            const { randomFingerprint } = require('./fingerprint');
            const generated = randomFingerprint(fp.platform || 'Win32', body.kernel_version || '148');
            for (const [k, v] of Object.entries(generated)) {
                if (fp[k] === undefined || fp[k] === null || fp[k] === '') fp[k] = v;
            }
        }

        const profile = {
            id,
            serial_number: serialNumber,
            name: body.name || id,
            group: body.group || 'default',
            remark: body.remark || '',
            kernel: body.kernel || null,
            kernel_version: body.kernel_version || null,
            proxy_id: body.proxy_id || null,
            fingerprint: fp,
            tabs: Array.isArray(body.tabs) ? body.tabs : [],
            cookies: Array.isArray(body.cookies) ? body.cookies : null,
            created_at: now,
            updated_at: now,
        };
        store.update((db) => {
            if (db.profiles.find((p) => p.id === id)) throw new Error(`profile id exists: ${id}`);
            db.profiles.push(profile);
        });
        res.json(ok(profile));
    });

    app.post('/api/v1/browser/update', (req, res) => {
        const body = req.body || {};
        if (!body.id) return res.json(err('id is required'));
        const updatable = ['name', 'group', 'remark', 'kernel', 'kernel_version', 'proxy_id', 'fingerprint', 'tabs', 'cookies'];
        let updated = null;
        store.update((db) => {
            const i = db.profiles.findIndex((p) => p.id === body.id);
            if (i < 0) throw new Error(`profile not found: ${body.id}`);
            const cur = db.profiles[i];
            for (const k of updatable) if (body[k] !== undefined) cur[k] = body[k];
            cur.updated_at = nowMs();
            updated = cur;
        });
        res.json(ok(updated));
    });

    app.post('/api/v1/browser/delete', async (req, res) => {
        const ids = (req.body && req.body.ids) || [];
        if (!Array.isArray(ids) || !ids.length) return res.json(err('ids[] required'));
        for (const id of ids) if (launcher.isRunning(id)) await launcher.stop(id, { force: true });
        const removed = [];
        store.update((db) => {
            db.profiles = db.profiles.filter((p) => {
                if (ids.includes(p.id)) { removed.push(p.id); return false; }
                return true;
            });
        });
        for (const id of removed) {
            const dir = launcher.userDataDirFor(id);
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
        res.json(ok({ removed }));
    });

    // ---- Browser control ----
    app.get('/api/v1/browser/start', async (req, res) => {
        const id = (req.query.id || '').toString();
        const profile = findProfile(id);
        if (!profile) return res.json(err(`profile not found: ${id}`));
        const proxy = findProxy(profile.proxy_id);
        try {
            const r = await launcher.launch(profile, { proxy });
            res.json(ok({
                profile_id: id,
                pid: r.pid,
                ws: { puppeteer: r.wsEndpoint, selenium: `127.0.0.1:${r.debugPort}` },
                debug_port: r.debugPort,
                user_data_dir: launcher.userDataDirFor(id),
            }));
        } catch (e) {
            res.json(err(e.message));
        }
    });

    app.get('/api/v1/browser/stop', async (req, res) => {
        const id = (req.query.id || '').toString();
        const force = req.query.force === '1' || req.query.force === 'true';
        const ok_ = await launcher.stop(id, { force });
        res.json(ok({ stopped: ok_, id }));
    });

    app.get('/api/v1/browser/stop-all', async (req, res) => {
        const ids = await launcher.stopAll();
        res.json(ok({ stopped: ids }));
    });

    app.get('/api/v1/browser/active', (req, res) => {
        res.json(ok({ list: launcher.listRunning() }));
    });

    app.get('/api/v1/browser/active/one', (req, res) => {
        const id = (req.query.id || '').toString();
        const r = launcher.getRunning(id);
        if (!r) return res.json(ok({ running: false, id }));
        res.json(ok({
            running: true, id, pid: r.pid,
            ws: { puppeteer: r.wsEndpoint, selenium: `127.0.0.1:${r.debugPort}` },
            debug_port: r.debugPort, started_at: r.startedAt,
        }));
    });

    // ---- Proxies ----
    app.get('/api/v1/proxy/list', (req, res) => {
        const db = store.load();
        res.json(ok({ list: db.proxies, total: db.proxies.length }));
    });

    app.get('/api/v1/proxy/check', async (req, res) => {
        const id = (req.query.id || '').toString();
        const proxy = findProxy(id);
        if (!proxy) return res.json(err('proxy not found: ' + id));
        try {
            const result = await checkProxy(proxy);
            // Cache result in store
            store.update((db) => {
                const p = db.proxies.find(x => x.id === id);
                if (p) {
                    p.check_ok = true;
                    p.check_ip = result.ip;
                    p.check_country = result.country;
                    p.check_time = Date.now();
                }
            });
            res.json(ok(result));
        } catch (e) {
            store.update((db) => {
                const p = db.proxies.find(x => x.id === id);
                if (p) { p.check_ok = false; p.check_ip = ''; p.check_country = ''; p.check_time = Date.now(); }
            });
            res.json(err(e.message));
        }
    });

    app.post('/api/v1/proxy/create', (req, res) => {
        const body = req.body || {};
        if (!body.type || !body.host || !body.port) return res.json(err('type, host, port required'));
        const db = store.load();
        const maxId = db.proxies.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
        const id = body.id || String(maxId + 1);
        const now = nowMs();
        const proxy = {
            id,
            type: body.type,
            host: body.host,
            port: String(body.port),
            user: body.user || '',
            password: body.password || '',
            created_at: now,
        };
        store.update((db) => {
            if (db.proxies.find((p) => p.id === id)) throw new Error(`proxy id exists: ${id}`);
            db.proxies.push(proxy);
        });
        res.json(ok(proxy));
    });

    app.post('/api/v1/proxy/update', (req, res) => {
        const body = req.body || {};
        if (!body.id) return res.json(err('id is required'));
        const updatable = ['type', 'host', 'port', 'user', 'password', 'remark'];
        let updated = null;
        store.update((db) => {
            const i = db.proxies.findIndex((p) => p.id === body.id);
            if (i < 0) throw new Error(`proxy not found: ${body.id}`);
            const cur = db.proxies[i];
            for (const k of updatable) if (body[k] !== undefined) cur[k] = body[k];
            updated = cur;
        });
        res.json(ok(updated));
    });

    app.post('/api/v1/proxy/delete', (req, res) => {
        const ids = (req.body && req.body.ids) || [];
        if (!Array.isArray(ids) || !ids.length) return res.json(err('ids[] required'));
        const removed = [];
        store.update((db) => {
            db.proxies = db.proxies.filter((p) => {
                if (ids.includes(p.id)) { removed.push(p.id); return false; }
                return true;
            });
        });
        res.json(ok({ removed }));
    });

    // ---- Catch-all ----
    app.use((req, res) => res.status(404).json(err(`not found: ${req.method} ${req.path}`, 404)));

    // Express 4 error handler
    // eslint-disable-next-line no-unused-vars
    app.use((errObj, req, res, _next) => {
        res.status(500).json(err(errObj.message || 'internal error', 500));
    });

    return app;
}

function start({ host = API_HOST, port = API_PORT } = {}) {
    return new Promise((resolve, reject) => {
        const app = buildApp();
        const server = app.listen(port, host, () => {
            console.log(`[my-ads-browser] LocalAPI on http://${host}:${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = { start, buildApp };
