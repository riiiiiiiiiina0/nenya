/**
 * Debug utilities for development and testing
 */

/**
 * Reloads all tabs in all windows
 * @returns {Promise<{success: boolean, message: string, stats?: {windows: number, tabs: number}}>}
 */
async function reloadAllTabs() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    let tabCount = 0;

    for (const window of windows) {
      for (const tab of window.tabs) {
        // Skip chrome:// URLs and other special pages that can't be reloaded
        if (
          tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('chrome-extension://')
        ) {
          try {
            await chrome.tabs.reload(tab.id);
            tabCount++;
          } catch (error) {
            console.warn(`Failed to reload tab ${tab.id}:`, error);
          }
        }
      }
    }

    return {
      success: true,
      message: `Successfully reloaded ${tabCount} tabs across ${windows.length} windows`,
      stats: {
        windows: windows.length,
        tabs: tabCount,
      },
    };
  } catch (error) {
    console.error('Error reloading tabs:', error);
    return {
      success: false,
      message: `Failed to reload tabs: ${error.message}`,
    };
  }
}

/**
 * Shows a status message in the debug section
 * @param {string} message
 * @param {boolean} isError
 */
function showDebugStatus(message, isError = false) {
  const statusEl = document.getElementById('debugOperationStatus');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `text-sm min-h-6 ${
    isError ? 'text-error' : 'text-success'
  }`;

  // Clear the message after 5 seconds
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'text-sm text-base-content/70 min-h-6';
  }, 5000);
}

/**
 * Initialize debug section
 */
function initDebug() {
  const reloadAllButton = document.getElementById('debugReloadAllTabsButton');

  if (reloadAllButton) {
    reloadAllButton.addEventListener('click', async () => {
      // Disable button during operation
      reloadAllButton.disabled = true;
      showDebugStatus('Reloading all tabs...', false);

      const result = await reloadAllTabs();

      // Re-enable button
      reloadAllButton.disabled = false;

      if (result.success) {
        showDebugStatus(result.message, false);
      } else {
        showDebugStatus(result.message, true);
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDebug);
} else {
  initDebug();
}
