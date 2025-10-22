# Mirror Raindrop Collections and Items to Browser Bookmarks

## Design

- Mirror data one way from Raindrop to the browser bookmarks. Fetch data on extension startup and on a scheduled interval.
- Allow users to save the current page (or selected pages) to the Raindrop `Unsorted` collection from the popup or context menu.
- Allow users to capture tab groups and tabs as a `project`. Each project is a Raindrop collection, and each item represents a tab with tab group and index metadata stored in the description.

## Mapping

- Use a dedicated browser bookmark folder as the mirror root. The user selects the folder name and location on the options page; the default is `Raindrop` under `/Bookmarks Bar`.
- Raindrop groups map to subfolders under the root `Raindrop` folder.
- Root-level Raindrop collections map to subfolders inside their corresponding group folders.
- Child or nested Raindrop collections map to nested subfolders within their parent collection folders.
- Raindrop items map to bookmarks placed in the matching folder.

## Pull Logic

### Groups and collections

1. Ensure the root `Raindrop` bookmark folder exists.
2. Fetch all Raindrop groups.
3. Fetch all root collections.
4. Fetch child collections.
5. Build a tree representing the Raindrop hierarchy and compare it with the mirror folder tree.
6. Create bookmark folders for any groups or collections missing locally.
7. Remove bookmark folders (and their contents) that no longer exist in Raindrop.
8. Ensure an `Unsorted` folder exists under the mirror root.

### Deleted items

1. Store the timestamp of the oldest deleted Raindrop item in `chrome.storage.local` as `OLDEST_DELETED_RAINDROP_ITEM`, initializing it to `0` if necessary.
2. Fetch deleted Raindrop items (collection id `-99`, sorted by `-lastUpdate`) until an item’s `lastUpdate` predates `OLDEST_DELETED_RAINDROP_ITEM`, or there are no more items to fetch.
3. Remove bookmarks within the mirror folder that share URLs with these deleted items.
4. Update `OLDEST_DELETED_RAINDROP_ITEM` with the most recent `lastUpdate` value processed.

### New or updated items

1. Store the timestamp of the oldest Raindrop item in `chrome.storage.local` as `OLDEST_RAINDROP_ITEM`, initializing it to `0` if necessary.
2. Fetch Raindrop items (collection id `0`, sorted by `-lastUpdate`) until an item’s `lastUpdate` predates `OLDEST_RAINDROP_ITEM`, or there are no more items to fetch.
3. Locate the corresponding bookmark in the mirror folder by URL.
4. If no bookmark exists, create one in the appropriate folder.
5. If a bookmark already exists in the appropriate folder with the correct title and location, leave it unchanged.
6. Otherwise, update the bookmark title or move it to the correct folder.

## Save to Unsorted

- Call the Raindrop API to save URL(s) to the Unsorted collection (collection id `-1`) with `pleaseParse = {}`.
- Create the corresponding bookmark entry under `Raindrop/Unsorted`.
- When triggered from popup page, save urls of higlighted tabs or current active tabs.
- When triggered from context menu over a page, save the page's url.
- When triggered from context menu over a link, save the link's url.

## Saved Projects

### Save tabs as a project

1. Collect all highlighted tabs, or fall back to the active tab in the current window.
2. Prompt the user for a project name, defaulting to the first tab’s group name or title.
3. Ensure the `Saved projects` group exists in Raindrop.
4. Create a new collection under that group using the chosen project name.
5. Create one Raindrop item per tab, storing the following JSON in each item description:
   ```
   {
     "group": { "name": string, "color": string, "index": number }?,
     "tab": { "index": number, "pinned": boolean }
   }
   ```
   The tab index is the tab’s position within its tab group, or within its window when no group exists.

### Add tabs to a project

1. Let the user pick an existing project from the popup list (from popup page projects list 🔼 button).
2. Collect highlighted tabs, or fall back to the active tab.
3. Fetch the project’s current Raindrop items.
4. If all existing items belong to the same tab group `G` and the new tabs are ungrouped, assign the group metadata `G` to the new entries.
5. Create new Raindrop items for the selected tabs within the project collection, this new item should have biggest sorting index in metadata.

### Replace items in a project

1. Let the user pick an existing project from the popup (from popup page projects list ⏫ button).
2. Collect highlighted tabs, or fall back to the active tab.
3. Delete all items currently stored in the project collection.
4. Recreate the project by reusing the steps in “Save tabs as a project”.

### Replace items in a project with tabs in current window

Save as "Replace items in a project", but instead of highlight tabs or active tab, we use all tabs from current window.

### Open a saved project

TODO
