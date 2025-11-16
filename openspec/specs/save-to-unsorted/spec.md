## Save to Unsorted Specification

### Requirement: Users MUST be able to trigger Save to Unsorted from common surfaces
The extension MUST expose a single Save to Unsorted behavior through the popup, pinned shortcut buttons, and the `bookmarks-save-to-unsorted` keyboard command.

#### Scenario: Save highlighted or active tabs from popup or shortcut
- **GIVEN** the user opens the popup (or activates the pinned Save shortcut / keyboard command),
- **AND** they have highlighted tabs in the current window,
- **THEN** the extension MUST collect the highlighted tabs (or fall back to the active tab when none are highlighted),
- **AND** convert split page URLs (e.g., `chrome-extension://.../split.html?...`) to the canonical `https://nenya.local/split` form before normalization,
- **AND** ignore tabs without a normalizable `http`/`https` URL,
- **AND** deduplicate entries by normalized URL before calling the background `mirror:saveToUnsorted` action,
- **AND** disable the initiating button until the request resolves.

#### Scenario: No valid tabs to save from popup or shortcut
- **GIVEN** the Save to Unsorted action is triggered,
- **WHEN** no highlighted or active tab produces a valid `http`/`https` URL after processing,
- **THEN** the popup MUST report that there are no valid tabs to save (`concludeStatus` with info tone) without sending a background request.

### Requirement: Context menus MUST allow saving individual pages or links
Right-click context menus MUST invoke the same Save to Unsorted pipeline for both current pages and explicit links.

#### Scenario: Save current page from context menu
- **GIVEN** the user right-clicks a page and chooses 'Save to Raindrop Unsorted',
- **THEN** the extension MUST capture the page URL, convert split page URLs to `https://nenya.local/split`, normalize it, apply URL processing rules for the `save-to-raindrop` context, and send it to `saveUrlsToUnsorted` with the active tab's title.

#### Scenario: Save link from context menu
- **GIVEN** the user right-clicks a link and selects 'Save link to Raindrop Unsorted',
- **THEN** the extension MUST process the link URL with the same normalization, split conversion, and URL processing steps,
- **AND** use the selected text (falling back to the tab title) as the entry title before sending it to `saveUrlsToUnsorted`.

### Requirement: Save pipeline MUST normalize URLs, honor processing rules, and mirror Raindrop Unsorted locally
Saving MUST sanitize inputs, apply user-configured URL processors, call the Raindrop API, and keep the local Unsorted bookmark folder synchronized.

#### Scenario: Process entries before calling Raindrop
- **GIVEN** `saveUrlsToUnsorted` receives entries,
- **THEN** it MUST trim each URL, ignore empties, normalize to `http`/`https`, apply the `save-to-raindrop` URL processing rules, convert split URLs to the nenya.local format, and deduplicate exact matches,
- **AND** maintain per-request counts (created, updated, skipped, failed, total) reflecting skipped invalid URLs.

#### Scenario: Authenticate and fail fast when Raindrop is unavailable
- **GIVEN** `saveUrlsToUnsorted` runs,
- **WHEN** no valid Raindrop tokens exist or they are expired,
- **THEN** it MUST reject the save (returning `ok: false` with an explanatory error) and avoid calling the Raindrop API.

#### Scenario: Mirror saved Raindrops under the Unsorted bookmark folder
- **GIVEN** there are sanitized entries,
- **THEN** the extension MUST ensure the configured Raindrop root folder and its `Unsorted` child exist in the browser bookmarks,
- **AND** for each entry it MUST call `POST /raindrop` with `collectionId: -1`,
- **AND** if the processed URL already exists in the local Unsorted folder it MUST update the bookmark title when the Raindrop response title changes and count it as `updated` (otherwise count as `skipped`),
- **AND** if the URL is new it MUST create a bookmark beneath the Unsorted folder and count it as `created`,
- **AND** failures MUST increment `failed` and include `url: error` entries in the response `errors` array.

#### Scenario: Return save summary to popup callers
- **GIVEN** the popup invoked `mirror:saveToUnsorted`,
- **WHEN** a response arrives,
- **THEN** it MUST include the summary counts (`created`, `updated`, `skipped`, `failed`, `ok`, `error`) so the popup can echo the result in its status message.

### Requirement: Save outcomes MUST notify the user according to notification preferences
Users MUST get clear feedback (or suppression) that respects the Notifications settings in `src/options/notifications.js`.

#### Scenario: Success notification
- **GIVEN** a save succeeded and bookmark notifications / Unsorted notifications are enabled,
- **THEN** the background MUST raise an `'unsorted-success'` notification via `pushNotification`,
- **AND** the body MUST mention how many URLs were saved and summarize duplicate skips, linking to `https://app.raindrop.io/my/-1`.

#### Scenario: Failure notification
- **GIVEN** a save failed to persist at least one URL and bookmark notifications for Unsorted saves are enabled,
- **THEN** the background MUST raise an `'unsorted-failure'` notification with the sanitized error message.

#### Scenario: Respect disabled notifications
- **GIVEN** any of global notifications, bookmark notifications, or the specific Unsorted notification toggle is disabled,
- **WHEN** a save completes,
- **THEN** no notification MUST be shown even though the save summary is still returned to popup callers.
