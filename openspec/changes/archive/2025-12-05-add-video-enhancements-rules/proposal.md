# Change: Add per-site video enhancement rules

## Why
Users must currently toggle Nenya's inline fullscreen helper manually on every visit. They need a way to declare per-site automation so dominant videos enter the distraction-free mode immediately, especially on frequently visited media portals.

## What Changes
- Add a "Video Enhancements" section in the options UI to list, create, edit, delete, and toggle rules that map URL patterns to the `autoFullscreen` enhancement.
- Persist rules in `chrome.storage.sync.videoEnhancementRules`, normalize them on load, and sync live edits coming from other devices or import/export flows.
- Extend `src/contentScript/video-controller.js` to load enabled rules, match the current page URL, and automatically call `enterFullscreen()` on the dominant video whenever a matching rule declares `autoFullscreen`.
- Listen for storage updates so open tabs react when rules change, and provide safeguards (timeouts, observer coordination) so auto-entered fullscreen behaves like the existing manual toggle.

## Impact
- Affected specs: `video-features`
- Affected code: `src/options/index.html`, `src/options/videoEnhancements.js`, `src/options/options.js`, `src/contentScript/video-controller.js`, `src/shared/storage.js` (helpers, if reused)

