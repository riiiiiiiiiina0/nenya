/* global chrome */

/**
 * Block Elements Content Script
 * Hides elements based on stored blocking rules that match the current page URL
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'blockElementRules';
  const STYLE_ID = 'nenya-block-elements-style';
  const CHECK_INTERVAL = 300; // ms - debounce interval for mutations

  /**
   * @typedef {Object} BlockElementRule
   * @property {string} id
   * @property {string} urlPattern
   * @property {string[]} selectors
   * @property {boolean | undefined} disabled
   * @property {string | undefined} createdAt
   * @property {string | undefined} updatedAt
   */

  /** @type {BlockElementRule[]} */
  let cachedRules = [];
  let styleElement = null;
  let mutationObserver = null;
  let debounceTimer = null;
  let lastAppliedSelectors = '';

  /**
   * Get the current page URL
   * @returns {string}
   */
  function getCurrentUrl() {
    return window.location.href;
  }

  /**
   * Check if a URL pattern matches the current page URL
   * @param {string} pattern
   * @param {string} url
   * @returns {boolean}
   */
  function matchesPattern(pattern, url) {
    try {
      const urlPattern = new URLPattern(pattern);
      return urlPattern.test(url);
    } catch (error) {
      console.warn('[block-elements] Invalid URL pattern:', pattern, error);
      return false;
    }
  }

  /**
   * Get all selectors that match the current page URL
   * @param {string} url
   * @returns {string[]}
   */
  function getMatchingSelectors(url) {
    const selectors = [];

    for (const rule of cachedRules) {
      if (!rule.disabled && matchesPattern(rule.urlPattern, url)) {
        selectors.push(...rule.selectors);
      }
    }

    return selectors;
  }

  /**
   * Generate high-specificity CSS selector
   * Adds specificity boosters to ensure our rules override any site CSS
   * @param {string} selector
   * @returns {string}
   */
  function boostSelectorSpecificity(selector) {
    // Add multiple :not(#\:) to boost specificity without changing selection
    // The ID #\: will never match (invalid ID), so :not(#\:) is always true
    // Each :not() with an ID selector adds (1,0,0) to specificity
    return `${selector}:not(#\\:):not(#\\:):not(#\\:)`;
  }

  /**
   * Apply blocking CSS to hide elements
   * @returns {void}
   */
  function applyBlockingCss() {
    const url = getCurrentUrl();
    const selectors = getMatchingSelectors(url);

    // Convert selectors array to a unique string for comparison
    const selectorsString = selectors.sort().join(',');

    // Skip if nothing changed
    if (selectorsString === lastAppliedSelectors) {
      return;
    }

    lastAppliedSelectors = selectorsString;

    // Remove existing style element if present
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
      styleElement = null;
    }

    // Create new style element if we have selectors to hide
    if (selectors.length > 0) {
      // Boost specificity for each selector to ensure maximum priority
      const boostedSelectors = selectors.map((s) =>
        boostSelectorSpecificity(s),
      );

      styleElement = document.createElement('style');
      styleElement.id = STYLE_ID;

      // Use multiple hiding techniques to ensure elements are hidden
      // even if display or visibility are overridden
      styleElement.textContent = `${boostedSelectors.join(', ')} {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  max-height: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  position: absolute !important;
  clip: rect(0, 0, 0, 0) !important;
  pointer-events: none !important;
  user-select: none !important;
}`;

      // Insert style element as early as possible
      if (document.head) {
        document.head.appendChild(styleElement);
      } else if (document.documentElement) {
        document.documentElement.appendChild(styleElement);
      }
    }
  }

  /**
   * Debounced version of applyBlockingCss
   * @returns {void}
   */
  function applyBlockingCssDebounced() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      applyBlockingCss();
      debounceTimer = null;
    }, CHECK_INTERVAL);
  }

  /**
   * Load rules from storage
   * @returns {Promise<void>}
   */
  async function loadRules() {
    if (!chrome?.storage?.sync) {
      cachedRules = [];
      return;
    }

    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const rules = Array.isArray(stored?.[STORAGE_KEY])
        ? stored[STORAGE_KEY]
        : [];

      // Validate and sanitize rules
      cachedRules = rules.filter((rule) => {
        return (
          rule &&
          typeof rule === 'object' &&
          typeof rule.urlPattern === 'string' &&
          rule.urlPattern.trim() &&
          Array.isArray(rule.selectors) &&
          rule.selectors.length > 0
        );
      });
    } catch (error) {
      console.warn('[block-elements] Failed to load rules:', error);
      cachedRules = [];
    }
  }

  /**
   * Setup mutation observer to detect DOM changes and SPA navigation
   * @returns {void}
   */
  function setupMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver(() => {
      // Debounce to avoid excessive calls
      applyBlockingCssDebounced();
    });

    // Observe the entire document for changes
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Setup listeners for URL changes (SPA navigation)
   * @returns {void}
   */
  function setupUrlChangeListeners() {
    let lastUrl = getCurrentUrl();

    // Listen for history changes (pushState, replaceState)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      const newUrl = getCurrentUrl();
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        applyBlockingCss();
      }
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      const newUrl = getCurrentUrl();
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        applyBlockingCss();
      }
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', () => {
      const newUrl = getCurrentUrl();
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        applyBlockingCss();
      }
    });

    // Listen for hashchange
    window.addEventListener('hashchange', () => {
      const newUrl = getCurrentUrl();
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        applyBlockingCss();
      }
    });
  }

  /**
   * Listen for storage changes
   * @returns {void}
   */
  function setupStorageListener() {
    if (!chrome?.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        return;
      }

      void loadRules().then(() => {
        applyBlockingCss();
      });
    });
  }

  /**
   * Initialize the blocking system
   * @returns {Promise<void>}
   */
  async function init() {
    // Load rules from storage
    await loadRules();

    // Apply blocking CSS immediately
    applyBlockingCss();

    // Setup listeners
    setupUrlChangeListeners();
    setupMutationObserver();
    setupStorageListener();
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
})();
