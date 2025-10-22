(function () {
  'use strict';

  let fixedTitle = '';

  /**
   * Check for stored custom title for this tab and apply it
   * @returns {Promise<void>}
   */
  async function checkStoredCustomTitle() {
    try {
      // Request current tab ID from background script
      const response = await chrome.runtime.sendMessage({ type: 'getCurrentTabId' });
      if (!response || typeof response.tabId !== 'number') {
        return;
      }

      // Check for stored custom title
      const result = await chrome.storage.local.get([`customTitle_${response.tabId}`]);
      const storedTitle = result[`customTitle_${response.tabId}`];
      
      if (storedTitle && typeof storedTitle === 'string' && storedTitle.trim() !== '') {
        overrideTitle(storedTitle.trim());
        setTitleElementMultipleTimes();
      }
    } catch (error) {
      console.log('Could not check for stored custom title:', error);
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
    }
  });

  // Check for stored custom title on page load
  void checkStoredCustomTitle();
})();
