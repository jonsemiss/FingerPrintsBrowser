const path = require('path');
const fs = require('fs');

// All paths are configurable via env vars. Kernel is resolved only from this repo.

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DATA_DIR =
    process.env.MYADS_DATA_DIR ||
    path.join(PROJECT_ROOT, 'data');

const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

function kernelExeIn(dir) {
    const deep = path.join(dir, 'DeepChrome.exe');
    if (fs.existsSync(deep)) return deep;
    const sun = path.join(dir, 'SunBrowser.exe');
    if (fs.existsSync(sun)) return sun;
    return '';
}

// Default kernel: MYADS_KERNEL, else newest bundled kernel/chrome_* .
function detectDefaultKernel() {
    if (process.env.MYADS_KERNEL) return process.env.MYADS_KERNEL;
    const kernelDir = path.join(PROJECT_ROOT, 'kernel');
    try {
        const dirs = fs.readdirSync(kernelDir)
            .filter(d => d.startsWith('chrome_') && kernelExeIn(path.join(kernelDir, d)))
            .sort((a, b) => parseInt(b.split('_')[1], 10) - parseInt(a.split('_')[1], 10));
        if (dirs.length) return kernelExeIn(path.join(kernelDir, dirs[0]));
    } catch { /* no kernel dir */ }
    return '';
}
const DEFAULT_KERNEL = detectDefaultKernel();

// Resolve kernel path from version string like "152" or "148"
function resolveKernel(version) {
    if (!version) return DEFAULT_KERNEL;
    const bundled = kernelExeIn(path.join(PROJECT_ROOT, 'kernel', `chrome_${version}`));
    if (bundled) return bundled;
    return DEFAULT_KERNEL;
}

const API_PORT = parseInt(process.env.MYADS_PORT || '50326', 10);
const API_HOST = process.env.MYADS_HOST || '127.0.0.1';
const API_TOKEN = process.env.MYADS_TOKEN || ''; // empty = no auth

function ensureDirs() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

module.exports = {
    PROJECT_ROOT,
    DATA_DIR,
    PROFILES_DIR,
    STORE_FILE,
    DEFAULT_KERNEL,
    resolveKernel,
    API_PORT,
    API_HOST,
    API_TOKEN,
    ensureDirs,
};
