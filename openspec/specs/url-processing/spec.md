## URL Processing Specification

`src/options/urlProcessRules.js`, `src/options/index.html`, `src/shared/urlProcessor.js`, `src/background/clipboard.js`, `src/background/index.js`, `src/background/mirror.js`, `src/background/projects.js`, `src/background/options-backup.js`, `src/background/automerge-options-sync.js`, and `src/options/importExport.js` implement the URL Processing capability: users define deterministic rule sets that match URL patterns, apply ordered processors during specific workflows (clipboard copies, Raindrop saves, and tab openings), and ensure those rules remain portable through backup, export, and Automerge sync flows.

### Requirement: The options UI SHALL normalize and reflect sync-stored URL process rules

#### Scenario: Sanitize stored rules on page load
- **GIVEN** the options page initializes,
- **THEN** `loadAndRenderRules()` MUST read `chrome.storage.sync.urlProcessRules`, pass the raw array through `normalizeRules()`, and discard entries missing a trimmed `name`, at least one valid `URLPattern`, at least one processor, or a supported `applyWhen`,
- **AND** `normalizeRules()` MUST trim pattern strings, validate them with the `URLPattern` constructor (treating hostname, pathname, wildcard, and full-URL inputs appropriately), drop invalid regex-style processor names, coerce processor IDs via `generateProcessorId()`, and strip deprecated `open-in-new-tab` contexts,
- **AND** whenever normalization changes the payload, the sanitized array MUST be written back to `chrome.storage.sync` before calling `render()` so the UI, backups, and Automerge receive the cleaned copy,
- **AND** `render()` MUST either show the empty-state banner or list each rule sorted alphabetically by `name`.

#### Scenario: React to sync changes in real time
- **GIVEN** another browser, Automerge sync, or backup restore mutates `chrome.storage.sync.urlProcessRules`,
- **WHEN** `chrome.storage.onChanged` fires for that key (and the local save promise is not in-flight),
- **THEN** the options script MUST re-run `normalizeRules()` against the new value, update the in-memory `rules` array, clear `selectedRuleId` / `editingRuleId` when those records disappear, and re-render so the list, detail panel, and form never reference stale data.

### Requirement: Users SHALL manage rule definitions from the options UI

#### Scenario: Add URL patterns and processors with validation
- **GIVEN** the user fills the "URL Process Rules" form,
- **WHEN** they add a pattern,
- **THEN** `addPattern()` MUST trim the input, validate it via `URLPattern`, reject duplicates, and append it to `editingPatterns`,
- **AND** when adding a processor, `addProcessor()` MUST ensure `name` is non-empty, require `value` for `add` processors, validate slash-wrapped regexes, generate a processor ID, and append it to `editingProcessors`,
- **AND** the processors list MUST expose move-up/move-down controls so users can reorder execution, plus delete buttons to remove mistakes,
- **AND** form validation MUST block submission until the rule has a `name`, at least one pattern, and at least one processor.

#### Scenario: Create, edit, toggle, and delete rules
- **GIVEN** the user submits the form,
- **WHEN** creating a rule,
- **THEN** `handleFormSubmit()` MUST mint a unique rule ID, capture ISO `createdAt`/`updatedAt` timestamps, copy `editingPatterns`, `editingProcessors`, and any checked `applyWhen` contexts (`copy-to-clipboard` or `save-to-raindrop`), push the rule into the array, resort by name, persist to `chrome.storage.sync.urlProcessRules`, and reset the form,
- **AND** editing MUST replace the existing record, update `updatedAt`, preserve `createdAt`, and exit edit mode (button label back to "Add rule", cancel hidden),
- **AND** the saved list MUST show each rule with summary counts plus `View`, `Edit`, `Delete`, and an enabled toggle; toggling MUST set `rule.disabled`, persist immediately, and visually dim disabled rows,
- **AND** deleting MUST confirm with the user, remove the record, clear any selected/editing state, persist, and re-render,
- **AND** the detail panel MUST surface the rule metadata (patterns, ordered processors with badges, apply-when badges, timestamps) whenever `View` is clicked.

### Requirement: URL processors MUST apply deterministic transformations for matching contexts

#### Scenario: Match rules using URLPattern semantics
- **GIVEN** any workflow calls `processUrl(url, applyWhen)`,
- **THEN** the helper MUST load `urlProcessRules` from `chrome.storage.sync`, ignore non-arrays, and skip the entire pipeline when no rules exist,
- **AND** it MUST filter rules to those not `disabled`, whose `applyWhen` array includes the provided context (one of `copy-to-clipboard`, `save-to-raindrop`, or legacy `open-in-new-tab`), and whose `urlPatterns` match the original URL using `urlMatchesPatterns()` (which interprets hostnames, pathnames, wildcard-containing strings, and full URLs via `URLPattern`),
- **AND** invalid patterns MUST be caught and skipped without breaking remaining matches.

#### Scenario: Apply processors sequentially
- **GIVEN** a rule survives filtering,
- **WHEN** its processors run,
- **THEN** `applyProcessor()` MUST iterate in the stored order, parse the URL with the `URL` constructor, and:
  - set/overwrite query params for `add` processors,
  - either set query params or run regex replacements when a `replace` processor’s name is slash-wrapped,
  - delete query params or run regex removals for `remove` processors,
- **AND** regex failures MUST fall back to the pre-regex URL without throwing,
- **AND** the final string returned by `processUrl()` MUST cascade all processor outputs so downstream consumers see the transformed URL, or the original URL when parsing fails.

### Requirement: Clipboard operations SHALL use processed URLs

#### Scenario: Copy tab data after applying rules
- **GIVEN** a clipboard context-menu action runs,
- **WHEN** `getTabData()` in `src/background/clipboard.js` iterates selected tabs,
- **THEN** it MUST skip non-HTTP(S) URLs, call `processUrl(tab.url, 'copy-to-clipboard')` for each valid tab, and feed the processed URLs into every formatter (Title, Title+URL, Markdown, etc.) so copied text reflects all matching rule transformations before badges/notifications are shown.

### Requirement: Save-to-Raindrop flows SHALL process URLs before persistence

#### Scenario: Context menu saves
- **GIVEN** the user triggers “Save to Raindrop Unsorted” for a page or link,
- **WHEN** `src/background/index.js` handles the context-menu click,
- **THEN** it MUST convert split-page URLs, normalize them via `normalizeHttpUrl()`, run `processUrl(normalizedUrl, 'save-to-raindrop')`, and pass the processed URL to `saveUrlsToUnsorted()` so Raindrop and bookmark dedupe operate on the rewritten string.

#### Scenario: Bulk saves and project exports
- **GIVEN** code paths such as `saveUrlsToUnsorted()` or `resolveProjectTabs()` prepare URLs for Raindrop/bookmark storage,
- **WHEN** each entry is sanitized,
- **THEN** they MUST call `processUrl(url, 'save-to-raindrop')` prior to deduplication, split-page conversion, and Raindrop API calls so every bookmark/project entry honors the user’s processors.

### Requirement: Tab navigation processing SHALL honor legacy open-in-new-tab rules

#### Scenario: Rewrite navigations before loading
- **GIVEN** `chrome.webNavigation.onBeforeNavigate` fires for a top-level HTTP(S) navigation,
- **THEN** `src/background/index.js` MUST call `processUrl(details.url, 'open-in-new-tab')` and, when the returned value differs, update the tab’s URL via `chrome.tabs.update()` so legacy rules marked for that context still execute even though the options UI no longer exposes it.

### Requirement: Backups, exports, and sync SHALL propagate URL process rules

#### Scenario: Options backup/export includes sanitized rules
- **GIVEN** backups (`src/background/options-backup.js`) or manual exports (`src/options/importExport.js`) run,
- **THEN** they MUST call `collectUrlProcessRules()` / `loadUrlProcessRules()` to pull the current list, sanitize it via `normalizeUrlProcessRules()` (preserving processors, applyWhen, disabled flag, and timestamps), embed it in the payload, and `applyUrlProcessRules()` when restoring so other devices recreate the exact rule set in `chrome.storage.sync`.

#### Scenario: Automerge sync mirrors the urlProcessRules key
- **GIVEN** Automerge sync is active,
- **WHEN** `automerge-options-sync` constructs or updates the CRDT document,
- **THEN** the document MUST include a `urlProcessRules` array seeded by `createEmptyAutomergeDoc()`, copy storage changes into the doc via `applyStorageChangesToDoc()`, and push doc updates back into `chrome.storage.sync` via `applyDocToStorage()` so Raindrop-hosted state stays consistent with the user’s rule definitions.


