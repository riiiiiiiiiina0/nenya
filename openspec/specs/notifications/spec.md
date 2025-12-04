## Notifications Specification

`src/options/index.html`, `src/options/notifications.js`, `src/options/bookmarks.js`, `src/background/mirror.js`, `src/background/projects.js`, `src/background/clipboard.js`, `src/background/options-backup.js`, and `src/background/automerge-options-sync.js` collectively implement the notifications options capability: users pick which alerts the extension may show, the settings persist across devices, and every background workflow honors the stored preferences.

### Requirement: The options UI SHALL load, normalize, and persist notification preferences

#### Scenario: Initialize controls from chrome.storage.sync
- **WHEN** `initializeNotificationControls()` runs on the Notifications section and all toggle elements exist,
- **THEN** it MUST call `chrome.storage.sync.get('notificationPreferences')`, run `normalizePreferences()` to coerce every Boolean and backfill missing values with `DEFAULT_NOTIFICATION_PREFERENCES` (global enabled + every bookmark/project/clipboard leaf set to `true`),
- **AND** it MUST clone the result into the module-level `preferences` object, call `applyPreferencesToUI()` to set every toggle’s `checked` state, and immediately invoke `updateToggleDisabledState()` so child toggles are disabled and tagged with `aria-disabled="true"` whenever their parent (global or category) is off.

#### Scenario: Persist toggle changes to sync storage
- **WHEN** the user flips any notification toggle in `src/options/index.html`,
- **THEN** the corresponding event listener in `src/options/notifications.js` MUST mutate the matching `preferences` flag, call the relevant handler (for global/bookmark/project/clipboard masters) so cascading disabled states stay accurate, and await `savePreferences()` so the complete `NotificationPreferences` shape is written back to `chrome.storage.sync.notificationPreferences`.

#### Scenario: Reflect imported or remote preference updates
- **WHEN** `chrome.storage.onChanged` fires for the `notificationPreferences` key in the `sync` area (because Automerge, backup import, or another device wrote new values),
- **THEN** both the shared storage-change listener and `subscribeToStorageChanges()` MUST call `normalizePreferences(detail.newValue)`, update the module’s `preferences`, and rerun `applyPreferencesToUI()` so the options UI mirrors the latest remote state without needing a reload.

### Requirement: Notification toggles SHALL enforce cascading enablement in the UI

#### Scenario: Global toggle governs every category
- **WHEN** `handleGlobalToggleChange()` receives `false`,
- **THEN** it MUST set `preferences.enabled = false`, call `updateToggleDisabledState()` so every category and leaf toggle becomes disabled (both via the `disabled` attribute and `aria-disabled`), and persist the change; re-enabling MUST re-enable categories but leave each child checkbox’s `checked` value untouched so prior choices survive round-trips.

#### Scenario: Category toggles gate their nested preferences
- **WHEN** `handleBookmarkToggleChange(false)` (or the analogous project/clipboard handlers) runs,
- **THEN** `updateToggleDisabledState()` MUST disable the nested checkboxes inside that category’s group container, prevent direct interaction until the parent is re-enabled, and `savePreferences()` MUST persist both the parent flag and untouched child values so downstream consumers know the category is globally off even if individual leaves remain `true`.

### Requirement: Bookmark and project notification controls SHALL only appear when Raindrop auth is active

#### Scenario: Hide bookmark/project controls when logged out
- **GIVEN** `renderProviderState()` in `src/options/bookmarks.js` determines there is no selected provider or stored OAuth tokens,
- **WHEN** it calls `updateNotificationSectionsVisibility(false)`,
- **THEN** the bookmark and project management `<section>` elements MUST set `hidden = true`, keeping clipboard controls visible so unauthenticated users are not shown Raindrop-specific toggles that cannot take effect.

#### Scenario: Reveal controls after successful login
- **GIVEN** the user connects a provider and tokens are present,
- **WHEN** `renderProviderState()` invokes `updateNotificationSectionsVisibility(true)`,
- **THEN** the bookmark and project sections MUST clear their `hidden` attribute, allowing the navigation manager to expose them and enabling users to adjust preferences that correspond to authenticated Raindrop sync activity.

### Requirement: Background workflows SHALL honor stored notification preferences

#### Scenario: Bookmark workflows respect global and bookmark flags
- **WHEN** `notifyUnsortedSaveOutcome()` or `notifyMirrorPullSuccess()/notifyMirrorPullFailure()` in `src/background/mirror.js` considers emitting a notification,
- **THEN** each function MUST await `getNotificationPreferences()`, exit early unless `preferences.enabled`, `preferences.bookmark.enabled`, and the relevant leaf flag (`unsortedSaved` or `pullFinished`) are all true, and only then call `pushNotification()` so bookmark alerts appear exclusively when the user opted in.

#### Scenario: Project workflows respect per-action toggles
- **WHEN** `projects.js` finishes handling a `projects:saveProject`, `projects:addTabsToProject`, `projects:replaceProjectItems`, or `projects:deleteProject` request,
- **THEN** the corresponding `show*Notification()` helper MUST check `preferences.enabled`, `preferences.project.enabled`, and the action-specific flag (`saveProject`, `addTabs`, `replaceItems`, or `deleteProject`) before summarizing the result and calling `pushNotification()`; disabling any one of those flags SHALL suppress both success and failure notifications for that action.

#### Scenario: Clipboard workflows honor clipboard preferences for successes
- **WHEN** the clipboard background module copies titles/URLs or screenshots via context menus or commands,
- **THEN** it MUST read `getNotificationPreferences()` and only show the success toast if `preferences.enabled`, `preferences.clipboard.enabled`, and `preferences.clipboard.copySuccess` are true, while error notifications (e.g., failed copy or invalid screenshot request) SHALL continue to display regardless so the user still learns about failures.

### Requirement: Notification preferences SHALL remain portable across devices and backups

#### Scenario: Include preferences in backup/export/import flows
- **WHEN** the Options export, scheduled backup, or Raindrop Automerge writer builds payloads,
- **THEN** `buildNotificationsPayload()` in `options-backup.js` MUST serialize the current `preferences` under the `notification-preferences` kind with metadata, `applyNotificationPreferences()` MUST sanitize incoming payloads via `normalizeNotificationPreferences()` before writing them to `chrome.storage.sync`, and imports must call `suppressBackup('notification-preferences')` to avoid infinite sync loops.

#### Scenario: Automerge sync replicates notification preferences
- **WHEN** Automerge initializes (`createEmptyAutomergeDoc()`) or observes storage deltas,
- **THEN** it MUST include a top-level `notificationPreferences` map in the CRDT, propagate local changes from `chrome.storage` into the doc, and apply remote Automerge patches back into `chrome.storage.sync.notificationPreferences`, ensuring every browser instance converges on the same set of notification toggles.

