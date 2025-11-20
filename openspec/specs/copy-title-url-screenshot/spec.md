# Copy Title/URL/Screenshot Specification

## Purpose

Enable users to quickly copy tab information (title, URL, or screenshot) to the clipboard in various formats via context menus and keyboard shortcuts, supporting both single and multiple tab selection.

## Requirements

### Requirement: Context Menu Items

The extension MUST provide context menu items for copying tab information in multiple formats.

#### Scenario: Display context menu options

- **GIVEN** the user right-clicks on a page
- **THEN** the following context menu items MUST be displayed:
  - "Copy Title"
  - "Copy Title\\nURL"
  - "Copy Title - URL"
  - "Copy [Title](URL)"
  - "Copy Screenshot"
- **AND** these menu items MUST be available in all contexts: page, frame, selection, editable, link, image, all

#### Scenario: Hide screenshot option for multiple tabs

- **GIVEN** multiple tabs are highlighted/selected
- **WHEN** the user right-clicks on any of the selected tabs
- **THEN** the "Copy Screenshot" menu item MUST be hidden
- **AND** all other copy menu items MUST remain visible

### Requirement: Keyboard Shortcuts

The extension MUST support keyboard shortcuts for clipboard operations as defined in the manifest.

#### Scenario: Execute clipboard operations via keyboard

- **GIVEN** keyboard shortcuts are configured in the manifest
- **WHEN** the user presses a configured clipboard shortcut
- **THEN** the corresponding clipboard operation MUST execute
- **AND** the operation MUST target the currently active tab or highlighted tabs
- **AND** the appropriate badge and notification MUST be displayed

#### Scenario: Available keyboard shortcuts

The following keyboard shortcuts MUST be supported:

- `copy-title` - Copy tab title(s)
- `copy-title-url` - Copy title and URL on separate lines
- `copy-title-dash-url` - Copy title and URL separated by " - "
- `copy-markdown-link` - Copy as markdown link format
- `copy-screenshot` - Copy screenshot of current tab

### Requirement: Copy Title Format

The extension MUST support copying tab titles only.

#### Scenario: Copy single tab title

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title"
- **THEN** the tab's title MUST be copied to the clipboard
- **AND** a success badge MUST be displayed
- **AND** a success notification MUST be shown (if notifications are enabled)

#### Scenario: Copy multiple tab titles

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title"
- **THEN** all selected tab titles MUST be copied to the clipboard
- **AND** each title MUST be on a separate line
- **AND** the success message MUST indicate the number of tabs copied

### Requirement: Copy Title and URL Format

The extension MUST support copying tab title and URL on separate lines.

#### Scenario: Copy single tab title and URL

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title\\nURL"
- **THEN** the tab's title MUST be copied on the first line
- **AND** the tab's URL MUST be copied on the second line
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs title and URL

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title\\nURL"
- **THEN** each tab's information MUST be formatted as title on first line, URL on second line
- **AND** each tab's information MUST be separated by a blank line
- **AND** tabs MUST be ordered by their selection order

### Requirement: Copy Title - URL Format

The extension MUST support copying tab title and URL on a single line separated by " - ".

#### Scenario: Copy single tab in dash format

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title - URL"
- **THEN** the format MUST be: `{title} - {url}`
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs in dash format

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title - URL"
- **THEN** each tab MUST be formatted as `{title} - {url}` on separate lines
- **AND** URLs MUST be processed through the URL processor

### Requirement: Copy Markdown Link Format

The extension MUST support copying tab information as markdown links.

#### Scenario: Copy single tab as markdown link

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy [Title](URL)"
- **THEN** the format MUST be: `[{title}]({url})`
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs as markdown links

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy [Title](URL)"
- **THEN** each tab MUST be formatted as `[{title}]({url})` on separate lines
- **AND** URLs MUST be processed through the URL processor

### Requirement: Copy Screenshot

The extension MUST support copying a screenshot of the current tab to the clipboard.

#### Scenario: Copy screenshot of active tab

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Screenshot"
- **THEN** a screenshot of the visible tab area MUST be captured
- **AND** the screenshot MUST be copied to the clipboard as an image
- **AND** the screenshot MUST be in PNG format with 100% quality
- **AND** a success badge MUST be displayed

#### Scenario: Screenshot not available for multiple tabs

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user attempts to copy a screenshot via keyboard shortcut
- **THEN** an error notification MUST be shown stating "Screenshot only works with single tab"
- **AND** a failure badge MUST be displayed
- **AND** the clipboard MUST NOT be modified

### Requirement: Multi-Tab Support

The extension MUST support clipboard operations on multiple tabs.

#### Scenario: Target highlighted tabs first

- **GIVEN** multiple tabs are highlighted in the current window
- **WHEN** the user triggers any clipboard operation
- **THEN** the operation MUST target all highlighted tabs
- **AND** tabs MUST be processed in their index order

#### Scenario: Fallback to active tab

- **GIVEN** no tabs are highlighted
- **WHEN** the user triggers any clipboard operation
- **THEN** the operation MUST target the current active tab
- **AND** the operation MUST proceed as if a single tab was selected

#### Scenario: Filter invalid URLs

- **GIVEN** multiple tabs are selected including some with non-HTTP URLs
- **WHEN** processing tabs for clipboard operations
- **THEN** only tabs with HTTP or HTTPS URLs MUST be processed
- **AND** other tabs (chrome://, about:, etc.) MUST be filtered out

### Requirement: URL Processing

The extension MUST process URLs before copying them to the clipboard.

#### Scenario: Apply URL processing rules

- **GIVEN** a URL is being copied
- **WHEN** formatting the clipboard content
- **THEN** the URL MUST be processed through `processUrl()` with context `'copy-to-clipboard'`
- **AND** any configured URL processing rules MUST be applied
- **AND** the processed URL MUST be used in the clipboard output

### Requirement: Clipboard API Integration

The extension MUST use the appropriate clipboard APIs for different content types.

#### Scenario: Copy text to clipboard

- **GIVEN** a text-based clipboard operation (title, URL, etc.)
- **WHEN** copying to clipboard
- **THEN** the extension MUST inject a script into the active tab
- **AND** the script MUST use `navigator.clipboard.writeText()`
- **AND** the operation MUST complete before showing feedback

#### Scenario: Copy image to clipboard

- **GIVEN** a screenshot is being copied
- **WHEN** copying to clipboard
- **THEN** the extension MUST capture the visible tab using `chrome.tabs.captureVisibleTab()`
- **AND** the data URL MUST be converted to a Blob
- **AND** the Blob MUST be written using `navigator.clipboard.write()` with ClipboardItem
- **AND** the tab window MUST be focused before clipboard access

### Requirement: Extension Page Handling

The extension MUST handle clipboard operations on extension and system pages where script injection is restricted.

#### Scenario: Copy from extension page

- **GIVEN** the current tab is an extension page (chrome-extension://)
- **WHEN** copying text to clipboard
- **THEN** the extension MUST find another injectable tab in the same window
- **AND** temporarily focus that tab to perform the copy operation
- **AND** restore focus to the original tab after copying

#### Scenario: Copy screenshot from extension page

- **GIVEN** the current tab is an extension page
- **WHEN** copying a screenshot
- **THEN** the extension MUST find another injectable tab for clipboard access
- **AND** if no injectable tab exists, create a temporary tab at google.com
- **AND** use the temporary tab for clipboard access
- **AND** close the temporary tab after copying
- **AND** restore focus to the original tab

#### Scenario: Detect extension and system pages

- **GIVEN** a tab URL needs to be checked
- **WHEN** determining if it's an extension/system page
- **THEN** the following URL prefixes MUST be treated as restricted:
  - `chrome-extension://`
  - `chrome://`
  - `edge://`
  - `about:`
  - `moz-extension://`

### Requirement: Visual Feedback

The extension MUST provide visual feedback for clipboard operations.

#### Scenario: Show success badge

- **GIVEN** a clipboard operation succeeds
- **WHEN** the operation completes
- **THEN** a green clipboard emoji badge (📋) MUST be displayed on the extension icon
- **AND** the badge MUST have a green background (#00FF00)
- **AND** the badge MUST auto-dismiss after 2000ms

#### Scenario: Show failure badge

- **GIVEN** a clipboard operation fails
- **WHEN** the operation completes
- **THEN** a red X emoji badge (❌) MUST be displayed on the extension icon
- **AND** the badge MUST have a white background (#ffffff)
- **AND** the badge MUST auto-dismiss after 2000ms

### Requirement: Notifications

The extension MUST show notifications for clipboard operations based on user preferences.

#### Scenario: Show success notification

- **GIVEN** notifications are enabled for clipboard operations
- **AND** the clipboard operation succeeds
- **WHEN** the operation completes
- **THEN** a notification MUST be shown with:
  - Title: "Nenya"
  - Message: "Copied {N} tab(s) to clipboard" or "Screenshot copied to clipboard"
  - Icon: Extension icon (48x48)
- **AND** the notification MUST respect the user's notification preferences

#### Scenario: Show failure notification

- **GIVEN** a clipboard operation fails
- **WHEN** the operation completes
- **THEN** a notification MUST be shown with:
  - Title: "Nenya"
  - Message: "Failed to copy to clipboard"
  - Icon: Extension icon (48x48)
- **AND** failure notifications MUST always be shown regardless of user preferences

#### Scenario: Check notification preferences

- **GIVEN** a successful clipboard operation
- **WHEN** determining whether to show a notification
- **THEN** the notification MUST be shown only if:
  - Global notifications are enabled (`prefs.enabled`)
  - Clipboard notifications are enabled (`prefs.clipboard.enabled`)
  - Copy success notifications are enabled (`prefs.clipboard.copySuccess`)

### Requirement: Context Menu Visibility

The extension MUST dynamically update context menu visibility based on tab selection state.

#### Scenario: Update on tab highlight changes

- **GIVEN** the user changes tab selection (highlights or unhighlights tabs)
- **WHEN** the `chrome.tabs.onHighlighted` event fires
- **THEN** the context menu visibility MUST be updated
- **AND** the screenshot menu item MUST be hidden if multiple tabs are selected
- **AND** the screenshot menu item MUST be shown if only one tab is selected

### Requirement: Error Handling

The extension MUST handle errors gracefully during clipboard operations.

#### Scenario: Handle clipboard API errors

- **GIVEN** the clipboard API fails
- **WHEN** attempting to copy content
- **THEN** the error MUST be logged to the console
- **AND** a failure badge MUST be displayed
- **AND** an error notification MUST be shown
- **AND** the extension MUST not crash or hang

#### Scenario: Handle tab access errors

- **GIVEN** script injection fails on a tab
- **WHEN** attempting to perform a clipboard operation
- **THEN** the operation MUST fail gracefully
- **AND** the error MUST be logged with context
- **AND** the user MUST be notified of the failure

#### Scenario: Handle screenshot capture errors

- **GIVEN** screenshot capture fails (e.g., permission denied, tab not visible)
- **WHEN** attempting to copy a screenshot
- **THEN** the operation MUST return false
- **AND** an error message MUST be logged
- **AND** failure feedback MUST be shown to the user

### Requirement: Clipboard Operation Context

The extension MUST provide context menu items in appropriate contexts.

#### Scenario: Available contexts

- **GIVEN** the context menu is being displayed
- **WHEN** determining which contexts to show clipboard items
- **THEN** clipboard menu items MUST be available in the following contexts:
  - `page` - Regular page content
  - `frame` - Iframe content
  - `selection` - Selected text
  - `editable` - Input fields and editable content
  - `link` - Right-click on links
  - `image` - Right-click on images
  - `all` - All contexts

---

## Implementation Notes

### File Organization

- **Background Service**: `src/background/clipboard.js` - Main clipboard functionality
- **Background Index**: `src/background/index.js` - Command handlers and initialization
- **Manifest**: `manifest.json` - Keyboard shortcuts and permissions

### Key Functions

- `setupClipboardContextMenus()` - Initialize context menu items
- `handleClipboardContextMenuClick()` - Handle context menu clicks
- `handleClipboardCommand()` - Handle keyboard shortcuts
- `copyToClipboard()` - Copy text to clipboard
- `captureTabScreenshot()` - Capture tab screenshot
- `copyImageViaTab()` - Copy image to clipboard with tab focus handling
- `handleMultiTabCopy()` - Process multiple tabs for text copy
- `handleScreenshotCopy()` - Process screenshot copy with edge case handling
- `updateClipboardContextMenuVisibility()` - Update menu visibility based on selection

### Storage Keys

This feature does not use any persistent storage. All operations are stateless.

### Permissions Required

- `clipboardWrite` - Required for clipboard operations
- `tabs` - Required to query and access tab information
- `contextMenus` - Required for context menu integration
- `scripting` - Required to inject clipboard access scripts
- `activeTab` - Required to capture screenshots

### Dependencies

- `src/background/mirror.js` - For badge animations and notification preferences
- `src/shared/urlProcessor.js` - For URL processing before copy
