# Options Restore & Backup Specification

## Purpose
Document how the Raindrop-based options backup and restore system behaves today so UI and background workflows stay aligned with the existing functionality.
## Requirements
### Requirement: Options UI MUST expose manual Raindrop backup controls with live status
The options page MUST remain the only user-facing surface for the Raindrop backup system, so it must reflect the current state and provide guarded actions.

#### Scenario: Status snapshot and connection gating
- **GIVEN** the options page loads, **WHEN** `src/options/backup.js` initializes, **THEN** it MUST call `OPTIONS_BACKUP_MESSAGES.STATUS`, aggregate the latest `lastBackupAt`/`lastRestoreAt` timestamps across every category, and render those times (or `Never`) along with the freshest error message in the status area.
- **AND** the background response MUST include `loggedIn`, allowing the UI to disable the Backup/Restore buttons plus show “Connect your Raindrop account…” whenever no valid tokens exist.
- **AND** all buttons MUST flip to `aria-disabled="true"` while any backup/reset/restore action is running so the user cannot queue concurrent work.

#### Scenario: Manual backups, restores, and resets
- **GIVEN** the user clicks Backup/Restore, **WHEN** the page sends `optionsBackup:backupNow` or `optionsBackup:restoreNow`, **THEN** the background MUST execute `runManualBackup`/`runManualRestore`, refresh cached state, and reply with `{ ok, errors?, state }`.
- **AND** the UI MUST show a Toastify toast (“Options backup completed successfully.” / “Options restored from backup.”) on success or surface the first `errors` entry on failure before re-fetching status.
- **WHEN** “Reset to defaults” is clicked, the UI MUST prompt for confirmation, send `optionsBackup:resetDefaults`, and on success report “Options reset to defaults.” while the background clears all option buckets to their defaults, resets `optionsBackupState`, and performs a full backup with trigger `reset` so Raindrop mirrors the new defaults immediately.

### Requirement: Local option edits MUST automatically sync to Raindrop in near real time

Settings often change piecemeal, so the background worker MUST incrementally sync categories to the provider without user involvement. The sync MUST use Automerge CRDT to ensure conflict-free merging when multiple browsers modify settings concurrently.

#### Scenario: Storage change detection triggers Automerge document update

- **GIVEN** any watched key in `chrome.storage.sync` (`mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`, `highlightTextRules`, `blockElementRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `pinnedShortcuts`) or `chrome.storage.local` (`customCodeRules`) changes, **THEN** `handleStorageChanges` MUST apply the change to the local Automerge document using `Automerge.change()` with the browser's unique actor ID.
- **AND** the change MUST be queued for sync to Raindrop with trigger `storage`, coalescing multiple rapid changes within a 1.5 s suppression window set by `suppressBackup` to avoid echo loops when the extension itself writes to storage (e.g., after a sync applies remote changes).

#### Scenario: Automerge sync manages conflict-free merging with unified document storage

- **WHEN** a sync operation runs, **THEN** the background MUST ensure the `Nenya options backup` collection exists (creating it if missing), fetch the remote Automerge document by searching for items with title matching `automerge-options-sync*`, reconstruct the full Base64-encoded binary (concatenating chunks if multiple items found), decode and deserialize it, merge it with the local Automerge document using `Automerge.merge(localDoc, remoteDoc)`, apply the merged document to `chrome.storage` (with `suppressBackup` enabled), serialize and encode the merged document, split it into chunks if the Base64 string exceeds 10,000 characters (with each chunk ≤10,000 characters), and save chunk(s) back to Raindrop (deleting obsolete chunks if chunk count changed).
- **AND** the merge MUST automatically resolve all conflicts according to Automerge CRDT semantics (concurrent array insertions are preserved, object property updates use LWW per-property, deletions are tombstoned), ensuring no data loss from concurrent edits across browsers.
- **AND** `optionsBackupState` MUST record the trigger, timestamp, last merge timestamp, count of changes applied, document size, chunk count, and any errors, using the latest Raindrop item's `lastUpdate` timestamp as `lastRemoteModifiedAt`.

#### Scenario: Failure visibility without spam

- **GIVEN** an automatic sync fails (e.g., lost auth, API errors, Automerge document corruption), **WHEN** `notifyOnError` is true, **THEN** the service MUST store the error message/timestamp globally (not per-category since Automerge uses single document) and push a `pushNotification('options-backup', 'Options sync failed', …)` only if no notification has been emitted in the last 15 minutes (`AUTO_NOTIFICATION_COOLDOWN_MS`).

### Requirement: Remote backups MUST be restored automatically whenever the extension wakes or the user logs in

Raindrop is treated as the source of truth, so the extension MUST continuously sync from it. With Automerge, "restore" becomes a merge operation that combines local and remote changes rather than overwriting local state.

#### Scenario: Lifecycle, alarm, and focus syncs

- **GIVEN** the service worker wakes because of `onInstalled`, `onStartup`, the dedicated alarm (`nenya-options-backup-sync` every 5 minutes), or a window regains focus (no more than once per minute), **THEN** `handleOptionsBackupLifecycle(trigger)` MUST initialize the Automerge sync service (loading actor ID and local document if not already in memory) and run `syncWithRemote(trigger, notifyOnError=true)`.
- **AND** after a sync resolves, the background MUST invoke `evaluateAllTabs()` so the auto-reload subsystem recalculates schedules using the freshly merged rules.

#### Scenario: Immediate sync after OAuth login

- **GIVEN** the user completes OAuth, **WHEN** `processOAuthSuccess` receives the tokens, **THEN** it MUST call `setBackupConnectionState(true)`, trigger `optionsBackup:syncAfterLogin`, execute `syncWithRemote('login', false)` to merge remote changes into local state, and only after that refresh the visible sync status so the page reflects the post-login state.

#### Scenario: Manual restore feedback and error reporting

- **GIVEN** the user clicks the Restore button, **WHEN** the page sends `optionsBackup:restoreNow`, **THEN** `syncWithRemote('manual-restore', false)` MUST execute with `forceRestore: true` flag, which discards uncommitted local changes and applies only the remote Automerge document to `chrome.storage`, record any errors globally, return `ok: false` with an errors array if the sync fails, and the UI MUST toast the first message; background-triggered syncs still surface notifications through `pushNotification('Options sync failed', …)` respecting the cooldown logic.

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

### Requirement: Each browser instance MUST have a unique Automerge actor ID

Automerge requires unique actor IDs to attribute changes correctly and enable conflict-free merging. The actor ID MUST be stable across browser sessions but unique per browser installation.

#### Scenario: Actor ID generation and persistence

- **WHEN** the Automerge sync service initializes for the first time, **THEN** it MUST generate a unique actor ID in the format `nenya-<deviceId>-<randomHex8>` (e.g., `nenya-chrome-linux-a1b2c3d4`) using the existing `deviceId` from `optionsBackupState` plus 8 random hexadecimal characters, and store it in `chrome.storage.local.automergeActorId`.
- **AND** on subsequent initializations, the service MUST load the existing `automergeActorId` from `chrome.storage.local` and use it for all Automerge operations, ensuring the same browser always uses the same actor ID.
- **AND** the actor ID MUST be used when loading or initializing the Automerge document (via `Automerge.load` or `Automerge.init`), ensuring that `Automerge.change(doc, changeFunc)` uses this actor ID. The actor ID MUST be recorded in the `_meta.devices` object with the current timestamp whenever a sync completes.

#### Scenario: Actor ID visibility for debugging

- **WHEN** the options page loads the backup status, **THEN** the `OPTIONS_BACKUP_MESSAGES.STATUS` response MAY include the current `actorId` in the state object for debugging purposes, though it MUST NOT be exposed in the UI by default (only for technical troubleshooting).

### Requirement: Automerge merge operations MUST preserve all concurrent changes from multiple browsers

The core benefit of Automerge is conflict-free merging. The system MUST leverage Automerge's CRDT semantics to automatically resolve conflicts without data loss.

#### Scenario: Concurrent edits to different categories

- **GIVEN** Browser A changes `darkModeRules` at T1 and Browser B changes `autoReloadRules` at T2 (before either syncs), **WHEN** Browser A syncs at T3 (pushes its local document to Raindrop), and Browser B syncs at T4 (fetches Browser A's document, merges with its own, pushes the result), **THEN** the final merged document MUST contain both Browser A's `darkModeRules` changes AND Browser B's `autoReloadRules` changes, with no data loss.
- **AND** when Browser A syncs again at T5, it MUST fetch the merged document from T4 and apply Browser B's `autoReloadRules` changes to its `chrome.storage`, resulting in both browsers converging to identical state.

#### Scenario: Concurrent edits to the same array

- **GIVEN** Browser A inserts a new rule into `autoReloadRules` array at index 0 at T1, and Browser B inserts a different rule into the same `autoReloadRules` array at index 0 at T2 (before either syncs), **WHEN** both browsers subsequently sync and merge their documents, **THEN** the final merged `autoReloadRules` array MUST contain both inserted rules (Automerge will order them deterministically based on actor IDs and Lamport timestamps), with no rule lost or overwritten.

#### Scenario: Concurrent edits to the same object property

- **GIVEN** Browser A sets `notificationPreferences.enabled = false` at T1, and Browser B sets `notificationPreferences.enabled = true` at T2 (before either syncs), **WHEN** both browsers sync and merge, **THEN** the final value of `notificationPreferences.enabled` MUST be the value from the browser whose change has the later Lamport timestamp in Automerge's logical clock (typically the last writer, but deterministic even if wall-clock times are identical), and both browsers MUST converge to this value.

#### Scenario: Merge logging for observability

- **WHEN** a merge operation completes, **THEN** the system MUST log (via `console.log` in debug mode or stored in `optionsBackupState`) the count of local changes applied to the merged document, the count of remote changes received, the actor IDs involved, and a flag indicating whether any conflicts were auto-resolved, to aid debugging and monitoring of multi-browser sync health.

### Requirement: The system MUST support forced restore that overwrites local state with remote backup for recovery scenarios

The extension MUST provide a manual restore operation that discards all local uncommitted changes and replaces the local Automerge document entirely with the remote state, allowing users to recover from corruption or undo unwanted local modifications.

#### Scenario: Force restore discards local changes for recovery from corruption

- **GIVEN** the user clicks the Restore button in the options page, **WHEN** the background receives `optionsBackup:restoreNow`, **THEN** `syncWithRemote('manual-restore', false)` MUST execute with a `forceRestore: true` flag.
- **AND** when `forceRestore: true`, the sync operation MUST discard the current local Automerge document, fetch the remote document from Raindrop, apply it directly to `chrome.storage` (after validation), and replace the in-memory local document with the remote one, effectively losing any uncommitted local changes.
- **AND** the UI MUST show a success toast "Options restored from remote backup. Local changes discarded." to inform the user of the data loss trade-off.

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

