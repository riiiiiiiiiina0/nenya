/**
 * Tab picker UI - shows tabs grouped by window for adding to split view
 */

// Store callbacks for refreshing pickers
let modalPickerCallback = null;
let embeddedPickerCallback = null;

/**
 * Get filtered tabs grouped by window
 * @returns {Promise<Array<{id: number, focused: boolean, tabs: Array}>>}
 */
async function getFilteredWindowsWithTabs() {
  const splitPageUrlPrefix = chrome.runtime.getURL('src/split/split.html');

  // Get current window ID (the window containing the split page)
  let currentWindowId = null;
  try {
    currentWindowId = await new Promise((resolve) => {
      chrome.windows.getCurrent((window) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve(null);
          return;
        }
        resolve(window?.id || null);
      });
    });
  } catch (error) {
    console.error('[tab-picker] Failed to get current window:', error);
  }

  // Get all windows with their tabs
  const windows = await chrome.windows.getAll({ populate: true });

  // Filter and group tabs by window, excluding split pages
  const windowsWithTabs = windows
    .filter((win) => win.id !== undefined)
    .map((win) => ({
      id: /** @type {number} */ (win.id),
      focused: win.focused || false,
      tabs: (win.tabs || []).filter(
        (tab) =>
          tab.url &&
          !tab.url.startsWith(splitPageUrlPrefix) &&
          (tab.url.startsWith('http://') || tab.url.startsWith('https://')),
      ),
    }))
    .filter((win) => win.tabs.length > 0);

  // Sort: current window first, then others
  if (currentWindowId !== null) {
    windowsWithTabs.sort((a, b) => {
      const aIsCurrent = a.id === currentWindowId;
      const bIsCurrent = b.id === currentWindowId;
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      return 0;
    });
  }

  return windowsWithTabs;
}

/**
 * Build tab list UI and append to content container
 * @param {HTMLElement} content - Container element to append to
 * @param {Array<{id: number, focused: boolean, tabs: Array}>} windowsWithTabs - Filtered windows with tabs
 * @param {Function} onTabSelected - Callback when tab is selected
 * @param {HTMLElement|null} overlay - Optional overlay to remove when tab is selected (for modal)
 */
function buildTabListUI(
  content,
  windowsWithTabs,
  onTabSelected,
  overlay = null,
) {
  // Clear existing content
  content.innerHTML = '';

  // Build tab list grouped by window
  windowsWithTabs.forEach((window, windowIndex) => {
    const windowSection = document.createElement('div');
    windowSection.className = 'mb-4';

    const windowHeader = document.createElement('div');
    windowHeader.className =
      'text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2';
    windowHeader.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span>Window ${windowIndex + 1}${
      window.focused ? ' (Current)' : ''
    }</span>
      <span class="text-xs text-gray-500 dark:text-gray-400">(${
        window.tabs.length
      } tabs)</span>
    `;
    windowSection.appendChild(windowHeader);

    const tabList = document.createElement('div');
    tabList.className = 'space-y-1';

    window.tabs.forEach((tab) => {
      const tabItem = document.createElement('button');
      tabItem.className =
        'w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 group cursor-pointer';
      tabItem.dataset.tabId = String(tab.id);

      // Favicon
      const favicon = document.createElement('img');
      favicon.className = 'w-4 h-4 flex-shrink-0';
      favicon.src =
        tab.favIconUrl ||
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>';
      favicon.alt = '';
      favicon.onerror = () => {
        favicon.src =
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>';
      };

      // Tab info
      const tabInfo = document.createElement('div');
      tabInfo.className = 'flex-1 min-w-0';

      const title = document.createElement('div');
      title.className =
        'text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400';
      title.textContent = tab.title || 'Untitled';
      title.title = tab.title || '';

      const url = document.createElement('div');
      url.className = 'text-xs text-gray-500 dark:text-gray-400 truncate';
      url.textContent = tab.url || '';
      url.title = tab.url || '';

      tabInfo.appendChild(title);
      tabInfo.appendChild(url);

      // Add icon
      const addIcon = document.createElement('div');
      addIcon.className =
        'flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity';
      addIcon.innerHTML = `
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
      `;

      tabItem.appendChild(favicon);
      tabItem.appendChild(tabInfo);
      tabItem.appendChild(addIcon);

      // Click handler
      tabItem.addEventListener('click', () => {
        onTabSelected(tab);
        if (overlay) {
          overlay.remove();
          modalPickerCallback = null;
        }
      });

      tabList.appendChild(tabItem);
    });

    windowSection.appendChild(tabList);
    content.appendChild(windowSection);
  });
}

/**
 * Refresh the modal tab picker
 */
async function refreshModalPicker() {
  const overlay = document.getElementById('nenya-tab-picker');
  if (!overlay || !modalPickerCallback) return;

  // Find the picker container (has both bg-white and dark:bg-gray-800 classes)
  const picker =
    overlay.querySelector('.bg-white.dark\\:bg-gray-800') ||
    overlay.querySelector('.bg-white') ||
    overlay.querySelector('.dark\\:bg-gray-800');
  if (!picker) return;

  const content = /** @type {HTMLElement} */ (
    picker.querySelector('.overflow-y-auto')
  );
  if (!content) return;

  const windowsWithTabs = await getFilteredWindowsWithTabs();

  if (windowsWithTabs.length === 0) {
    overlay.remove();
    modalPickerCallback = null;
    showNotification('No tabs available to add');
    return;
  }

  buildTabListUI(content, windowsWithTabs, modalPickerCallback, overlay);
}

/**
 * Refresh the embedded tab picker
 */
async function refreshEmbeddedPicker() {
  const picker = document.getElementById('nenya-embedded-tab-picker');
  if (!picker || !embeddedPickerCallback) return;

  const windowsWithTabs = await getFilteredWindowsWithTabs();

  if (windowsWithTabs.length === 0) {
    picker.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center p-8">
          <p class="text-gray-600 dark:text-gray-400">No tabs available to add</p>
        </div>
      </div>
    `;
    return;
  }

  // Clear existing content but keep header
  const header = picker.querySelector('.flex.items-center.justify-between');
  const content = /** @type {HTMLElement} */ (
    picker.querySelector('.overflow-y-auto')
  );

  if (!content) return;

  buildTabListUI(content, windowsWithTabs, embeddedPickerCallback);
}

/**
 * Setup Chrome API listeners for tab/window events
 */
function setupTabListeners() {
  // Tab removed
  chrome.tabs.onRemoved.addListener(() => {
    refreshModalPicker();
    refreshEmbeddedPicker();
  });

  // Tab created
  chrome.tabs.onCreated.addListener(() => {
    refreshModalPicker();
    refreshEmbeddedPicker();
  });

  // Tab updated (including when it finishes loading)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // Only refresh when status changes to 'complete' or when title/url changes
    if (
      changeInfo.status === 'complete' ||
      changeInfo.title ||
      changeInfo.url
    ) {
      refreshModalPicker();
      refreshEmbeddedPicker();
    }
  });

  // Window removed
  chrome.windows.onRemoved.addListener(() => {
    refreshModalPicker();
    refreshEmbeddedPicker();
  });

  // Window created
  chrome.windows.onCreated.addListener(() => {
    refreshModalPicker();
    refreshEmbeddedPicker();
  });
}

// Initialize listeners
setupTabListeners();

/**
 * Create and show a tab picker modal
 * @param {Object} position - {x, y} screen coordinates
 * @param {Function} onTabSelected - callback(tab) when a tab is selected
 */
export async function showTabPicker(position, onTabSelected) {
  // Remove any existing picker
  const existing = document.getElementById('nenya-tab-picker');
  if (existing) {
    existing.remove();
  }

  // Store callback for refreshing
  modalPickerCallback = onTabSelected;

  const windowsWithTabs = await getFilteredWindowsWithTabs();

  if (windowsWithTabs.length === 0) {
    showNotification('No tabs available to add');
    modalPickerCallback = null;
    return;
  }

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'nenya-tab-picker';
  overlay.className =
    'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.zIndex = '9999';

  // Create picker container
  const picker = document.createElement('div');
  picker.className =
    'bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col';
  picker.style.maxHeight = '80vh';

  // Header
  const header = document.createElement('div');
  header.className =
    'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700';
  header.innerHTML = `
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Tab to Split View</h3>
    <button class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" id="nenya-picker-close">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  `;

  // Scrollable content area
  const content = document.createElement('div');
  content.className = 'overflow-y-auto flex-1 p-4';

  // Build tab list using shared function
  buildTabListUI(content, windowsWithTabs, onTabSelected, overlay);

  // Assemble modal
  picker.appendChild(header);
  picker.appendChild(content);
  overlay.appendChild(picker);

  // Close handlers
  const closeButton = header.querySelector('#nenya-picker-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      overlay.remove();
      modalPickerCallback = null;
    });
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      modalPickerCallback = null;
    }
  });

  // ESC to close
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
      modalPickerCallback = null;
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Add to DOM
  document.body.appendChild(overlay);
}

/**
 * Create and show an embedded tab picker (not a modal)
 * @param {Function} onTabSelected - callback(tab) when a tab is selected
 * @returns {Promise<HTMLElement>} - The picker container element
 */
export async function createEmbeddedTabPicker(onTabSelected) {
  // Store callback for refreshing
  embeddedPickerCallback = onTabSelected;

  const windowsWithTabs = await getFilteredWindowsWithTabs();

  // Create picker container
  const picker = document.createElement('div');
  picker.id = 'nenya-embedded-tab-picker';
  picker.className = 'flex flex-col h-full bg-white dark:bg-gray-800';

  if (windowsWithTabs.length === 0) {
    picker.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center p-8">
          <p class="text-gray-600 dark:text-gray-400">No tabs available to add</p>
        </div>
      </div>
    `;
    return picker;
  }

  // Header
  const header = document.createElement('div');
  header.className =
    'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700';
  header.innerHTML = `
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Tab to Split View</h3>
  `;

  // Scrollable content area
  const content = document.createElement('div');
  content.className = 'overflow-y-auto flex-1 p-4';

  // Build tab list using shared function
  buildTabListUI(content, windowsWithTabs, onTabSelected);

  // Assemble picker
  picker.appendChild(header);
  picker.appendChild(content);

  return picker;
}

/**
 * Show a temporary notification
 * @param {string} message
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className =
    'fixed top-4 right-4 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-lg shadow-lg z-[10000]';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}
