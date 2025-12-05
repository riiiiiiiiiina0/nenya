## ADDED Requirements
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

## MODIFIED Requirements
### Requirement: Options UI MUST expose manual Raindrop backup controls with live status
The options page SHALL present Backup/Restore alongside Import/Export via a floating bar and reflect the latest manual backup/restore status; the popup MAY trigger the same flow while the options page stays in sync.

#### Scenario: Status snapshot and action gating
- **WHEN** the options page or popup loads
- **THEN** it SHALL fetch `{ lastBackupAt, lastRestoreAt, lastError }` and render timestamps or “Never”
- **AND** Backup/Restore SHALL disable while a request is running or when the user is not connected
- **AND** after any manual action completes, the UI SHALL refresh status and display a success or error toast.

## REMOVED Requirements
### Requirement: Local option edits MUST automatically sync to Raindrop in near real time
**Reason**: Automatic Automerge sync is being removed.  
**Migration**: Users invoke manual Backup when ready to sync changes.

### Requirement: Remote backups MUST be restored automatically whenever the extension wakes or the user logs in
**Reason**: Lifecycle/focus/installation restores are removed in favor of manual control.  
**Migration**: Users trigger Restore manually from options or popup.

### Requirement: Each browser instance MUST have a unique Automerge actor ID
**Reason**: Automerge is removed; no actor IDs are needed.

### Requirement: Automerge merge operations MUST preserve all concurrent changes from multiple browsers
**Reason**: Manual overwrite semantics replace CRDT merging.

### Requirement: The system MUST support forced restore that overwrites local state with remote backup for recovery scenarios
**Reason**: Superseded by the new manual restore overwrite requirement.  
**Migration**: Use manual Restore for recovery.

