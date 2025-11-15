## Raindrop Pull Specification

### Requirement: Mirror Raindrop.io Data to Local Bookmarks
The system MUST provide a mechanism to mirror a user's Raindrop.io collections and bookmarks to the browser's local bookmark structure. This process, referred to as a "pull" or "sync," ensures that the user's Raindrop.io data is accessible and backed up as native browser bookmarks.

#### Scenario: Initial Mirroring of Raindrop.io Data
- **Given** a user has authenticated their Raindrop.io account with the extension,
- **And** they initiate a "pull" or "sync" for the first time,
- **Then** the system MUST create a root bookmark folder (e.g., "Raindrop") in a user-configurable location (defaulting to the Bookmarks Bar).
- **And** the system MUST replicate the user's Raindrop.io collection hierarchy as nested bookmark folders within the root folder.
- **And** the system MUST create bookmarks within the corresponding folders for each item in the user's Raindrop.io collections, preserving the title and URL.

#### Scenario: Synchronizing Changes from Raindrop.io
- **Given** a user has previously mirrored their Raindrop.io data,
- **And** new bookmarks or collections have been added to their Raindrop.io account,
- **When** a periodic or manual sync is triggered,
- **Then** the system MUST add the new collections as bookmark folders and the new items as bookmarks in the corresponding locations.

#### Scenario: Synchronizing Updates from Raindrop.io
- **Given** a user has previously mirrored their Raindrop.io data,
- **And** existing bookmarks or collections have been updated (e.g., renamed) in their Raindrop.io account,
- **When** a periodic or manual sync is triggered,
- **Then** the system MUST update the corresponding bookmark folders and bookmarks to reflect the changes.

#### Scenario: User Changes Parent Bookmark Folder or Root Folder Name
- **Given** a user has previously mirrored their Raindrop.io data,
- **When** the user changes the parent bookmark folder or the root folder name from the options page,
- **Then** the system MUST immediately update the root bookmark folder name or move the root bookmark folder to the new parent folder.
- **And** the system MUST ensure that all mirrored Raindrop.io collections and bookmarks remain within the updated root folder.

#### Scenario: Synchronizing Deletions from Raindrop.io
- **Given** a user has previously mirrored their Raindrop.io data,
- **And** bookmarks or collections have been deleted from their Raindrop.io account,
- **When** a periodic or manual sync is triggered,
- **Then** the system MUST remove the corresponding bookmark folders and bookmarks from the local mirror.

#### Scenario: Handling of Unsorted Raindrop.io Items
- **Given** a user has items in their "Unsorted" Raindrop.io collection,
- **When** a sync is performed,
- **Then** the system MUST create a dedicated "Unsorted" bookmark folder within the root mirror folder.
- **And** the system MUST create bookmarks for all items from the "Unsorted" collection within this "Unsorted" folder.

#### Scenario: Automatic Periodic Synchronization
- **Given** the user has enabled the Raindrop.io integration,
- **Then** the system MUST automatically perform a sync operation at a predefined interval (e.g., every 10 minutes) to keep the local bookmark mirror up-to-date.
- **And** the system MUST provide a visual indicator (e.g., a badge on the extension icon) when a sync is in progress.

#### Scenario: Reset and Re-pull of Raindrop.io Data
- **Given** a user has previously mirrored their Raindrop.io data,
- **And** they initiate a "reset and re-pull" action,
- **Then** the system MUST delete the existing root bookmark folder and all its contents.
- **And** the system MUST then perform a full initial mirroring of all Raindrop.io data as described in the "Initial Mirroring of Raindrop.io Data" scenario.
