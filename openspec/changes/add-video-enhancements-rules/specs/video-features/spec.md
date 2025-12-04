## ADDED Requirements

### Requirement: The options page SHALL manage Video Enhancement rules

The options UI SHALL expose a dedicated "Video Enhancements" section that manages per-site automation rules stored in sync so users can control when fullscreen automation occurs. `src/options/videoEnhancements.js` owns the section inside `src/options/index.html` and persists rules under `chrome.storage.sync.videoEnhancementRules` using the schema `{ id, pattern, patternType: 'url-pattern' | 'wildcard', enhancements: { autoFullscreen: boolean }, disabled?: boolean, createdAt, updatedAt }`.

#### Scenario: Load, sanitize, and render the rules list
- **GIVEN** the options page initializes,
- **THEN** the script MUST fetch `videoEnhancementRules`, drop entries that lack a valid pattern or `enhancements.autoFullscreen` boolean, coerce `disabled` to `false` when missing, and sort by `createdAt` before rendering,
- **AND** it MUST show an empty-state card when the array is empty, otherwise render each rule (pattern in monospace, `patternType` badge, enabled toggle, enhancement badges),
- **AND** it MUST subscribe to `chrome.storage.onChanged` for the sync namespace so updates from other windows/imports re-render without a refresh.

#### Scenario: Create, edit, toggle, or delete a rule
- **GIVEN** the user interacts with the Video Enhancements form,
- **WHEN** they submit with a non-empty pattern that either parses via `URLPattern` (when `patternType === 'url-pattern'`) or passes wildcard validation,
- **THEN** the handler MUST either create a new UUID-backed rule (setting `createdAt`) or update the matching `id` (writing `updatedAt`) while preserving other fields,
- **AND** the form MUST allow enabling/disabling `autoFullscreen` via a checkbox (currently the only enhancement) and default it to `true` on creation,
- **AND** invalid input MUST surface inline errors and leave storage untouched,
- **AND** toggling the Enabled switch MUST flip `rule.disabled` and persist immediately, while Delete MUST confirm, remove the rule, and update the list plus any open detail drawer.

### Requirement: The video controller SHALL auto-enter custom fullscreen for matching rules

`src/contentScript/video-controller.js` MUST honor enabled rules so dominant videos enter Nenya's custom fullscreen automatically.

#### Scenario: Enter fullscreen when the page URL matches an enabled rule
- **GIVEN** the content script initializes or its MutationObserver finds a new dominant video,
- **WHEN** at least one enabled rule in `videoEnhancementRules` matches `window.location.href` (using `URLPattern` first, falling back to wildcard substring matching),
- **THEN** the script MUST pick the same "largest video" candidate used by PiP controls, wait for metadata (up to ~2 s), and call `enterFullscreen(video, { source: 'rule-auto' })`,
- **AND** it MUST ensure auto-entry only runs once per navigation (set a flag tied to the matching rule ID) unless the video exits fullscreen and a new dominant video appears,
- **AND** it MUST log (not throw) when matching fails or `enterFullscreen` rejects so content pages stay stable.

#### Scenario: Ignore pages without matches or disabled rules
- **GIVEN** the content script loaded rules,
- **WHEN** no enabled rule matches the current URL, or all matching rules have `enhancements.autoFullscreen === false`,
- **THEN** it MUST skip auto fullscreen entirely and leave manual controls untouched,
- **AND** when `chrome.storage.onChanged` reports updates to `videoEnhancementRules`, the script MUST reload them, exit fullscreen if the currently enforced rule was disabled, and allow future navigations to re-run the match with the updated data.

