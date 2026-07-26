const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Auto-detect Balatro save directory per platform
function getBalatroSaveDir() {
    switch (process.platform) {
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support', 'Balatro', '1');
        case 'win32':
            return path.join(process.env.APPDATA || '', 'Balatro', '1');
        case 'linux':
            return path.join(os.homedir(), '.local', 'share', 'Balatro', '1');
        default:
            return null;
    }
}

// Also detect profile.jkr location (same root, different filename)
function getBalatroProfileDir() {
    const dir = getBalatroSaveDir();
    if (!dir) return null;
    return path.resolve(dir, '..');  // profile.jkr is one level above save.jkr
}

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 650,
        title: 'Balatro Editor',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,  // Allow fetch('data/meta.json') on file://
        },
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
}

// ── IPC handlers ──────────────────────────────────────────────

// Read a JKR file from the active save directory
ipcMain.handle('fs:readBalatroFile', async (_event, filename) => {
    const baseDir = filename === 'profile.jkr' ? getBalatroProfileDir() : getBalatroSaveDir();
    if (!baseDir) return { error: 'Unsupported platform' };
    const filePath = path.join(baseDir, filename);
    if (!fs.existsSync(filePath)) return { error: `File not found: ${filename}` };
    try {
        const data = fs.readFileSync(filePath);
        // Return as base64 for binary-safe transfer across IPC
        return { data: data.buffer ? Buffer.from(data).toString('base64') : Buffer.from(data).toString('base64'), path: filePath };
    } catch (err) {
        return { error: err.message };
    }
});

// Write a JKR file to the active save directory
ipcMain.handle('fs:writeBalatroFile', async (_event, filename, base64Data) => {
    const baseDir = filename === 'profile.jkr' ? getBalatroProfileDir() : getBalatroSaveDir();
    if (!baseDir) return { error: 'Unsupported platform' };
    const filePath = path.join(baseDir, filename);
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (err) {
        return { error: err.message };
    }
});

// Open save dialog for manual export fallback
ipcMain.handle('fs:showSaveDialog', async (_event, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: 'Balatro JKR', extensions: ['jkr'] }],
    });
    if (result.canceled) return null;
    return result.filePath;
});

// Write file to an arbitrary path (for manual export)
ipcMain.handle('fs:writeFile', async (_event, filePath, base64Data) => {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
});

// Get platform info for UI
ipcMain.handle('app:getPlatform', () => process.platform);

// Get Balatro save paths
ipcMain.handle('app:getSavePaths', () => ({
    saveDir: getBalatroSaveDir(),
    profileDir: getBalatroProfileDir(),
    platform: process.platform,
}));

// ── File watching for auto-reload ─────────────────────────────
let watcher = null;

ipcMain.handle('fs:startWatching', () => {
    const dir = getBalatroSaveDir();
    if (!dir || !fs.existsSync(dir)) return;
    if (watcher) watcher.close();
    try {
        watcher = fs.watch(dir, (eventType, filename) => {
            if (filename && filename.endsWith('.jkr') && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('fs:fileChanged', filename);
            }
        });
    } catch (_) {
        // Directory might not exist if user hasn't played yet
    }
});

ipcMain.handle('fs:stopWatching', () => {
    if (watcher) { watcher.close(); watcher = null; }
});

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (watcher) watcher.close();
    if (process.platform !== 'darwin') app.quit();
});
