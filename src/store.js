// Tiny synchronous JSON store. Sufficient for ~thousands of profiles.
// Atomic writes (write-temp + rename) so a crash never leaves a half-written file.

const fs = require('fs');
const path = require('path');
const { STORE_FILE, ensureDirs } = require('./config');

const DEFAULT = {
    profiles: [], // { id, name, group, remark, kernel, proxy_id, fingerprint, created_at, updated_at }
    proxies: [],  // { id, type, host, port, user, password, remark, created_at }
    settings: {}, // free-form
};

let cache = null;

function load() {
    if (cache) return cache;
    ensureDirs();
    if (!fs.existsSync(STORE_FILE)) {
        cache = JSON.parse(JSON.stringify(DEFAULT));
        save();
        return cache;
    }
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        cache = Object.assign({}, DEFAULT, JSON.parse(raw));
    } catch (e) {
        const bak = STORE_FILE + '.corrupt-' + Date.now();
        fs.copyFileSync(STORE_FILE, bak);
        cache = JSON.parse(JSON.stringify(DEFAULT));
        save();
    }
    return cache;
}

function save() {
    if (!cache) return;
    ensureDirs();
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, STORE_FILE);
}

function update(mutator) {
    load();
    mutator(cache);
    save();
}

module.exports = { load, save, update };
