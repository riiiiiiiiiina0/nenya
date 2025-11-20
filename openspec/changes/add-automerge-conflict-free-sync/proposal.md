# Change: Add Automerge-based conflict-free options sync

## Why

The current options backup system uses last-write-wins (LWW) conflict resolution based on timestamps, which can cause data loss when users modify settings from multiple browsers simultaneously. For example, if Browser A changes the dark mode rules while Browser B updates auto-reload rules, the later sync will overwrite all settings from the earlier browser, losing one set of changes. This is frustrating for multi-browser users who need reliable, conflict-free synchronization.

By integrating Automerge—a CRDT (Conflict-free Replicated Data Type) library—we can guarantee that concurrent edits from multiple browsers will merge automatically without data loss, providing a mathematically sound solution to the conflict problem.

## What Changes

- **Consolidate all feature options into a single unified Automerge document** (replaces the current per-category multi-item approach)
- Integrate Automerge (v3.2.0) as the conflict resolution layer for options sync
- Replace timestamp-based LWW with CRDT-based automatic merging
- Store the unified Automerge document as a Base64-encoded binary in the new Raindrop collection "Nenya options backup"
- **Implement mandatory automatic chunking** to split the serialized document across multiple Raindrop items if the Base64 string exceeds 10,000 characters (Raindrop's hard limit for item descriptions - exceeding this causes data loss)
- Maintain existing backup/restore UI and automatic sync triggers
- Add device-specific Automerge actor IDs for proper change attribution
- Implement merge logic that combines local and remote Automerge documents on every sync
- Keep existing payload sanitization and validation logic
- Preserve backward compatibility by detecting and migrating from old JSON-based backups

## Impact

- **Affected specs:** `options-restore-backup`
- **Affected code:**
  - `src/background/options-backup.js` - Core sync engine (add Automerge integration)
  - `src/options/backup.js` - UI (minimal changes, possibly add sync status)
  - `src/libs/automerge@3.2.0-mjs` - Already downloaded, needs to be loaded
- **User benefits:** Zero data loss from concurrent edits, true multi-browser support, simpler sync model (one document instead of many)
- **Migration:** First sync after update will consolidate existing per-category JSON backups into a single Automerge document
- **Breaking changes:** None - new collection name ensures clean separation
- **Storage efficiency:** Single unified document reduces Raindrop API calls and simplifies conflict resolution
