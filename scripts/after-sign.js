/**
 * Electron-builder afterSign hook.
 * Ad-hoc signs the macOS app bundle after build, before DMG packaging.
 * This prevents Gatekeeper "app is damaged" error on unsigned apps.
 */
exports.default = async function (context) {
    const { electronPlatformName, appOutDir } = context;
    // Only apply to macOS builds
    if (electronPlatformName !== 'darwin') return;

    const { execSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    const productName = context.packager.appInfo.productName;
    const appPath = path.join(appOutDir, `${productName}.app`);

    if (!fs.existsSync(appPath)) {
        console.warn(`[after-sign] App not found at: ${appPath}, skipping ad-hoc sign`);
        return;
    }

    console.log(`[after-sign] Ad-hoc signing: ${appPath}`);
    try {
        execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
        console.log(`[after-sign] Verifying signature...`);
        execSync(`codesign --verify --verbose=4 "${appPath}"`, { stdio: 'inherit' });
        console.log(`[after-sign] ✓ Ad-hoc signing complete`);
    } catch (err) {
        console.error(`[after-sign] ✗ Signing failed: ${err.message}`);
        // Don't fail the build — signed is better than unsigned, but
        // unsigned is still functional on macOS with right-click → Open
    }
};
