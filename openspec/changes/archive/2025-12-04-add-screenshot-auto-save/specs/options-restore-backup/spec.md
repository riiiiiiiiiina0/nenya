## MODIFIED Requirements

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

## ADDED Requirements

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

