## Block Elements Specification

`src/options/blockElements.js`, `src/popup/popup.js`, `src/contentScript/epicker*.{js,html}`, `src/contentScript/block-elements.js`, and supporting background/import code collectively implement the “Block Elements” feature: users capture CSS selectors per site, manage them from the options page, and the content script hides matching elements on every visit.

### Requirement: The options UI SHALL load and sanitize block element rules stored in sync

#### Scenario: Normalize stored rules on page load

- **GIVEN** the options page initializes,
- **THEN** `loadRules()` MUST call `chrome.storage.sync.get('blockElementRules')`, run `normalizeRules()` to drop entries without a valid `URLPattern`, strip empty selectors, mint UUIDs for missing `id`s, coerce `disabled` to booleans, and sort the collection by `urlPattern`,
- **AND** when normalization mutates the array it MUST immediately persist the sanitized version back to sync before calling `render()` so the UI and storage stay in lockstep,
- **AND** the “Saved Rules” card MUST either display the empty-state copy or render one `<article>` per rule with its pattern, selector count, and controls.

#### Scenario: Reflect remote sync updates

- **GIVEN** another browser, the Automerge syncer, or import/export modifies `blockElementRules`,
- **WHEN** `chrome.storage.onChanged` fires for that key in the `sync` namespace,
- **THEN** the options script MUST ignore the notification while `syncing === true` (so it does not thrash on writes initiated locally) and otherwise rerun `normalizeRules()` + `render()`,
- **AND** if the currently selected rule ID is no longer present it MUST clear `selectedRuleId`, hide the details panel, and reset any in-progress pattern edits to avoid referencing stale entries.

### Requirement: Users SHALL manage rule patterns, selectors, and enablement via the options detail panel

#### Scenario: View and edit rule metadata

- **GIVEN** the user clicks “View” or “Edit pattern” for a rule,
- **THEN** `renderDetails()` MUST populate `blockElementsRuleDetails` with the pattern (monospace input), selector count badge, created/updated timestamps formatted via `Intl.DateTimeFormat`, and an enabled add-selector form,
- **AND** entering edit mode MUST set `detailPattern.readOnly = false`, reveal the “Save/Cancel” buttons, and copy the original pattern so `cancelPatternEdit()` can revert,
- **AND** clicking “Save” MUST trim the input, validate it with the browser’s `URLPattern` constructor, update `rule.urlPattern`, stamp `updatedAt`, resort the array, persist to sync, then exit edit mode and re-render the list/detail views.

#### Scenario: Add, remove, delete, or disable selectors from a rule

- **GIVEN** a rule is selected,
- **WHEN** the user types a CSS selector into `blockElementsRuleAddSelectorInput` and clicks “Add” (or presses Enter),
- **THEN** the script MUST trim the string, call `isValidSelector()` (falling back to a confirmation dialog when parsing fails), reject duplicates, push it onto `rule.selectors`, stamp `updatedAt`, persist, clear the input, and rerender the selectors list with chips + delete buttons,
- **AND** clicking a selector’s ✕ MUST confirm removal, drop it from the array, and automatically delete the entire rule (and deselect it) when no selectors remain,
- **AND** the “Delete Rule” button MUST confirm before removing the whole entry and refreshing the empty state if applicable,
- **AND** the “Enabled” toggle in each list row MUST flip `rule.disabled`, dim disabled rows via `opacity-50`, and persist without touching timestamps so the content script can respect the flag.

### Requirement: The popup element picker SHALL let users capture selectors tied to the active tab

#### Scenario: Launch the picker from the popup

- **GIVEN** the user clicks the 🎯 “Custom filter” shortcut in `src/popup/popup.js`,
- **THEN** `handleCustomFilter()` MUST resolve the active tab, ensure it has a numeric `tab.id`, send `{ type: 'launchElementPicker', tabId }` to the background, and close the popup on success,
- **AND** failures to find a tab or inject must surface via `concludeStatus()` so users know why the picker did not start.

#### Scenario: Inspect elements, preview selectors, and confirm a rule addition

- **GIVEN** `launchElementPicker()` injects `src/contentScript/epicker.js`,
- **THEN** the content script MUST load `epicker-ui.html` inside a transparent iframe, prevent duplicate sessions via `window.__nenyaPickerActive`, and proxy pointer events to compute candidate CSS selectors with increasing specificity (ID, class, short DOM paths, nth-of-type, etc.),
- **AND** the UI MUST show the selector slider, live match counts, a “Preview” toggle that temporarily hides matching elements, and a “Create” button that stays disabled until at least one selector candidate exists,
- **AND** clicking “Create” MUST send `{ type: 'blockElement:addSelector', selector, url: window.location.href }` to the background before tearing down overlays and restoring scrolling,
- **AND** pressing Escape, clicking ✕, or hitting “Pick” MUST exit gracefully by removing injected nodes and restoring any previewed elements.

### Requirement: The background and backup pipelines SHALL persist selectors per host and keep them portable

#### Scenario: Save selectors received from the picker

- **GIVEN** the background service receives `blockElement:addSelector`,
- **THEN** it MUST derive a URL pattern in the form `<protocol>//<hostname>/*` from `message.url`, fetch existing `blockElementRules`, and either append the selector to the matching rule (deduping and updating `updatedAt`) or create a new rule with a generated ID plus both timestamps,
- **AND** it MUST reject empty selector/URL payloads, store the updated array via `chrome.storage.sync.set`, and reply with `{ success: true, rule }` (or include an error message on failure) so the picker can report success if needed.

#### Scenario: Include block element rules in options export/import flows

- **GIVEN** the user exports settings from the Options “Backups” section or Automerge sync pulls from Raindrop,
- **THEN** `readCurrentOptions()` MUST call `normalizeBlockElementRules()` so only valid `{ id, urlPattern, selectors[], createdAt?, updatedAt? }` entries land in the JSON payload,
- **AND** `applyImportedOptions()` MUST re-run the same normalization, write the sanitized array back to `chrome.storage.sync.blockElementRules`, and therefore keep rule IDs and timestamps stable across devices,
- **AND** Automerge sync (`automerge-options-sync.js`) MUST treat `blockElementRules` as a first-class key so CRDT merges propagate new selectors without clobbering other settings.

### Requirement: The content script SHALL hide matching selectors reliably as pages change

#### Scenario: Apply blocking CSS for applicable rules

- **GIVEN** `src/contentScript/block-elements.js` initializes on a page,
- **THEN** it MUST load cached rules from sync, filter to enabled entries whose `URLPattern` matches `window.location.href`, and build a `<style id="nenya-block-elements-style">` block where each selector is specificity-boosted via repeated `:not(#\:)`,
- **AND** the injected CSS MUST hide targets via multiple properties (`display:none`, `visibility:hidden`, `opacity:0`, zeroed dimensions, `pointer-events:none`, etc.) so site styles cannot easily undo the block,
- **AND** when no selectors apply it MUST remove any prior style tag to avoid stale CSS.

#### Scenario: Keep blocking state current across DOM, SPA, and storage changes

- **GIVEN** modern sites mutate without full reloads,
- **THEN** the script MUST hook `history.pushState/replaceState`, `popstate`, and `hashchange` to detect URL changes, run a document-level `MutationObserver` that debounces `applyBlockingCss()` every 300 ms, and listen to `chrome.storage.onChanged` for `blockElementRules` updates so rules are reloaded without reloading the tab,
- **AND** `applyBlockingCss()` MUST memoize the last applied selector set (sorted and joined) so it skips rebuilding the style element when nothing changed, preventing unnecessary DOM churn during long mutation bursts.
