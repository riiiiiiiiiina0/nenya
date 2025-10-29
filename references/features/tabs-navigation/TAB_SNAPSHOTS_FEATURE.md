# Tab Snapshots Feature

## Overview

The Tab Snapshots feature automatically captures and stores snapshots of active tabs in Chrome local storage. This provides a visual history of recently viewed tabs.

## Features

### Automatic Snapshot Capture

Snapshots are automatically captured in two scenarios:

1. **When active tab changes**: When you switch to a different tab that is already loaded
   - Captures after **300ms delay** to ensure UI has settled (tab switcher removed, animations complete)
2. **When page finishes loading**: When a page in the currently active tab finishes loading
   - Captures after **500ms delay** to ensure page is fully rendered (dynamic content, images, animations)

### Automatic Snapshot Cleanup

Snapshots are automatically removed when:

1. **When tab is closed**: When a tab is closed, its corresponding snapshot is removed from storage

### Snapshot Contents

Each snapshot includes:

- **Tab ID**: The unique identifier of the tab
- **Title**: The page title
- **Favicon**: The page's favicon URL
- **Thumbnail**: A resized screenshot (400px width, maintains aspect ratio)
- **Timestamp**: When the snapshot was captured (milliseconds since epoch)

### Storage Management

- **Maximum snapshots**: 10 snapshots are kept in storage
- **Uniqueness**: Only one snapshot per tab ID (the most recent one)
- **Sort order**: Sorted by timestamp in descending order (newest first)
- **Storage location**: Chrome local storage under the key `tabSnapshots`

### Excluded Pages

Snapshots are NOT captured for:

- Chrome internal pages (`chrome://`, `chrome-extension://`, `about:`)
- Empty or invalid URLs
- Pages that haven't finished loading

## Technical Implementation

### Module: `src/background/tab-snapshots.js`

This module provides:

#### Functions

- `initializeTabSnapshots()`: Sets up event listeners for tab activation and updates
- `getSnapshots()`: Retrieves all stored snapshots
- `clearSnapshots()`: Removes all stored snapshots

#### Internal Functions

- `createSnapshot(tabId)`: Creates a snapshot for a specific tab
- `saveSnapshot(snapshot)`: Saves a snapshot to storage
- `captureTabScreenshot(windowId)`: Captures and resizes a screenshot
- `resizeImage(dataUrl, targetWidth)`: Resizes an image while maintaining aspect ratio

### Event Listeners

1. **`chrome.tabs.onActivated`**: Triggered when user switches tabs

   - Captures snapshot of the newly activated tab (if already loaded)

2. **`chrome.tabs.onUpdated`**: Triggered when tab properties change

   - Captures snapshot only when `status === 'complete'` and tab is active

3. **`chrome.tabs.onRemoved`**: Triggered when a tab is closed
   - Removes the corresponding snapshot from storage

### Image Processing

Screenshots are captured using `chrome.tabs.captureVisibleTab()` and then resized to 400px width using:

- `OffscreenCanvas` for image manipulation
- JPEG format with 80% quality for optimal size/quality balance
- Automatic aspect ratio maintenance

## Testing

A test page is provided at `test-snapshots.html` that allows you to:

- View all stored snapshots with thumbnails
- See snapshot metadata (tab ID, title, timestamp)
- Clear all snapshots
- Auto-refresh every 5 seconds to see new snapshots

To test:

1. Load the extension in Chrome
2. Open `test-snapshots.html` in a browser tab
3. Switch between tabs or load new pages
4. Return to the test page to see captured snapshots

## Usage Example

### Programmatic Access

```javascript
// Get all snapshots
const snapshots = await chrome.storage.local.get('tabSnapshots');
console.log(snapshots.tabSnapshots);

// Example output:
// [
//   {
//     tabId: 123,
//     title: "Example Page",
//     favicon: "https://example.com/favicon.ico",
//     thumbnail: "data:image/jpeg;base64,...",
//     timestamp: 1698765432100
//   },
//   ...
// ]
```

### Clear Snapshots

```javascript
await chrome.storage.local.remove('tabSnapshots');
```

## Performance Considerations

- Screenshots are captured only for visible tabs (not background tabs)
- Images are resized to reduce storage size
- JPEG compression is applied (80% quality)
- Maximum of 10 snapshots prevents unlimited storage growth
- Only one snapshot per tab ID prevents duplicates

## Future Enhancements

Potential improvements:

- Configurable maximum number of snapshots
- Configurable thumbnail size
- Option to exclude certain domains
- Export snapshots to disk
- Search/filter snapshots
- Manual snapshot capture trigger
