const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Detect Balatro save directory per platform
// All JKR files (meta.jkr, profile.jkr, save.jkr) live in the same directory
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

    // Pipe renderer console logs to terminal
    mainWindow.webContents.on('console-message', (_event, level, message) => {
        const prefix = ['', 'log', 'warn', 'error'][level] || 'log';
        console.log(`[renderer:${prefix}] ${message}`);
    });

    // Auto-open DevTools in development
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

// ── IPC handlers ──────────────────────────────────────────────

// Read a JKR file from the save directory
ipcMain.handle('fs:readBalatroFile', async (_event, filename) => {
    const baseDir = getBalatroSaveDir();
    if (!baseDir) return { error: 'Unsupported platform' };
    const filePath = path.join(baseDir, filename);
    if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
    try {
        const data = fs.readFileSync(filePath);
        return { data: Buffer.from(data).toString('base64'), path: filePath };
    } catch (err) {
        return { error: err.message };
    }
});

// Write a JKR file to the save directory
ipcMain.handle('fs:writeBalatroFile', async (_event, filename, base64Data) => {
    const baseDir = getBalatroSaveDir();
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

// Get system locale from Electron (more reliable than navigator.language on some systems)
ipcMain.handle('app:getLocale', () => app.getLocale().toLowerCase().replace('-', '_'));

// Get Balatro save paths
ipcMain.handle('app:getSavePaths', () => ({
    saveDir: getBalatroSaveDir(),
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

// ── App menu ──────────────────────────────────────────────────

const appMenu = Menu.buildFromTemplate([
    {
        label: 'Balatro Editor',
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
                label: 'Restart Balatro Editor',
                accelerator: 'CmdOrCtrl+R',
                click: () => {
                    app.relaunch();
                    app.quit();
                }
            },
            { type: 'separator' },
            { role: 'quit' }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }
]);

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
    Menu.setApplicationMenu(appMenu);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (watcher) watcher.close();
    if (process.platform !== 'darwin') app.quit();
});
