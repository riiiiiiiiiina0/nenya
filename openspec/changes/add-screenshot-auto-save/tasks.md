# Implementation Tasks

## 1. Define Storage Schema

- [x] 1.1 Define `ScreenshotSettings` TypeScript type/JSDoc
- [x] 1.2 Define storage key `SCREENSHOT_SETTINGS_KEY = 'screenshotSettings'`
- [x] 1.3 Define default settings: `{ autoSave: false }`
- [x] 1.4 Add normalization function for settings validation

## 2. Add UI in Options Page

- [x] 2.1 Add new "Screenshot Settings" section in `src/options/index.html`
- [x] 2.2 Create `src/options/screenshots.js` with load/save/UI logic
- [x] 2.3 Add toggle control for "Automatically save screenshots to Downloads folder"
- [x] 2.4 Add event listeners for toggle changes
- [x] 2.5 Add storage change listener to reflect updates from other contexts

## 3. Implement Auto-Save Logic

- [x] 3.1 Add `downloads` permission to `manifest.json`
- [x] 3.2 Create helper function `shouldAutoSaveScreenshots()` in `clipboard.js`
- [x] 3.3 Modify `handleScreenshotCopy()` to check auto-save setting
- [x] 3.4 Implement `downloadScreenshot(dataUrl)` function using `chrome.downloads.download()`
- [x] 3.5 Generate filename with timestamp: `screenshot-{YYYY-MM-DD-HHmmss}.png`
- [x] 3.6 Handle download errors gracefully with console warnings

## 4. Integrate with Backup/Restore

- [x] 4.1 Add `buildScreenshotSettingsPayload()` function in `options-backup.js`
- [x] 4.2 Add `parseScreenshotSettingsItem()` function in `options-backup.js`
- [x] 4.3 Add `applyScreenshotSettings()` function in `options-backup.js`
- [x] 4.4 Register new category `'screenshot-settings'` in `BACKUP_CATEGORIES`
- [x] 4.5 Add storage change listener for `screenshotSettings` key
- [ ] 4.6 Test backup creates `screenshot-settings-1` item in Raindrop
- [ ] 4.7 Test restore correctly applies screenshot settings

## 5. Integrate with Import/Export

- [x] 5.1 Add `screenshotSettings` to JSON export in `importExport.js`
- [x] 5.2 Add `screenshotSettings` to JSON import in `importExport.js`
- [x] 5.3 Apply normalization during import to ensure valid values
- [ ] 5.4 Test export includes screenshot settings
- [ ] 5.5 Test import correctly applies screenshot settings

## 6. Testing & Validation

- [ ] 6.1 Test toggle UI loads current setting correctly
- [ ] 6.2 Test toggle change persists to storage
- [ ] 6.3 Test screenshot copies to clipboard when auto-save is off (default)
- [ ] 6.4 Test screenshot saves to Downloads folder when auto-save is on
- [ ] 6.5 Test filename format is correct with timestamp
- [ ] 6.6 Test backup includes screenshot settings
- [ ] 6.7 Test restore applies screenshot settings
- [ ] 6.8 Test JSON export includes screenshot settings
- [ ] 6.9 Test JSON import applies screenshot settings
- [ ] 6.10 Test storage listener updates UI when changed from another context

