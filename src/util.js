const crypto = require('crypto');

// Short id (8 lowercase chars). Prefix 'f' for this project.
function shortId(prefix = 'f') {
    const buf = crypto.randomBytes(6);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 7; i++) {
        s += alphabet[buf[i % buf.length] % alphabet.length];
    }
    return prefix + s;
}

function nowMs() { return Date.now(); }

function ok(data) { return { code: 0, msg: 'success', data }; }
function err(msg, code = -1) { return { code, msg, data: null }; }

function pickDefined(obj, keys) {
    const out = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

module.exports = { shortId, nowMs, ok, err, pickDefined };
