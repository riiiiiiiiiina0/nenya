# Design: Automerge-based Conflict-Free Options Sync

## Context

Nenya currently backs up extension options to Raindrop using JSON payloads with timestamp-based conflict resolution. Each feature category (auto-reload rules, dark mode rules, etc.) is stored as separate items in Raindrop, and each category is synced independently. When multiple browsers modify settings concurrently, the last-write-wins approach causes data loss. Users expect reliable multi-browser sync where all changes are preserved.

**Current Problems:**

1. **Data loss from LWW conflicts** - Browser A's changes overwrite Browser B's changes
2. **Per-category sync complexity** - Each feature manages its own Raindrop items and sync logic
3. **Inconsistent state** - Categories can be out-of-sync with each other (e.g., auto-reload rules synced but dark mode not yet)

**Proposed Solution:**

- **Consolidate all options into ONE unified Automerge document** - Single source of truth
- **CRDT-based automatic conflict resolution** - No data loss, ever
- **Single sync operation** - All settings sync together atomically

**Stakeholders:**

- Multi-browser users who need reliable sync
- Maintainers who need simple, proven conflict resolution

**Constraints:**

- Must use vanilla JavaScript (no build step)
- Must continue using Raindrop as storage backend
- **Raindrop API hard limit: item descriptions cannot exceed 10,000 characters** (data will be truncated/lost)
- Must preserve existing UI/UX
- Automerge v3.2.0 IIFE bundle already downloaded to `src/libs/`

## Goals / Non-Goals

**Goals:**

- **Consolidate all feature options into a single unified sync model** (replacing per-category approach)
- Eliminate data loss from concurrent modifications across browsers
- Maintain existing backup/restore workflow and UI
- Use Automerge for conflict-free merging
- Store Automerge binary documents in Raindrop (with automatic chunking for large documents)
- Support gradual migration from old JSON format
- Keep sync triggers (storage changes, lifecycle events, alarms) unchanged
- Reduce Raindrop API calls (1 fetch + 1 save instead of N fetches + N saves per sync)

**Non-Goals:**

- Real-time sync (current polling/alarm schedule is sufficient)
- Peer-to-peer sync (Raindrop remains the central storage)
- Sync between users (single-user extension)
- History/undo features (future enhancement)
- Custom conflict resolution UI (automatic merging is sufficient)

## Decisions

### Decision 1: Use Automerge as conflict resolution layer

**Rationale:** Automerge provides mathematically proven conflict-free merging (CRDT). It's designed for exactly this use case: multiple replicas making concurrent changes that must merge cleanly.

**Alternatives considered:**

- Yjs: Similar CRDT library but larger bundle size (~80KB vs ~50KB for Automerge)
- Operational Transformation: More complex to implement correctly
- Three-way merge (Git-style): Requires storing common ancestor, adds complexity
- Keeping LWW with per-setting timestamps: Doesn't handle nested changes (e.g., array modifications within a category)

**Why Automerge wins:** Smaller size, simpler API, already downloaded, well-suited for JSON-like data structures.

### Decision 2: Store unified Automerge binary in new Raindrop collection with chunking support

**Collection name:** "Nenya options backup" (note: different from existing "Options backup")

**Consolidation approach:**

- **All feature options consolidated into ONE Automerge document** (replaces current per-category approach where each feature saves to separate items)
- Single source of truth for all settings: `mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`, `highlightTextRules`, `blockElementRules`, `customCodeRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `pinnedShortcuts`

**Storage format with automatic chunking:**

- **If Base64 string ≤ 10,000 characters:** Single Raindrop item
  - Title: `automerge-options-sync`
  - Description: Base64-encoded Automerge binary document
  - Tags: `nenya`, `automerge`, `version:2`
- **If Base64 string > 10,000 characters:** Multiple chunked items
  - Title pattern: `automerge-options-sync-chunk-1`, `automerge-options-sync-chunk-2`, ...
  - Each chunk description: Portion of Base64-encoded binary (≤10,000 characters per chunk)
  - Tags: `nenya`, `automerge`, `version:2`, `chunked`, `total-chunks:N`
  - Chunks read sequentially and concatenated before deserializing

**Rationale:**

- **CRITICAL: Raindrop API enforces a hard limit of 10,000 characters for item descriptions** - exceeding this will cause data truncation/loss
- Chunking is MANDATORY for documents that exceed this limit, not optional
- **Single unified document eliminates per-category sync complexity** - one fetch, one merge, one save for ALL options
- Most users with typical configs will fit in single item (~5-8KB Base64 is common)
- Users with extensive custom code or thousands of rules will automatically chunk (transparent to user)
- New collection name prevents conflicts during migration period
- Can detect format version and chunking via tags

**Alternatives considered:**

- No chunking: **REJECTED** - would cause silent data loss when description exceeds 10,000 characters
- Compression before Base64: Adds complexity, still needs chunking for worst cases, and Automerge binary is already compact
- Store as JSON instead of binary: Larger size (~3x), loses Automerge's compact format benefits, still needs chunking
- Multiple separate Automerge documents per category: Defeats purpose of unified sync, reintroduces per-category complexity
- Reusing "Options backup" collection: Risk of confusion during migration

### Decision 3: Merge strategy - Three-way merge on every sync

**Flow:**

1. Load local Automerge document from memory (initialized from last sync)
2. Fetch remote Automerge document from Raindrop
3. Merge: `mergedDoc = Automerge.merge(localDoc, remoteDoc)`
4. Apply merged document to `chrome.storage` (if changes detected)
5. Save merged document back to Raindrop
6. Keep merged document in memory for next sync cycle

**Rationale:**

- Automerge.merge() handles all conflict resolution automatically
- No need to track which browser made which change
- Each browser's local document accumulates its own changes between syncs
- Remote document accumulates changes from all browsers

### Decision 4: Actor ID per device

Each browser instance gets a unique actor ID (stored in `chrome.storage.local` as `automergeActorId`).

**Format:** `nenya-<deviceId>-<randomHex>` (e.g., `nenya-chrome-linux-a1b2c3d4`)

**Rationale:**

- Automerge requires unique actor IDs for change attribution
- Helps with debugging (can see which browser made which changes)
- Generated once per browser installation

### Decision 5: Migration from old JSON format

**Detection:** Check for existing items in "Options backup" collection on first sync after update.

**Migration flow:**

1. If `automerge-options-sync` item exists in new collection → use it (already migrated)
2. Else if items exist in old "Options backup" collection:
   - Load all JSON payloads
   - Create new Automerge document
   - Populate with current `chrome.storage` values (most recent local state)
   - Save to new collection
   - Leave old collection untouched (user can manually delete later)
3. Else → Create empty Automerge document with defaults

**Rationale:**

- Non-destructive migration (keeps old backup as safety net)
- Uses current local state as migration source (most reliable)
- Automatic and transparent to user

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Browser A                                                   │
│ ┌─────────────────────┐      ┌──────────────────────────┐  │
│ │ chrome.storage      │──────│ Automerge Document A     │  │
│ │ (source of truth)   │ read │ (in-memory, tracks edits)│  │
│ └─────────────────────┘      └──────────────────────────┘  │
│              │                           │                  │
│              │ onChange                  │ sync (5min)      │
│              ▼                           ▼                  │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ options-backup.js                                   │    │
│ │ - Detect storage changes                            │    │
│ │ - Apply changes to Automerge doc                    │    │
│ │ - Merge with remote Automerge doc                   │    │
│ │ - Resolve conflicts (automatic via CRDT)            │    │
│ └─────────────────────────────────────────────────────┘    │
│              │                           ▲                  │
│              │ save                      │ load             │
│              ▼                           │                  │
└──────────────┼───────────────────────────┼──────────────────┘
               │                           │
               │    Raindrop Collection    │
               │   "Nenya options backup"  │
               │                           │
               │  ┌────────────────────┐   │
               └─▶│ automerge-options- │◀──┘
                  │ sync (Base64 blob) │
                  └────────────────────┘
                           ▲
                           │ sync (5min)
                           │
┌──────────────────────────┼───────────────────────────────────┐
│ Browser B                │                                   │
│              ┌───────────▼──────────────┐                    │
│              │ Automerge Document B     │                    │
│              │ (in-memory, tracks edits)│                    │
│              └───────────┬──────────────┘                    │
│                          │                                   │
│ ┌────────────────────────▼───────────┐                      │
│ │ chrome.storage (source of truth)   │                      │
│ └────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow - Concurrent Edit Example

**Scenario:** Browser A changes dark mode rules, Browser B changes auto-reload rules, both sync at similar times.

**Timeline:**

```
T0: Both browsers have synced state (lastSync = T0)

T1: Browser A edits darkModeRules
    - Local: Apply change to Automerge.change(docA, d => d.darkModeRules = [...])
    - Stored in memory

T2: Browser B edits autoReloadRules
    - Local: Apply change to Automerge.change(docB, d => d.autoReloadRules = [...])
    - Stored in memory

T3: Browser A syncs (5min alarm)
    - Fetch remote doc (state at T0)
    - Merge: mergedA = Automerge.merge(docA, remoteT0)
    - Result: mergedA has darkModeRules change
    - Save mergedA to Raindrop

T4: Browser B syncs (5min alarm)
    - Fetch remote doc (mergedA from T3)
    - Merge: mergedB = Automerge.merge(docB, mergedA)
    - Result: mergedB has BOTH darkModeRules AND autoReloadRules changes
    - Save mergedB to Raindrop
    - Apply to chrome.storage (darkModeRules now appears from Browser A)

T5: Browser A syncs again
    - Fetch remote doc (mergedB from T4)
    - Merge: finalA = Automerge.merge(docA, mergedB)
    - Result: finalA has BOTH changes
    - Apply to chrome.storage (autoReloadRules now appears from Browser B)

Outcome: No data loss, all changes preserved!
```

### Code Structure Changes

**New file:** `src/background/automerge-options-sync.js`

- `initializeAutomergeSync()` - Load actor ID, initialize document
- `getLocalAutomergeDoc()` - Get current in-memory document
- `applyStorageChangesToDoc(changes)` - Record chrome.storage changes in Automerge
- `syncWithRemote()` - Fetch, merge, save, apply
- `saveDocToRaindrop(doc)` - Serialize and upload
- `loadDocFromRaindrop()` - Download and deserialize
- `migrateFromOldFormat()` - One-time migration
- `applyDocToStorage(doc)` - Write Automerge state to chrome.storage

**Modified file:** `src/background/options-backup.js`

- Replace `performBackup()` calls with `syncWithRemote()`
- Replace `performRestore()` calls with `syncWithRemote()`
- Keep existing category helpers for validation
- Keep existing UI message handlers

**Modified file:** `src/background/index.js`

- Import automerge library (via importScripts in service worker)
- Initialize automerge-options-sync module

## Data Model

### Automerge Document Schema

```javascript
{
  // Top-level keys match chrome.storage keys
  mirrorRootFolderSettings: {
    rootFolderName: "My Bookmarks",
    parentFolderPath: "/",
    parentFolderId: "123"
  },
  notificationPreferences: { /* ... */ },
  autoReloadRules: [
    { id: "abc", pattern: "*.example.com", intervalSeconds: 60, disabled: false }
  ],
  darkModeRules: [ /* ... */ ],
  brightModeWhitelist: [ /* ... */ ],
  highlightTextRules: [ /* ... */ ],
  blockElementRules: [ /* ... */ ],
  customCodeRules: [ /* ... */ ],
  llmPrompts: [ /* ... */ ],
  urlProcessRules: [ /* ... */ ],
  autoGoogleLoginRules: [ /* ... */ ],
  pinnedShortcuts: [ /* ... */ ],

  // Metadata
  _meta: {
    version: 2, // Automerge format version
    devices: {
      "nenya-chrome-linux-a1b2c3d4": { lastSeen: 1700000000000 }
    }
  }
}
```

### Raindrop Item Format

**Single item (Base64 string ≤ 10,000 characters):**

```javascript
{
  _id: "raindrop-item-id",
  title: "automerge-options-sync",
  description: "AAEAAQAAAAE...", // Base64-encoded Automerge binary (full document, ≤10,000 chars)
  collectionId: <id-of-nenya-options-backup-collection>,
  tags: ["nenya", "automerge", "version:2"],
  created: "2025-01-01T00:00:00.000Z",
  lastUpdate: "2025-01-01T12:00:00.000Z"
}
```

**Chunked items (Base64 string > 10,000 characters):**

```javascript
// Chunk 1
{
  _id: "raindrop-item-id-1",
  title: "automerge-options-sync-chunk-1",
  description: "AAEAAQAAAAE...", // First 10,000 characters of Base64 string
  collectionId: <id>,
  tags: ["nenya", "automerge", "version:2", "chunked", "total-chunks:3"],
  created: "2025-01-01T00:00:00.000Z",
  lastUpdate: "2025-01-01T12:00:00.000Z"
}
// Chunk 2
{
  _id: "raindrop-item-id-2",
  title: "automerge-options-sync-chunk-2",
  description: "AAAA...", // Next 10,000 characters
  tags: ["nenya", "automerge", "version:2", "chunked", "total-chunks:3"],
  // ... same metadata
}
// Chunk 3 (final)
{
  _id: "raindrop-item-id-3",
  title: "automerge-options-sync-chunk-3",
  description: "ZZZZ...", // Remaining characters (≤10,000)
  tags: ["nenya", "automerge", "version:2", "chunked", "total-chunks:3"],
  // ... same metadata
}
```

**Reading logic:**

1. Search for items with title matching `automerge-options-sync*`
2. If single item found → decode directly
3. If multiple chunks found → sort by chunk number, concatenate descriptions, then decode
4. All chunks must have matching `total-chunks` tag for integrity check

## Risks / Trade-offs

### Risk 1: Automerge bundle size (~50KB minified)

**Impact:** Increases extension size by ~50KB.

**Mitigation:**

- Acceptable trade-off for conflict-free sync
- Automerge IIFE bundle is already optimized
- Still smaller than many other libraries in the extension

### Risk 2: Automerge learning curve

**Impact:** Team needs to understand CRDT concepts.

**Mitigation:**

- Automerge API is simple for basic usage (`change`, `merge`, `load`, `save`)
- This design doc captures architectural decisions
- Code will be well-commented with examples

### Risk 3: Raindrop 10,000 character limit for item descriptions

**Impact:** Raindrop API enforces a hard limit of 10,000 characters per item description. Documents exceeding this will be truncated, causing data loss.

**Mitigation:**

- **Mandatory automatic chunking** for any document > 10,000 characters (not optional)
- Base64 encoding adds ~33% overhead to binary size (unavoidable for text storage)
- Expected size: 5-15KB Base64 for typical configs (fits comfortably in single item)
- Heavy users with extensive custom code will auto-chunk transparently (2-5 chunks typical)
- Chunk integrity validation ensures all chunks are present before deserializing
- Test coverage for chunking scenarios to ensure correctness

### Risk 4: Migration complexity

**Impact:** Users upgrading from old format need seamless transition.

**Mitigation:**

- Automatic detection and migration on first sync
- Non-destructive (keeps old backup)
- Falls back to current chrome.storage state (most reliable)
- Clear error messages if migration fails

### Risk 5: Debugging Automerge state

**Impact:** Binary format is harder to inspect than JSON.

**Mitigation:**

- Add debug utility: `exportAutomergeAsJSON()` for inspection
- Log merge operations with change counts
- Keep device metadata in document for troubleshooting

## Migration Plan

### Phase 1: Implementation (v2.0.0)

1. Implement automerge-options-sync.js module
2. Add Automerge library loading in service worker
3. Update options-backup.js to use new sync mechanism
4. Add migration logic for old format
5. Update manifest.json to declare Automerge IIFE as resource
6. Test with multiple browser instances

### Phase 2: Rollout

1. Release as minor version update (automatic via Chrome Web Store)
2. First sync after update triggers migration
3. Monitor error logs for migration issues
4. Users can continue using old browsers during transition (old JSON backup still exists)

### Phase 3: Cleanup (v2.1.0+)

1. After 3-6 months, add UI option to delete old "Options backup" collection
2. Eventually remove old JSON backup code (keep for backward compatibility initially)

### Rollback Plan

If critical issues arise:

1. Revert to previous version via Chrome Web Store
2. Old JSON backups still exist in "Options backup" collection
3. Users can manually restore from old collection
4. Fix issues and re-release

## Open Questions

1. **Q:** Should we compress the Base64-encoded Automerge binary further?
   **A:** Not initially. Measure actual sizes first. If >100KB, consider gzip compression.

2. **Q:** How to handle schema changes (e.g., adding new option categories)?
   **A:** Automerge handles schema evolution naturally. New keys just appear. Use Automerge version field for breaking changes.

3. **Q:** Should we expose Automerge history for debugging?
   **A:** Not in v2.0.0. Future enhancement could add "View Sync History" in options UI.

4. **Q:** What if a browser is offline for weeks and then syncs?
   **A:** Automerge will merge all changes. No time limit on merge capability. This is a CRDT advantage.

5. **Q:** Should manual backup/restore buttons still exist?
   **A:** Yes, keep them. Manual backup triggers immediate sync. Manual restore forces pull from remote without pushing local changes first (useful for recovery).
