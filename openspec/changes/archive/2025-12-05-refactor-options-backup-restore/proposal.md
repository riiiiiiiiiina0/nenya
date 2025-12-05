# Change: Refactor options backup/restore to manual chunked Raindrop flow

## Why
Automerge-driven automatic sync is heavy, surprising, and coupled to `chrome.storage.sync`. We need a simpler, manual-only backup/restore that writes options locally, moves controls to persistent UI, and lets popup users trigger backups without background automation.

## What Changes
- Persist all options data in `chrome.storage.local` and remove Automerge/auto-sync alarms or focus listeners.
- Replace CRDT backups with manual, plain-JSON backups that split into ≤1000-character chunks and use Raindrop batch get/set to overwrite remote or local in a single call.
- Move backup/restore plus import/export controls into a floating bar on the options page and add backup/restore buttons to the popup.
- Keep the existing options payload coverage while eliminating Automerge metadata and merge semantics.

## Impact
- Affected specs: options-restore-backup
- Affected code: `src/background/options-backup.js`, `src/options/*` (backup, import/export, layout), `src/popup/{index.html,popup.js}`, Raindrop helpers

