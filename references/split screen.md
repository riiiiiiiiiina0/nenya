# Split screen feature

This document explains how the Sandwich Bear extension implements a multi-pane split screen for arbitrary webpages, and how you can reproduce the same feature. It covers architecture, permissions, background flows, the split page UI, layouts, resizing, insertion/removal/reordering, content script communication, title/favicon handling, URL/state persistence, keyboard shortcuts, and edge cases.

### High-level UX

- **Open tabs in split view**: Pick up to 4 highlighted tabs and open them in a single split page (from page context menu or chrome command keyboard shortcut). If exactly 4, it defaults to a 2×2 grid.
- **Layouts**: Horizontal, Vertical, and Grid (2×2). Switch freely; resizing is preserved where applicable.
- **Resize and reorder**: Drag dividers to resize; move frames left/right (or up/down) with buttons or shortcuts.
- **Per-frame controls**: Full-page toggle, reload, back, detach to a new tab, remove, and copy URL from a bottom display.
- **Context actions**: From a regular page, use the action button or context menus. From inside a frame, use Cmd/Meta-click to add to the right, or Alt/Option-click to replace the right frame.

## 1) Manifest and permissions

The feature is a Chrome MV3 extension with a background service worker and content scripts that run in all frames. Required capabilities:

- **permissions**: `tabs`, `clipboardWrite`, `declarativeNetRequest`, `contextMenus`, `scripting`, `webNavigation`
- **host_permissions**: `<all_urls>` to allow iframing and content scripts across sites
- **content_scripts**: injected on `<all_urls>`, `all_frames: true`
- **background**: service worker (`type: 'module'`)

Reference:

```17:31:/Users/tangqh/Documents/projects/treeee/sandwich-bear/manifest.json
  "permissions": [
    "tabs",
    "clipboardWrite",
    "declarativeNetRequest",
    "contextMenus",
    "scripting",
    "webNavigation"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "type": "module",
    "service_worker": "src/background.js"
  },
```

Notes for zero-build projects (per this repo's rules): include browser-ready CSS/JS (e.g., TailwindCSS, DaisyUI) as local files in `src/libs/` and load them from HTML without bundling.

## 2) Making iframes work on most websites

Many sites block embedding with `X-Frame-Options` or `Content-Security-Policy`. The extension uses a Dynamic DNR rule to strip such response headers for subframes and main frames. It also injects a small spoofing shim early during navigation to avoid some destructive page scripts.

Header removal rule:

```45:83:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
  chrome.declarativeNetRequest
    .updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          condition: {
            urlFilter: '*',
            resourceTypes: [
              'sub_frame',
              'xmlhttprequest',
              'websocket',
              'main_frame',
              'other',
            ],
          },
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              { header: 'X-Frame-Options', operation: 'remove' },
              { header: 'Frame-Options', operation: 'remove' },
              { header: 'Content-Security-Policy', operation: 'remove' },
              { header: 'Content-Security-Policy-Report-Only', operation: 'remove' },
            ],
          },
        },
      ],
    })
```

Inject spoofing as early as possible:

```127:145:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
chrome.webNavigation.onCommitted.addListener(
  (details) => {
    if (details.frameId >= 0) {
      injectWindowSpoofing(details.tabId, details.frameId);
    }
  },
  { url: [{ schemes: ['http', 'https'] }] },
);

chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId >= 0) {
      injectWindowSpoofing(details.tabId, details.frameId);
    }
  },
  { url: [{ schemes: ['http', 'https'] }] },
);
```

Limitations remain (e.g., `chrome://` pages, some identity-protected or strongly CSP’d sites). Handle errors gracefully.

## 3) Background: user flows, action titles, menus

Dynamic action title and click handling:

```232:271:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
const updateAction = async () => {
  // ... derive appropriate title based on active tab or highlighted tabs
  await chrome.action.setPopup({ tabId: activeTab.id, popup: '' });
  await chrome.action.setTitle({ title, tabId: activeTab.id });
};
```

Split selected tabs into a single split page:

```301:353:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
const doSplit = async () => {
  // Filter to http/https tabs, sort by tab index, take first 4
  const httpTabs = highlightedTabs
    .filter((t) => typeof t.url === 'string' && (t.url.startsWith('http://') || t.url.startsWith('https://')))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, 4);
  // Build split.html?state=... and open next to the first selected tab
  const state = { urls: httpTabs.map((t) => String(t.url)) };
  const splitUrl = `${chrome.runtime.getURL('src/split.html')}?state=${encodeURIComponent(JSON.stringify(state))}`;
  const newTab = await chrome.tabs.create({ url: splitUrl, windowId: firstTab.windowId });
  // Move into group and close originals
};
```

Ungroup (restore iframes back to normal tabs):

```370:439:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
const doUngroup = async () => {
  // Ask split page for current live URLs instead of parsing stale tab URL
  const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'get-current-urls' });
  const urls = (response && Array.isArray(response.urls) ? response.urls : []).filter(u => typeof u === 'string' && u.length > 0);
  // Create new tabs next to the split page, optionally keep group, then close split tab
};
```

Context menus and click routing:

```192:229:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/background.js
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-in-split-view') {
    // create split with [current page, clicked link]
  } else if (info.menuItemId === 'open-on-the-right') {
    chrome.tabs.sendMessage(tab.id, { action: 'add-iframe-right', url: info.linkUrl, frameId: info.frameId });
  } else if (info.menuItemId === 'replace-on-the-right') {
    chrome.tabs.sendMessage(tab.id, { action: 'replace-iframe-right', url: info.linkUrl, frameId: info.frameId });
  }
});
```

## 4) Split page bootstrapping

The split UI is a standalone HTML at `src/split.html`. It loads Tailwind and DaisyUI (as static assets) and a single module entry that builds the UI.

HTML structure:

```39:42:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split.html
<body class="m-0 p-0 h-full w-full overflow-hidden">
  <div id="iframe-container" class="flex h-screen w-screen"></div>
  <script type="module" src="split/entry.js"></script>
</body>
```

Entry script responsibilities:

- Parse `?state=` with `urls`, optional `ratios`, optional `layout`.
- Decide initial layout (default horizontal; auto-grid when exactly 4 URLs and no explicit layout).
- Create `.iframe-wrapper` + `iframe` per URL. Each wrapper gets `style.order = evenIndex` and `data-ratio` for linear modes.
- In linear modes, insert `.iframe-divider` between wrappers (odd `order`). Dividers are 4px thick.
- Attach menus, URL display, active-hover, title listeners, edge plus buttons, and divider plus buttons.

Selected construction flow:

```324:399:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/entry.js
applyLayout();
attachEdgePlusButtons();

urls.forEach((url, index) => {
  const iframeWrapper = document.createElement('div');
  iframeWrapper.className = 'iframe-wrapper group relative flex-shrink-0 flex-grow-0';
  iframeWrapper.style.order = String(index * 2);
  // Set data-ratio and inline size for linear layouts
  // Create iframe, set sandbox/allow, name = sb-iframe-<index>
  // Append menu and URL display; insert divider after each wrapper except last
});
// Ensure plus visibility and recalc sizes
```

Wrappers use `style.order` to capture logical ordering; wrappers are always even orders; dividers are odd. This ordering drives movement, insert positions, and state serialization.

## 5) Layouts and CSS structure

There are three modes: `horizontal`, `vertical`, and `grid` (2×2). Mode lives in `appState` and all layout transitions go through `applyLayout()`.

Applying layout:

```14:29:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/layout.js
export const applyLayout = () => {
  const iframeContainer = appState.getContainer();
  const mode = appState.getLayoutMode();
  const isVerticalLayout = mode === 'vertical';
  const isGridLayout = mode === 'grid';

  if (isGridLayout) {
    iframeContainer.className = 'grid grid-cols-2 grid-rows-2 h-screen w-screen';
    const col = appState.getGridColumnPercent();
    const row = appState.getGridRowPercent();
    iframeContainer.style.gridTemplateColumns = `${col}% ${100 - col}%`;
    iframeContainer.style.gridTemplateRows = `${row}% ${100 - row}%`;
    // remove stale dividers, add grid overlay dividers
  } else if (isVerticalLayout) {
    iframeContainer.className = 'flex flex-col h-screen w-screen';
  } else {
    iframeContainer.className = 'flex flex-row h-screen w-screen';
  }
```

Grid mode adds two overlay dividers (vertical and horizontal) that adjust 2×2 split percentages.

```104:127:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/layout.js
const vDivider = document.createElement('div');
vDivider.dataset.sbGridDivider = 'vertical';
// ... position via left: calc(col% - 2px)
addGridDividerDragFunctionality(vDivider, 'vertical');
// ... similarly for horizontal divider
```

Switchers:

```173:194:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/layout.js
export const setLayoutToGrid = () => {
  // only allow grid for 4 wrappers, clear ratios, applyLayout, rebuildInterface, updateUrlWithState
};
```

Linear modes rebuild inter-wrapper dividers and equalize ratios on entry.

## 6) Resizing: divider drag mechanics

Linear modes compute sizes as percentages of the container minus divider pixels (4px per divider). Ratios persist in `wrapper.dataset.ratio` and are applied via CSS `calc()`.

Divider drag handler:

```18:36:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/drag.js
const currentPosition = isVerticalLayout() ? e.clientY : e.clientX;
const delta = currentPosition - startPosition;
const totalDividerCount = iframeContainer.querySelectorAll('.iframe-divider').length;
const dividerPx = totalDividerCount * 4;
const containerSize = isVerticalLayout() ? iframeContainer.clientHeight : iframeContainer.clientWidth;
const effectiveSize = Math.max(1, containerSize - dividerPx);
const deltaPercentage = (delta / effectiveSize) * 100;
```

Persisting sizes with divider-aware calc:

```42:60:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/size.js
export function applyWrapperPrimarySize(wrapper, ratioPercent, isVerticalLayout, iframeContainer) {
  const totalDividerPx = getTotalDividerThicknessPx(iframeContainer);
  const ratioDecimal = Math.max(0, ratioPercent) / 100;
  const sizeExpr = `calc((100% - ${totalDividerPx}px) * ${ratioDecimal})`;
  // set width/height accordingly
}
```

Grid drag handler updates grid template percents live:

```171:185:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/drag.js
if (orientation === 'vertical') {
  const percent = ((x - rect.left) / Math.max(1, rect.width)) * 100;
  appState.setGridColumnPercent(percent);
} else {
  const percent = ((y - rect.top) / Math.max(1, rect.height)) * 100;
  appState.setGridRowPercent(percent);
}
iframeContainer.style.gridTemplateColumns = `${col}% ${100 - col}%`;
iframeContainer.style.gridTemplateRows = `${row}% ${100 - row}%`;
```

On mouse up, both handlers restore `pointer-events`, clear cursors, and call `updateUrlWithState()`.

## 7) Inserting, removing, and reordering frames

Plus buttons: a small overlay button exists on each divider and at the left/right edges. Clicking opens a tab picker grouped by window (populated via `chrome.tabs.query`). Selecting a tab inserts a new iframe and closes the source tab once the iframe loads.

Attach divider plus and open picker:

```17:37:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
export const attachDividerPlus = (divider) => {
  const plusBtn = document.createElement('button');
  plusBtn.dataset.sbPlus = 'true';
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTabPicker(divider, { x: e.clientX, y: e.clientY }, undefined);
  });
  divider.appendChild(plusBtn);
};
```

Insert at a divider, auto-grid on 4:

```206:214:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
export const insertAtDivider = (divider, url) => {
  const iframeContainer = appState.getContainer();
  const isVerticalLayout = appState.getIsVerticalLayout();
  // compute sorted wrappers; derive left/right indices from divider.style.order
```

```232:260:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
const iframe = document.createElement('iframe');
iframe.src = url;
iframe.name = `sb-iframe-${Date.now()}`;
iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads');
iframe.setAttribute('allow', 'fullscreen');
```

```289:312:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
if (allWrappers.length === 4) {
  setLayoutToGrid();
  updateDividerPlusVisibility();
  updateDocumentTitleFromIframes();
  updateUrlWithState();
} else {
  // equalize ratios, rebuild interface, recalc, update title
}
```

Insert at edges and hide plus when >= 4:

```441:476:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
export const attachEdgePlusButtons = () => {
  // fixed left/right edge containers with ➕; open picker and call insertAtEdge('head'|'tail')
};
```

```481:507:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/insert.js
export const updateDividerPlusVisibility = () => {
  const wrappers = document.querySelectorAll('.iframe-wrapper');
  const hide = wrappers.length >= 4;
  // hide divider/edge plus buttons accordingly
};
```

Move by swapping `style.order` and normalizing:

```32:49:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/move.js
const fromOrder = Number.parseInt(fromWrapper.style.order || `${fromIndex * 2}`, 10);
const toOrder = Number.parseInt(toWrapper.style.order || `${toIndex * 2}`, 10);
fromWrapper.style.order = String(toOrder);
toWrapper.style.order = String(fromOrder);
updateCssOrder();
rebuildInterface();
```

Remove and rebalance; if grid drops to 3, switch to horizontal; if 1 remains, reopen and close split:

```114:131:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/remove.js
const newRatio = 100 / remainingWrappers.length;
remainingWrappers.forEach((wrapper) => {
  wrapper.dataset.ratio = String(newRatio);
  applyWrapperPrimarySize(wrapper, newRatio, isVerticalLayout, iframeContainer);
});
rebuildInterface();
updateDividerPlusVisibility();
recalcAllWrapperSizes(iframeContainer, isVerticalLayout);
closeTabIfSingleRemaining();
```

## 8) Menu controls per frame

Each wrapper has a hover menu. In linear modes it shows layout toggle + grid (when 4). In grid, it shows explicit Horizontal/Vertical buttons.

Layout buttons:

```56:67:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
if (isGridLayout) {
  const toHorizontalBtn = document.createElement('button');
  toHorizontalBtn.addEventListener('click', setLayoutToHorizontal);
  const toVerticalBtn = document.createElement('button');
  toVerticalBtn.addEventListener('click', setLayoutToVertical);
} else {
  const gridBtn = /* only when totalCount===4 */
  const layoutBtn = /* toggles vertical/horizontal */
}
```

Full-page toggle, reload, back, move, remove, detach:

```104:151:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
const fullPageBtn = document.createElement('button');
fullPageBtn.addEventListener('click', () => {
  if (isFullPage(iframeWrapper)) collapseIframe(iframeWrapper);
  else expandIframe(iframeWrapper);
});
```

```156:181:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
reloadBtn.addEventListener('click', () => {
  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe && iframe.dataset.frameId) {
    const frameId = parseInt(iframe.dataset.frameId, 10);
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: 'reloadFrame' }, { frameId });
    });
  }
});
```

```183:207:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
backBtn.addEventListener('click', () => {
  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe && iframe.dataset.frameId) {
    const frameId = parseInt(iframe.dataset.frameId, 10);
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: 'goBack' }, { frameId });
    });
  }
});
```

```210:256:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
// Move left/right buttons call moveIframe(index, -1|+1), respecting vertical mode label rotation
```

```258:313:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/menu.js
// Remove removes wrapper; Detach opens iframe URL in new tab and then removes wrapper
```

## 9) Content scripts and cross-frame messaging

Frames are named `sb-iframe-<n>` to identify themselves. A content script runs in these frames to bridge events and navigation to the parent split page.

Frame connector (runs in content script world):

```4:17:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/frame-connector.js
if (window.name && window.name.startsWith('sb-iframe-')) {
  // Inject MAIN-world url-interceptor.js
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/content/url-interceptor.js');
  (document.head || document.documentElement).appendChild(script);
}
```

```21:33:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/frame-connector.js
window.addEventListener('sb:url-change', (event) => {
  if (event.detail && event.detail.url) {
    chrome.runtime.sendMessage({ action: 'sb:nav', frameName: window.name, url: event.detail.url });
  }
});
```

```35:53:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/frame-connector.js
chrome.runtime.sendMessage({ action: 'registerFrame', frameName: window.name });
chrome.runtime.sendMessage({ action: 'sb:nav', frameName: window.name, url: window.location.href });
```

```56:63:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/frame-connector.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'reloadFrame') window.location.reload();
  if (message.action === 'goBack') window.history.back();
});
```

```65:104:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/frame-connector.js
// Forward Alt+[A|D|E|X|F] to parent as sb:key; ignore inputs and contentEditable
```

Main-world URL interceptor (reliable SPA detection):

```34:49:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/url-interceptor.js
const originalPushState = history.pushState;
history.pushState = function (...args) { originalPushState.apply(this, args); reportUrlChange(); };
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) { originalReplaceState.apply(this, args); reportUrlChange(); };
window.addEventListener('popstate', reportUrlChange);
window.addEventListener('hashchange', reportUrlChange);
```

Anchor interception (in-frame UX shortcuts):

```18:31:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/anchor.js
if (url && isModifierOpenRight) {
  e.stopPropagation(); e.preventDefault();
  chrome.runtime.sendMessage({ action: 'add-iframe-right', url, frameName: window.name });
  return;
}
```

```33:46:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/anchor.js
if (url && isModifierReplaceRight) {
  e.stopPropagation(); e.preventDefault();
  chrome.runtime.sendMessage({ action: 'replace-iframe-right', url, frameName: window.name });
  return;
}
```

```48:57:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/anchor.js
if (url && (isTargetBlank || isYouTubeLink)) {
  e.stopPropagation(); e.preventDefault();
  chrome.runtime.sendMessage({ action: 'openAnchorLink', url });
}
```

Reload forwarding (Cmd/Ctrl+R inside frames):

```6:21:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/content/reload-forwarder.js
if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
  e.preventDefault(); e.stopPropagation();
  chrome.runtime.sendMessage({ action: 'sb:reload', frameName: window.name });
}
```

## 10) Title, favicon, and URL display

The parent page derives `document.title` from the child iframes and updates the favicon to match the active frame when possible.

Bridging titles and URLs from frames:

```176:241:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/title.js
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'sb:title') return;
  // Map to the right iframe by normalized URL, then set data-sb-title and data-sb-current-url
  // Defer updateUrlWithState(); updateUrlDisplay(iframe)
});
```

Active iframe controls page title and favicon:

```90:141:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/title.js
export const updateDocumentTitleAndFaviconFromIframe = (iframe) => {
  const tabId = appState.getTabId();
  const frameId = iframe.dataset.frameId;
  chrome.tabs.sendMessage(tabId, { action: 'sb:get-title' }, { frameId }, (response) => {
    document.title = response?.title || 'Untitled';
    if (response?.favicon) getFaviconEl().href = response.favicon; else resetFaviconToDefault();
  });
};
```

Bottom URL display with copy-to-clipboard feedback:

```27:42:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/url-display.js
urlDisplay.addEventListener('click', async () => {
  const currentUrl = iframe.getAttribute('data-sb-current-url') || iframe.getAttribute('src') || '';
  await navigator.clipboard.writeText(currentUrl);
  // swap icon, flash green, show "Copied", then restore
});
```

## 11) URL/state encoding and persistence

The split page serializes its state into a single `state` query param (`JSON.stringify`). It includes `urls`, `ratios`, `layout`, and derived `titles`. This is updated after UI changes (resize, move, insert/remove, navigation within frames).

Serialize state:

```59:75:/Users/tangqh/Documents/projects/treeee/sandwich-bear/src/split/url.js

## 15) Design review and improvements

- Scope header/CSP removal narrowly
  - Current DNR rule removes CSP/XFO for many resource types, globally. Restrict to `sub_frame` and prefer session rules limited to the split tab via `chrome.declarativeNetRequest.updateSessionRules` with `tabIds`. Remove rules when the split tab closes.
  - Avoid touching `xmlhttprequest`/`websocket`; they are unrelated to embedding and weaken site security.
  - If available in your Chrome version, rewrite CSP to drop only `frame-ancestors` (instead of removing the whole header). Otherwise, limit the rule by domain allowlists.

- Restrict main-world injection
  - `injectWindowSpoofing` currently runs on all frames. Only inject for frames inside the split page tab. Use `onCommitted/onBeforeNavigate` details to check the top frame's `documentUrl` or fetch the tab and verify it starts with your `chrome-extension://.../src/split.html` URL before injecting.
  - Consider removing the `window.stop` override entirely or restrict it to your iframes (frames whose `window.name` starts with `sb-iframe-`) to avoid breaking host pages.

- Tighten content scripts
  - Add a guard to `title-probe.js` so it runs only inside split iframes:
    - Early-return unless `window.name?.startsWith('sb-iframe-')`.
  - Alternatively, drop `title-probe.js` and rely on `sb:get-title` requests on hover/active plus periodic polling if needed.
  - Optionally register content scripts at runtime only while a split page exists using `chrome.scripting.registerContentScripts`.

- Cross‑platform modifiers for anchor actions
  - In `anchor.js`, `isModifierOpenRight` uses `e.metaKey` only. Detect platform (`chrome.runtime.getPlatformInfo`) and use:
    - macOS: Meta for add-right, Option for replace-right.
    - Windows/Linux: Ctrl for add-right, Alt for replace-right.
  - Ensure UI hints and context menu labels match the actual modifiers.

- Normalize iframe permissions
  - `entry.js` sets `allow="fullscreen; clipboard-read; clipboard-write"`, while `insert.js` sets only `fullscreen`. Unify to the same `allow` across both paths.

- Minor UX resilience
  - While in full-page mode, proactively hide grid overlay dividers to avoid cursor hit targets (in addition to sibling `display: none`).
  - Debounce frequent `updateUrlWithState()` calls when many `sb:title` messages arrive.

const state = { urls: currentUrls, ratios: currentRatios.map((r) => Number(r)), layout: mode, titles };
newUrl.searchParams.set('state', JSON.stringify(state));
window.history.replaceState({}, '', newUrl.toString());
```

Initial parsing and defaults happen in `entry.js`. If exactly four URLs and no explicit layout, it defaults to grid.

## 12) Keyboard shortcuts

Shortcuts target the active iframe (hover to activate):

- **Alt+A**: Move left (or up in vertical)
- **Alt+D**: Move right (or down in vertical)
- **Alt+E**: Detach to new tab
- **Alt+X**: Remove frame
- **Alt+F**: Toggle full-page for this frame

Shortcuts originate either in the frame (forwarded by content script) or on the split page document, and are processed centrally to call actions on the resolved iframe.

## 13) Implementation checklist (zero-build)

1. Manifest
   - Add MV3 background service worker; content scripts on `<all_urls>` with `all_frames: true`.
   - Declare permissions: `tabs`, `clipboardWrite`, `declarativeNetRequest`, `contextMenus`, `scripting`, `webNavigation`.
   - Add `web_accessible_resources` for your split page and any injected scripts.
2. Background
   - Install a DNR rule to remove `X-Frame-Options`/`CSP`.
   - Inject spoofing early on `onCommitted`/`onBeforeNavigate`.
   - Implement `updateAction`, `doSplit`, `doUngroup`, context menus, and routing.
3. Split page
   - Create `split.html` with a container and load your module entry.
   - Include TailwindCSS/DaisyUI via local files (no bundlers).
4. Entry module
   - Parse `state`, set layout, instantiate wrappers/iframes/menus/dividers/edge-plus.
   - Implement layout transitions and grid overlay dividers.
   - Implement drag-resize for linear and grid; persist ratios/percents.
   - Implement insertion (divider/edge), removal, reordering; equalize and recalc.
   - Maintain `data-sb-*` attributes and `style.order` (even wrappers, odd dividers).
   - Update URL with state and `document.title`/favicon on changes.
5. Content scripts
   - Frame connector (Alt-key forwarding, reload/back handlers, initial register + nav reports).
   - Main-world URL interceptor (History API + popstate/hashchange).
   - Anchor interception (Meta-click add right, Alt-click replace right, handle \_blank/YouTube to open as tabs).
   - Reload forwarder (Cmd/Ctrl+R to parent).

## 14) Edge cases and notes

- Some sites cannot load in iframes despite header removal.
- Title/favicon retrieval may fail on cross-origin or blocked pages; fall back to hostname/default favicon.
- `chrome://`, `chrome-extension://`, and similar protocols are not embeddable.
- Ensure you guard all Chrome APIs and ignore errors on unload or blocked frames.

---

With the components above, you can reproduce Sandwich Bear’s split screen feature in a zero-build Chrome MV3 extension while adhering to this repository’s conventions.
