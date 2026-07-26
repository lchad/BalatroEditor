/**
 * Electron desktop adapter.
 * Only activates when running inside Electron (window.balatroDesktop exists).
 * Provides auto-loading of Balatro save files and native file I/O.
 * Has zero effect in browser/Cloudflare Pages.
 */

(function () {
    if (!window.balatroDesktop) return;

    const desktop = window.balatroDesktop;

    // ── Helper: base64 → Uint8Array (matching what jkr-converter expects) ──
    function base64ToUint8(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // ── Override loadMetaJSON to use real jkr files instead of demo data ──
    // In web mode, meta.js fetches data/meta.json (demo data). In desktop mode,
    // we load the actual meta.jkr from the game directory instead.
    async function loadDesktopSaveFiles() {
        const paths = await desktop.getSavePaths();

        // Show paths in footer
        document.querySelectorAll('[data-i18n="footer.file_location"]').forEach(el => {
            const parent = el.closest('.sidebar-footer') || el.parentElement;
            if (parent) {
                const info = document.createElement('div');
                info.className = 'desktop-paths';
                info.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:4px;line-height:1.6;';
                info.innerHTML = `<div>📂 ${paths.saveDir}</div>`;
                parent.appendChild(info);
            }
        });

        // Load meta.jkr from Balatro save directory
        const meta = await desktop.readBalatroFile('meta.jkr');
        if (!meta.error && meta.data) {
            try {
                const uint8 = base64ToUint8(meta.data);
                const jsonData = await window.jkrToJson(uint8);
                if (jsonData && jsonData.unlocked) {
                    window.metaData.unlocked = jsonData.unlocked || {};
                    window.metaData.discovered = jsonData.discovered || {};
                    window.metaData.alerted = jsonData.alerted || {};
                    updateStats(currentCategory);
                    renderCategory(currentCategory);
                    if (typeof showNotification === 'function') showNotification('meta.jkr loaded from game directory', 'success');
                }
            } catch (_) { /* silent fallback */ }
        }

        // Load profile.jkr
        const profile = await desktop.readBalatroFile('profile.jkr');
        if (!profile.error && profile.data) {
            window._desktopProfilePath = profile.path;
            try {
                const uint8 = base64ToUint8(profile.data);
                const jsonData = await window.jkrToJson(uint8);
                if (jsonData) {
                    window.profileData = jsonData;
                    if (typeof showNotification === 'function') showNotification('profile.jkr loaded', 'success');
                }
            } catch (_) { /* silent */ }
        }

        // Load save.jkr
        const save = await desktop.readBalatroFile('save.jkr');
        if (!save.error && save.data) {
            window._desktopSavePath = save.path;
            try {
                const uint8 = base64ToUint8(save.data);
                const jsonData = await window.jkrToJson(uint8);
                if (jsonData) {
                    window.saveData = jsonData;
                    if (typeof showNotification === 'function') showNotification('save.jkr loaded', 'success');
                }
            } catch (_) { /* silent */ }
        }

        // File watching
        desktop.startWatching();
        desktop.onFileChanged((filename) => {
            if (typeof showNotification === 'function') {
                showNotification(`${filename} changed — refresh to reload`, 'info');
            }
        });
    }

    // ── Skip safety modal in desktop mode (writing directly to game dir) ──
    if (window.showSafeDownloadModal) {
        window.showSafeDownloadModal = async () => true;
    }

    // ── Patch loadMetaJSON to skip demo data fetch, load real files instead ──
    const origLoadMetaJSON = window.loadMetaJSON;
    window.loadMetaJSON = async function () {
        // Still show skeleton loading
        if (typeof showCategorySkeletonLoading === 'function') {
            showCategorySkeletonLoading(currentCategory || 'jokers');
        }
        // Load real game files instead of demo data/meta.json
        await loadDesktopSaveFiles();
        window._desktopFileLoadDone = true;
    };

    // ── Override exportBlob for desktop ──────────────────────────────────
    // Save directly to Balatro game directory instead of downloading
    const origExportBlob = window.exportBlob;
    if (origExportBlob) {
        window.exportBlob = async function (blob, suggestedName, successMessage) {
            // Try direct write to game directory
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });

            const result = await desktop.writeBalatroFile(suggestedName, base64);
            if (result.success) {
                if (typeof showNotification === 'function') {
                    showNotification(`${suggestedName} saved to game directory`, 'success');
                }
                return;
            }

            // Fallback: show native save dialog
            const savePath = await desktop.showSaveDialog(suggestedName);
            if (savePath) {
                await desktop.writeFile(savePath, base64);
                if (typeof showNotification === 'function') showNotification(successMessage, 'success');
            }
        };
    }

    // ── Init on DOMContentLoaded ─────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoLoadBalatroFiles);
    } else {
        autoLoadBalatroFiles();
    }
})();
