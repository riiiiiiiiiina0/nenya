# Options Restore & Backup Specification

## Purpose
Document how the Raindrop-based options backup and restore system behaves today so UI and background workflows stay aligned with the existing functionality.
## Requirements
### Requirement: Options UI MUST expose manual Raindrop backup controls with live status
The options page SHALL present Backup/Restore alongside Import/Export via a floating bar and reflect the latest manual backup/restore status; the popup MAY trigger the same flow while the options page stays in sync.

#### Scenario: Status snapshot and action gating
- **WHEN** the options page or popup loads
- **THEN** it SHALL fetch `{ lastBackupAt, lastRestoreAt, lastError }` and render timestamps or “Never”
- **AND** Backup/Restore SHALL disable while a request is running or when the user is not connected
- **AND** after any manual action completes, the UI SHALL refresh status and display a success or error toast.

### Requirement: Backup payloads MUST cover every configurable category with normalized data and metadata

Each payload MUST be versioned JSON that contains metadata plus a sanitized copy of local settings, guaranteeing that restores are deterministic.

#### Scenario: Category inventory and sanitation

- **GIVEN** backups run, **THEN** the system MUST capture the following categories using their build/parse/apply helpers: root folder + provider linkage (`mirrorRootFolderSettings`), notification preferences, auto reload rules (identifiers generated when missing, minimum 5 s interval, sanitized URL patterns), dark mode rules, bright mode whitelist, highlight text rules (type limited to `whole-phrase|comma-separated|regex` with valid colors/patterns), block element rules (URLPattern validation and selector arrays), custom code rules (stored from `chrome.storage.local`, invalid patterns still persisted but noted), LLM prompts, URL process rules, auto Google login rules, pinned shortcuts (limited to six whitelisted shortcut ids), **and screenshot settings (auto-save boolean flag)**.
- **AND** every `apply*` function MUST normalize incoming payloads, write them back through `chrome.storage` with `suppressBackup` to avoid echo loops, and run any needed follow-up (e.g., re-evaluating auto reload rules).

#### Scenario: Screenshot settings backup payload

- **GIVEN** a backup operation is triggered
- **WHEN** building the screenshot settings payload
- **THEN** the system MUST read `screenshotSettings` from `chrome.storage.sync`
- **AND** create a payload with kind `'screenshot-settings'`
- **AND** include the normalized settings object: `{ autoSave: boolean }`
- **AND** include standard metadata (version, timestamp, deviceId, trigger)
- **AND** store the payload in Raindrop with title `'screenshot-settings-1'`

#### Scenario: Screenshot settings restore payload

- **GIVEN** a restore operation is triggered
- **WHEN** parsing a screenshot settings item from Raindrop
- **THEN** the system MUST validate the payload kind is `'screenshot-settings'`
- **AND** extract the settings object and normalize it
- **AND** ensure `autoSave` is a boolean (default to `false` if invalid)
- **AND** apply the normalized settings to `chrome.storage.sync.screenshotSettings`
- **AND** suppress automatic backup during the write to avoid loops

#### Scenario: Screenshot settings storage change detection

- **GIVEN** the backup service is monitoring storage changes
- **WHEN** `chrome.storage.sync.screenshotSettings` changes
- **THEN** the system MUST detect the change
- **AND** queue a backup for the `'screenshot-settings'` category
- **AND** respect the suppression window to avoid backup loops
- **AND** use trigger `'storage'` for the incremental backup

### Requirement: Screenshot Settings Category Registration

The backup system MUST register screenshot settings as a backup category.

#### Scenario: Register screenshot settings category

- **GIVEN** the backup system initializes
- **WHEN** registering backup categories
- **THEN** a `'screenshot-settings'` category MUST be added to `BACKUP_CATEGORIES`
- **AND** the category MUST have:
  - `title: 'screenshot-settings'`
  - `link: 'https://nenya.local/options/screenshot'`
  - `buildPayload: buildScreenshotSettingsPayload`
  - `parseItem: parseScreenshotSettingsItem`
  - `applyPayload: applyScreenshotSettings`
- **AND** the category MUST be included in full backups
- **AND** the category MUST support incremental backups on storage changes

### Requirement: Screenshot Settings Import/Export

The JSON import/export functionality MUST include screenshot settings.

#### Scenario: Export screenshot settings to JSON

- **GIVEN** the user exports options to JSON
- **WHEN** building the export payload
- **THEN** the export MUST include a `screenshotSettings` field
- **AND** the field MUST contain the normalized settings: `{ autoSave: boolean }`
- **AND** the field MUST be included even if using default values

#### Scenario: Import screenshot settings from JSON

- **GIVEN** the user imports options from JSON
- **WHEN** the JSON contains a `screenshotSettings` field
- **THEN** the import MUST read and normalize the settings
- **AND** ensure `autoSave` is a boolean (default to `false` if missing/invalid)
- **AND** write the normalized settings to `chrome.storage.sync.screenshotSettings`
- **AND** the options page UI MUST reflect the imported settings immediately

#### Scenario: Handle missing screenshot settings in import

- **GIVEN** the user imports options from JSON
- **WHEN** the JSON does NOT contain a `screenshotSettings` field
- **THEN** the import MUST NOT modify existing screenshot settings
- **AND** existing settings MUST be preserved unchanged
- **AND** no error or warning MUST be shown

### Requirement: Options data MUST be persisted in local storage only
All option categories SHALL be stored in `chrome.storage.local` instead of `chrome.storage.sync`, including root folder settings, notification preferences, auto reload rules, dark mode rules, bright mode whitelist/settings, highlight text rules, video enhancement rules, block element rules, custom code rules, LLM prompts, URL process rules, auto Google login rules, screenshot settings, and pinned shortcuts.

#### Scenario: Option writes use local storage
- **WHEN** any option category is saved by the UI or background helpers
- **THEN** the values SHALL be written to `chrome.storage.local` under their respective keys
- **AND** no writes to `chrome.storage.sync` SHALL occur for these categories.

#### Scenario: Manual backup reads from the local copy
- **WHEN** a manual backup or restore runs
- **THEN** it SHALL read from `chrome.storage.local` for every option category listed above to assemble or apply the payload.

### Requirement: Manual Raindrop backup and restore MUST use chunked plain JSON with batch requests
Manual backup/restore SHALL operate on a plain JSON payload, split into deterministic chunks of at most 1000 characters, and use Raindrop batch get/set APIs to save or fetch all chunks in a single request.

#### Scenario: Manual backup stores chunked JSON via batch set
- **WHEN** the user triggers Backup from the options floating bar or the popup
- **THEN** the system SHALL build a JSON payload from local options, stringify it, split it into ordered chunks each ≤1000 characters, and issue one Raindrop batch set request to overwrite the remote copy (creating/updating all chunk items)
- **AND** on success it SHALL record `lastBackupAt`; on failure it SHALL return an error without reporting success.

#### Scenario: Manual restore fetches chunked JSON via batch get
- **WHEN** the user triggers Restore from the options floating bar or the popup
- **THEN** the system SHALL issue one Raindrop batch get request to fetch all backup chunks, sort them deterministically, concatenate and parse the JSON, and apply it to local options
- **AND** if any chunk is missing, out-of-order, or the JSON fails to parse, the restore SHALL fail and surface an error instead of applying partial data.

### Requirement: Automatic sync MUST be disabled in favor of explicit user triggers
The system SHALL never initiate Raindrop backup/restore automatically; only explicit user actions may trigger network sync.

#### Scenario: No background sync without explicit action
- **WHEN** the extension starts, storage changes occur, alarms fire, or a window gains focus
- **THEN** no Raindrop backup/restore SHALL be initiated automatically
- **AND** no Automerge/CRDT merge paths or backup alarms SHALL run.

### Requirement: Backup controls MUST be reachable from options floating bar and popup
Users SHALL be able to access Backup/Restore (and import/export) from both the options page and the popup, sharing the same manual flow.

#### Scenario: Options floating bar is visible across sections
- **WHEN** a user views any options section
- **THEN** a floating bottom-right bar SHALL stay visible containing Backup, Restore, Export JSON, and Import JSON actions
- **AND** these controls SHALL disable while an action is running and when the user is not connected.

#### Scenario: Popup backup/restore actions
- **WHEN** the popup opens while the user is logged in
- **THEN** Backup and Restore buttons SHALL be present, call the same manual background flow, and show success or error feedback
- **AND** when logged out the buttons SHALL be disabled or prompt the user to connect.

### Requirement: Backup payload MUST cover all configurable categories in plain JSON
Manual backups SHALL serialize all configurable options into a plain JSON payload that can be restored without CRDT metadata.

#### Scenario: Backup includes normalized categories without Automerge metadata
- **WHEN** a manual backup builds its payload
- **THEN** it SHALL include normalized values for `mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`/`brightModeSettings`, `highlightTextRules`, `videoEnhancementRules`, `blockElementRules`, `customCodeRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `screenshotSettings`, and `pinnedShortcuts`
- **AND** the payload SHALL omit Automerge metadata and SHALL store only plain JSON fields
- **AND** restore SHALL overwrite the corresponding local keys, applying defaults when fields are missing.

### Requirement: Manual restore MUST overwrite local options with the remote backup
Manual restores SHALL apply the remote backup as the single source of truth, replacing existing local values rather than merging.

#### Scenario: Restore overwrites instead of merging
- **WHEN** a manual restore succeeds
- **THEN** the parsed backup values SHALL replace the existing local option values for each category, disregarding uncommitted local edits
- **AND** if the chunk set is incomplete or invalid, the restore SHALL abort and leave local values unchanged.

