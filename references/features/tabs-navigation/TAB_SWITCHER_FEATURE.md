# Tab Switcher Feature

## Overview

The Tab Switcher feature provides a visual, keyboard-driven interface to quickly switch between tabs using snapshots captured by the Tab Snapshots feature. It displays a horizontal gallery of tab thumbnails that can be navigated using keyboard shortcuts.

## Features

### Keyboard Shortcut

- **Default**: `Alt+Shift+Tab` (can be customized in `chrome://extensions/shortcuts`)
- **Trigger**: Opens the tab switcher overlay
- **Navigation**: Use arrow keys or press the shortcut again to cycle through tabs
- **Activation**: Press `Enter` or release the keyboard shortcut to switch to the selected tab

### Visual Interface

- **Overlay**: Semi-transparent dark backdrop with blur effect
- **Horizontal Layout**: Tab snapshots displayed in a scrollable horizontal row
- **Thumbnails**: 400px width screenshots of each tab
- **Metadata**: Shows page title, favicon, and relative timestamp
- **Highlight**: Second item is highlighted by default for quick switching

### Navigation Controls

1. **Open Switcher**: Press `Alt+Shift+Tab`
2. **Navigate Right**: Press `→` (Right Arrow) or press `Alt+Shift+Tab` again
3. **Navigate Left**: Press `←` (Left Arrow)
4. **Activate Tab**: Press `Enter` or release the keyboard shortcut
5. **Close Without Switching**: Press `Escape`
6. **Tab Key Navigation**: `Tab` to go right, `Shift+Tab` to go left

### Automatic Dismissal

The tab switcher automatically closes when:

- Page becomes hidden (user switches to a different tab)
- User activates a different window
- Page loses focus

### Automatic Filtering

The tab switcher intelligently filters snapshots:

- **Current window only**: Only shows tabs from the current browser window
- **Validates existence**: Checks that each tab still exists before displaying
- **Removes closed tabs**: Automatically filters out closed tabs
- **Cleans storage**: Invalid snapshots are removed from storage in the background

### Default Selection

- **Second item** is highlighted by default (index 1)
- This allows quick switching to the most recently viewed tab
- If only one snapshot exists, it will be selected

## Technical Implementation

### Files

1. **`src/contentScript/tab-switcher.js`** - Main logic for the tab switcher
2. **`src/contentScript/tab-switcher.css`** - Styling for the overlay and UI
3. **`src/background/index.js`** - Command handler and tab activation

### Content Script: `tab-switcher.js`

The content script is injected into all pages and listens for messages from the background script.

#### Key Functions

- `openSwitcher()`: Opens the tab switcher overlay and loads snapshots
- `closeSwitcher()`: Hides the overlay
- `selectNext()`: Moves selection to the next item (cycles to first)
- `selectPrevious()`: Moves selection to the previous item (cycles to last)
- `activateSelectedTab()`: Activates the currently selected tab
- `renderSnapshots()`: Renders snapshot items in the UI
- `updateSelection()`: Updates the visual highlight and scrolls selected item into view

#### Event Listeners

1. **`keydown`**: Handles arrow keys, Enter, Escape, and Tab navigation
2. **`keyup`**: Detects when keyboard shortcut is released to activate tab
3. **`chrome.runtime.onMessage`**: Listens for toggle command from background

### Background Script

#### Command Handler

```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'tab-switcher') {
    // Send message to active tab's content script
    chrome.tabs.sendMessage(activeTabId, {
      type: 'tab-switcher:toggle',
    });
  }
});
```

#### Message Handler

```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'tab-switcher:activate') {
    // Activate the requested tab
    chrome.tabs.update(message.tabId, { active: true });
  }
});
```

### Styling: `tab-switcher.css`

Features:

- **Dark overlay** with backdrop blur for focus
- **Card-based design** with rounded corners and shadows
- **Smooth animations** for opening and selection changes
- **Responsive design** for different screen sizes
- **Dark mode support** using `prefers-color-scheme`
- **Maximum z-index** (2147483647) to ensure visibility

## User Experience

### Typical Workflow

1. User presses `Alt+Shift+Tab`
2. Switcher opens with snapshots in horizontal layout
3. Second item is highlighted (usually the previous tab)
4. User can:
   - Press `→` or `Alt+Shift+Tab` again to move to next tab
   - Press `←` to move to previous tab
   - Press `Enter` to activate highlighted tab immediately
   - Release keyboard shortcut to activate highlighted tab
   - Press `Escape` to close without switching

### Cycling Behavior

- **At last item**: Pressing right cycles to first item
- **At first item**: Pressing left cycles to last item
- This allows infinite scrolling through all available tabs

### Visual Feedback

- **Selected item**: Blue border, slight scale increase, enhanced shadow
- **Hover effect**: Subtle lift and shadow on mouse hover
- **Smooth scrolling**: Selected item automatically scrolls into view
- **Animations**: Fade-in for overlay, slide-up for container

## Integration with Tab Snapshots

The tab switcher relies on the Tab Snapshots feature:

1. Reads snapshots from `chrome.storage.local` under key `tabSnapshots`
2. Displays thumbnails, titles, favicons, and timestamps
3. Uses tab IDs to activate the correct tab
4. Only shows tabs that have been captured by the snapshot system

## Configuration

### Keyboard Shortcut

Users can customize the keyboard shortcut:

1. Go to `chrome://extensions/shortcuts`
2. Find "Nenya" extension
3. Locate "🔄 Tab Switcher"
4. Click to set a custom keyboard combination

### Recommended Shortcuts

- `Alt+` ` (backtick) - Common for tab switching
- `Alt+Shift+Tab` - Current default
- `Ctrl+Shift+Tab` - Alternative option

## Performance

- **Lazy loading**: Snapshots loaded only when switcher opens
- **No background polling**: Purely event-driven
- **Efficient rendering**: Only renders visible items
- **Smooth scrolling**: Uses native browser scrolling with `scroll-behavior: smooth`
- **Hardware acceleration**: CSS transforms used for animations

## Edge Cases

1. **No snapshots available**: Shows "No tab snapshots available" message
2. **Single snapshot**: Automatically selected (no navigation needed)
3. **Tab no longer exists**: Chrome API handles gracefully, may fail silently
4. **Content script not loaded**: Background script catches and logs error
5. **Rapid key presses**: Debounced to prevent UI glitches

## Limitations

1. **Requires snapshots**: Only shows tabs that have been captured
2. **Content script injection**: May not work on chrome:// pages or extension pages
3. **Tab activation**: Can only activate tabs in the same browser window
4. **Storage dependent**: If storage is full or cleared, no snapshots to display

## Accessibility

- **Keyboard navigation**: Fully controllable via keyboard
- **High contrast**: Clear visual distinction between selected and unselected items
- **Focus indicators**: Bold border on selected item
- **Escape hatch**: Multiple ways to close (Escape key, click outside, etc.)

## Performance

The tab switcher is optimized for speed:

- **Batched validation**: All tabs validated in a single message (not one by one)
- **Parallel queries**: Background script queries all tabs simultaneously
- **Instant appearance**: Typically shows in 40ms or less
- **Scales well**: Performance is constant regardless of number of tabs
- **See:** `TAB_SWITCHER_PERFORMANCE.md` for detailed measurements

## Future Enhancements

Potential improvements:

1. **Search functionality**: Type to filter tabs by title
2. **Close tabs**: Click X to close tabs from switcher
3. **Reorder tabs**: Drag and drop to reorder
4. **Group display**: Show tab groups with visual separators
5. **Window selection**: Switch between different browser windows
6. **Pinned tabs**: Show pinned tabs separately
7. **Recently closed**: Include recently closed tabs
8. **Preview on hover**: Expand thumbnail on hover
9. **Keyboard shortcuts overlay**: Show available shortcuts in UI
10. **Customizable layout**: Vertical or grid layout options
