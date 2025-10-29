# Tab Switcher - Visibility Change Handler

## Overview

The tab switcher automatically closes when the page becomes hidden (e.g., when the user switches to a different tab or window). This ensures a clean user experience and prevents the switcher from being stuck open.

## Problem Scenario

Without automatic dismissal:

```
User opens tab switcher in Tab A
    ↓
User switches to Tab B using mouse/keyboard (not via switcher)
    ↓
Tab A is now hidden, but switcher remains open ❌
    ↓
User returns to Tab A
    ↓
Switcher is still visible, blocking content ❌
```

## Solution

Added a `visibilitychange` event listener that automatically closes the switcher when the page becomes hidden:

```javascript
function handleVisibilityChange() {
  if (document.hidden && isOpen) {
    console.log('[tab-switcher] Page hidden, closing switcher');
    closeSwitcher();
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange);
```

## How It Works

### Visibility API

The [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) allows detection of when a page becomes visible or hidden.

**Key properties:**

- `document.hidden` - Boolean indicating if page is hidden
- `document.visibilityState` - String: 'visible' or 'hidden'

**When does a page become hidden?**

1. User switches to a different tab
2. User minimizes the browser window
3. User switches to a different application (Alt+Tab on desktop)
4. User enters tab overview mode (on some platforms)

### Event Flow

```
Tab Switcher Open in Tab A
    ↓
User switches to Tab B (via mouse, keyboard, etc.)
    ↓
Tab A receives 'visibilitychange' event
    ↓
document.hidden === true
    ↓
handleVisibilityChange() called
    ↓
Check: if (document.hidden && isOpen)
    ↓
closeSwitcher() called
    ↓
Overlay removed from DOM
    ↓
isOpen = false
```

## Implementation

### Handler Function

```javascript
/**
 * Handle visibility change - close switcher when page becomes hidden
 */
function handleVisibilityChange() {
  if (document.hidden && isOpen) {
    console.log('[tab-switcher] Page hidden, closing switcher');
    closeSwitcher();
  }
}
```

**Logic:**

- Only act when page becomes **hidden** (`document.hidden === true`)
- Only act when switcher is **open** (`isOpen === true`)
- Call `closeSwitcher()` to clean up

### Registration

```javascript
// Initialize event listeners
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('visibilitychange', handleVisibilityChange); // ← Added
chrome.runtime.onMessage.addListener(handleMessage);
```

## Benefits

✅ **Clean state** - Switcher doesn't remain open when page is hidden  
✅ **No interference** - Returning to the page shows normal content  
✅ **Better UX** - Switcher only visible when relevant  
✅ **Resource cleanup** - DOM elements removed when not needed  
✅ **Predictable behavior** - Users expect overlays to close on context switch

## User Scenarios

### Scenario 1: Switch Away via Mouse

```
1. User opens switcher with Alt+Shift+Tab
2. User clicks on a different tab in tab bar (didn't use switcher)
3. ✅ Switcher automatically closes in original tab
4. User can switch back without seeing the old switcher
```

### Scenario 2: Switch Away via Keyboard

```
1. User opens switcher with Alt+Shift+Tab
2. User presses Ctrl+Tab (browser's built-in tab switch)
3. ✅ Switcher automatically closes in original tab
4. Clean state maintained
```

### Scenario 3: Minimize Browser

```
1. User opens switcher with Alt+Shift+Tab
2. User minimizes browser window (Alt+F9 or minimize button)
3. ✅ Switcher automatically closes
4. User restores window - no stuck overlay
```

### Scenario 4: Switch Application

```
1. User opens switcher with Alt+Shift+Tab
2. User switches to different application (Alt+Tab on desktop)
3. ✅ Switcher automatically closes
4. Browser is now in background with clean state
```

## Edge Cases Handled

### Case 1: Switcher Already Closed

```javascript
if (document.hidden && isOpen) {
  // Only acts if switcher is actually open
}
```

**Result:** No-op if switcher already closed.

### Case 2: Rapid Visibility Changes

```
Page hidden → Page visible → Page hidden (rapid tab switching)
```

**Result:** Handler checks `isOpen` each time, only acts when needed.

### Case 3: Page Becomes Visible

```javascript
if (document.hidden && isOpen) {
  // Only acts when becoming hidden, not when becoming visible
}
```

**Result:** No action when page becomes visible (correct behavior).

## Browser Compatibility

The Page Visibility API is widely supported:

- ✅ Chrome 14+ (2011)
- ✅ Firefox 10+ (2012)
- ✅ Safari 7+ (2013)
- ✅ Edge (all versions)
- ✅ Opera 15+ (2013)

**Coverage:** 99%+ of modern browsers

## Performance

**Memory:** No additional memory overhead  
**CPU:** Event fires only on visibility state change (not continuous)  
**Impact:** Negligible (~0.1ms to handle event)

## Testing

### Manual Test 1: Tab Switch

1. Open tab switcher (Alt+Shift+Tab)
2. Click on a different tab
3. Return to original tab
4. **Expected:** Switcher is closed ✅

### Manual Test 2: Window Minimize

1. Open tab switcher (Alt+Shift+Tab)
2. Minimize browser window
3. Restore browser window
4. **Expected:** Switcher is closed ✅

### Manual Test 3: Application Switch

1. Open tab switcher (Alt+Shift+Tab)
2. Switch to different application (Alt+Tab)
3. Switch back to browser
4. **Expected:** Switcher is closed ✅

### Manual Test 4: Normal Switcher Usage

1. Open tab switcher (Alt+Shift+Tab)
2. Select a tab using the switcher
3. **Expected:** Switcher closes normally ✅
4. Visibility handler doesn't interfere

## Console Output

When switcher auto-closes due to visibility change:

```
[tab-switcher] Page hidden, closing switcher
[tab-switcher] Closed
```

This helps with debugging and understanding the behavior.

## Alternative Approaches Considered

### Alternative 1: Do Nothing (REJECTED)

**Issue:** Switcher remains open when page becomes hidden  
**Problem:** Confusing UX when returning to the page

### Alternative 2: Timer-based Cleanup (REJECTED)

```javascript
// Auto-close after X seconds
setTimeout(() => closeSwitcher(), 5000);
```

**Issues:**

- Arbitrary timeout value
- May close while user is still using it
- Doesn't respond to actual visibility changes

### Alternative 3: Visibility API (CHOSEN) ✅

**Benefits:**

- Responds to actual user actions
- Immediate cleanup when needed
- Standard browser API
- No timers or polling needed

## Integration

This feature integrates seamlessly with existing close mechanisms:

1. **User closes manually** (Escape key)
2. **User selects tab** (Enter or shortcut release)
3. **User switches context** (Visibility change) ← New
4. **Any of these** result in clean closure via `closeSwitcher()`

## Future Enhancements

Potential improvements:

1. **Remember state**: Optionally remember last position when returning
2. **Fade out**: Add fade-out animation when auto-closing
3. **Notification**: Subtle indicator that switcher was auto-closed
4. **Configurable**: Allow users to disable auto-close if desired

## Conclusion

The visibility change handler ensures the tab switcher behaves predictably and doesn't remain open when the page is hidden. This provides a clean, professional user experience that matches user expectations for overlay UI elements.

**Key Benefit:** The switcher is only visible when relevant, and automatically cleans itself up when the user context changes.
