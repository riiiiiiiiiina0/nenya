## Context
- Current options backup uses Automerge with `chrome.storage.sync` + `chrome.storage.local`, background alarms, focus listeners, and storage-change hooks to auto-merge via Raindrop chunks.
- The UI confines backup/restore to a card inside the options page; the popup has no backup controls.
- We need a manual-only flow that writes options locally, chunk-saves plain JSON to Raindrop in one batch, and surfaces controls persistently (options floating bar + popup buttons).

## Goals / Non-Goals
- Goals: remove Automerge/automatic sync, store options in `chrome.storage.local`, implement manual backup/restore with ≤1000-character chunks via Raindrop batch get/set, overwrite semantics, and shared UI controls (options floating bar + popup).
- Non-Goals: change Raindrop auth flows, redesign options schemas, or add server-side storage beyond Raindrop items.

## Decisions
- **Data location**: All option categories (root folder settings, notifications, auto reload, dark/bright mode, highlight, video enhancements, block elements, custom code, LLM prompts, URL process rules, auto Google login rules, screenshot settings, pinned shortcuts) persist in `chrome.storage.local`. Reads fall back to existing local values; sync keys are no longer written.
- **Backup format**: Build a single JSON object of option categories, stringify, split into ordered chunks ≤1000 characters, and store via a single Raindrop batch set call (titles/prefix for ordering). Restore uses one batch get to fetch all chunks, reassembles, parses, and overwrites local storage. No Automerge metadata or merge resolution.
- **Triggers**: Remove alarms/focus/storage listeners that auto-sync. Only explicit Backup/Restore actions (options floating bar or popup buttons) call the background backup/restore handlers.
- **UI**: Add a floating bottom-right bar on the options page that stays visible across sections and hosts Backup, Restore, Export, and Import. Add backup/restore buttons to the popup that reuse the same background flow and show toast/status feedback.
- **Error handling**: Treat missing/partial chunk sets or JSON parse failures as errors; do not apply partial restores. Batch failures surface user-facing errors.

## Risks / Trade-offs
- Loss of automatic sync may leave stale remote backups; mitigated by prominent manual controls in options and popup.
- Moving to local storage removes built-in sync; users must rely on manual backup for cross-device transfer.
- Smaller chunk size may increase chunk count; ordering and batch operations must be deterministic to avoid corruption.

## Migration Plan
- Remove Automerge actors/state, alarms, and storage listeners; stop writing option categories to sync.
- Implement chunked batch backup/restore with overwrite semantics and update status responses.
- Wire the floating bar and popup buttons to the new manual flow; ensure import/export reads local.
- Validate with `openspec validate` and manual backup/restore runs in options and popup.

## Open Questions
- Should we migrate any existing sync-stored options into local on first run of the new flow?
- What exact Raindrop collection/title convention should be used for batch chunk items (reuse existing collection vs. new)?

