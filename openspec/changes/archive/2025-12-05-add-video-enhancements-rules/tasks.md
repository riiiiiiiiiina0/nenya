## 1. Implementation
- [x] 1.1 Build `Video Enhancements` section in `options/index.html` plus `videoEnhancements.js` to render, validate, and persist rules (CRUD + toggles) in `chrome.storage.sync.videoEnhancementRules`.
- [x] 1.2 Hook the new section into `options.js` navigation, empty states, and import/export flows so rules travel with existing backups.
- [x] 1.3 Update `src/contentScript/video-controller.js` (and CSS if needed) to load the rules, detect when `autoFullscreen` should fire, and invoke the existing `enterFullscreen()` logic for the dominant video.
- [x] 1.4 Listen for storage changes in both the options page and content script so edits sync live without reloads, including tearing down fullscreen if a rule disables it.

## 2. Validation
- [x] 2.1 Manually verify rule CRUD in the options UI, sync across windows, and ensure backups include the new key.
- [x] 2.2 Test on representative video sites (e.g., YouTube, Vimeo, news players) to confirm matching URLs auto-enter fullscreen only when the rule is enabled and gracefully skip others.

