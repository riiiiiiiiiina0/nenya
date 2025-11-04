/**
 * Clipboard context menu functionality for copying tab data.
 */

import { setActionBadge, animateActionBadge } from './mirror.js';
import { processUrl } from '../shared/urlProcessor.js';

/**
 * Context menu IDs for clipboard operations.
 */
export const CLIPBOARD_CONTEXT_MENU_IDS = {
  COPY_TITLE_URL: 'nenya-copy-title-url',
  COPY_TITLE_DASH_URL: 'nenya-copy-title-dash-url',
  COPY_MARKDOWN_LINK: 'nenya-copy-markdown-link',
  COPY_SCREENSHOT: 'nenya-copy-screenshot',
};

/**
 * Get the notification icon URL using chrome.runtime.getURL.
 * @returns {string} - The icon URL.
 */
function getNotificationIconUrl() {
  try {
    return chrome.runtime.getURL('assets/icons/icon-48x48.png');
  } catch (error) {
    console.warn('[clipboard] Failed to resolve icon URL:', error);
    return 'assets/icons/icon-48x48.png';
  }
}

function setCopySuccessBadge() {
  try {
    setActionBadge('📋', '#00FF00', 2000);
  } catch (error) {
    console.warn('[clipboard] Failed to set success badge:', error);
  }
}

function setCopyFailureBadge() {
  try {
    setActionBadge('❌', '#ffffff', 2000);
  } catch (error) {
    console.warn('[clipboard] Failed to set failure badge:', error);
  }
}

/**
 * Copy text to clipboard using Chrome extension API.
 * @param {string} text - The text to copy to clipboard.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function copyToClipboard(text) {
  try {
    // Inject script into active tab to use navigator.clipboard
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && typeof tabs[0].id === 'number') {
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (textToCopy) => {
          navigator.clipboard.writeText(textToCopy);
        },
        args: [text],
      });
      return true;
    }

    return false;
  } catch (error) {
    console.warn('[clipboard] Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Capture a screenshot of the specified tab.
 * @param {number} tabId - The ID of the tab to capture.
 * @returns {Promise<string|null>} - The data URL of the screenshot, or null if failed.
 */
async function captureTabScreenshot(tabId) {
  try {
    // Get the window ID for the tab
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png',
      quality: 100,
    });
    return dataUrl;
  } catch (error) {
    console.warn('[clipboard] Failed to capture screenshot:', error);
    return null;
  }
}

/**
 * Get tab data for clipboard operations.
 * @param {chrome.tabs.Tab[]} tabs - Array of tabs to process.
 * @returns {Promise<Array<{title: string, url: string}>>} - Array of tab data.
 */
async function getTabData(tabs) {
  const tabData = [];
  for (const tab of tabs) {
    if (!tab || typeof tab.url !== 'string' || !tab.url.startsWith('http')) {
      continue;
    }
    const processedUrl = await processUrl(tab.url, 'copy-to-clipboard');
    tabData.push({
      title: typeof tab.title === 'string' ? tab.title : '',
      url: processedUrl,
    });
  }
  return tabData;
}

/**
 * Format tab data as "Title\nURL".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatTitleUrl(tabData) {
  return tabData.map((tab) => `${tab.title}\n${tab.url}`).join('\n\n');
}

/**
 * Format tab data as "Title - URL".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatTitleDashUrl(tabData) {
  return tabData.map((tab) => `${tab.title} - ${tab.url}`).join('\n');
}

/**
 * Format tab data as markdown links "[Title](URL)".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatMarkdownLink(tabData) {
  return tabData.map((tab) => `[${tab.title}](${tab.url})`).join('\n');
}

/**
 * Handle clipboard copy operations for multiple tabs.
 * @param {string} formatType - The format type to use.
 * @param {chrome.tabs.Tab[]} tabs - Array of tabs to process.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function handleMultiTabCopy(formatType, tabs) {
  const tabData = await getTabData(tabs);

  if (tabData.length === 0) {
    return false;
  }

  let formattedText = '';

  switch (formatType) {
    case 'title-url':
      formattedText = formatTitleUrl(tabData);
      break;
    case 'title-dash-url':
      formattedText = formatTitleDashUrl(tabData);
      break;
    case 'markdown-link':
      formattedText = formatMarkdownLink(tabData);
      break;
    default:
      return false;
  }

  return await copyToClipboard(formattedText);
}

/**
 * Check if a URL is an extension or system page that can't have scripts injected.
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if the URL is an extension/system page.
 */
function isExtensionOrSystemPage(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return (
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://')
  );
}

/**
 * Find a regular tab in the same window that can have scripts injected.
 * @param {number} windowId - The window ID.
 * @param {number} excludeTabId - Tab ID to exclude.
 * @returns {Promise<number|null>} - Tab ID if found, null otherwise.
 */
async function findInjectableTab(windowId, excludeTabId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) {
      if (
        tab.id &&
        tab.id !== excludeTabId &&
        tab.url &&
        !isExtensionOrSystemPage(tab.url)
      ) {
        return tab.id;
      }
    }
    return null;
  } catch (error) {
    console.warn('[clipboard] Failed to find injectable tab:', error);
    return null;
  }
}

/**
 * Copy image to clipboard by injecting script into a tab.
 * @param {number} tabId - The tab ID to inject into.
 * @param {string} dataUrl - The data URL of the image.
 * @param {number} [originalTabId] - Optional original tab ID to restore focus to after copying.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function copyImageViaTab(tabId, dataUrl, originalTabId) {
  try {
    // Focus the tab first - clipboard API requires document focus
    await chrome.tabs.update(tabId, { active: true });
    
    // Get the window ID and focus it
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    
    // Wait a bit for the tab to be focused
    await new Promise((resolve) => setTimeout(resolve, 100));

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (dataUrlToCopy) => {
        return new Promise((resolve) => {
          try {
            // Ensure window is focused
            window.focus();
            
            // Convert data URL to blob
            const byteString = atob(dataUrlToCopy.split(',')[1]);
            const mimeString = dataUrlToCopy.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });

            // Write to clipboard
            navigator.clipboard
              .write([
                new ClipboardItem({
                  [blob.type]: blob,
                }),
              ])
              .then(() => {
                resolve({ success: true });
              })
              .catch((error) => {
                console.error('[clipboard] Clipboard write failed:', error);
                resolve({ success: false, error: error.message });
              });
          } catch (error) {
            console.error('[clipboard] Blob conversion failed:', error);
            resolve({ success: false, error: error.message });
          }
        });
      },
      args: [dataUrl],
    });

    // Check if the clipboard operation succeeded
    let success = false;
    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      if (result.success) {
        success = true;
      } else {
        const errorMsg = 'error' in result ? result.error : 'Unknown error';
        console.warn('[clipboard] Clipboard operation failed:', errorMsg);
      }
    }

    // Restore focus to original tab if we switched tabs
    if (typeof originalTabId === 'number' && originalTabId !== tabId && success) {
      try {
        await chrome.tabs.update(originalTabId, { active: true });
      } catch (error) {
        console.warn('[clipboard] Failed to restore focus to original tab:', error);
      }
    }

    return success;
  } catch (error) {
    console.warn('[clipboard] Failed to copy image via tab:', error);
    return false;
  }
}

/**
 * Handle screenshot capture for a single tab.
 * @param {number} tabId - The ID of the tab to capture.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function handleScreenshotCopy(tabId) {
  const dataUrl = await captureTabScreenshot(tabId);

  if (!dataUrl) {
    return false;
  }

  try {
    // Get tab info to check if it's an extension page
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab?.url;
    if (!tabUrl) {
      console.warn('[clipboard] Tab URL is unavailable');
      return false;
    }
    const isExtensionPage = isExtensionOrSystemPage(tabUrl);

    if (isExtensionPage) {
      // For extension pages, find another tab in the same window to inject into
      const injectableTabId = await findInjectableTab(
        tab.windowId,
        tabId,
      );
      if (injectableTabId) {
        // Pass the original tab ID to restore focus after copying
        return await copyImageViaTab(injectableTabId, dataUrl, tabId);
      }

      // If no injectable tab found, open google.com in a new tab as fallback
      console.warn(
        '[clipboard] Cannot copy screenshot: extension page with no injectable tabs, opening fallback tab',
      );
      try {
        // Create a new tab with google.com
        const fallbackTab = await chrome.tabs.create({
          url: 'https://www.google.com',
          active: false, // Don't switch to it immediately
        });

        if (!fallbackTab || typeof fallbackTab.id !== 'number') {
          console.warn('[clipboard] Failed to create fallback tab');
          return false;
        }

        const fallbackTabId = fallbackTab.id;

        // Wait for the tab to load
        await new Promise((resolve) => {
          /**
           * @type {(updatedTabId: number, changeInfo: {status?: string}) => void}
           */
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === fallbackTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve(undefined);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // Timeout after 5 seconds
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(undefined);
          }, 5000);
        });

        // Perform the copy operation in the fallback tab
        const success = await copyImageViaTab(fallbackTabId, dataUrl, tabId);

        // Close the fallback tab
        try {
          await chrome.tabs.remove(fallbackTabId);
        } catch (closeError) {
          console.warn('[clipboard] Failed to close fallback tab:', closeError);
        }

        return success;
      } catch (fallbackError) {
        console.warn('[clipboard] Fallback tab operation failed:', fallbackError);
        return false;
      }
    } else {
      // For regular pages, use the standard method
      return await copyImageViaTab(tabId, dataUrl);
    }
  } catch (error) {
    console.warn('[clipboard] Failed to copy screenshot to clipboard:', error);
    return false;
  }
}

/**
 * Setup clipboard context menu items.
 * @returns {void}
 */
export function setupClipboardContextMenus() {
  if (!chrome.contextMenus) {
    console.warn('[clipboard] Context menus not available');
    return;
  }

  // Title\nURL format
  chrome.contextMenus.create(
    {
      id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_URL,
      title: 'Copy Title\\nURL',
      contexts: [
        'page',
        'frame',
        'selection',
        'editable',
        'link',
        'image',
        'all',
      ],
    },
    (error) => {
      if (error) {
        console.warn(
          '[clipboard] Failed to create Title\\nURL context menu:',
          error,
        );
      }
    },
  );

  // Title - URL format
  chrome.contextMenus.create(
    {
      id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_DASH_URL,
      title: 'Copy Title - URL',
      contexts: [
        'page',
        'frame',
        'selection',
        'editable',
        'link',
        'image',
        'all',
      ],
    },
    (error) => {
      if (error) {
        console.warn(
          '[clipboard] Failed to create Title - URL context menu:',
          error,
        );
      }
    },
  );

  // Markdown link format
  chrome.contextMenus.create(
    {
      id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_MARKDOWN_LINK,
      title: 'Copy [Title](URL)',
      contexts: [
        'page',
        'frame',
        'selection',
        'editable',
        'link',
        'image',
        'all',
      ],
    },
    (error) => {
      if (error) {
        console.warn(
          '[clipboard] Failed to create Markdown link context menu:',
          error,
        );
      }
    },
  );

  // Screenshot (only for single tab)
  chrome.contextMenus.create(
    {
      id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT,
      title: 'Copy Screenshot',
      contexts: [
        'page',
        'frame',
        'selection',
        'editable',
        'link',
        'image',
        'all',
      ],
    },
    (error) => {
      if (error) {
        console.warn(
          '[clipboard] Failed to create Screenshot context menu:',
          error,
        );
      }
    },
  );
}

/**
 * Handle context menu clicks for clipboard operations.
 * @param {chrome.contextMenus.OnClickData} info - Context menu click information.
 * @param {chrome.tabs.Tab} tab - The tab where the context menu was clicked.
 * @returns {Promise<void>}
 */
export async function handleClipboardContextMenuClick(info, tab) {
  const { menuItemId } = info;

  if (!Object.values(CLIPBOARD_CONTEXT_MENU_IDS).includes(String(menuItemId))) {
    return;
  }

  try {
    // Get highlighted tabs first, then fall back to active tab
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      setCopyFailureBadge();
      return;
    }

    let success = false;

    if (menuItemId === CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT) {
      // Screenshot only works with single tab
      if (tabs.length === 1 && typeof tabs[0].id === 'number') {
        success = await handleScreenshotCopy(tabs[0].id);
      }
    } else {
      // Handle text formats
      let formatType = '';
      switch (menuItemId) {
        case CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_URL:
          formatType = 'title-url';
          break;
        case CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_DASH_URL:
          formatType = 'title-dash-url';
          break;
        case CLIPBOARD_CONTEXT_MENU_IDS.COPY_MARKDOWN_LINK:
          formatType = 'markdown-link';
          break;
      }

      if (formatType) {
        success = await handleMultiTabCopy(formatType, tabs);
      }
    }

    // Conclude badge animation with success/failure emoji
    if (success) {
      setCopySuccessBadge();
    } else {
      setCopyFailureBadge();
    }

    // Show notification based on result
    if (success) {
      const message =
        menuItemId === CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT
          ? 'Screenshot copied to clipboard'
          : `Copied ${tabs.length} tab${
              tabs.length > 1 ? 's' : ''
            } to clipboard`;

      chrome.notifications.create({
        type: 'basic',
        iconUrl: getNotificationIconUrl(),
        title: 'Nenya',
        message,
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: getNotificationIconUrl(),
        title: 'Nenya',
        message: 'Failed to copy to clipboard',
      });
    }
  } catch (error) {
    console.error('[clipboard] Context menu click failed:', error);
    setCopyFailureBadge();
  }
}

/**
 * Handle clipboard commands from keyboard shortcuts.
 * @param {string} command - The command name.
 * @returns {Promise<void>}
 */
export async function handleClipboardCommand(command) {
  try {
    // Get highlighted tabs first, then fall back to active tab
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
      setCopyFailureBadge();
      return;
    }

    let success = false;

    if (command === 'copy-screenshot') {
      // Screenshot only works with single tab
      if (tabs.length === 1 && typeof tabs[0].id === 'number') {
        success = await handleScreenshotCopy(tabs[0].id);
      } else {
        // Show notification for multiple tabs
        chrome.notifications.create({
          type: 'basic',
          iconUrl: getNotificationIconUrl(),
          title: 'Nenya',
          message: 'Screenshot only works with single tab',
        });
        setCopyFailureBadge();
        return;
      }
    } else {
      // Handle text formats
      let formatType = '';
      switch (command) {
        case 'copy-title-url':
          formatType = 'title-url';
          break;
        case 'copy-title-dash-url':
          formatType = 'title-dash-url';
          break;
        case 'copy-markdown-link':
          formatType = 'markdown-link';
          break;
      }

      if (formatType) {
        success = await handleMultiTabCopy(formatType, tabs);
      }
    }

    // Set badge based on result
    if (success) {
      setCopySuccessBadge();

      // Show notification
      const message =
        command === 'copy-screenshot'
          ? 'Screenshot copied to clipboard'
          : `Copied ${tabs.length} tab${
              tabs.length > 1 ? 's' : ''
            } to clipboard`;

      chrome.notifications.create({
        type: 'basic',
        iconUrl: getNotificationIconUrl(),
        title: 'Nenya',
        message,
      });
    } else {
      setCopyFailureBadge();

      chrome.notifications.create({
        type: 'basic',
        iconUrl: getNotificationIconUrl(),
        title: 'Nenya',
        message: 'Failed to copy to clipboard',
      });
    }
  } catch (error) {
    console.error('[clipboard] Command failed:', error);
    setCopyFailureBadge();
  }
}

/**
 * Update context menu visibility based on tab selection.
 * This function should be called when tab selection changes to hide/show
 * the screenshot option based on whether multiple tabs are selected.
 * @returns {Promise<void>}
 */
export async function updateClipboardContextMenuVisibility() {
  if (!chrome.contextMenus) {
    return;
  }

  try {
    const tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    const hasMultipleTabs = tabs && tabs.length > 1;

    // Update screenshot menu item visibility
    chrome.contextMenus.update(CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT, {
      visible: !hasMultipleTabs,
    });
  } catch (error) {
    console.warn(
      '[clipboard] Failed to update context menu visibility:',
      error,
    );
  }
}
