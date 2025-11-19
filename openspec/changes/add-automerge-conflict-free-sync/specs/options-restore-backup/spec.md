# Options Restore & Backup Specification - Delta

## MODIFIED Requirements

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

The Automerge document MUST represent all configurable categories as a single unified data structure, with metadata tracking device participation and sync history. Each category MUST maintain its existing validation and sanitization logic when applied to `chrome.storage`.

#### Scenario: Category inventory and sanitation

- **GIVEN** syncs run, **THEN** the Automerge document MUST contain the following top-level keys matching their `chrome.storage` counterparts: `mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules` (identifiers generated when missing, minimum 5 s interval, sanitized URL patterns), `darkModeRules`, `brightModeWhitelist`, `highlightTextRules` (type limited to `whole-phrase|comma-separated|regex` with valid colors/patterns), `blockElementRules` (URLPattern validation and selector arrays), `customCodeRules` (stored from `chrome.storage.local`, invalid patterns still persisted but noted), `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, and `pinnedShortcuts` (limited to six whitelisted shortcut ids).
- **AND** when applying the Automerge document to `chrome.storage`, every category MUST be validated using the existing `build*Payload` helpers (e.g., `buildAutoReloadRulesPayload`) to ensure data integrity, written back through `chrome.storage` with `suppressBackup` to avoid echo loops, and trigger any needed follow-up (e.g., re-evaluating auto reload rules).

#### Scenario: Metadata, unified document format with chunking, and migration

- **WHEN** initializing the Automerge document, **THEN** it MUST embed a `_meta` key containing `{ version: 2, devices: { [actorId]: { lastSeen: timestamp } } }` to track which browsers have synced and when, where `version: 2` indicates the Automerge-based consolidated format.
- **AND** the system MUST consolidate ALL feature options into a single Automerge document (replacing the current per-category approach), serialize it via `Automerge.save()`, encode as Base64, and store in the `Nenya options backup` collection using one of two strategies: (1) if Base64 string ≤ 10,000 characters, create/update a single item with title `automerge-options-sync` and tags `['nenya', 'automerge', 'version:2']`, or (2) if Base64 string > 10,000 characters, split into chunks of exactly 10,000 characters each (with final chunk ≤10,000 characters), create/update items with titles `automerge-options-sync-chunk-1`, `automerge-options-sync-chunk-2`, etc., and tags `['nenya', 'automerge', 'version:2', 'chunked', 'total-chunks:N']` where N is the total chunk count, to comply with Raindrop's hard limit of 10,000 characters per item description (exceeding this causes data truncation).
- **AND** when reading the remote document, the system MUST search for items matching `automerge-options-sync*`, detect chunking via the `chunked` tag, sort chunks by the numeric suffix in the title, concatenate their descriptions in order, verify all chunks have matching `total-chunks:N` tags for integrity, then decode and deserialize the reconstructed Base64 string.
- **AND** on first sync after update, if no `automerge-options-sync*` items exist but items exist in the old `Options backup` collection, the system MUST create a new unified Automerge document containing ALL categories, populate it with the current `chrome.storage` state (most reliable migration source), save it to the new collection (with automatic chunking if needed), and leave the old collection untouched as a safety backup.

## ADDED Requirements

### Requirement: Each browser instance MUST have a unique Automerge actor ID

Automerge requires unique actor IDs to attribute changes correctly and enable conflict-free merging. The actor ID MUST be stable across browser sessions but unique per browser installation.

#### Scenario: Actor ID generation and persistence

- **WHEN** the Automerge sync service initializes for the first time, **THEN** it MUST generate a unique actor ID in the format `nenya-<deviceId>-<randomHex8>` (e.g., `nenya-chrome-linux-a1b2c3d4`) using the existing `deviceId` from `optionsBackupState` plus 8 random hexadecimal characters, and store it in `chrome.storage.local.automergeActorId`.
- **AND** on subsequent initializations, the service MUST load the existing `automergeActorId` from `chrome.storage.local` and use it for all Automerge operations, ensuring the same browser always uses the same actor ID.
- **AND** the actor ID MUST be used when calling `Automerge.change(doc, { actor: actorId }, changeFunc)` and MUST be recorded in the `_meta.devices` object with the current timestamp whenever a sync completes.

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
