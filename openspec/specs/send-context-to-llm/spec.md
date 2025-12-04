## Send Context to LLM Specification

### Requirement: The chat popup SHALL surface eligible context tabs and provider choices

`src/popup/chat.js` renders `chat.html` and is responsible for discovering the tabs to send plus whichever LLM provider is active.

#### Scenario: Determine target tabs and visualize eligibility
- **GIVEN** the chat page loads or the user returns focus to the popup,
- **THEN** `updateTabsInfoDisplay()` MUST query the current window for highlighted tabs, fall back to the active tab when none are highlighted, filter to `http://` or `https://` URLs only, and cache those tabs in `targetTabs`,
- **AND** the toolbar MUST show up to five favicons plus display `N tabs` when the list is non-empty or the warning label `No http:// tabs` when no eligible tabs exist so `handleSend()` and `handleDownload()` can block early.

#### Scenario: Provide inline selectors for saved prompts and LLM providers
- **GIVEN** the operator types inside `#promptTextarea`,
- **WHEN** the latest `/` token has no trailing space, **THEN** the popup MUST call `loadLLMPrompts()` (from `src/options/llmPrompts.js`), filter and sort matches by name/content, and show the dropdown so clicking (or pressing Enter on) an item replaces the `/` token with the saved prompt text and stores its `id` in `currentSelectedPromptId`,
- **AND WHEN** the latest `@` token has no trailing space, **THEN** the provider dropdown MUST list the alphabetized `LLM_PROVIDERS`, mark the currently selected provider, and let the user toggle one provider via click or keyboard navigation, removing the `@` trigger text and persisting the single-selection set to `chrome.storage.local.chatLLMSelectedProviders`,
- **AND** the popup MUST also allow opening the provider picker via the “Select provider” button and support Cmd/Ctrl+Enter to call `handleSend()` without leaving the textarea focus.

### Requirement: The chat popup SHALL manage provider tabs for the current session

#### Scenario: Auto-open provider tabs next to the source tab
- **GIVEN** `initChatPage()` completes `getChatPageTabId()` and `loadSelectedProviders()`,
- **WHEN** at least one provider is selected and a `sessionId` exists, **THEN** the popup MUST send `open-llm-tabs` to the background including the chat page tab id and current tab index so `openLLMTabs()` in `src/background/index.js` can create any missing provider tabs immediately to the right of the current browser tab and map `{session → provider → tabId}` inside `sessionToLLMTabs`.

#### Scenario: Switch, reuse, or clean up provider tabs
- **GIVEN** provider tabs were opened for a session,
- **WHEN** the operator chooses another provider before sending, **THEN** `toggleProvider()` MUST call `switch-llm-provider` so `switchLLMProvider()` reloads the existing tab with the new provider URL and updates the session map,
- **AND WHEN** the back button, popup closure, or chat tab removal occurs before any send, **THEN** `closeLLMTabs()` or the background’s `chrome.runtime.onConnect/onRemoved` handlers MUST close each tracked provider tab and clear `sessionToLLMTabs`/`tabIdToSessionId`,
- **BUT** if `reuseLLMTabs()` marks `sessionsWithSentContent`, the cleanup logic MUST leave those tabs open for the user after the popup closes.

### Requirement: Sending or downloading context SHALL validate prerequisites before contacting the background

#### Scenario: Send workflow validates state and dispatches `collect-and-send-to-llm`
- **GIVEN** the operator clicks “Send” (or presses Cmd/Ctrl+Enter),
- **THEN** `handleSend()` MUST ensure at least one provider is selected and at least one eligible tab exists, disable the button while the request is in-flight, and call `chrome.runtime.sendMessage('collect-and-send-to-llm')` with `{ tabIds, llmProviders, promptContent, sessionId, useReuseTabs }`,
- **AND** the popup MUST re-enable the button after the promise settles and surface `alert()` errors coming from the response.

#### Scenario: Download workflow returns a markdown bundle
- **GIVEN** the operator clicks the download button,
- **WHEN** tabs are eligible, **THEN** `handleDownload()` MUST request `collect-page-content-as-markdown`, prepend the current prompt as `# Prompt`, append one `## Page N` section per collected tab (with `**URL:**` metadata and the captured body markdown), and trigger a file download named `page-content-<timestamp>.md`.

### Requirement: The background page SHALL assemble sanitized context packages

#### Scenario: Collect page content before injecting into LLM tabs
- **GIVEN** a `collect-and-send-to-llm` message arrives,
- **THEN** the background MUST derive at least one tab id (falling back to highlighted or active tabs), reject the call when none are found or `llmProviders` is empty, sequentially run `collectPageContentFromTabs()` so each tab loads the correct extractor (`getContent-youtube.js`, `getContent-notion.js`, or the general Readability/Turndown pipeline plus `pageContentCollector.js`), and store the resulting `{ title, url, content }` list as `collectedContents`,
- **AND** when a single active tab is being sent, it MUST attempt to capture a JPEG screenshot via `chrome.tabs.captureVisibleTab()` and unshift that blob metadata into `selectedLocalFiles`,
- **AND** once the content is ready it MUST either call `reuseLLMTabs(sessionId, llmProviders, collectedContents)` (marking `sessionsWithSentContent`) or fall back to `openOrReuseLLMTabs()` to open new tabs when reuse is impossible, returning `{ success: true }` only after every provider injection has been triggered.

#### Scenario: Serve markdown payloads for downloads
- **GIVEN** a `collect-page-content-as-markdown` request,
- **THEN** the background MUST run the same `collectPageContentFromTabs()` pipeline and respond with `{ success: true, contents }` so the popup can compose the `.md` file without duplicating extraction logic.

### Requirement: The LLM page injector SHALL attach files and prompts, then optionally auto-send

`src/contentScript/llmPageInjector.js` runs inside each provider tab opened by the background.

#### Scenario: Deliver attachments and prompt text to provider editors
- **GIVEN** the injector receives `inject-llm-data`,
- **THEN** it MUST wait for a `[contenteditable="true"]` editor, paste any screenshots or uploads from `files` using `ClipboardEvent('paste')`, convert every collected tab into a markdown file whose body contains `<selectedText>` (when present) plus `<content>` sections, dispatch those as file paste events in order, and after a short delay normalize whitespace in `promptContent`, insert it via its cascade of injection strategies (execCommand → Selection API → textContent → framework events), and finally click the provider-specific `sendButtonSelector` when supplied.

### Requirement: The options page SHALL allow managing saved prompts in sync storage

`src/options/llmPrompts.js` renders the Options → LLM Prompts section backed by `chrome.storage.sync.llmPrompts`.

#### Scenario: Create or edit a named prompt with timestamps
- **GIVEN** the operator submits `#llmPromptForm`,
- **THEN** the handler MUST require non-empty `name` and `prompt` values, load the current prompts list via `loadLLMPrompts()`, either overwrite the entry matching `currentlyEditingPromptId` (touching `updatedAt`) or push a new object `{ id: generatePromptId(), name, prompt, createdAt, updatedAt }`, persist the sorted array through `savePrompts()`, emit a toast notification, and leave the newly saved prompt selected in both the options UI and the chat popup search.

#### Scenario: Select, delete, or react to storage updates
- **GIVEN** prompts exist,
- **THEN** clicking a prompt in the list MUST highlight it, populate the detail pane, and reveal created/updated timestamps formatted by `Intl.DateTimeFormat`,
- **AND** pressing “Delete” MUST confirm via `window.confirm`, remove the entry, hide the details view when nothing remains selected, and toast success,
- **AND** the module MUST listen to `chrome.storage.onChanged` for `llmPrompts` updates in the `sync` area so any external import/export immediately rerenders the list, clears editing state when a prompt disappears, and refreshes the detail pane when the selected prompt changes elsewhere.

### Requirement: Saved prompts SHALL participate in the options backup & restore system

`src/background/options-backup.js` integrates prompts with the global import/export flows.

#### Scenario: Normalize prompt payloads during backup and restore
- **GIVEN** `collectLLMPrompts()` runs as part of backup,
- **THEN** it MUST call `normalizeLLMPrompts()` to drop invalid entries, trim whitespace, auto-generate IDs when missing, and sort by `name`; if normalization changed the array it MUST store the sanitized version back into sync storage before returning it for the payload,
- **AND WHEN** `applyLLMPrompts()` receives prompts from a restore, **THEN** it MUST run the same normalization and write the sanitized list into `chrome.storage.sync.llmPrompts` (suppressing recursive backups) so the popup and options UI immediately see consistent data via their storage listeners.

