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
Settings often change piecemeal, so the background worker MUST incrementally back up categories to the provider without user involvement.

#### Scenario: Storage change detection queues category backups
- **GIVEN** any watched key in `chrome.storage.sync` (`mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`, `highlightTextRules`, `blockElementRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `pinnedShortcuts`) or `chrome.storage.local` (`customCodeRules`) changes, **THEN** `handleStorageChanges` MUST queue the matching category id with trigger `storage`.
- **AND** `queueCategoryBackup` MUST coalesce multiple changes, prevent duplicate work while a backup is running, and drop requests inside the 1.5 s suppression window set by `suppressBackup` whenever the extension itself writes to the same storage bucket (e.g., after a restore).

#### Scenario: Incremental backups manage their Raindrop collection
- **WHEN** a category backup runs, **THEN** the background MUST ensure the `Options backup` collection exists (creating it if missing), fetch existing items, and serialize the sanitized payload with metadata before chunking it into ≤10 KB slices stored under deterministic titles such as `auto-reload-rules-1`.
- **AND** for each run it MUST delete any obsolete non-indexed item, upsert each chunk via `raindropRequest`, update `optionsBackupState` with the trigger, timestamp, and `lastRemoteModifiedAt`, and record errors when token lookup fails.
- **AND** `performFullBackup('manual'|'reset')` MUST delete every existing backup item, rebuild all category payloads, and create them in batches of ≤100 items to satisfy Raindrop’s limits.

#### Scenario: Failure visibility without spam
- **GIVEN** an automatic backup fails (e.g., lost auth, API errors), **WHEN** `notifyOnError` is true, **THEN** the service MUST store the error message/timestamp per category and push a `pushNotification('options-backup', 'Options backup failed', …)` only if the category has not emitted a notification in the last 15 minutes (`AUTO_NOTIFICATION_COOLDOWN_MS`).

### Requirement: Remote backups MUST be restored automatically whenever the extension wakes or the user logs in
Raindrop is treated as the source of truth, so the extension MUST continuously restore from it.

#### Scenario: Lifecycle, alarm, and focus restores
- **GIVEN** the service worker wakes because of `onInstalled`, `onStartup`, the dedicated alarm (`nenya-options-backup-sync` every 5 minutes), or a window regains focus (no more than once per minute), **THEN** `handleOptionsBackupLifecycle(trigger)` MUST initialize the service and run `performRestore(trigger, notifyOnError=true)`.
- **AND** after a lifecycle restore resolves, the background MUST invoke `evaluateAllTabs()` so the auto-reload subsystem recalculates schedules using the freshly restored rules.

#### Scenario: Immediate restore after OAuth login
- **GIVEN** the user completes OAuth, **WHEN** `processOAuthSuccess` receives the tokens, **THEN** it MUST call `setBackupConnectionState(true)`, trigger `optionsBackup:restoreAfterLogin`, and only after that refresh the visible backup status so the page reflects the post-login state.

#### Scenario: Manual restore feedback and error reporting
- **GIVEN** the user runs a manual restore, **WHEN** any category payload fails to parse or apply, **THEN** `performRestore('manual', false)` MUST record the error per category, return `ok: false` with an errors array, and the UI MUST toast the first message; background-triggered restores still surface notifications through `pushNotification('Options restore failed', …)` respecting the cooldown logic.

### Requirement: Backup payloads MUST cover every configurable category with normalized data and metadata
Each payload MUST be versioned JSON that contains metadata plus a sanitized copy of local settings, guaranteeing that restores are deterministic.

#### Scenario: Category inventory and sanitation
- **GIVEN** backups run, **THEN** the system MUST capture the following categories using their build/parse/apply helpers: root folder + provider linkage (`mirrorRootFolderSettings`), notification preferences, auto reload rules (identifiers generated when missing, minimum 5 s interval, sanitized URL patterns), dark mode rules, bright mode whitelist, highlight text rules (type limited to `whole-phrase|comma-separated|regex` with valid colors/patterns), block element rules (URLPattern validation and selector arrays), custom code rules (stored from `chrome.storage.local`, invalid patterns still persisted but noted), LLM prompts, URL process rules, auto Google login rules, and pinned shortcuts (limited to six whitelisted shortcut ids).
- **AND** every `apply*` function MUST normalize incoming payloads, write them back through `chrome.storage` with `suppressBackup` to avoid echo loops, and run any needed follow-up (e.g., re-evaluating auto reload rules).

#### Scenario: Metadata, chunk format, and backward compatibility
- **WHEN** constructing payloads, **THEN** `buildMetadata` MUST embed `version: 1`, `lastModified` timestamps, the locally cached `deviceId` + platform/arch, and the trigger string so restores can compare remote vs. local changes.
- **AND** restores MUST read chunked items sequentially (`category-1`, `category-2`, …), fall back to the legacy single-item format when no chunks exist, and always treat Raindrop’s timestamp as authoritative before applying payloads and updating `lastRemoteModifiedAt`.
