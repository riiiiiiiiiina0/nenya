/* global chrome */

/**
 * YouTube-specific CSS fixes
 * Hides elements that interfere with video controls
 */

(function () {
  'use strict';

  /**
   * Inject CSS to hide YouTube cards button that blocks PIP and fullscreen buttons
   */
  function injectYouTubeFixes() {
    const styleId = 'nenya-youtube-fixes';

    // Remove existing style if present
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      return;
    }

    // Create and inject style element
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = `
      .ytp-cards-button {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    // Inject at the end of head to ensure highest priority
    if (document.head) {
      document.head.appendChild(styleElement);
    } else if (document.body) {
      document.body.appendChild(styleElement);
    } else {
      // If neither head nor body exists yet, wait for DOM
      const observer = new MutationObserver(() => {
        if (document.head) {
          document.head.appendChild(styleElement);
          observer.disconnect();
        } else if (document.body) {
          document.body.appendChild(styleElement);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Inject CSS fixes immediately
  injectYouTubeFixes();
})();
