(function () {
  'use strict';

  /**
   * @typedef {Object} DarkModeRule
   * @property {string} pattern
   * @property {boolean} enabled
   */

  /**
   * @typedef {Object} DarkReader
   * @property {function(): boolean} isEnabled
   * @property {function(Object): void} enable
   * @property {function(): void} disable
   */

  /**
   * @typedef {Window & {DarkReader: DarkReader}} WindowWithDarkReader
   */

  /**
   * @type {WindowWithDarkReader}
   */
  const windowWithDarkReader = /** @type {WindowWithDarkReader} */ (/** @type {unknown} */ (window));

  /**
   * Check if OS theme is dark
   * @returns {boolean}
   */
  const isOSThemeDark = () => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  /**
   * Get dark mode rules from storage
   * @returns {Promise<Array<DarkModeRule>>}
   */
  const getdarkModeRules = async () => {
    const { darkModeRules } = await chrome.storage.sync.get('darkModeRules');
    return darkModeRules || [];
  };

  /**
   * Check if current URL matches any enabled dark mode rule
   * @param {Array<DarkModeRule>} rules - Array of dark mode rules
   * @returns {boolean}
   */
  const hasMatchingRule = (rules) => {
    const enabledRules = rules.filter(rule => rule.enabled);
    if (enabledRules.length === 0) {
      return false;
    }

    const currentUrl = window.location.href;

    for (const rule of enabledRules) {
      try {
        // @ts-ignore - URLPattern is a browser API
        const pattern = new URLPattern(rule.pattern);
        if (pattern.test(currentUrl)) {
          return true;
        }
      } catch (error) {
        console.error(`Invalid URL pattern: ${rule.pattern}`, error);
      }
    }

    return false;
  };

  /**
   * Enable or disable Dark Reader based on OS theme and URL rules
   */
  const updateDarkReader = async () => {
    const rules = await getdarkModeRules();
    const shouldEnable = isOSThemeDark() && hasMatchingRule(rules);

    if (shouldEnable) {
      if (!windowWithDarkReader.DarkReader.isEnabled()) {
        windowWithDarkReader.DarkReader.enable({
          brightness: 100,
          contrast: 90,
          sepia: 10
        });
      }
    } else {
      if (windowWithDarkReader.DarkReader.isEnabled()) {
        windowWithDarkReader.DarkReader.disable();
      }
    }
  };

  /**
   * Initialize dark mode functionality
   */
  const initDarkMode = async () => {
    // Initial check on page load
    await updateDarkReader();

    // Set up media query listener for OS theme changes
    if (window.matchMedia) {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      // Use addEventListener if supported, otherwise use addListener
      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener('change', () => {
          void updateDarkReader();
        });
      } else if (darkModeMediaQuery.addListener) {
        darkModeMediaQuery.addListener(() => {
          void updateDarkReader();
        });
      }
    }
  };

  initDarkMode();
})();
