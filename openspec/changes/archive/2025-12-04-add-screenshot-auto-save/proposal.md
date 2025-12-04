# Change: Add Screenshot Auto-Save to File System

## Why

Users who frequently capture screenshots via the copy-screenshot feature may want to automatically save each screenshot to their local file system for archival purposes, without manually downloading them from the clipboard. This provides a persistent record and easier organization of captured screenshots.

## What Changes

- Add a new "Screenshot Settings" section in the options page
- Add a toggle to enable/disable automatic saving of screenshots to file system (default: false)
- Store the setting in `chrome.storage.sync` under key `screenshotSettings`
- Modify the screenshot capture logic to automatically download screenshots when enabled
- Include the new setting in the options backup/restore flow
- Include the new setting in JSON import/export functionality

## Impact

- Affected specs:
  - `copy-title-url-screenshot` - New requirements for auto-save functionality
  - `options-restore-backup` - Modified requirement to include screenshot settings in backup/restore
- Affected code:
  - `src/background/clipboard.js` - Add download logic after screenshot capture
  - `src/options/index.html` - Add new Screenshot Settings section
  - `src/options/screenshots.js` - New file for managing screenshot settings UI
  - `src/background/options-backup.js` - Add screenshot settings to backup/restore categories
  - `src/options/importExport.js` - Add screenshot settings to import/export
  - `manifest.json` - Add `downloads` permission

