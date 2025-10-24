/**
 * Clipboard context menu functionality for copying tab data.
 */

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
 * Copy text to clipboard using Chrome extension API.
 * @param {string} text - The text to copy to clipboard.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function copyToClipboard(text) {
  try {
    // Use Chrome extension's clipboard API if available
    if (chrome.clipboard && chrome.clipboard.writeText) {
      await chrome.clipboard.writeText(text);
      return true;
    }
    
    // Fallback: inject script into active tab to use navigator.clipboard
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
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
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
 * @returns {Array<{title: string, url: string}>} - Array of tab data.
 */
function getTabData(tabs) {
  return tabs
    .filter(tab => tab && typeof tab.url === 'string' && tab.url.startsWith('http'))
    .map(tab => ({
      title: typeof tab.title === 'string' ? tab.title : '',
      url: tab.url,
    }));
}

/**
 * Format tab data as "Title\nURL".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatTitleUrl(tabData) {
  return tabData
    .map(tab => `${tab.title}\n${tab.url}`)
    .join('\n\n');
}

/**
 * Format tab data as "Title - URL".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatTitleDashUrl(tabData) {
  return tabData
    .map(tab => `${tab.title} - ${tab.url}`)
    .join('\n');
}

/**
 * Format tab data as markdown links "[Title](URL)".
 * @param {Array<{title: string, url: string}>} tabData - Array of tab data.
 * @returns {string} - Formatted text.
 */
function formatMarkdownLink(tabData) {
  return tabData
    .map(tab => `[${tab.title}](${tab.url})`)
    .join('\n');
}

/**
 * Handle clipboard copy operations for multiple tabs.
 * @param {string} formatType - The format type to use.
 * @param {chrome.tabs.Tab[]} tabs - Array of tabs to process.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function handleMultiTabCopy(formatType, tabs) {
  const tabData = getTabData(tabs);
  
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
    // Use Chrome extension's clipboard API if available
    if (chrome.clipboard && chrome.clipboard.write) {
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      // Copy blob to clipboard
      await chrome.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      return true;
    }
    
    // Fallback: inject script into the tab to use navigator.clipboard
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (dataUrl) => {
        fetch(dataUrl)
          .then(response => response.blob())
          .then(blob => {
            navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
              }),
            ]);
          });
      },
      args: [dataUrl],
    });
    return true;
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
    return;
  }

  // Create parent menu for clipboard operations
  chrome.contextMenus.create({
    id: 'nenya-clipboard-parent',
    title: 'Copy to Clipboard',
    contexts: ['page'],
  });

  // Title\nURL format
  chrome.contextMenus.create({
    id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_URL,
    parentId: 'nenya-clipboard-parent',
    title: 'Title\\nURL',
    contexts: ['page'],
  });

  // Title - URL format
  chrome.contextMenus.create({
    id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_TITLE_DASH_URL,
    parentId: 'nenya-clipboard-parent',
    title: 'Title - URL',
    contexts: ['page'],
  });

  // Markdown link format
  chrome.contextMenus.create({
    id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_MARKDOWN_LINK,
    parentId: 'nenya-clipboard-parent',
    title: '[Title](URL)',
    contexts: ['page'],
  });

  // Screenshot (only for single tab)
  chrome.contextMenus.create({
    id: CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT,
    parentId: 'nenya-clipboard-parent',
    title: 'Screenshot',
    contexts: ['page'],
  });
}

/**
 * Handle context menu clicks for clipboard operations.
 * @param {chrome.contextMenus.OnClickData} info - Context menu click information.
 * @param {chrome.tabs.Tab} tab - The tab where the context menu was clicked.
 * @returns {Promise<void>}
 */
export async function handleClipboardContextMenuClick(info, tab) {
  const { menuItemId } = info;
  
  if (!Object.values(CLIPBOARD_CONTEXT_MENU_IDS).includes(menuItemId)) {
    return;
  }

  try {
    // Get highlighted tabs first, then fall back to active tab
    let tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    if (!tabs || tabs.length === 0) {
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

    // Show notification based on result
    if (success) {
      const message = menuItemId === CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT 
        ? 'Screenshot copied to clipboard'
        : `Copied ${tabs.length} tab${tabs.length > 1 ? 's' : ''} to clipboard`;
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon-48x48.png',
        title: 'Nenya',
        message,
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon-48x48.png',
        title: 'Nenya',
        message: 'Failed to copy to clipboard',
      });
    }
  } catch (error) {
    console.error('[clipboard] Context menu click failed:', error);
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
    const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
    const hasMultipleTabs = tabs && tabs.length > 1;

    // Update screenshot menu item visibility
    chrome.contextMenus.update(CLIPBOARD_CONTEXT_MENU_IDS.COPY_SCREENSHOT, {
      visible: !hasMultipleTabs,
    });
  } catch (error) {
    console.warn('[clipboard] Failed to update context menu visibility:', error);
  }
}
