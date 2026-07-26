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

    // ── Desktop-only UI tweaks ──────────────────────────────────────
    // Hide import/export controls (files loaded/saved from game dir directly)
    // Some buttons are rendered dynamically (profile, save editor), so
    // we use a MutationObserver to catch them when they appear.
    function hideDesktopButtons() {
        // Static buttons (in sidebar HTML)
        const staticBtns = [
            '#export-jkr',
            'label[for="import-jkr"]',
        ];
        staticBtns.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
        });
        // Dynamic buttons (added to DOM after render)
        // Profile "save & export" — auto-saved on toggle.
        // Save-editor "导入 save.jkr" — no save file in desktop mode yet.
        const dynamicIds = ['save-profile', 'import-save-jkr'];
        dynamicIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const parent = el.closest('.control-btn, label') || el;
                parent.style.display = 'none';
            }
        });
    }

    // Watch for dynamically rendered profile/save buttons
    const btnObserver = new MutationObserver(() => hideDesktopButtons());
    btnObserver.observe(document.body || document.documentElement, {
        childList: true, subtree: true,
    });

    // Set language based on Electron system locale
    // Also reorder lang buttons: if Chinese, put 中文 first
    async function applySystemLocale() {
        try {
            const locale = await desktop.getLocale();
            const isZh = locale && locale.startsWith('zh');
            if (isZh) {
                // Reorder language buttons: 中文 first, then EN, ES
                document.querySelectorAll('.lang-toggle, .mobile-lang-toggle').forEach(container => {
                    const zhBtn = container.querySelector('.lang-btn[data-lang="zh"]');
                    const enBtn = container.querySelector('.lang-btn[data-lang="en"]');
                    const esBtn = container.querySelector('.lang-btn[data-lang="es"]');
                    if (zhBtn && enBtn) {
                        container.insertBefore(zhBtn, container.firstChild);
                    }
                });
                if (typeof setLanguage === 'function') {
                    setLanguage('zh');
                }
            }
        } catch (_) { /* use default from navigator.language */ }
    }

    // ── Override loadMetaJSON to use real jkr files instead of demo data ──
    // In web mode, meta.js fetches data/meta.json (demo data). In desktop mode,
    // we load the actual meta.jkr from the game directory instead.
    async function loadDesktopSaveFiles() {
        const paths = await desktop.getSavePaths();
        console.log('[Desktop] Save paths:', paths);

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
        console.log('[Desktop] Loading meta.jkr...');
        const meta = await desktop.readBalatroFile('meta.jkr');
        console.log('[Desktop] meta.jkr response:', meta);
        if (!meta.error && meta.data) {
            try {
                const uint8 = base64ToUint8(meta.data);
                const jsonData = await window.jkrToJson(uint8);
                console.log('[Desktop] meta.jkr parsed:', jsonData ? 'OK' : 'null');
                if (jsonData && jsonData.unlocked) {
                    metaData.unlocked = jsonData.unlocked || {};
                    metaData.discovered = jsonData.discovered || {};
                    metaData.alerted = jsonData.alerted || {};
                    updateStats(currentCategory);
                    renderCategory(currentCategory);
                    if (typeof showNotification === 'function') showNotification('meta.jkr loaded from game directory', 'success');
                }
            } catch (e) { console.error('[Desktop] meta.jkr parse error:', e); }
        } else {
            console.warn('[Desktop] meta.jkr load failed:', meta?.error || 'no data');
            if (typeof showNotification === 'function') showNotification('Failed to load meta.jkr: ' + (meta?.error || 'unknown'), 'error');
        }

        // Load profile.jkr
        console.log('[Desktop] Loading profile.jkr...');
        const profile = await desktop.readBalatroFile('profile.jkr');
        console.log('[Desktop] profile.jkr response:', profile);
        if (!profile.error && profile.data) {
            window._desktopProfilePath = profile.path;
            try {
                const uint8 = base64ToUint8(profile.data);
                const jsonData = await window.jkrToJson(uint8);
                console.log('[Desktop] profile.jkr parsed:', jsonData ? 'OK' : 'null');
                if (jsonData) {
                    profileData = jsonData;
                    if (typeof showNotification === 'function') showNotification('profile.jkr loaded', 'success');
                }
            } catch (e) { console.error('[Desktop] profile.jkr parse error:', e); }
        } else {
            console.warn('[Desktop] profile.jkr load failed:', profile?.error || 'no data');
        }

        // Load save.jkr (may not exist — not an error)
        console.log('[Desktop] Loading save.jkr...');
        const save = await desktop.readBalatroFile('save.jkr');
        if (!save.error && save.data) {
            window._desktopSavePath = save.path;
            try {
                const uint8 = base64ToUint8(save.data);
                const jsonData = await window.jkrToJson(uint8);
                if (jsonData) {
                    saveData = jsonData;
                    if (typeof showNotification === 'function') showNotification('save.jkr loaded', 'success');
                }
            } catch (e) { console.error('[Desktop] save.jkr parse error:', e); }
        } else {
            console.log('[Desktop] save.jkr not available:', save?.error || 'no data');
        }

        // Apply desktop-specific UI tweaks
        hideDesktopButtons();
        applySystemLocale();

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

    // ── Auto-save: every toggle in desktop mode writes to game dir ──
    const origToggleItem = window.toggleItem;
    if (typeof origToggleItem === 'function') {
        let autoSaveTimer = null;
        window.toggleItem = function (id) {
            origToggleItem(id);
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => saveDesktopMeta(), 300);
        };
    }

    async function saveDesktopMeta() {
        if (!metaData?.unlocked) return;
        try {
            const jkrContent = await window.jsonToJkr(metaData);
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(new Blob([jkrContent], { type: 'application/octet-stream' }));
            });
            const result = await desktop.writeBalatroFile('meta.jkr', base64);
            if (result?.success) {
                console.log('[Desktop] meta.jkr auto-saved');
            } else {
                console.warn('[Desktop] auto-save failed:', result?.error);
            }
        } catch (e) {
            console.error('[Desktop] auto-save error:', e);
        }
    }

    // ── Auto-save: profile edits ─────────────────────────────────
    // Profile inputs are dynamically rendered; use event delegation.
    let profileSaveTimer = null;
    document.getElementById('content-container')?.addEventListener('change', (e) => {
        if (e.target.closest('.profile-container')) {
            if (profileSaveTimer) clearTimeout(profileSaveTimer);
            profileSaveTimer = setTimeout(() => saveDesktopProfile(), 400);
        }
    });

    async function saveDesktopProfile() {
        if (!profileData) return;
        try {
            const jkrContent = await window.jsonToJkr(profileData);
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(new Blob([jkrContent], { type: 'application/octet-stream' }));
            });
            const result = await desktop.writeBalatroFile('profile.jkr', base64);
            if (result?.success) {
                console.log('[Desktop] profile.jkr auto-saved');
            } else {
                console.warn('[Desktop] profile auto-save failed:', result?.error);
            }
        } catch (e) {
            console.error('[Desktop] profile auto-save error:', e);
        }
    }

    // ── Init on DOMContentLoaded ─────────────────────────────────────────
    // Note: the actual file loading is triggered by the loadMetaJSON override
    // above (called from meta.js DOMContentLoaded), so no separate init needed.
})();
