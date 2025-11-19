# Implementation Tasks

## 1. Setup and Infrastructure

- [ ] 1.1 Verify Automerge library (`src/libs/automerge@3.2.0.iife.min.js`) loads correctly in service worker
- [ ] 1.2 Add Automerge to service worker imports in `src/background/index.js`
- [ ] 1.3 Create `src/background/automerge-options-sync.js` module skeleton

## 2. Actor ID and Initialization

- [ ] 2.1 Implement actor ID generation and storage (`chrome.storage.local.automergeActorId`)
- [ ] 2.2 Implement `initializeAutomergeSync()` to load/create actor ID and initialize in-memory document
- [ ] 2.3 Add document initialization on service worker startup

## 3. Core Automerge Operations

- [ ] 3.1 Implement `getLocalAutomergeDoc()` to retrieve current in-memory document
- [ ] 3.2 Implement `applyStorageChangesToDoc(changes)` to record chrome.storage changes in Automerge using `Automerge.change()`
- [ ] 3.3 Implement `applyDocToStorage(doc, suppressBackup=true)` to write Automerge state to chrome.storage
- [ ] 3.4 Add device metadata tracking (`_meta.devices`) with timestamps

## 4. Raindrop Integration with Mandatory Chunking

- [ ] 4.1 Implement `ensureAutomergeCollection()` to create/find "Nenya options backup" collection
- [ ] 4.2 Implement `serializeAndChunkDoc(doc)` to serialize Automerge doc, encode as Base64, and split into exactly 10,000 character chunks if total length > 10,000 (CRITICAL: Raindrop hard limit)
- [ ] 4.3 Implement `saveDocToRaindrop(doc)` to save unified document (single item or multiple chunks) to Raindrop
- [ ] 4.4 Add safety check to prevent saving descriptions > 10,000 characters (log error if chunking logic fails)
- [ ] 4.5 Implement `loadDocFromRaindrop()` to search for `automerge-options-sync*` items, detect chunking, concatenate chunks, and deserialize
- [ ] 4.6 Add chunk integrity validation (verify matching `total-chunks:N` tags, ensure no missing chunks, verify total reconstructed length)
- [ ] 4.7 Implement cleanup logic to delete obsolete chunks when chunk count decreases
- [ ] 4.8 Handle Raindrop API errors (authentication, network, rate limits, description too long errors)

## 5. Sync and Merge Logic

- [ ] 5.1 Implement `syncWithRemote()` core function: fetch → merge → save → apply
- [ ] 5.2 Add merge conflict logging (track changes merged, actor IDs involved)
- [ ] 5.3 Handle empty remote state (first sync creates initial document)
- [ ] 5.4 Add debouncing/coalescing for rapid local changes (reuse existing queue mechanism)

## 6. Migration from Old Format

- [ ] 6.1 Implement `detectOldBackupFormat()` to check for existing "Options backup" collection
- [ ] 6.2 Implement `migrateFromOldFormat()` to create Automerge doc from current chrome.storage
- [ ] 6.3 Add migration trigger on first sync after update
- [ ] 6.4 Log migration success/failure for debugging

## 7. Integration with Existing Backup System

- [ ] 7.1 Update `handleStorageChanges()` in `options-backup.js` to call `applyStorageChangesToDoc()` instead of `queueCategoryBackup()`
- [ ] 7.2 Update lifecycle handlers (`onInstalled`, `onStartup`, alarm) to call `syncWithRemote()` instead of `performRestore()`
- [ ] 7.3 Update manual backup button handler to call `syncWithRemote()`
- [ ] 7.4 Update manual restore button handler to call `syncWithRemote({ forceRestore: true })`
- [ ] 7.5 Update reset button handler to create new Automerge doc with defaults

## 8. State Management and UI

- [ ] 8.1 Update `optionsBackupState` to track Automerge sync status (lastSyncAt, lastMergeAt, conflictsResolved, documentSize, chunkCount)
- [ ] 8.2 Update `OPTIONS_BACKUP_MESSAGES.STATUS` handler to return Automerge-specific state including chunking info
- [ ] 8.3 Update `src/options/backup.js` UI to display sync status (optional: show "Conflict-free sync enabled" and document size/chunk info)
- [ ] 8.4 Preserve existing error notification system

## 9. Validation and Sanitization

- [ ] 9.1 Reuse existing category validation helpers (`buildAutoReloadRulesPayload`, etc.) before applying to chrome.storage
- [ ] 9.2 Add Automerge document schema validation (ensure all expected keys exist)
- [ ] 9.3 Handle corrupted Automerge documents (fallback to migration or defaults)

## 10. Testing and Debugging

- [ ] 10.1 Test with single browser: edit options, verify sync to Raindrop (single item if small)
- [ ] 10.2 Test with two browsers: concurrent edits to different settings, verify both changes preserved
- [ ] 10.3 Test with two browsers: concurrent edits to same setting (e.g., add different rules to same array), verify merge
- [ ] 10.4 Test migration from old format (downgrade → upgrade with existing backup)
- [ ] 10.5 Test offline scenario: make local changes while offline, sync when back online
- [ ] 10.6 Test error handling: invalid Raindrop auth, network errors, corrupted documents
- [ ] 10.7 Test chunking: create large custom code rules to exceed 10,000 character threshold, verify multi-chunk storage
- [ ] 10.8 Test chunk reduction: delete large rules, verify obsolete chunks are cleaned up
- [ ] 10.9 Test chunk integrity: manually corrupt a chunk in Raindrop, verify error detection
- [ ] 10.10 Add debug logging for merge operations (change counts, actor IDs, document size, chunk count)

## 11. Documentation and Cleanup

- [ ] 11.1 Add JSDoc comments to all new functions in `automerge-options-sync.js`
- [ ] 11.2 Update AGENTS.md if new patterns are introduced
- [ ] 11.3 Add inline comments explaining key Automerge operations
- [ ] 11.4 Remove or deprecate old backup code (mark with `// DEPRECATED: Old JSON backup, kept for reference`)

## 12. Final Validation

- [ ] 12.1 Run `openspec validate add-automerge-conflict-free-sync --strict` and resolve all issues
- [ ] 12.2 Verify no linter errors in modified files
- [ ] 12.3 Test extension loading in Chrome without errors
- [ ] 12.4 Perform manual end-to-end test with two browser profiles
