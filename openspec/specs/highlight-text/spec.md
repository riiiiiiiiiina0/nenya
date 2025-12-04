## Highlight Text Specification

### Requirement: The options page SHALL load and sanitize highlight rules from sync storage

`src/options/highlightText.js` owns the Highlight Text section in `src/options/index.html` and persists rules under `chrome.storage.sync.highlightTextRules`.

#### Scenario: Normalize stored rules on page load
- **GIVEN** the options page initializes,
- **THEN** `loadRules()` MUST fetch `highlightTextRules`, drop any entries that are not objects or that fail `URLPattern` parsing (plus regex validation when `type === 'regex'`),
- **AND** it MUST coerce missing boolean flags (`bold`, `italic`, `underline`, `ignoreCase`, `disabled`) to `false`, retain any timestamps, and return the sanitized array for rendering,
- **AND** if no array exists it MUST default to an empty list so the empty state renders.

#### Scenario: React to sync updates coming from other contexts
- **GIVEN** another browser, the Automerge syncer, or the import/export tool modifies `highlightTextRules`,
- **WHEN** `chrome.storage.onChanged` fires with that key in the `sync` namespace,
- **THEN** the options script MUST reload via `loadRules()`, re-render the list, and clear edit/detail panels when the referenced rule disappears so stale IDs are not left selected.

### Requirement: The highlight rule form SHALL enforce valid input and provide complete rule metadata

Each rule records `{ id, pattern, type: 'whole-phrase' | 'comma-separated' | 'regex', value, textColor, backgroundColor, bold, italic, underline, ignoreCase, disabled?, createdAt?, updatedAt? }`.

#### Scenario: Add or edit a rule through the form
- **GIVEN** the user fills `#highlightTextRuleForm`,
- **WHEN** they submit with a non-empty `highlightTextPatternInput` that passes the browser’s `URLPattern` constructor, a `highlightTextValueInput` value, and (for regex rules) a compilable pattern,
- **THEN** the handler MUST either create a new rule with a generated UUID (`generateRuleId()`) plus `createdAt`, or update the existing `editingRuleId` with a fresh `updatedAt`,
- **AND** it MUST capture styling via the color pickers plus alpha sliders (converted with `formatColorWithAlpha()` so semi-transparent rgba strings round to two decimals) and the bold/italic/underline/ignoreCase checkboxes,
- **AND** invalid input MUST keep the form in place, surface the specific error in `#highlightTextFormError`, retain focus, and leave storage untouched until corrected,
- **AND** `clearForm()` MUST reset the inputs, revert the submit button text between “Add rule” and “Update rule”, hide the cancel button, and restore default colors (`#000000` text, `#ffff00` background).

#### Scenario: View, toggle, or delete existing rules
- **GIVEN** at least one rule is stored,
- **THEN** `renderRulesList()` MUST show either the empty-state card or an `<article>` per rule containing the URL pattern (monospace), the value preview, type badge, optional “Aa” badge when `ignoreCase` is true, text/background color chips, and `B/I/U` indicators when the corresponding styling flags are set,
- **AND** the Enabled toggle MUST flip `rule.disabled` and persist back to sync without altering other metadata, dimming disabled rows via `opacity-50`,
- **AND** “View” MUST populate the detail drawer (`highlightTextRuleDetails`) with the pattern, value, type label, rendered color swatches, styling badges, “Yes/No” ignore-case summary, and formatted timestamps (`formatDate()`),
- **AND** “Edit” MUST repopulate the form, scroll it into view, set `editingRuleId`, and switch the submit label to “Update rule”, while “Delete” MUST confirm via `window.confirm`, remove the rule, persist the pruned array, and hide the detail drawer if it referenced the deleted entry.

### Requirement: The popup highlight shortcut SHALL prefill the options section with the active tab URL

#### Scenario: Jump from the popup to the Highlight Text form
- **GIVEN** the user clicks the 🟨 shortcut in `src/popup/popup.js`,
- **WHEN** `handleHighlightText()` resolves the active tab,
- **THEN** it MUST require a valid `tab.url`, store `{ highlightTextPrefillUrl: url }` in `chrome.storage.local`, call `chrome.runtime.openOptionsPage()`, close the popup on success, and surface a status error if no tab/URL is found,
- **AND** once the options page loads, `checkForPrefillUrl()` MUST fetch and delete that local key, wait (retrying up to ~2.5 s) for `window.navigationManager`, navigate to `#highlight-text-heading`, reveal that section, focus `highlightTextPatternInput`, and inject the stored URL so the user can immediately save a rule.

### Requirement: The highlight text content script SHALL apply stored rules to matching pages

`src/contentScript/highlight-text.js` runs on every page to render highlights once a rule’s `pattern` matches the current URL.

#### Scenario: Load rules and decide applicability
- **GIVEN** the script initializes,
- **THEN** `loadRules()` MUST pull `highlightTextRules`, drop anything missing the required fields, coerce boolean flags, and cache them in memory,
- **AND** `applyHighlighting()` MUST clear any previous spans via `removeAllHighlights()`, read `window.location.href`, and filter to enabled rules whose `pattern` matches via `URLPattern` or the wildcard fallback (treating `*` as `.*` and falling back to substring matching when parsing fails) so only those applicable rules are applied to the DOM.

#### Scenario: Wrap matched text while protecting page semantics
- **GIVEN** a text node is being processed,
- **WHEN** a `whole-phrase` rule matches, the script MUST wrap only the first contiguous match in that node with a `<span class="nenya-highlight-<ruleId>">` styled with the configured text/background colors, padding, border radius, and optional bold/italic/underline flags, leaving the remainder of the node split before/after the match,
- **AND** for `comma-separated` rules it MUST iterate the trimmed list, wrap the first matching entry per node, and stop scanning that node after inserting the span,
- **AND** for `regex` rules it MUST call `text.matchAll()` to wrap every capture (keeping order via a `DocumentFragment`), gracefully skip invalid patterns with a console warning, and ensure the remainder of the node is re-appended,
- **AND** the walker MUST ignore `<script>`, `<style>`, `<code>`, `<pre>`, `<textarea>`, and `<input>` tags, skip any element already containing the highlight class, and rebuild the DOM using `DocumentFragment` + `parent.replaceChild()` so layout calculations keep working.

### Requirement: Highlight rendering SHALL stay accurate as content, navigation state, or stored rules change

#### Scenario: Reapply highlights when the DOM or URL changes
- **GIVEN** the page mutates after the initial pass,
- **THEN** the MutationObserver MUST watch `document.body` for added nodes, detect when `window.location.href` changes in SPA navigations, and debounce `applyHighlighting()` (100 ms) whenever new text content appears or the URL differs from the last pass,
- **AND** `popstate` events, window `resize`, and scroll listeners MUST either trigger a debounced reapply (resize) or refresh the minimap viewport box so the overlay tracks the current view.

#### Scenario: Respond to storage edits
- **GIVEN** the user edits highlight rules elsewhere,
- **WHEN** `chrome.storage.onChanged` reports `highlightTextRules` in the `sync` area,
- **THEN** the content script MUST reload the rules, re-run `applyHighlighting()`, and therefore clear obsolete spans (via the upfront `removeAllHighlights()` call) before painting the new matches, preventing duplicate or stale highlights.

### Requirement: The highlight minimap SHALL visualize result density and offer navigation

The minimap lives in fixed-position elements injected by `injectMinimapStyles()` and `createMinimap()` once per page.

#### Scenario: Render markers and viewport indicator
- **GIVEN** `applyHighlighting()` finishes,
- **THEN** `updateMinimap()` MUST query all elements whose class name starts with `nenya-highlight-`, hide the minimap (`opacity: 0`) when none exist, or otherwise create 3 px-tall markers positioned by the match’s top offset divided by total document height,
- **AND** markers MUST inherit the highlight’s computed background color so groups of matches are visually tied to their rule styling,
- **AND** `updateMinimapViewport()` MUST set the viewport overlay height/position proportional to `window.innerHeight / documentHeight` and `scrollY / documentHeight`, updating on scroll/resize via debounced listeners.

#### Scenario: Allow users to jump via the minimap
- **GIVEN** the minimap is visible,
- **WHEN** the user clicks a marker (`.nenya-minimap-marker`),
- **THEN** `handleMinimapClick()` MUST scroll its associated highlight element into centered view with smooth behavior,
- **AND** clicking elsewhere inside the minimap container MUST scroll proportionally to the click location (centering the viewport), letting users quickly navigate among dense highlight clusters without searching manually.

