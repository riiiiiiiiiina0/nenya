## ADDED Requirements

### Requirement: Encrypt & Save entrypoints

The extension SHALL expose a single encrypt-and-save flow for the active tab or a right-click target via the popup pinned shortcut, the `bookmarks-save-to-unsorted-encrypted` command, and a context menu item covering page and link contexts.

#### Scenario: Trigger encrypt save from popup shortcut or command

- **GIVEN** the user clicks the pinned "Encrypt & save" shortcut in the popup or presses the `bookmarks-save-to-unsorted-encrypted` keyboard command,
- **THEN** the extension SHALL target only the active tab in the current window,
- **AND** it SHALL convert split-page URLs to `https://nenya.local/split`, normalize to `http`/`https`, and apply `save-to-raindrop` URL processing before continuing.

#### Scenario: Trigger encrypt save from context menu

- **GIVEN** the user selects "Encrypt & Save to Raindrop Unsorted" from the context menu on a page or link,
- **THEN** the extension SHALL choose the link URL when present (otherwise the page URL),
- **AND** it SHALL run the same split conversion, normalization, and `save-to-raindrop` URL processing steps before continuing.

### Requirement: Encrypt & Save behavior and persistence

The encrypt-and-save flow SHALL prompt for a password, branch on user input, and persist the result through the Unsorted save pipeline.

#### Scenario: Password provided encrypts and saves

- **GIVEN** the encrypt-and-save flow runs,
- **WHEN** the user enters a non-empty password,
- **THEN** it SHALL POST `{url, password}` to `https://oh-auth.vercel.app/secret/encrypt`,
- **AND** on success it SHALL save the returned decrypt URL to Raindrop Unsorted through `saveUrlsToUnsorted` with `pleaseParse` disabled and URL processing skipped,
- **AND** it SHALL attach a generated 2–3 word friendly title that excludes the password and raw URL.

#### Scenario: Password blank or cancelled falls back to plain save

- **GIVEN** the encrypt-and-save flow runs,
- **WHEN** the user cancels the prompt or submits an empty password,
- **THEN** it SHALL reuse the processed target URL and call the existing Unsorted save pipeline,
- **AND** it SHALL use the selection text when present (otherwise the tab title) as the saved title.

#### Scenario: Encryption failure does not save

- **GIVEN** the encrypt-and-save flow runs,
- **WHEN** the encryption request fails or returns no decrypt URL,
- **THEN** it SHALL surface a user-visible error (notification for background triggers or popup status),
- **AND** it SHALL NOT attempt to save to Raindrop Unsorted.
