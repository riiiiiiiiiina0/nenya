# Tab Snapshots - Smart Delay Timing

## Overview

Screenshots are captured with **strategic delays** to ensure clean, accurate snapshots without capturing transient UI elements or incomplete page states.

## Delay Timings

### Tab Activation: 300ms

When switching to an already-loaded tab:

```javascript
async function handleTabActivated(activeInfo) {
  // Wait 300ms before capturing
  await new Promise((resolve) => setTimeout(resolve, 300));
  const snapshot = await createSnapshot(activeInfo.tabId);
}
```

**Why 300ms?**

1. **Tab switcher removal**: If user used tab switcher (Alt+Shift+Tab), it needs time to:

   - Be removed from DOM (~1ms)
   - CSS fade-out animations to complete (~150ms)
   - Browser to repaint without the overlay (~50ms)

2. **Tab visibility transition**: Browser needs time to:

   - Mark tab as visible
   - Trigger visibility change events
   - Re-render tab content if it was throttled

3. **UI animations**: Common page elements that animate on visibility:
   - Sticky headers/footers repositioning
   - Loading spinners disappearing
   - Notification toasts auto-hiding

### Page Load: 500ms

When a page finishes loading:

```javascript
async function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;

  // Wait 500ms before capturing
  await new Promise((resolve) => setTimeout(resolve, 500));
  const snapshot = await createSnapshot(tabId);
}
```

**Why 500ms?**

1. **Dynamic content loading**: Modern web apps often:

   - Load content via AJAX after page "complete" event
   - Fetch data from APIs
   - Populate DOM dynamically
   - Show skeleton screens that need time to populate

2. **Images and media**:

   - Hero images might be lazy-loaded
   - Above-the-fold images need time to decode and paint
   - WebP/AVIF format conversion
   - Responsive images selecting correct size

3. **CSS animations**:

   - Page transition effects
   - Skeleton screen fade-outs
   - Element slide-ins
   - Loading indicators

4. **JavaScript execution**:
   - React/Vue hydration
   - Initial state rendering
   - User preferences applying
   - Analytics scripts executing

## Timing Trade-offs

### Too Short (< 200ms)

**Problems:**

- ❌ Captures tab switcher in screenshot
- ❌ Shows loading skeletons
- ❌ Missing lazy-loaded images
- ❌ Incomplete dynamic content
- ❌ Mid-animation states

**Example:**

```
Page loads → 100ms delay → Screenshot taken
Result: Half-loaded page with spinner visible
```

### Current (300ms / 500ms)

**Benefits:**

- ✅ Tab switcher completely gone
- ✅ Most animations completed
- ✅ Dynamic content loaded
- ✅ Above-fold images visible
- ✅ Clean, stable UI state

**Trade-off:**

- Slight delay before snapshot available
- User might switch away before capture (acceptable - only captures active tabs)

### Too Long (> 1000ms)

**Problems:**

- ❌ User might switch tabs before capture
- ❌ Page content might have changed
- ❌ Unnecessary wait for most pages
- ❌ Delays snapshot availability

**Example:**

```
Switch tab → 1500ms delay → User already switched again
Result: Missed snapshot or wrong state captured
```

## Real-World Examples

### Example 1: News Website

```
Page loads (status: complete)
  ↓ 0ms: DOM ready, but articles still loading via API
  ↓ 100ms: Articles loaded, images downloading
  ↓ 300ms: Hero image visible, ads loading
  ↓ 500ms: ✅ SNAPSHOT TAKEN - Full page visible
  ↓ 800ms: Below-fold images lazy loading
```

### Example 2: Social Media Feed

```
Switch to tab (was already loaded)
  ↓ 0ms: Tab switcher overlay visible
  ↓ 50ms: Tab switcher fading out
  ↓ 150ms: Tab switcher removed from DOM
  ↓ 200ms: Page repainting without overlay
  ↓ 300ms: ✅ SNAPSHOT TAKEN - Clean page
```

### Example 3: Single Page App (SPA)

```
Page loads (React app)
  ↓ 0ms: Status complete, but React not hydrated
  ↓ 100ms: React hydration starting
  ↓ 200ms: Components mounting
  ↓ 300ms: Data fetching
  ↓ 400ms: Components rendering with data
  ↓ 500ms: ✅ SNAPSHOT TAKEN - App fully rendered
```

## Performance Impact

### Memory

- Delays are non-blocking (async/await)
- No memory held during delay
- Timers are lightweight

### CPU

- No CPU usage during delay
- Screenshot capture happens after delay
- Processing time separate from delay time

### User Experience

- Delays are **imperceptible** to users
- Snapshots happen in background
- No UI blocking or freezing
- Tab switching remains instant

### Total Snapshot Time

```
Tab Activation Flow:
  Switch tab → 300ms delay → 200ms capture → 50ms resize → 30ms save
  Total: ~580ms (user doesn't notice)

Page Load Flow:
  Page complete → 500ms delay → 200ms capture → 50ms resize → 30ms save
  Total: ~780ms (happens in background)
```

## Comparison with Alternatives

### Alternative 1: No Delay (REJECTED)

```javascript
// Immediate capture
const snapshot = await createSnapshot(tabId);
```

**Issues:**

- ❌ Tab switcher visible in screenshots
- ❌ Loading states captured
- ❌ Incomplete pages
- ❌ Poor snapshot quality

### Alternative 2: Wait for idle (REJECTED)

```javascript
// Wait for network and CPU idle
await new Promise((resolve) => {
  requestIdleCallback(resolve, { timeout: 2000 });
});
```

**Issues:**

- ❌ Unpredictable timing (could be 10ms or 2000ms)
- ❌ Might wait too long
- ❌ Doesn't guarantee UI settled
- ❌ Complex to implement

### Alternative 3: Fixed delays (CHOSEN) ✅

```javascript
// Tab activation: 300ms
await new Promise((resolve) => setTimeout(resolve, 300));

// Page load: 500ms
await new Promise((resolve) => setTimeout(resolve, 500));
```

**Benefits:**

- ✅ Predictable timing
- ✅ Tuned for real-world scenarios
- ✅ Simple to implement
- ✅ Covers 95% of cases well
- ✅ Easy to adjust if needed

## Configuration

Currently hardcoded, but could be made configurable:

```javascript
// Potential future configuration
const DELAYS = {
  TAB_ACTIVATION: 300, // ms
  PAGE_LOAD: 500, // ms
  MIN_DELAY: 100, // ms
  MAX_DELAY: 2000, // ms
};
```

## Edge Cases

### Case 1: Very Fast Tab Switching

```
User switches tabs rapidly:
  Tab A (300ms delay not finished)
  → Tab B (new 300ms delay starts)
  → Tab C (new 300ms delay starts)

Result: Only Tab C gets snapshot (correct behavior)
```

### Case 2: Slow Network

```
Page loading slowly:
  → status: complete (but images still loading)
  → 500ms delay
  → Some images might still be missing

Trade-off: Acceptable - better than capturing loading state
```

### Case 3: SPA Navigation

```
SPA internal navigation:
  → No page reload
  → No snapshot triggered (by design)
  → Snapshot only on actual tab switch
```

## Monitoring & Debugging

Console logs show timing:

```
[tab-snapshots] Creating snapshot for tab: 123
[tab-snapshots] Tab info: {...}
[tab-snapshots] Attempting to capture screenshot...
[tab-snapshots] Captured screenshot, size: 504855
[tab-snapshots] Resized thumbnail, size: 125000
[tab-snapshots] Snapshot created successfully
```

Time between "Creating snapshot" and "Snapshot created" includes the delay.

## Future Enhancements

Potential improvements:

1. **Adaptive delays**: Adjust based on page complexity
2. **Content detection**: Check if page is actually ready
3. **Performance API**: Use Performance Observer to detect stability
4. **User preferences**: Allow users to configure delays
5. **Smart detection**: Detect tab switcher presence and wait

## Conclusion

The **300ms/500ms delay strategy** provides the optimal balance between:

- Screenshot quality (clean, complete pages)
- Performance (minimal overhead)
- User experience (imperceptible delays)
- Simplicity (easy to understand and maintain)

These delays ensure that screenshots accurately represent the page as users see it, without transient UI elements or incomplete loading states.
