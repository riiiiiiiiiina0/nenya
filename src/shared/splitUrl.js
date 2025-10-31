/* global chrome */

/**
 * Get the base URL for split pages.
 * @returns {string}
 */
function getSplitBaseUrl() {
  return chrome.runtime.getURL('src/split/split.html');
}

/**
 * Check if a URL is a split page URL (extension format).
 * @param {string} url - The URL to check
 * @returns {boolean}
 */
export function isSplitPageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const splitBaseUrl = getSplitBaseUrl();
  return url.startsWith(splitBaseUrl);
}

/**
 * Convert a split page URL from extension format to nenya.local format for saving.
 * @param {string} url - The split page URL in extension format
 * @returns {string} - The converted URL, or original URL if not a split page
 */
export function convertSplitUrlForSave(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  if (!isSplitPageUrl(url)) {
    return url;
  }

  // Extract the query string (everything after the ?)
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    // No query string, just return the base nenya.local URL
    return 'https://nenya.local/split';
  }

  const queryString = url.substring(queryIndex);
  return 'https://nenya.local/split' + queryString;
}

/**
 * Convert a split page URL from nenya.local format back to extension format for restoring.
 * @param {string} url - The split page URL in nenya.local format
 * @returns {string} - The converted URL, or original URL if not a nenya.local split page
 */
export function convertSplitUrlForRestore(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  if (!url.startsWith('https://nenya.local/split')) {
    return url;
  }

  // Extract the query string (everything after /split)
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    // No query string, just return the base extension URL
    return getSplitBaseUrl();
  }

  const queryString = url.substring(queryIndex);
  return getSplitBaseUrl() + queryString;
}
