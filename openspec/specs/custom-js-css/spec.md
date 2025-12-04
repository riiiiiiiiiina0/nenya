## Custom JS & CSS Specification

`src/options/customCode.js`, `src/options/index.html`, `src/popup/popup.js`, `src/contentScript/custom-js-css.js`, `src/background/index.js`, `src/options/importExport.js`, and `src/background/automerge-options-sync.js` collectively implement the “Custom JS & CSS” capability: users create URL-patterned rules that inject CSS and JavaScript into matching pages, manage those rules from the Options UI or popup shortcuts, and keep them portable through the Raindrop backup plus Automerge sync flows.

### Requirement: The options UI SHALL load and sanitize locally stored custom code rules

#### Scenario: Normalize stored rules on page load
- **GIVEN** the options page initializes,
- **THEN** `loadRules()` MUST read `chrome.storage.local.customCodeRules`, run `normalizeRules()` to drop entries without a `URLPattern`, coerce empty CSS/JS strings to `''`, mint UUIDs when `id` is missing, and sort by pattern,
- **AND** when `normalizeRules()` indicates the array mutated, the sanitized copy MUST be persisted back to local storage before calling `render()` so the “Saved Rules” card reflects the cleaned data instead of the stale payload,
- **AND** the UI MUST either show the empty-state banner or display each rule with its pattern summary.

#### Scenario: Reflect real-time storage updates
- **GIVEN** another browser, Automerge sync, popup import, or backup restore changes `chrome.storage.local.customCodeRules`,
- **WHEN** `chrome.storage.onChanged` fires for that key in the `local` namespace,
- **THEN** the options script MUST ignore the change while the local save promise is in-flight (`syncing === true`) and otherwise re-run `normalizeRules()` plus `render()`,
- **AND** it MUST clear `selectedRuleId` / `editingRuleId` when the referenced rule disappears so the details panel and form never reference stale objects.

### Requirement: Users SHALL create, edit, toggle, export, and delete custom code rules from the options page

#### Scenario: Submit the form to create or edit a rule
- **GIVEN** the user enters a URL pattern plus optional CSS/JS into the form,
- **WHEN** they submit,
- **THEN** `handleFormSubmit()` MUST trim the pattern, validate it via the browser’s `URLPattern` constructor, ensure at least one of CSS or JavaScript contains non-whitespace content, and surface inline errors for empty/invalid input,
- **AND** creating a rule MUST mint a `rule.id`, set both `createdAt`/`updatedAt` ISO timestamps, push the record into `rules`, select it, resort, persist via `saveRules()`, and reset the Ace editors plus form copy,
- **AND** editing MUST update the existing record in-place, refresh `updatedAt` (adding `createdAt` if missing), resort, persist, and exit edit mode (button text back to “Add rule”, cancel hidden).

#### Scenario: Manage saved rules via the list actions
- **GIVEN** at least one rule exists,
- **THEN** each list row MUST show the pattern (monospace), whether CSS and/or JS is present, and offer `View`, `Edit`, `Export`, `Delete`, plus an “Enabled” toggle,
- **AND** toggling the switch MUST flip `rule.disabled`, dim disabled rows, persist immediately, and re-render without resetting timestamps,
- **AND** `View` MUST populate the detail panel (pattern, formatted code snippets, created/updated dates), while `Edit` MUST load the rule into the Ace editors, reveal “Cancel”, and focus the pattern input,
- **AND** `Export` MUST serialize the rule to JSON (including metadata + `version: '1.0'`), download it as `nenya-cjc-<domain>.json`, and optionally toast success when Toastify is available,
- **AND** `Delete` MUST confirm with the user, remove the rule, clear any active selection/edit session, persist, and rerender (showing the empty state when the last rule is removed).

### Requirement: Popup shortcuts SHALL support importing and pre-filling custom code rules

#### Scenario: Import a custom rule from JSON
- **GIVEN** the user pins the 💾 “Import custom JS/CSS rule” shortcut and clicks it,
- **THEN** the popup MUST trigger the hidden `importCustomCodeFileInput`, accept only `.json`, and pass the selected file to `handleImportCustomCode()`,
- **AND** the handler MUST read the file, parse JSON, call `validateImportedRule()` to ensure a valid `pattern` plus at least one of `css` or `js`, mint a new `id`/timestamps, and reject duplicates that already share the same pattern in storage,
- **AND** on success it MUST append the new rule to `chrome.storage.local.customCodeRules`, reset the `<input>` value (allowing repeat imports), and surface a success status message; validation failures MUST surface descriptive errors via `concludeStatus()`.

#### Scenario: Prefill the options form from the current tab
- **GIVEN** the user clicks the 📑 “Inject js/css into this page” shortcut,
- **WHEN** the popup resolves the active tab’s URL,
- **THEN** it MUST store `{ customCodePrefillUrl: currentTab.url }` in `chrome.storage.local` and open the options page,
- **AND** `checkForPrefillUrl()` on the options side MUST pull and clear that key, navigate to `#custom-code-heading`, ask `window.navigationManager` to show the section when available, wait for Ace to initialize, and finally populate/focus the URL pattern input so the rule can be saved without retyping.

### Requirement: The content script SHALL inject CSS and JavaScript for matching rules and keep injection state current

#### Scenario: Apply matching rules on page load
- **GIVEN** `src/contentScript/custom-js-css.js` runs on every page,
- **THEN** the `CustomCodeInjector` MUST read the latest rules from `chrome.storage.local`, filter to entries that are not `disabled` and whose `URLPattern` matches `window.location.href`, and for each:
  - inject CSS by replacing/adding a `<style id="nenya-custom-css-<ruleId>" data-nenya-custom>` appended to the end of `<head>` (or `body`/`documentElement` fallback) so it wins cascade priority,
  - request the background service worker to execute the JavaScript payload in the page’s MAIN world, only once per rule per tab (tracked in `injectedScripts`) to avoid duplicate side effects,
- **AND** `applyMatchingRules()` MUST keep a set of active rule IDs and remove any now-stale `<style>` elements when a rule stops matching, while acknowledging that previously executed JS cannot be rolled back (disabling the rule only prevents future injections).

#### Scenario: Reapply injections when configuration changes
- **GIVEN** another tab, import, or backup modifies `customCodeRules`,
- **THEN** the content script’s `chrome.storage.onChanged` listener MUST detect the `local` change, swap in the new `rules` array, and immediately call `applyMatchingRules()` so SPA navigations and edits propagate without reloading the page,
- **AND** initialization MUST also call `applyMatchingRules()` after the first `loadRules()` completes so matches apply on the initial render.

### Requirement: The background service SHALL execute custom JavaScript payloads securely

#### Scenario: Execute JS on behalf of the content script
- **GIVEN** the content script requests `{ type: 'INJECT_CUSTOM_JS', ruleId, code }`,
- **THEN** the background service worker MUST verify `sender.tab.id` exists and `code` is non-empty, call `chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (js) => (0, eval)(js), args: [code] })`, and reply `{ success: true }`,
- **AND** errors (invalid tab, injection failure, runtime exceptions) MUST be caught and responded to with `{ success: false, error }` so the caller can log and avoid retry storms.

### Requirement: Backups and sync SHALL propagate custom code rules across devices even though they live in local storage

#### Scenario: Include custom code rules in options backup/export
- **GIVEN** the options backup (`readCurrentOptions()` / `applyImportedOptions()`) or manual export/import flows run,
- **THEN** they MUST call `normalizeCustomCodeRules()` to sanitize every entry, ensure deterministic sorting, and persist the sanitized list to `chrome.storage.local.customCodeRules` (while other settings go to `chrome.storage.sync`),
- **AND** import operations MUST write the sanitized array back to local storage alongside the other categories so a restore faithfully recreates the user’s custom code rules.

#### Scenario: Keep Automerge sync aware of local-only rules
- **GIVEN** Automerge sync is preparing the CRDT document for Raindrop,
- **THEN** `ensureLocalStorageInDoc()` MUST read `chrome.storage.local.customCodeRules`, detect divergence from the document’s `doc.customCodeRules`, and copy the JSON data into the Automerge change so remote merges, backups, and other browsers receive the latest rules even though they originate in local storage.


