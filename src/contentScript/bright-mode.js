(function () {
  'use strict';

  /**
   * @typedef {Object} BrightModePattern
   * @property {string} id
   * @property {string} pattern
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  const WHITELIST_STORAGE_KEY = 'brightModeWhitelist';
  const BLACKLIST_STORAGE_KEY = 'brightModeBlacklist';
  const BRIGHT_MODE_STYLE_ID = 'nenya-bright-mode-styles';

  /**
   * Bright Mode Content Script
   * Enforces bright mode styles on whitelist pages when OS theme is light mode
   */
  class BrightModeEnforcer {
    constructor() {
      this.whitelistPatterns = [];
      this.blacklistPatterns = [];
      this.isBrightModeActive = false;
      this.observer = null;
      this.mediaQuery = null;

      this.init();
    }

    /**
     * Initialize the bright mode enforcer
     */
    async init() {
      try {
        // Load patterns from storage
        await this.loadPatterns();

        // Check if current page should have bright mode applied
        this.checkAndApplyBrightMode();

        // Set up media query listener for OS theme changes
        this.setupMediaQueryListener();

        // Set up storage change listener
        this.setupStorageListener();

        // Set up DOM mutation observer
        this.setupMutationObserver();

        // Set up navigation event listeners
        this.setupNavigationListeners();

        console.log('[BrightMode] Initialized successfully');
      } catch (error) {
        console.error('[BrightMode] Failed to initialize:', error);
      }
    }

    /**
     * Load whitelist and blacklist patterns from storage
     */
    async loadPatterns() {
      if (!chrome?.storage?.sync) {
        console.warn('[BrightMode] Chrome storage not available');
        return;
      }

      try {
        const result = await chrome.storage.sync.get([
          WHITELIST_STORAGE_KEY,
          BLACKLIST_STORAGE_KEY,
        ]);

        this.whitelistPatterns = result[WHITELIST_STORAGE_KEY] || [];
        this.blacklistPatterns = result[BLACKLIST_STORAGE_KEY] || [];

        console.log('[BrightMode] Loaded patterns:', {
          whitelist: this.whitelistPatterns.length,
          blacklist: this.blacklistPatterns.length,
        });
      } catch (error) {
        console.error('[BrightMode] Failed to load patterns:', error);
      }
    }

    /**
     * Check if current URL matches any pattern in the given list
     * @param {BrightModePattern[]} patterns
     * @param {string} url
     * @returns {boolean}
     */
    matchesPattern(patterns, url) {
      if (!patterns || patterns.length === 0) {
        return false;
      }

      try {
        const currentUrl = new URL(url);

        return patterns.some((pattern) => {
          try {
            // Handle different pattern formats
            if (pattern.pattern.includes('://')) {
              // Full URL pattern
              const urlPattern = new URLPattern(pattern.pattern);
              return urlPattern.test(currentUrl);
            } else if (pattern.pattern.startsWith('/')) {
              // Pathname pattern
              const urlPattern = new URLPattern({ pathname: pattern.pattern });
              return urlPattern.test(currentUrl);
            } else if (
              pattern.pattern.includes('*') ||
              pattern.pattern.includes(':')
            ) {
              // Pattern with wildcards or named groups - treat as pathname
              const urlPattern = new URLPattern({
                pathname: '/' + pattern.pattern,
              });
              return urlPattern.test(currentUrl);
            } else {
              // Domain or hostname pattern
              const urlPattern = new URLPattern({ hostname: pattern.pattern });
              return urlPattern.test(currentUrl);
            }
          } catch (error) {
            console.warn(
              '[BrightMode] Invalid pattern:',
              pattern.pattern,
              error,
            );
            return false;
          }
        });
      } catch (error) {
        console.warn('[BrightMode] Failed to parse URL:', url, error);
        return false;
      }
    }

    /**
     * Check if current page should have bright mode applied
     */
    checkAndApplyBrightMode() {
      const currentUrl = window.location.href;
      const isInWhitelist = this.matchesPattern(
        this.whitelistPatterns,
        currentUrl,
      );
      const isInBlacklist = this.matchesPattern(
        this.blacklistPatterns,
        currentUrl,
      );
      const isOSLightMode = window.matchMedia(
        '(prefers-color-scheme: light)',
      ).matches;

      console.log('[BrightMode] Checking conditions:', {
        currentUrl,
        isInWhitelist,
        isInBlacklist,
        isOSLightMode,
      });

      // Apply bright mode if:
      // 1. OS is in light mode AND
      // 2. Page is in whitelist AND
      // 3. Page is NOT in blacklist
      const shouldApplyBrightMode =
        isOSLightMode && isInWhitelist && !isInBlacklist;

      if (shouldApplyBrightMode && !this.isBrightModeActive) {
        this.applyBrightMode();
      } else if (!shouldApplyBrightMode && this.isBrightModeActive) {
        this.removeBrightMode();
      }
    }

    /**
     * Apply bright mode styles to the page
     */
    applyBrightMode() {
      if (this.isBrightModeActive) {
        return;
      }

      // Create and inject the bright mode styles
      const style = document.createElement('style');
      style.id = BRIGHT_MODE_STYLE_ID;
      style.textContent = `
      @media (prefers-color-scheme: light) {
        html, img, video, canvas, [style*="background-image"], iframe {
          filter: invert(1) hue-rotate(180deg);
        }
      }
    `;

      document.head.appendChild(style);
      this.isBrightModeActive = true;

      console.log('[BrightMode] Applied bright mode styles');
    }

    /**
     * Remove bright mode styles from the page
     */
    removeBrightMode() {
      if (!this.isBrightModeActive) {
        return;
      }

      const style = document.getElementById(BRIGHT_MODE_STYLE_ID);
      if (style) {
        style.remove();
      }

      this.isBrightModeActive = false;

      console.log('[BrightMode] Removed bright mode styles');
    }

    /**
     * Set up media query listener for OS theme changes
     */
    setupMediaQueryListener() {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

      this.handleThemeChange = () => {
        console.log('[BrightMode] OS theme changed');
        this.checkAndApplyBrightMode();
      };

      // Modern browsers
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', this.handleThemeChange);
      } else {
        // Fallback for older browsers
        this.mediaQuery.addListener(this.handleThemeChange);
      }
    }

    /**
     * Set up storage change listener for pattern updates
     */
    setupStorageListener() {
      if (!chrome?.storage?.onChanged) {
        return;
      }

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') {
          return;
        }

        const whitelistChanged = changes[WHITELIST_STORAGE_KEY];
        const blacklistChanged = changes[BLACKLIST_STORAGE_KEY];

        if (whitelistChanged || blacklistChanged) {
          console.log('[BrightMode] Patterns updated, reloading...');
          this.loadPatterns().then(() => {
            this.checkAndApplyBrightMode();
          });
        }
      });
    }

    /**
     * Set up DOM mutation observer for dynamic content
     */
    setupMutationObserver() {
      if (!window.MutationObserver) {
        console.warn('[BrightMode] MutationObserver not supported');
        return;
      }

      this.observer = new MutationObserver((mutations) => {
        if (!this.isBrightModeActive) {
          return;
        }

        let shouldReapply = false;

        mutations.forEach((mutation) => {
          // Check for added nodes with background images
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = /** @type {Element} */ (node);

                // Check if the element itself has background image
                if (this.hasBackgroundImage(element)) {
                  shouldReapply = true;
                }

                // Check if any child elements have background images
                const elementsWithBg = element.querySelectorAll(
                  '[style*="background-image"]',
                );
                if (elementsWithBg.length > 0) {
                  shouldReapply = true;
                }
              }
            });
          }

          // Check for attribute changes that might add background images
          if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'style' &&
            mutation.target.nodeType === Node.ELEMENT_NODE
          ) {
            const element = /** @type {Element} */ (mutation.target);
            if (this.hasBackgroundImage(element)) {
              shouldReapply = true;
            }
          }
        });

        if (shouldReapply) {
          console.log(
            '[BrightMode] DOM changes detected, reapplying styles...',
          );
          // Small delay to ensure DOM is stable
          setTimeout(() => {
            this.reapplyBrightModeStyles();
          }, 100);
        }
      });

      // Start observing
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });
    }

    /**
     * Set up navigation event listeners for back/forward buttons
     */
    setupNavigationListeners() {
      // Create bound event handlers for proper cleanup
      this.handleVisibilityChange = () => {
        if (!document.hidden) {
          console.log(
            '[BrightMode] Page became visible, checking bright mode...',
          );
          // Small delay to ensure page is fully loaded
          setTimeout(() => {
            this.checkAndApplyBrightMode();
          }, 100);
        }
      };

      this.handlePageShow = (event) => {
        console.log('[BrightMode] Page show event, checking bright mode...', {
          persisted: event.persisted,
        });
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          this.checkAndApplyBrightMode();
        }, 100);
      };

      this.handlePopState = () => {
        console.log('[BrightMode] Popstate event, checking bright mode...');
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          this.checkAndApplyBrightMode();
        }, 100);
      };

      this.handleHashChange = () => {
        console.log('[BrightMode] Hash change event, checking bright mode...');
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          this.checkAndApplyBrightMode();
        }, 100);
      };

      // Add event listeners
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange,
      );
      window.addEventListener('pageshow', this.handlePageShow);
      window.addEventListener('popstate', this.handlePopState);
      window.addEventListener('hashchange', this.handleHashChange);
    }

    /**
     * Check if an element has a background image
     * @param {Element} element
     * @returns {boolean}
     */
    hasBackgroundImage(element) {
      const style = window.getComputedStyle(element);
      const backgroundImage = style.backgroundImage;
      return Boolean(
        backgroundImage &&
          backgroundImage !== 'none' &&
          backgroundImage !== 'initial',
      );
    }

    /**
     * Reapply bright mode styles to newly added elements
     */
    reapplyBrightModeStyles() {
      if (!this.isBrightModeActive) {
        return;
      }

      // The CSS should automatically apply to new elements, but we can force a reflow
      // by temporarily removing and re-adding the style
      const style = document.getElementById(BRIGHT_MODE_STYLE_ID);
      if (style && style.parentNode) {
        const parent = style.parentNode;
        const nextSibling = style.nextSibling;

        parent.removeChild(style);
        parent.insertBefore(style, nextSibling);
      }
    }

    /**
     * Clean up resources
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      if (this.mediaQuery && this.handleThemeChange) {
        if (this.mediaQuery.removeEventListener) {
          this.mediaQuery.removeEventListener('change', this.handleThemeChange);
        } else if (this.mediaQuery.removeListener) {
          this.mediaQuery.removeListener(this.handleThemeChange);
        }
      }

      // Remove navigation event listeners
      if (this.handleVisibilityChange) {
        document.removeEventListener(
          'visibilitychange',
          this.handleVisibilityChange,
        );
      }
      if (this.handlePageShow) {
        window.removeEventListener('pageshow', this.handlePageShow);
      }
      if (this.handlePopState) {
        window.removeEventListener('popstate', this.handlePopState);
      }
      if (this.handleHashChange) {
        window.removeEventListener('hashchange', this.handleHashChange);
      }
    }
  }

  // Initialize the bright mode enforcer when the script loads
  let brightModeEnforcer = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      brightModeEnforcer = new BrightModeEnforcer();
    });
  } else {
    brightModeEnforcer = new BrightModeEnforcer();
  }

  // Clean up when the page unloads
  window.addEventListener('beforeunload', () => {
    if (brightModeEnforcer) {
      brightModeEnforcer.destroy();
    }
  });
})();
