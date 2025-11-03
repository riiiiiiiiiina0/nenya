/* global chrome */

/**
 * Sets the extension icon URL using chrome.runtime.getURL()
 * This function should be called when the DOM is ready
 */
export function setIconUrl() {
  if (chrome?.runtime?.getURL) {
    const iconImg = /** @type {HTMLImageElement | null} */ (
      document.getElementById('extensionIcon')
    );
    if (iconImg) {
      iconImg.src = chrome.runtime.getURL('assets/icons/icon-48x48.png');
    }
  }
}

/**
 * Initialize icon URL setting - handles both immediate and deferred execution
 */
(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setIconUrl);
  } else {
    setIconUrl();
  }
})();
