(function () {
  'use strict';

  /* global URLPattern */

  /**
   * @typedef {Object} CustomCodeRule
   * @property {string} id
   * @property {string} pattern
   * @property {string} css
   * @property {string} js
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  const STORAGE_KEY = 'customCodeRules';
  const INJECTED_CSS_PREFIX = 'nenya-custom-css-';
  const INJECTED_JS_PREFIX = 'nenya-custom-js-';

  /**
   * Custom JS & CSS Injection Content Script
   * Injects custom CSS and JavaScript into pages matching URL patterns
   */
  class CustomCodeInjector {
    constructor() {
      this.rules = [];
      this.injectedStyles = new Set();
      this.injectedScripts = new Set();
      
      this.init();
    }

    /**
     * Initialize the custom code injector
     */
    async init() {
      try {
        // Load rules from storage
        await this.loadRules();

        // Apply rules to current page
        this.applyMatchingRules();

        // Set up storage change listener
        this.setupStorageListener();

        console.log('[CustomCode] Initialized successfully');
      } catch (error) {
        console.error('[CustomCode] Failed to initialize:', error);
      }
    }

    /**
     * Load rules from storage
     */
    async loadRules() {
      if (!chrome?.storage?.local) {
        console.warn('[CustomCode] Chrome storage not available');
        return;
      }

      try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        this.rules = result[STORAGE_KEY] || [];
        
        console.log('[CustomCode] Loaded rules:', this.rules.length);
      } catch (error) {
        console.error('[CustomCode] Failed to load rules:', error);
      }
    }

    /**
     * Check if current URL matches the given pattern
     * @param {string} pattern
     * @param {string} url
     * @returns {boolean}
     */
    matchesPattern(pattern, url) {
      try {
        // @ts-ignore - URLPattern is a browser API not yet in TypeScript types
        const urlPattern = new URLPattern(pattern);
        return urlPattern.test(url);
      } catch (error) {
        console.warn('[CustomCode] Invalid pattern:', pattern, error);
        return false;
      }
    }

    /**
     * Inject CSS into the page
     * @param {string} ruleId
     * @param {string} css
     */
    injectCSS(ruleId, css) {
      if (!css || !css.trim()) {
        return;
      }

      const styleId = INJECTED_CSS_PREFIX + ruleId;
      
      // Remove existing style if present
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }

      // Create and inject new style element
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = css;
      
      // Add data attribute for identification and priority
      styleElement.setAttribute('data-nenya-custom', 'true');
      
      // Inject at the END of head to ensure highest priority in cascade
      // This way it loads after other stylesheets
      if (document.head) {
        document.head.appendChild(styleElement);
      } else if (document.body) {
        // If head doesn't exist yet, append to body end
        document.body.appendChild(styleElement);
      } else {
        // Fallback: append to documentElement
        document.documentElement.appendChild(styleElement);
      }

      this.injectedStyles.add(styleId);
      console.log('[CustomCode] Injected CSS for rule:', ruleId);
    }

    /**
     * Inject JavaScript into the page
     * @param {string} ruleId
     * @param {string} js
     */
    async injectJS(ruleId, js) {
      if (!js || !js.trim()) {
        return;
      }

      const scriptId = INJECTED_JS_PREFIX + ruleId;
      
      // Check if script already injected
      if (this.injectedScripts.has(scriptId)) {
        console.log('[CustomCode] Script already injected for rule:', ruleId);
        return;
      }

      try {
        // Request background script to inject code in MAIN world
        // This bypasses page CSP restrictions
        const response = await chrome.runtime.sendMessage({
          type: 'INJECT_CUSTOM_JS',
          ruleId: ruleId,
          code: js
        });

        if (response?.success) {
          this.injectedScripts.add(scriptId);
          console.log('[CustomCode] Injected JS for rule:', ruleId);
        } else {
          console.error('[CustomCode] Failed to inject JS for rule:', ruleId, response?.error);
        }
      } catch (error) {
        console.error('[CustomCode] Failed to inject JS for rule:', ruleId, error);
      }
    }

    /**
     * Remove injected CSS
     * @param {string} ruleId
     */
    removeCSS(ruleId) {
      const styleId = INJECTED_CSS_PREFIX + ruleId;
      const styleElement = document.getElementById(styleId);
      
      if (styleElement) {
        styleElement.remove();
        this.injectedStyles.delete(styleId);
        console.log('[CustomCode] Removed CSS for rule:', ruleId);
      }
    }

    /**
     * Remove injected JavaScript
     * @param {string} ruleId
     */
    removeJS(ruleId) {
      const scriptId = INJECTED_JS_PREFIX + ruleId;
      const scriptElement = document.getElementById(scriptId);
      
      if (scriptElement) {
        scriptElement.remove();
        this.injectedScripts.delete(scriptId);
        console.log('[CustomCode] Removed JS for rule:', ruleId);
      }
    }

    /**
     * Apply all rules that match the current URL
     */
    applyMatchingRules() {
      const currentUrl = window.location.href;
      
      // Keep track of which rules should be active
      const activeRuleIds = new Set();

      // Apply matching rules
      this.rules.forEach((rule) => {
        if (this.matchesPattern(rule.pattern, currentUrl)) {
          activeRuleIds.add(rule.id);
          this.injectCSS(rule.id, rule.css);
          this.injectJS(rule.id, rule.js);
        }
      });

      // Remove injections for rules that no longer match
      this.injectedStyles.forEach((styleId) => {
        const ruleId = styleId.replace(INJECTED_CSS_PREFIX, '');
        if (!activeRuleIds.has(ruleId)) {
          this.removeCSS(ruleId);
        }
      });

      this.injectedScripts.forEach((scriptId) => {
        const ruleId = scriptId.replace(INJECTED_JS_PREFIX, '');
        if (!activeRuleIds.has(ruleId)) {
          this.removeJS(ruleId);
        }
      });
    }

    /**
     * Set up storage change listener
     */
    setupStorageListener() {
      if (!chrome?.storage?.onChanged) {
        return;
      }

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') {
          return;
        }

        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
          console.log('[CustomCode] Rules updated in storage');
          this.rules = changes[STORAGE_KEY]?.newValue || [];
          
          // Reapply rules with new configuration
          this.applyMatchingRules();
        }
      });
    }
  }

  // Initialize the custom code injector when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new CustomCodeInjector();
    });
  } else {
    new CustomCodeInjector();
  }
})();

