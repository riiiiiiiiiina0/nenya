(function () {
  'use strict';

  /**
   * Custom Title Override Content Script
   * Prevents page title changes and overrides with custom title from storage
   */

  /** @type {number | null} */
  let currentTabId = null;
  /** @type {string | null} */
  let customTitle = null;
  /** @type {MutationObserver | null} */
  let titleObserver = null;
  /** @type {boolean} */
  let isInitialized = false;

  /**
   * Get the current tab ID from background script
   * @returns {Promise<number | null>}
   */
  async function getTabId() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'getCurrentTabId',
      });
      return typeof response?.tabId === 'number' ? response.tabId : null;
    } catch (error) {
      console.error('[CustomTitle] Failed to get tab ID:', error);
      return null;
    }
  }

  /**
   * Load custom title from storage by tabId or URL
   * @param {number} tabId
   * @returns {Promise<string | null>}
   */
  async function loadCustomTitle(tabId) {
    try {
      // First try by tabId
      const storageKey = `customTitle_${tabId}`;
      const result = await chrome.storage.local.get(storageKey);
      const data = result[storageKey];

      if (data && typeof data === 'object' && typeof data.title === 'string') {
        return data.title;
      }

      // Fallback: try by URL match
      const currentUrl = window.location.href;
      if (currentUrl && typeof currentUrl === 'string') {
        const allStorage = await chrome.storage.local.get(null);
        const customTitleKeys = Object.keys(allStorage).filter((key) =>
          key.startsWith('customTitle_'),
        );

        for (const key of customTitleKeys) {
          const urlData = allStorage[key];
          if (
            urlData &&
            typeof urlData === 'object' &&
            typeof urlData.title === 'string' &&
            typeof urlData.url === 'string' &&
            urlData.url === currentUrl
          ) {
            // Found match by URL, update the record with current tabId
            if (urlData.tabId !== tabId) {
              // Create new record with new tabId and update timestamp
              const newStorageKey = `customTitle_${tabId}`;
              await chrome.storage.local.set({
                [newStorageKey]: {
                  tabId: tabId,
                  url: currentUrl,
                  title: urlData.title,
                  updatedAt: Date.now(), // Update timestamp to mark as latest
                },
              });
              // Remove old record if it's different
              if (key !== newStorageKey) {
                await chrome.storage.local.remove(key);
              }
            }
            return urlData.title;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[CustomTitle] Failed to load custom title:', error);
      return null;
    }
  }

  /**
   * Override document.title getter and setter
   * @param {string} title
   */
  function overrideDocumentTitle(title) {
    if (!title) {
      return;
    }

    // Override document.title setter
    let currentTitleValue = title;
    Object.defineProperty(document, 'title', {
      get: function () {
        return currentTitleValue;
      },
      set: function (newTitle) {
        // Prevent title changes - always use custom title
        currentTitleValue = title;
        updateTitleElement(title);
      },
      configurable: true,
      enumerable: true,
    });

    // Set initial title
    currentTitleValue = title;
    updateTitleElement(title);
  }

  /**
   * Update the title element text content
   * @param {string} title
   */
  function updateTitleElement(title) {
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleElement.textContent = title;
    } else {
      // If title element doesn't exist, create it
      const newTitleElement = document.createElement('title');
      newTitleElement.textContent = title;
      if (document.head) {
        document.head.appendChild(newTitleElement);
      } else {
        // Wait for head to be available
        const observer = new MutationObserver(() => {
          if (document.head) {
            document.head.appendChild(newTitleElement);
            observer.disconnect();
          }
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  /**
   * Set up mutation observer to watch for title element changes
   * @param {string} title
   */
  function observeTitleElement(title) {
    // Clean up existing observer
    if (titleObserver) {
      titleObserver.disconnect();
      titleObserver = null;
    }

    // Create new observer
    titleObserver = new MutationObserver(() => {
      const titleElement = document.querySelector('title');
      if (titleElement && titleElement.textContent !== title) {
        titleElement.textContent = title;
      }
    });

    // Observe title element if it exists
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    } else {
      // If title element doesn't exist yet, observe document head
      if (document.head) {
        titleObserver.observe(document.head, {
          childList: true,
          subtree: true,
        });
      } else {
        // Wait for head to be available
        const headObserver = new MutationObserver(() => {
          if (document.head) {
            observeTitleElement(title);
            headObserver.disconnect();
          }
        });
        headObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  /**
   * Initialize the custom title override
   */
  async function initialize() {
    if (isInitialized) {
      return;
    }

    try {
      // Get current tab ID
      currentTabId = await getTabId();
      if (!currentTabId) {
        console.warn('[CustomTitle] Could not get tab ID, aborting');
        return;
      }

      // Load custom title from storage
      customTitle = await loadCustomTitle(currentTabId);
      if (!customTitle) {
        // No custom title set for this tab, abort
        return;
      }

      // Override document.title
      overrideDocumentTitle(customTitle);

      // Set up mutation observer
      observeTitleElement(customTitle);

      isInitialized = true;
      console.log('[CustomTitle] Custom title override initialized:', customTitle);
    } catch (error) {
      console.error('[CustomTitle] Failed to initialize:', error);
    }
  }

  /**
   * Handle storage changes
   */
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }

      // Check if custom title for this tab changed
      const storageKey = currentTabId ? `customTitle_${currentTabId}` : null;
      if (!storageKey || !Object.prototype.hasOwnProperty.call(changes, storageKey)) {
        return;
      }

      const change = changes[storageKey];
      const newTitle =
        change.newValue &&
        typeof change.newValue === 'object' &&
        typeof change.newValue.title === 'string'
          ? change.newValue.title
          : null;

      if (newTitle) {
        customTitle = newTitle;
        overrideDocumentTitle(newTitle);
        observeTitleElement(newTitle);
      } else {
        // Custom title was removed, stop overriding
        if (titleObserver) {
          titleObserver.disconnect();
          titleObserver = null;
        }
        isInitialized = false;
        customTitle = null;
      }
    });
  }

  /**
   * Handle SPA navigation (pushState/replaceState)
   */
  function handleSPANavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      // Re-initialize to check for custom title updates
      if (currentTabId) {
        void loadCustomTitle(currentTabId).then((title) => {
          if (title) {
            customTitle = title;
            overrideDocumentTitle(title);
            observeTitleElement(title);
          } else if (customTitle) {
            // Title was removed, stop overriding
            if (titleObserver) {
              titleObserver.disconnect();
              titleObserver = null;
            }
            isInitialized = false;
            customTitle = null;
          }
        });
      }
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      // Re-initialize to check for custom title updates
      if (currentTabId) {
        void loadCustomTitle(currentTabId).then((title) => {
          if (title) {
            customTitle = title;
            overrideDocumentTitle(title);
            observeTitleElement(title);
          } else if (customTitle) {
            // Title was removed, stop overriding
            if (titleObserver) {
              titleObserver.disconnect();
              titleObserver = null;
            }
            isInitialized = false;
            customTitle = null;
          }
        });
      }
    };

    window.addEventListener('popstate', () => {
      // Re-initialize to check for custom title updates
      if (currentTabId) {
        void loadCustomTitle(currentTabId).then((title) => {
          if (title) {
            customTitle = title;
            overrideDocumentTitle(title);
            observeTitleElement(title);
          } else if (customTitle) {
            // Title was removed, stop overriding
            if (titleObserver) {
              titleObserver.disconnect();
              titleObserver = null;
            }
            isInitialized = false;
            customTitle = null;
          }
        });
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void initialize();
      setupStorageListener();
      handleSPANavigation();
    });
  } else {
    void initialize();
    setupStorageListener();
    handleSPANavigation();
  }

  // Also initialize on page load (for full page reloads)
  window.addEventListener('load', () => {
    if (!isInitialized) {
      void initialize();
    }
  });
})();

