// Electron main process. Two roles:
//   1) Boot the LocalAPI HTTP server (runs even with --no-window).
//   2) Optionally show a tiny dashboard window for visibility.
//
// Both roles are independent: profiles are launched as *external* processes
// (not Electron BrowserWindows), so the GUI is purely cosmetic.

const path = require('path');
const { app, BrowserWindow, shell, Menu } = require('electron');

const { start: startApi } = require('./api');
const launcher = require('./launcher');
const { API_HOST, API_PORT, ensureDirs } = require('./config');

const noWindow = process.argv.includes('--no-window');
let apiServer = null;
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1380,
        height: 820,
        icon: path.join(__dirname, '..', 'icon.ico'),
        title: 'DeepBrowser',
        webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.removeMenu();
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
    });
}

app.whenReady().then(async () => {
    ensureDirs();
    apiServer = await startApi({ host: API_HOST, port: API_PORT });
    if (!noWindow) createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
    // Keep the API alive even after closing the window on Windows/Linux.
    // Quit only when the user really stops the process (Ctrl+C / tray exit).
});

async function gracefulShutdown(reason) {
    try {
        await launcher.stopAll();
        if (apiServer) await new Promise((res) => apiServer.close(res));
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
