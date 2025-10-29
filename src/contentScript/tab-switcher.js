/**
 * Tab Switcher Content Script
 * Displays a tab switcher overlay when triggered by keyboard shortcut
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'nenya-tab-switcher-overlay';
  const STORAGE_KEY = 'tabSnapshots';

  /** @type {HTMLElement|null} */
  let overlayElement = null;
  /** @type {ShadowRoot|null} */
  let shadowRoot = null;
  /** @type {Array<{tabId: number, title: string, favicon: string, thumbnail: string, timestamp: number}>} */
  let snapshots = [];
  /** @type {number} */
  let selectedIndex = 1; // Highlight second item by default
  /** @type {boolean} */
  let isOpen = false;
  /** @type {boolean} */
  let keyReleased = true;

  /**
   * Get snapshots from storage
   * @returns {Promise<Array>}
   */
  async function getSnapshots() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const data = result[STORAGE_KEY];
        resolve(Array.isArray(data) ? data : []);
      });
    });
  }

  /**
   * Activate a tab by ID
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  async function activateTab(tabId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'tab-switcher:activate',
          tabId: tabId,
        },
        () => {
          resolve();
        },
      );
    });
  }

  /**
   * Load CSS content
   * @returns {Promise<string>}
   */
  async function loadCSS() {
    const cssUrl = chrome.runtime.getURL('src/contentScript/tab-switcher.css');
    const response = await fetch(cssUrl);
    return await response.text();
  }

  /**
   * Create the tab switcher overlay with Shadow DOM for style isolation
   * @returns {Promise<HTMLElement>}
   */
  async function createOverlay() {
    // Create host element
    const host = document.createElement('div');
    host.id = CONTAINER_ID;
    // Reset all styles on the host element to prevent inheritance
    host.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483647;';

    // Attach shadow DOM for complete style isolation
    shadowRoot = host.attachShadow({ mode: 'open' });

    // Load and inject CSS
    const cssContent = await loadCSS();
    const style = document.createElement('style');
    style.textContent = cssContent;
    shadowRoot.appendChild(style);

    // Create overlay structure inside shadow DOM
    const overlay = document.createElement('div');
    overlay.className = 'nenya-tab-switcher-overlay';

    const container = document.createElement('div');
    container.className = 'nenya-tab-switcher-container';

    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'nenya-tab-switcher-items';
    itemsWrapper.id = 'nenya-tab-switcher-items';

    container.appendChild(itemsWrapper);
    overlay.appendChild(container);
    shadowRoot.appendChild(overlay);

    return host;
  }

  /**
   * Render snapshot items
   */
  function renderSnapshots() {
    if (!shadowRoot) return;
    const itemsWrapper = shadowRoot.getElementById('nenya-tab-switcher-items');
    if (!itemsWrapper) return;

    itemsWrapper.innerHTML = '';

    if (snapshots.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'nenya-tab-switcher-empty';
      emptyMsg.textContent = 'No tab snapshots available';
      itemsWrapper.appendChild(emptyMsg);
      return;
    }

    snapshots.forEach((snapshot, index) => {
      const item = document.createElement('div');
      item.className = 'nenya-tab-switcher-item';
      if (index === selectedIndex) {
        item.classList.add('selected');
      }

      // Thumbnail
      if (snapshot.thumbnail) {
        const img = document.createElement('img');
        img.src = snapshot.thumbnail;
        img.className = 'nenya-tab-switcher-thumbnail';
        img.alt = snapshot.title;
        item.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'nenya-tab-switcher-thumbnail-placeholder';
        placeholder.textContent = '?';
        item.appendChild(placeholder);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'nenya-tab-switcher-info';

      const title = document.createElement('div');
      title.className = 'nenya-tab-switcher-title';
      title.textContent = snapshot.title;
      info.appendChild(title);

      // Favicon and timestamp
      const meta = document.createElement('div');
      meta.className = 'nenya-tab-switcher-meta';

      if (snapshot.favicon) {
        const favicon = document.createElement('img');
        favicon.src = snapshot.favicon;
        favicon.className = 'nenya-tab-switcher-favicon';
        favicon.alt = '';
        meta.appendChild(favicon);
      }

      const time = document.createElement('span');
      time.className = 'nenya-tab-switcher-time';
      time.textContent = formatTime(snapshot.timestamp);
      meta.appendChild(time);

      info.appendChild(meta);
      item.appendChild(info);

      itemsWrapper.appendChild(item);
    });
  }

  /**
   * Format timestamp to relative time
   * @param {number} timestamp
   * @returns {string}
   */
  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  /**
   * Update the selected item highlight
   */
  function updateSelection() {
    if (!shadowRoot) return;
    const items = shadowRoot.querySelectorAll('.nenya-tab-switcher-item');
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });

    // Scroll selected item into view
    if (items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }

  /**
   * Move selection to previous item
   */
  function selectPrevious() {
    if (snapshots.length === 0) return;
    selectedIndex = selectedIndex - 1;
    if (selectedIndex < 0) {
      selectedIndex = snapshots.length - 1;
    }
    updateSelection();
  }

  /**
   * Move selection to next item
   */
  function selectNext() {
    if (snapshots.length === 0) return;
    selectedIndex = (selectedIndex + 1) % snapshots.length;
    updateSelection();
  }

  /**
   * Activate the selected tab and close the switcher
   */
  async function activateSelectedTab() {
    if (
      snapshots.length === 0 ||
      selectedIndex < 0 ||
      selectedIndex >= snapshots.length
    ) {
      closeSwitcher();
      return;
    }

    const selectedSnapshot = snapshots[selectedIndex];
    await activateTab(selectedSnapshot.tabId);
    closeSwitcher();
  }

  /**
   * Get current window ID from background script
   * @returns {Promise<number>}
   */
  async function getCurrentWindowId() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'tab-switcher:getCurrentWindowId' },
        (response) => {
          if (response && typeof response.windowId === 'number') {
            resolve(response.windowId);
          } else {
            console.error('[tab-switcher] Failed to get window ID');
            resolve(-1); // Fallback to show all tabs if window ID fails
          }
        },
      );
    });
  }

  /**
   * Get info for multiple tabs at once via background script (batched for performance)
   * @param {Array<number>} tabIds
   * @returns {Promise<Array<{tabId: number, exists: boolean, windowId: number|null}>>}
   */
  async function getTabsInfo(tabIds) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'tab-switcher:getTabsInfo',
          tabIds: tabIds,
        },
        (response) => {
          if (response && response.success && Array.isArray(response.results)) {
            resolve(response.results);
          } else {
            // Fallback: assume all tabs don't exist
            resolve(
              tabIds.map((tabId) => ({
                tabId: tabId,
                exists: false,
                windowId: null,
              })),
            );
          }
        },
      );
    });
  }

  /**
   * Filter snapshots to only include tabs that still exist and are in the current window
   * Uses batched API for better performance
   * @param {Array} allSnapshots
   * @param {number} currentWindowId
   * @returns {Promise<Array>}
   */
  async function filterValidSnapshots(allSnapshots, currentWindowId) {
    const validSnapshots = [];
    const invalidTabIds = [];
    let wrongWindowCount = 0;
    const skipWindowFilter = currentWindowId === -1; // Fallback: show all if window ID unknown

    if (skipWindowFilter) {
      console.warn('[tab-switcher] Window ID unavailable, showing all tabs');
    }

    // Batch fetch all tab info at once for performance
    const tabIds = allSnapshots.map((snapshot) => snapshot.tabId);
    const tabInfos = await getTabsInfo(tabIds);

    // Create a map for quick lookup
    const tabInfoMap = new Map();
    tabInfos.forEach((info) => {
      tabInfoMap.set(info.tabId, info);
    });

    // Filter snapshots based on fetched info
    for (const snapshot of allSnapshots) {
      const tabInfo = tabInfoMap.get(snapshot.tabId) || {
        exists: false,
        windowId: null,
      };

      if (!tabInfo.exists) {
        // Tab doesn't exist anymore
        invalidTabIds.push(snapshot.tabId);
        console.log(
          '[tab-switcher] Tab no longer exists:',
          snapshot.tabId,
          snapshot.title,
        );
      } else if (!skipWindowFilter && tabInfo.windowId !== currentWindowId) {
        // Tab exists but in a different window - skip it (unless window filter disabled)
        wrongWindowCount++;
        console.log(
          '[tab-switcher] Tab in different window:',
          snapshot.tabId,
          snapshot.title,
          'window:',
          tabInfo.windowId,
        );
      } else {
        // Tab exists and is in current window (or window filter disabled)
        validSnapshots.push(snapshot);
      }
    }

    // Clean up invalid snapshots from storage
    if (invalidTabIds.length > 0) {
      console.log(
        '[tab-switcher] Cleaning up',
        invalidTabIds.length,
        'invalid snapshots',
      );
      chrome.runtime.sendMessage({
        type: 'tab-switcher:cleanup',
        invalidTabIds: invalidTabIds,
      });
    }

    if (wrongWindowCount > 0) {
      console.log(
        '[tab-switcher] Filtered out',
        wrongWindowCount,
        'tabs from other windows',
      );
    }

    return validSnapshots;
  }

  /**
   * Open the tab switcher
   */
  async function openSwitcher() {
    if (isOpen) {
      // If already open, move to next item
      selectNext();
      return;
    }

    // Get current window ID
    const currentWindowId = await getCurrentWindowId();
    console.log('[tab-switcher] Current window ID:', currentWindowId);

    // Load snapshots
    let allSnapshots = await getSnapshots();
    console.log(
      '[tab-switcher] Total snapshots in storage:',
      allSnapshots.length,
    );

    // Filter out snapshots for tabs that no longer exist or are in other windows
    snapshots = await filterValidSnapshots(allSnapshots, currentWindowId);

    // Debug: Log snapshot data
    console.log(
      '[tab-switcher] Loaded snapshots for current window:',
      snapshots.length,
    );
    snapshots.forEach((snapshot, index) => {
      console.log(`[tab-switcher] Snapshot ${index}:`, {
        tabId: snapshot.tabId,
        title: snapshot.title,
        hasThumbnail: Boolean(snapshot.thumbnail),
        thumbnailLength: snapshot.thumbnail ? snapshot.thumbnail.length : 0,
        thumbnailPreview: snapshot.thumbnail
          ? snapshot.thumbnail.substring(0, 50)
          : 'none',
      });
    });

    // Set default selection to second item (index 1) or first if only one
    selectedIndex = snapshots.length > 1 ? 1 : 0;

    // Always create a fresh overlay (removed from DOM when closed)
    overlayElement = await createOverlay();
    document.body.appendChild(overlayElement);

    // Render snapshots
    renderSnapshots();

    // Show overlay (already visible since we just created it)
    if (shadowRoot) {
      const overlayDiv = /** @type {HTMLElement|null} */ (
        shadowRoot.querySelector('.nenya-tab-switcher-overlay')
      );
      if (overlayDiv) {
        overlayDiv.style.display = 'flex';
      }
    }

    isOpen = true;
    keyReleased = false;

    console.log(
      '[tab-switcher] Opened with',
      snapshots.length,
      'snapshots from current window',
    );
  }

  /**
   * Close the tab switcher
   */
  function closeSwitcher() {
    // Remove the overlay element from DOM completely to prevent blocking mouse events
    if (overlayElement && overlayElement.parentNode) {
      overlayElement.parentNode.removeChild(overlayElement);
      overlayElement = null;
      shadowRoot = null;
    }
    isOpen = false;
    keyReleased = true;
    console.log('[tab-switcher] Closed');
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event
   */
  function handleKeyDown(event) {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        selectPrevious();
        break;
      case 'ArrowRight':
        event.preventDefault();
        selectNext();
        break;
      case 'Enter':
        event.preventDefault();
        void activateSelectedTab();
        break;
      case 'Escape':
        event.preventDefault();
        closeSwitcher();
        break;
      case 'Tab':
        // Prevent default tab behavior when switcher is open
        event.preventDefault();
        if (event.shiftKey) {
          selectPrevious();
        } else {
          selectNext();
        }
        break;
    }
  }

  /**
   * Handle key release to detect when keyboard shortcut is released
   * @param {KeyboardEvent} event
   */
  function handleKeyUp(event) {
    if (!isOpen) return;

    // Detect when Alt or Shift is released (part of the shortcut)
    if (event.key === 'Alt' || event.key === 'Shift') {
      keyReleased = true;
      // Activate selected tab when shortcut is released
      void activateSelectedTab();
    }
  }

  /**
   * Handle messages from background script
   * @param {Object} message
   */
  function handleMessage(message) {
    if (message.type === 'tab-switcher:toggle') {
      void openSwitcher();
    }
  }

  /**
   * Handle visibility change - close switcher when page becomes hidden
   */
  function handleVisibilityChange() {
    if (document.hidden && isOpen) {
      console.log('[tab-switcher] Page hidden, closing switcher');
      closeSwitcher();
    }
  }

  // Initialize
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  chrome.runtime.onMessage.addListener(handleMessage);

  console.log('[tab-switcher] Content script loaded');
})();
