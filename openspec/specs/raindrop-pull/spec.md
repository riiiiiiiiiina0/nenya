## Raindrop Pull Specification

### Requirement: Users MUST be able to trigger a Raindrop pull on demand
Once authenticated, users can initiate a mirror sync from multiple entry points.

#### Scenario: Manual pull from popup shortcut or keyboard command
- **GIVEN** the user is logged into a bookmark provider,
- **WHEN** they click the popup shortcut or press the `bookmarks-pull-raindrop` command,
- **THEN** the background script MUST invoke `runMirrorPull('manual')`,
- **AND** an action badge animation MUST indicate progress until the pull resolves with ✅ on success or ❌ on failure,
- **AND** the popup MUST present the returned stats string (bookmarks/folders created, updated, moved, deleted).

#### Scenario: Pull now button in options
- **GIVEN** the user is on the options page, logged in, and presses “Pull now,”
- **THEN** the page MUST send `{ type: 'mirror:pull' }` to the background,
- **AND** show a toast summarizing whether the sync created, updated, moved, or deleted any bookmarks/folders.

#### Scenario: Prevent concurrent pulls
- **GIVEN** a pull is already running,
- **WHEN** another manual, reset, command, or alarm-triggered pull starts,
- **THEN** the background MUST reject it with `ok: false` and `error: 'Sync already in progress.'`.

### Requirement: Raindrop data MUST mirror into a configurable root folder
Every pull replicates the remote collection hierarchy (including Unsorted) under a user-selected root bookmark folder.

#### Scenario: Initial mirroring
- **GIVEN** a logged-in user runs a pull for the first time,
- **THEN** the system MUST ensure the configured parent folder exists (default Bookmarks Bar) and create the root folder using the stored or default name,
- **AND** fetch `/user`, `/collections`, and `/collections/childrens` to build the collection tree,
- **AND** create/update/delete folders locally so the structure matches Raindrop,
- **AND** create bookmarks with normalized titles/URLs for every Raindrop item, including Unsorted items placed in a dedicated `Unsorted` subfolder.

#### Scenario: Synchronize additions, updates, moves, and deletions
- **GIVEN** the user has mirrored once,
- **WHEN** later pulls detect new, updated, moved, or deleted collections/items in Raindrop,
- **THEN** the mirror MUST create/move/delete bookmark folders and update/move/delete bookmarks to match the API responses, tracking counts in `MirrorStats`.

#### Scenario: Mirror the Unsorted collection
- **GIVEN** the remote Unsorted collection contains items,
- **THEN** every pull MUST ensure an `Unsorted` folder exists directly under the root folder,
- **AND** every Unsorted item MUST become a bookmark within that folder, deduplicated by normalized URL.

### Requirement: Mirror placement MUST follow root-folder settings from the options page
Users can change the parent folder or the root folder name at any time; pulls must honor the latest settings.

#### Scenario: Parent folder changed in options
- **GIVEN** the user selects a different parent folder in options and saves,
- **THEN** the options page MUST move the existing mirror root to the new parent immediately,
- **AND** subsequent pulls MUST continue mirroring inside the moved root folder, preserving all mirrored data.

#### Scenario: Root folder renamed in options
- **GIVEN** the user renames the root folder in options and saves,
- **THEN** the options page MUST rename the existing root folder instantly,
- **AND** pulls MUST keep using the renamed folder so all mirrored content stays within the updated name.

#### Scenario: Invalid parent folder recovered automatically
- **GIVEN** the saved parent folder ID no longer exists,
- **THEN** a pull MUST fall back to the Bookmarks Bar parent, persist that fix, and continue mirroring under the fallback.

### Requirement: Pulls MUST run automatically on a schedule and support reset
The background alarm keeps data fresh, and users can request a clean slate.

#### Scenario: Automatic periodic synchronization
- **GIVEN** the user is logged in,
- **THEN** the background alarm MUST invoke `runMirrorPull('alarm')` every `MIRROR_PULL_INTERVAL_MINUTES` (10 minutes),
- **AND** skip showing notifications when the alarm pull detects zero changes.

#### Scenario: Reset & Re-pull
- **GIVEN** the user clicks “Reset & Re-pull” in options,
- **THEN** the extension MUST remove the existing root mirror folder plus stored timestamps, persist corrected settings when needed, and immediately perform a full pull identical to the first-run scenario.

### Requirement: Users MUST be notified of pull outcomes
Pull completion should respect notification preferences and report meaningful status.

#### Scenario: Success notification
- **GIVEN** notifications are enabled (global + bookmark pull toggle),
- **THEN** a successful manual/reset pull MUST trigger `notifyMirrorPullSuccess` with the stats summary and link the user to the mirrored root folder.

#### Scenario: Failure notification
- **GIVEN** a pull fails due to API errors, auth issues, or other exceptions,
- **THEN** the system MUST trigger `notifyMirrorPullFailure` with the sanitized error message and set the badge to ❌.

#### Scenario: Token validation
- **GIVEN** a pull starts without valid (non-expired) Raindrop tokens,
- **THEN** the system MUST stop immediately, return an error stating that the user must reconnect, and avoid mutating bookmarks.
