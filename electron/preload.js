const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('balatroDesktop', {
    // Read a JKR file from the Balatro game directory
    readBalatroFile: (filename) => ipcRenderer.invoke('fs:readBalatroFile', filename),

    // Write a JKR file to the Balatro game directory
    writeBalatroFile: (filename, base64Data) => ipcRenderer.invoke('fs:writeBalatroFile', filename, base64Data),

    // Open system save dialog and write to chosen path
    showSaveDialog: (defaultName) => ipcRenderer.invoke('fs:showSaveDialog', defaultName),

    // Write file to arbitrary path
    writeFile: (filePath, base64Data) => ipcRenderer.invoke('fs:writeFile', filePath, base64Data),

    // Get current platform
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

    // Get Balatro game save directories
    getSavePaths: () => ipcRenderer.invoke('app:getSavePaths'),

    // File watching
    startWatching: () => ipcRenderer.invoke('fs:startWatching'),
    stopWatching: () => ipcRenderer.invoke('fs:stopWatching'),
    onFileChanged: (callback) => {
        ipcRenderer.on('fs:fileChanged', (_event, filename) => callback(filename));
    },
});
