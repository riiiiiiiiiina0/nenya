/**
 * Content script injected into iframes to monitor URL and title changes
 * Runs in each iframe and reports changes to the parent split.html
 */

(function () {
  'use strict';

  // Only run if we're in an iframe
  if (window.self === window.top) {
    return;
  }

  // Prevent double-injection
  // @ts-ignore - Custom property to prevent double-injection
  if (window.__nenyaIframeMonitorInstalled) {
    return;
  }
  // @ts-ignore - Custom property to prevent double-injection
  window.__nenyaIframeMonitorInstalled = true;

  let lastUrl = window.location.href;
  let lastTitle = '';

  /**
   * Send update to parent window
   */
  function sendUpdate() {
    const currentUrl = window.location.href;
    // Get title, but prefer a non-empty title over falling back to URL
    let currentTitle = document.title;
    if (!currentTitle || currentTitle.trim() === '') {
      // If title is empty, try to extract from meta tags
      const ogTitle = /** @type {HTMLMetaElement|null} */ (
        document.querySelector('meta[property="og:title"]')
      );
      if (ogTitle && ogTitle.content) {
        currentTitle = ogTitle.content;
      } else {
        // Only use URL as last resort
        currentTitle = currentUrl;
      }
    }

    // Only send if something changed
    if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
      console.log('sendUpdate', currentUrl, currentTitle);
      lastUrl = currentUrl;
      lastTitle = currentTitle;

      // Send message to parent window
      window.parent.postMessage(
        {
          type: 'iframe-update',
          url: currentUrl,
          title: currentTitle,
          frameName: window.name,
        },
        '*',
      );
    }
  }

  /**
   * Debounce function to avoid excessive updates
   * @param {Function} func
   * @param {number} wait
   * @returns {Function}
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const debouncedUpdate = debounce(sendUpdate, 100);

  // 1. Monitor page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendUpdate);
  } else {
    // Already loaded
    sendUpdate();
  }

  // Also send on full load
  window.addEventListener('load', sendUpdate);

  // 2. Monitor SPA navigation
  // History API (pushState, replaceState)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    sendUpdate();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    sendUpdate();
  };

  // Handle popstate (back/forward navigation)
  window.addEventListener('popstate', sendUpdate);

  // Handle hash changes
  window.addEventListener('hashchange', sendUpdate);

  // 3. Monitor DOM mutations for title changes
  const titleObserver = new MutationObserver(() => {
    const newTitle = document.title;
    if (newTitle !== lastTitle) {
      debouncedUpdate();
    }
  });

  // Observe entire document for any mutations
  titleObserver.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Send initial update with retries to catch the title as it loads
  let retryCount = 0;
  const maxRetries = 5;
  const retryDelays = [50, 200, 500, 1000, 2000];

  function sendInitialUpdate() {
    const hadTitle = document.title && document.title.trim() !== '';
    sendUpdate();

    // If we still don't have a title and haven't exhausted retries, try again
    if (!hadTitle && retryCount < maxRetries) {
      setTimeout(sendInitialUpdate, retryDelays[retryCount]);
      retryCount++;
    }
  }

  // Start initial update sequence
  setTimeout(sendInitialUpdate, 50);
})();
