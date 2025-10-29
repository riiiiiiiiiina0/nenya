# Debugging Tab Snapshots Issue

## Problem

The tab switcher shows "?" placeholders instead of screenshots.

## Debug Steps

### Step 1: Check Console Logs

1. Open Chrome DevTools (F12)
2. Go to the Console tab
3. Reload the extension
4. Switch between a few tabs
5. Look for log messages starting with `[tab-snapshots]`

### Step 2: Check What's Being Captured

Look for these log messages:

- ✅ `[tab-snapshots] Creating snapshot for tab: X`
- ✅ `[tab-snapshots] Tab info: {...}`
- ✅ `[tab-snapshots] Attempting to capture screenshot...`
- ✅ `[tab-snapshots] Captured screenshot, size: XXXX`
- ✅ `[tab-snapshots] Resized thumbnail, size: XXXX`
- ✅ `[tab-snapshots] Screenshot captured, length: XXXX`

If you see errors like:

- ❌ `Failed to capture screenshot: ...`
- ❌ `Tab not complete, skipping`
- ❌ `Internal URL, skipping`

### Step 3: Check Storage

In the Console, run:

```javascript
chrome.storage.local.get('tabSnapshots', (result) => {
  console.log('Stored snapshots:', result.tabSnapshots);
  if (result.tabSnapshots && result.tabSnapshots.length > 0) {
    console.log('First snapshot:', {
      tabId: result.tabSnapshots[0].tabId,
      title: result.tabSnapshots[0].title,
      hasThumbnail: Boolean(result.tabSnapshots[0].thumbnail),
      thumbnailLength: result.tabSnapshots[0].thumbnail?.length || 0,
      thumbnailPreview: result.tabSnapshots[0].thumbnail?.substring(0, 100),
    });
  }
});
```

### Step 4: Check Tab Switcher Loading

1. Open the tab switcher (Alt+Shift+Tab)
2. Check console for `[tab-switcher]` messages
3. Look for snapshot details showing `hasThumbnail: true/false`

## Common Issues and Solutions

### Issue 1: Image is not defined (FIXED ✅)

**Symptoms:**

- Logs show "ReferenceError: Image is not defined"
- Screenshots captured but resize fails

**Cause:** Service workers don't have access to DOM APIs like `Image`

**Solution:** Use `createImageBitmap()` instead of `new Image()` (now fixed in the code)

### Issue 2: Screenshots Not Being Captured

**Symptoms:**

- Logs show "Failed to capture screenshot"
- Error: "Cannot access contents of url..."

**Cause:** The page has restrictions or the window doesn't have focus

**Solution:** Ensure the browser window has focus when capturing

### Issue 3: Empty Thumbnails

**Symptoms:**

- Logs show successful capture but `length: 0`
- Thumbnails in storage are empty strings

**Cause:** Screenshot capture failing silently

**Solution:** Check if `chrome.tabs.captureVisibleTab` permission is working

### Issue 4: Chrome Internal Pages

**Symptoms:**

- Logs show "Internal URL, skipping"

**Cause:** Cannot capture chrome:// or chrome-extension:// pages

**Solution:** This is expected behavior

### Issue 5: Tab Not Complete

**Symptoms:**

- Logs show "Tab not complete, skipping"

**Cause:** Page still loading

**Solution:** Wait for page to fully load before switching

## Manual Test

Try this in the Console to manually test screenshot capture:

```javascript
// Get current tab
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];
  console.log('Current tab:', tab);

  try {
    // Try to capture
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 90,
    });

    console.log('SUCCESS! Screenshot captured:', dataUrl.length, 'bytes');
    console.log('Preview:', dataUrl.substring(0, 100));
  } catch (error) {
    console.error('FAILED! Error:', error);
  }
});
```

## Next Steps

Based on what you find in the logs, we can:

1. **If capture is failing**: Add better error handling or retry logic
2. **If thumbnails are empty**: Investigate image resize function
3. **If storage is wrong**: Fix the save function
4. **If switcher isn't loading**: Fix the data loading in content script
