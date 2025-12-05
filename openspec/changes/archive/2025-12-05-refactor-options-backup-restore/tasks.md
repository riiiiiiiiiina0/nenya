## 1. Implementation
- [ ] 1.1 Audit current options storage and Automerge sync flows to plan the local-storage migration.
- [ ] 1.2 Switch all option categories to `chrome.storage.local` persistence and update helpers/import-export to read/write local-only.
- [ ] 1.3 Replace Automerge/automatic sync with manual chunked Raindrop backup/restore using batch get/set, chunk size ≤1000 characters, overwrite semantics.
- [ ] 1.4 Update UI: add a bottom-right floating bar in options that surfaces Backup, Restore, Export, and Import controls across all sections with status/disable states.
- [ ] 1.5 Add backup/restore controls to the popup that call the same manual background flow and show success/error feedback.
- [ ] 1.6 Remove legacy alarms/listeners/actor state tied to Automerge and clean up backup state bookkeeping.
- [ ] 1.7 QA: run `openspec validate`, exercise manual backup/restore/import/export in options and popup, and document outcomes.

