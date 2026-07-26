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

    // ── Auto-load save files on startup ──────────────────────────────────
    async function autoLoadBalatroFiles() {
        const paths = await desktop.getSavePaths();

        // Show paths in footer for convenience
        document.querySelectorAll('[data-i18n="footer.file_location"]').forEach(el => {
            const parent = el.closest('.sidebar-footer') || el.parentElement;
            if (parent) {
                const info = document.createElement('div');
                info.className = 'desktop-paths';
                info.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:4px;line-height:1.6;';
                info.innerHTML = `
                    <div>📂 ${paths.saveDir}</div>
                `;
                parent.appendChild(info);
            }
        });

        // Try loading meta.jkr
        const meta = await desktop.readBalatroFile('meta.jkr');
        if (!meta.error && meta.data) {
            try {
                const uint8 = base64ToUint8(meta.data);
                const jsonData = await window.jkrToJson(uint8);
                if (jsonData && jsonData.unlocked) {
                    window.metaData.unlocked = jsonData.unlocked || {};
                    window.metaData.discovered = jsonData.discovered || {};
                    window.metaData.alerted = jsonData.alerted || {};
                    if (typeof renderCategory === 'function') renderCategory(window.currentCategory || 'jokers');
                    if (typeof showNotification === 'function') showNotification('meta.jkr loaded from game directory', 'success');
                }
            } catch (_) { /* silent fallback to old meta.json */ }
        }

        // Try loading profile.jkr
        const profile = await desktop.readBalatroFile('profile.jkr');
        if (!profile.error && profile.data) {
            // Store path for quick save-back
            window._desktopProfilePath = profile.path;
        }

        // Try loading save.jkr
        const save = await desktop.readBalatroFile('save.jkr');
        if (!save.error && save.data) {
            window._desktopSavePath = save.path;
        }

        // Start watching for file changes
        desktop.startWatching();
        desktop.onFileChanged((filename) => {
            if (typeof showNotification === 'function') {
                showNotification(`${filename} changed — refresh to reload`, 'info');
            }
        });
    }

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
