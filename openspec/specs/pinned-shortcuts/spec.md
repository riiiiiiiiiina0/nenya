## Pinned Shortcuts Specification

### Requirement: Pinned shortcuts MUST render in the popup header and trigger their actions
Selected shortcuts show up as emoji buttons at the top of `src/popup/index.html` and execute their linked handlers.

#### Scenario: Render stored shortcuts or defaults
- **GIVEN** the popup loads,
- **THEN** it MUST read `chrome.storage.sync.pinnedShortcuts`,
- **AND** use the stored order (falling back to `DEFAULT_PINNED_SHORTCUTS` when empty or invalid),
- **AND** render at most six buttons (excluding the always-present ⚙️ options button) with tooltips and IDs from `SHORTCUT_CONFIG`.

#### Scenario: Trigger shortcut handlers on click
- **GIVEN** a shortcut button is rendered,
- **WHEN** the user clicks it,
- **THEN** the button MUST call its configured handler (e.g., `initializeMirror` for pull/save combos, import custom code when selecting a file, etc.),
- **AND** buttons such as Pull/Save MUST be wired so that mirror actions receive the correct DOM references (passing the rendered elements to `initializeMirror`).

#### Scenario: Reflect storage updates live
- **GIVEN** another tab updates `pinnedShortcuts`,
- **THEN** the popup listener on `chrome.storage.onChanged` MUST reload shortcuts so new selections appear without reopening the popup.

### Requirement: Users MUST be able to manage pinned shortcuts from the options page
`src/options/pinnedShortcuts.js` provides a drag/click UI to curate up to six shortcuts.

#### Scenario: Display pinned and available lists
- **GIVEN** the user opens the Pinned Shortcuts section,
- **THEN** the UI MUST show two lists: the current pinned order (with move/remove controls) and the remaining available shortcuts (with add controls),
- **AND** each entry MUST display its emoji, tooltip, and identifier so users understand the action.

#### Scenario: Add, remove, reorder, and reset
- **GIVEN** the user interacts with the pinned list,
- **THEN** move buttons MUST reorder adjacent items, ❌ MUST remove a shortcut, and clicking ➕ (or the entire available card) MUST append a shortcut when under the max,
- **AND** the Reset button MUST restore `DEFAULT_PINNED_SHORTCUTS`,
- **AND** all edits MUST persist to `chrome.storage.sync.pinnedShortcuts` after normalizing (filter invalid IDs, drop `openOptions`, cap at six).

#### Scenario: Sync edits across tabs
- **GIVEN** pinned shortcuts change in storage,
- **THEN** the options page MUST listen via `chrome.storage.onChanged` and re-render, keeping the UI consistent across multiple open options tabs.

### Requirement: Pinned shortcuts MUST participate in Raindrop backup and restore
Shortcuts are part of the options backup payload stored in Raindrop via `options-backup.js`.

#### Scenario: Include shortcuts in backup payload
- **GIVEN** a backup executes,
- **THEN** `buildPinnedShortcutsPayload` MUST read the sanitized shortcuts array, wrap it with metadata (kind `pinned-shortcuts`), and upload it to the Raindrop backup collection (chunked if needed) just like other categories.

#### Scenario: Apply shortcuts during backup restore
- **GIVEN** a pinned-shortcuts item is downloaded from Raindrop,
- **THEN** `parsePinnedShortcutsItem` MUST validate IDs, trim duplicates, and pass the normalized list to `applyPinnedShortcuts`, which writes to `chrome.storage.sync` while suppressing backup recursion.

### Requirement: JSON import/export MUST include pinned shortcuts
The Options → Backup/Import JSON flow must round-trip the user’s shortcut configuration.

#### Scenario: Export pinned shortcuts
- **GIVEN** the user exports options to JSON,
- **THEN** the export payload MUST include a `pinnedShortcuts` array derived from `normalizePinnedShortcuts` so only valid IDs (max six) are written.

#### Scenario: Import pinned shortcuts
- **GIVEN** the user imports options from JSON,
- **THEN** the importer MUST call `applyImportedOptions` with the sanitized `pinnedShortcuts` array, writing it back to `chrome.storage.sync` so the popup/options UI immediately reflect the imported selection.
