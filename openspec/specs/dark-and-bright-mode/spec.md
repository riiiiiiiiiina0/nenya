## Dark and Bright Mode Specification

### Requirement: Users SHALL manage URL-specific dark mode rules from the options page

The Dark Mode section in `src/options/index.html` is responsible for capturing per-site rules stored under `chrome.storage.sync.darkModeRules`.

#### Scenario: Render stored rules or the empty state

- **GIVEN** the options page loads,
- **THEN** `renderRules()` MUST fetch `darkModeRules` from sync storage,
- **AND** it MUST either show `#darkModeRulesEmpty` when no rules exist or render each rule as an `<article>` with its pattern, Edit/Delete buttons, and an enabled toggle (disabled entries receive the `opacity-50` style).

#### Scenario: Add, edit, toggle, and delete rules

- **GIVEN** the user submits `#darkModeRuleForm`,
- **WHEN** `darkModePatternInput` contains a non-empty value,
- **THEN** a rule object `{ id, pattern, enabled }` MUST be appended with `enabled` defaulting to `true`, or the matching `id` MUST be updated on edit,
- **AND** toggling the switch MUST flip the `enabled` flag and persist via `chrome.storage.sync.set`,
- **AND** Delete MUST confirm via `window.confirm` before removing the rule.

#### Scenario: Reflect sync updates and popup prefill

- **GIVEN** another tab (or Automerge restore) mutates `darkModeRules`,
- **THEN** the options page listener on `chrome.storage.onChanged` MUST re-render unless `syncing` is true.
- **GIVEN** the popup invokes the 🌘 shortcut,
- **WHEN** `handleDarkMode()` opens `src/options/index.html#dark-mode-heading&url=<encoded>`,
- **THEN** `initUrlPreload()` MUST decode the `url` hash fragment and pre-fill `darkModePatternInput` so the user can save it with one click.

### Requirement: The dark mode content script SHALL enable Dark Reader on matching pages while the OS theme is dark

`src/libs/darkreader.js` and `src/contentScript/darkMode.js` run on every page at `document_start`.

#### Scenario: Evaluate rules on load

- **GIVEN** the content script initializes,
- **THEN** `updateDarkReader()` MUST fetch `chrome.storage.sync.darkModeRules`, filter to `rule.enabled === true`, and construct `URLPattern` objects to test `window.location.href`,
- **AND** if `window.matchMedia('(prefers-color-scheme: dark)')` matches and any pattern passes, `DarkReader.enable({ brightness: 100, contrast: 90, sepia: 10 })` MUST be invoked (after verifying it is not already active),
- **ELSE** `DarkReader.disable()` MUST be called if it was previously active.

#### Scenario: Re-evaluate when the OS theme flips

- **GIVEN** the user toggles the system theme,
- **THEN** the `prefers-color-scheme: dark` media query listener MUST call `updateDarkReader()` so new theme information (and the latest stored rules) determine whether Dark Reader stays enabled.

#### Scenario: Ignore malformed patterns

- **GIVEN** a stored `rule.pattern` cannot be parsed by `URLPattern`,
- **THEN** the script MUST log `Invalid URL pattern` to the console and skip that rule without breaking the rest of the evaluation.

### Requirement: Users SHALL maintain a validated bright mode whitelist from the options page

`src/options/brightMode.js` manages `chrome.storage.sync.brightModeWhitelist` entries with metadata.

#### Scenario: Load and sanitize stored patterns

- **GIVEN** the options page loads,
- **THEN** `loadPatterns()` MUST pull the whitelist array, run `normalizePatterns()` to drop invalid entries, auto-generate missing IDs, trim patterns, and sort them alphabetically,
- **AND** if normalization changed anything, the sanitized array MUST be written back to sync storage before rendering.

#### Scenario: Enforce valid input and CRUD interactions

- **GIVEN** the user submits `#brightModeWhitelistForm`,
- **WHEN** `brightModeWhitelistPatternInput` contains a string that passes `isValidUrlPattern()` (full URL, hostname, or pathname supported by the URL Pattern API),
- **THEN** the script MUST create/update a pattern object with timestamps and persist it,
- **AND** toggling the switch MUST flip `pattern.disabled`,
- **AND** Delete MUST confirm via `window.confirm`,
- **AND** invalid inputs MUST surface `Enter a valid URL pattern that the browser accepts.` via `#brightModeWhitelistFormError`.

#### Scenario: React to sync edits and maintain editing state

- **GIVEN** another tab modifies `brightModeWhitelist`,
- **THEN** the `chrome.storage.onChanged` handler MUST normalize the new value, update the rendered list, and reset the form when the item being edited disappears.

#### Scenario: Prefill from the popup quick action

- **GIVEN** the user clicks the 🔆 shortcut in the popup,
- **THEN** `handleBrightMode()` MUST store the active tab URL in `chrome.storage.local.brightModePrefillUrl`, open the options page, and close the popup,
- **AND** `checkForPrefillUrl()` MUST await `navigationManager`, jump to `#bright-mode-heading`, focus the input, and insert the stored URL once before deleting the prefill key.

### Requirement: The bright mode content script SHALL enforce light-mode rendering for matching pages while the OS theme is light

`src/contentScript/bright-mode.js` runs on all URLs at `document_start` to invert dark pages when the user prefers light.

#### Scenario: Apply styles when the whitelist and OS state allow it

- **GIVEN** the script initializes,
- **THEN** it MUST load `brightModeWhitelist`, drop `pattern.disabled` entries, and run `matchesPattern()` against `window.location.href` (supporting hostnames, full URLs, wildcard pathnames, or `/path` patterns),
- **AND** when the OS media query `(prefers-color-scheme: light)` matches and the URL is whitelisted, `applyBrightMode()` MUST inject the `#nenya-bright-mode-styles` `<style>` element that inverts core visual elements,
- **ELSE** `removeBrightMode()` MUST strip the style tag so the page renders normally.

#### Scenario: React to OS theme flips and storage updates

- **GIVEN** the user changes the OS appearance,
- **THEN** `setupMediaQueryListener()` MUST call `checkAndApplyBrightMode()` to keep the page aligned with the current preference.
- **GIVEN** `chrome.storage.sync.brightModeWhitelist` changes in any context,
- **THEN** the storage listener MUST reload patterns and immediately re-run the matching logic so edits take effect without refreshing the page.

#### Scenario: Stay accurate during SPA navigation and DOM mutations

- **GIVEN** the page uses client-side routing or dynamically adds nodes,
- **THEN** the MutationObserver MUST detect newly added elements (especially ones with `background-image`) and `reapplyBrightModeStyles()` after a short delay to keep the inversion consistent,
- **AND** listeners for `visibilitychange`, `hashchange`, `popstate`, and `pageshow` MUST re-check the whitelist so navigation events also refresh the decision.

#### Scenario: Clean up listeners when the page unloads

- **GIVEN** the tab navigates away or unloads,
- **THEN** `brightModeEnforcer.destroy()` MUST detach media query listeners, mutation observers, and navigation listeners to prevent memory leaks before the next page load.
