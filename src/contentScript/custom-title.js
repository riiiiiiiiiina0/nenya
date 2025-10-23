(function () {
  'use strict';

  let fixedTitle = '';
  let currentTabId = null;
  let lastKnownUrl = window.location.href;

  /**
   * Get current tab ID from background script
   * @returns {Promise<number|null>}
   */
  async function getCurrentTabId() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getCurrentTabId' });
      return response && typeof response.tabId === 'number' ? response.tabId : null;
    } catch (error) {
      console.log('Could not get current tab ID:', error);
      return null;
    }
  }

  /**
   * Update the stored custom title record with new URL
   * @param {string} newUrl - The new URL
   * @returns {Promise<void>}
   */
  async function updateStoredRecordWithNewUrl(newUrl) {
    if (!currentTabId) {
      return;
    }

    try {
      const storageKey = `customTitle_${currentTabId}`;
      const result = await chrome.storage.local.get([storageKey]);
      const storedData = result[storageKey];
      
      if (storedData) {
        // Update the URL in the stored record
        const updatedData = {
          ...storedData,
          url: newUrl,
          updatedAt: Date.now()
        };
        
        await chrome.storage.local.set({ [storageKey]: updatedData });
        console.log('Updated custom title record with new URL:', newUrl);
      }
    } catch (error) {
      console.log('Could not update stored record with new URL:', error);
    }
  }

  /**
   * Monitor URL changes and update storage
   * @param {string} newUrl - The new URL
   */
  function handleUrlChange(newUrl) {
    console.log('URL changed from', lastKnownUrl, 'to', newUrl);
    if (newUrl !== lastKnownUrl) {
      lastKnownUrl = newUrl;
      void updateStoredRecordWithNewUrl(newUrl);
    }
  }

  /**
   * Force check for URL changes (for debugging and fallback)
   */
  function forceUrlCheck() {
    const currentUrl = window.location.href;
    console.log('Force checking URL:', currentUrl, 'vs last known:', lastKnownUrl);
    if (currentUrl !== lastKnownUrl) {
      console.log('Force check detected URL change');
      handleUrlChange(currentUrl);
    }
  }

  /**
   * Set up URL change monitoring
   */
  function setupUrlMonitoring() {
    // Store original methods before any SPA framework can override them
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const originalGo = history.go;
    const originalBack = history.back;
    const originalForward = history.forward;
    
    // Override history methods to catch SPA navigation
    history.pushState = function(...args) {
      console.log('pushState called with args:', args);
      originalPushState.apply(history, args);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    };
    
    history.replaceState = function(...args) {
      console.log('replaceState called with args:', args);
      originalReplaceState.apply(history, args);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    };
    
    history.go = function(...args) {
      console.log('history.go called with args:', args);
      originalGo.apply(history, args);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    };
    
    history.back = function(...args) {
      console.log('history.back called');
      originalBack.apply(history, args);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    };
    
    history.forward = function(...args) {
      console.log('history.forward called');
      originalForward.apply(history, args);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    };
    
    // Monitor for popstate events (back/forward navigation)
    window.addEventListener('popstate', (event) => {
      console.log('popstate event triggered', event);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    });
    
    // Monitor for hash changes
    window.addEventListener('hashchange', (event) => {
      console.log('hashchange event triggered', event);
      setTimeout(() => handleUrlChange(window.location.href), 10);
    });
    
    // Additional monitoring for React Router and other SPAs
    // Monitor for DOM changes that might indicate navigation
    const observer = new MutationObserver((mutations) => {
      // Check if URL changed during DOM mutations (common in SPAs)
      const currentUrl = window.location.href;
      if (currentUrl !== lastKnownUrl) {
        console.log('URL change detected via DOM mutation');
        handleUrlChange(currentUrl);
      }
    });
    
    // Start observing DOM changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src']
    });
    
    // Monitor for React Router specific events if available
    if (window['React'] && window['React'].version) {
      console.log('React detected, setting up React-specific monitoring');
      
      // Try to hook into React Router if available
      const originalAddEventListener = window.addEventListener;
      window.addEventListener = function(type, listener, options) {
        if (type === 'popstate' || type === 'hashchange') {
          console.log('Event listener added for:', type);
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    }

    // Additional React Router detection
    // Monitor for common React Router patterns
    const checkForReactRouter = () => {
      // Check if React Router is present
      if (window['__REACT_ROUTER__'] || window['ReactRouter'] || document.querySelector('[data-react-router]')) {
        console.log('React Router detected, adding additional monitoring');
        
        // Monitor for route changes by watching for common React Router patterns
        const routeObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
              // Check if URL changed during React Router navigation
              setTimeout(forceUrlCheck, 50);
            }
          });
        });
        
        // Observe the main content area for React Router changes
        const mainContent = document.querySelector('main') || 
                          document.querySelector('[role="main"]') || 
                          document.querySelector('#root') || 
                          document.querySelector('#app') ||
                          document.body;
        
        if (mainContent) {
          routeObserver.observe(mainContent, {
            childList: true,
            subtree: true,
            attributes: true
          });
        }
      }
    };
    
    // Check for React Router after a delay to allow it to initialize
    setTimeout(checkForReactRouter, 1000);

    console.log('URL monitoring setup complete', lastKnownUrl);
  }

  /**
   * Check for stored custom title for this tab and apply it
   * @returns {Promise<void>}
   */
  async function checkStoredCustomTitle() {
    try {
      // Get current tab ID
      currentTabId = await getCurrentTabId();

      // First, check for stored custom title by tab ID (existing behavior)
      let storedTitleData = undefined;
      if (typeof currentTabId === 'number') {
        const result = await chrome.storage.local.get([`customTitle_${currentTabId}`]);
        storedTitleData = result[`customTitle_${currentTabId}`];
      }
      
      // Handle both old string format and new object format for backward compatibility
      let customTitle = '';
      if (typeof storedTitleData === 'string' && storedTitleData.trim() !== '') {
        // Old format: just a string
        customTitle = storedTitleData.trim();
      } else if (storedTitleData && typeof storedTitleData === 'object' && storedTitleData.title && typeof storedTitleData.title === 'string' && storedTitleData.title.trim() !== '') {
        // New format: object with tabId, url, and title
        customTitle = storedTitleData.title.trim();
      }
      
      if (customTitle) {
        overrideTitle(customTitle);
        setTitleElementMultipleTimes();
        return; // Found by tab ID, no need to search by URL
      }

      // If no custom title found by tab ID, search by URL
      await findAndApplyCustomTitleByUrl();
    } catch (error) {
      console.log('Could not check for stored custom title:', error);
    }
  }

  /**
   * Find custom title by URL and apply it, updating the record with current tab ID
   * @returns {Promise<void>}
   */
  async function findAndApplyCustomTitleByUrl() {
    try {
      const currentUrl = window.location.href;
      console.log('Searching for custom title by URL:', currentUrl);
      
      // Get all storage items
      const allStorage = await chrome.storage.local.get(null);
      
      // Look for records with matching URL
      for (const [key, value] of Object.entries(allStorage)) {
        if (key.startsWith('customTitle_') && value && typeof value === 'object') {
          // Check if this record has a URL that matches current page
          if (value.url && value.url === currentUrl && value.title && typeof value.title === 'string' && value.title.trim() !== '') {
            console.log('Found matching custom title by URL:', value.title);
            
            // Apply the custom title
            overrideTitle(value.title.trim());
            setTitleElementMultipleTimes();
            
            // Update the record with current tab ID if available
            const updatedRecord = {
              ...value,
              updatedAt: Date.now()
            };
            if (typeof currentTabId === 'number') {
              updatedRecord.tabId = currentTabId;
            }
            await chrome.storage.local.set({ [key]: updatedRecord });
            console.log('Updated custom title record with current tab ID:', currentTabId);
            
            return; // Found and applied, exit
          }
        }
      }
      
      console.log('No matching custom title found for URL:', currentUrl);
    } catch (error) {
      console.log('Could not find custom title by URL:', error);
    }
  }

  function overrideTitle(title) {
    fixedTitle = title;

    // Override document.title property
    try {
      Object.defineProperty(document, 'title', {
        get: function () {
          return fixedTitle;
        },
        set: function () {
          // Ignore all attempts to set the title
          return;
        },
        configurable: false,
      });
    } catch (e) {
      console.log('Could not override title property:', e);
    }
  }

  // Also override the title element directly
  function setTitleElement() {
    if (!fixedTitle) {
      return;
    }

    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleElement.textContent = fixedTitle;
    } else {
      // Create title element if it doesn't exist
      const title = document.createElement('title');
      title.textContent = fixedTitle;
      const head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        head.appendChild(title);
      }
    }
  }

  function setTitleElementMultipleTimes() {
    if (!fixedTitle) {
      return;
    }

    const delays = [0, 100, 500, 1000, 2000, 3000];
    for (const delay of delays) {
      setTimeout(setTitleElement, delay);
    }
  }

  // Set initial title
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setTitleElementMultipleTimes);
  } else {
    setTitleElementMultipleTimes();
  }

  // Use MutationObserver to prevent title changes via DOM manipulation
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'childList') {
        const titleElement = document.querySelector('title');
        if (
          fixedTitle &&
          titleElement &&
          titleElement.textContent !== fixedTitle
        ) {
          titleElement.textContent = fixedTitle;
        }
      }
    });
  });

  // Start observing
  observer.observe(document.head || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Listen for messages from the popup to rename the tab
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'renameTab' && request.title) {
      overrideTitle(request.title);
      setTitleElementMultipleTimes();
      sendResponse({ success: true });
      return true;
    }
    if (request.type === 'promptRenameTab') {
      try {
        const currentTitle = document.title || '';
        const next = window.prompt('Enter custom title for this tab:', currentTitle);
        if (next && next.trim() !== '') {
          overrideTitle(next.trim());
          setTitleElementMultipleTimes();
          // Save to storage asynchronously without blocking
          void (async () => {
            try {
              if (!currentTabId) {
                currentTabId = await getCurrentTabId();
              }
              if (currentTabId) {
                const storageKey = `customTitle_${currentTabId}`;
                await chrome.storage.local.set({
                  [storageKey]: {
                    tabId: currentTabId,
                    url: window.location.href,
                    title: next.trim(),
                    updatedAt: Date.now()
                  }
                });
              }
            } catch (e) {
              // ignore storage errors in prompt path
            }
          })();
        }
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      return true;
    }
  });

  // React to storage updates to apply titles immediately when saved elsewhere
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    try {
      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith('customTitle_') || !change || !('newValue' in change)) {
          continue;
        }
        const newValue = change.newValue;
        if (!newValue) {
          continue;
        }

        // Determine if this change is relevant to this page
        let isRelevant = false;
        if (typeof currentTabId === 'number' && key === `customTitle_${currentTabId}`) {
          isRelevant = true;
        } else if (newValue && typeof newValue === 'object' && typeof newValue.url === 'string') {
          isRelevant = newValue.url === window.location.href;
        }
        if (!isRelevant) {
          continue;
        }

        // Extract title
        let newTitle = '';
        if (typeof newValue === 'string' && newValue.trim() !== '') {
          newTitle = newValue.trim();
        } else if (
          newValue &&
          typeof newValue === 'object' &&
          typeof newValue.title === 'string' &&
          newValue.title.trim() !== ''
        ) {
          newTitle = newValue.title.trim();
        }

        if (newTitle) {
          overrideTitle(newTitle);
          setTitleElementMultipleTimes();
        }
      }
    } catch (e) {
      // ignore storage observer errors
    }
  });

  // Check for stored custom title on page load
  void checkStoredCustomTitle();
  
  // Set up URL monitoring
  setupUrlMonitoring();
  
  // Expose debugging functions globally for manual testing
  window['debugCustomTitle'] = {
    forceUrlCheck,
    handleUrlChange,
    getCurrentUrl: () => window.location.href,
    getLastKnownUrl: () => lastKnownUrl,
    getTabId: () => currentTabId
  };
})();
