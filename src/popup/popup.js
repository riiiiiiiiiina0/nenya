/* global chrome */

import '../options/theme.js';
import {
  isUserLoggedIn,
  toggleMirrorSection,
  showLoginMessage,
  initializeMirror,
} from './mirror.js';
import { concludeStatus } from './shared.js';
import { initializeProjects } from './projects.js';

const pullButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('pullButton')
);
const saveUnsortedButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('saveUnsortedButton')
);
const saveProjectButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('saveProjectButton')
);
const renameTabButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('renameTabButton')
);
const openOptionsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('openOptionsButton')
);
const statusMessage = /** @type {HTMLDivElement | null} */ (
  document.getElementById('statusMessage')
);
const autoReloadStatusElement = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('autoReloadStatus')
);
const projectsContainer = /** @type {HTMLDivElement | null} */ (
  document.getElementById('projectsContainer')
);
const refreshProjectsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('refreshProjectsButton')
);
const mirrorSection = /** @type {HTMLElement | null} */ (
  document.querySelector('article[aria-labelledby="mirror-heading"]')
);

// Initialize mirror functionality
if (pullButton && saveUnsortedButton && statusMessage) {
  initializeMirror(pullButton, saveUnsortedButton, statusMessage);
}

// Initialize projects functionality
if (
  saveProjectButton &&
  refreshProjectsButton &&
  projectsContainer &&
  statusMessage
) {
  initializeProjects(
    saveProjectButton,
    refreshProjectsButton,
    projectsContainer,
    statusMessage,
  );
}

if (!statusMessage) {
  console.error('[popup] Status element not found.');
}

if (openOptionsButton) {
  openOptionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[popup] Unable to open options page.', error);
        if (statusMessage) {
          concludeStatus(
            'Unable to open options page.',
            'error',
            3000,
            statusMessage,
          );
        }
      }
    });
  });
} else {
  console.error('[popup] Options button not found.');
}

if (renameTabButton) {
  renameTabButton.addEventListener('click', () => {
    void handleRenameTab();
  });
} else {
  console.error('[popup] Rename tab button not found.');
}

/**
 * Handle the rename tab action.
 * @returns {Promise<void>}
 */
async function handleRenameTab() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (statusMessage) {
        concludeStatus('No active tab found.', 'error', 3000, statusMessage);
      }
      return;
    }

    const currentTab = tabs[0];
    const currentTitle = currentTab.title || '';

    // Check if tab has a valid ID
    if (typeof currentTab.id !== 'number') {
      if (statusMessage) {
        concludeStatus('Invalid tab ID.', 'error', 3000, statusMessage);
      }
      return;
    }

    // Prompt user for custom title with current title as default
    const customTitle = window.prompt('Enter custom title for this tab:', currentTitle);
    
    if (customTitle === null) {
      // User cancelled
      if (statusMessage) {
        concludeStatus('Rename cancelled.', 'info', 2000, statusMessage);
      }
      return;
    }

    if (customTitle.trim() === '') {
      if (statusMessage) {
        concludeStatus('Title cannot be empty.', 'error', 3000, statusMessage);
      }
      return;
    }

    // Save custom title as object with tab ID, URL, and title to Chrome local storage
    try {
      await chrome.storage.local.set({
        [`customTitle_${currentTab.id}`]: {
          tabId: currentTab.id,
          url: currentTab.url,
          title: customTitle.trim()
        }
      });
    } catch (error) {
      console.error('[popup] Failed to save custom title to storage:', error);
    }

    // Send message to content script to rename the tab
    try {
      await chrome.tabs.sendMessage(currentTab.id, {
        type: 'renameTab',
        title: customTitle.trim()
      });
      
      if (statusMessage) {
        concludeStatus('Tab renamed successfully!', 'success', 3000, statusMessage);
      }
    } catch (error) {
      console.error('[popup] Failed to send rename message:', error);
      if (statusMessage) {
        concludeStatus('Failed to rename tab. Please refresh the page and try again.', 'error', 4000, statusMessage);
      }
    }
  } catch (error) {
    console.error('[popup] Error in handleRenameTab:', error);
    if (statusMessage) {
      concludeStatus('Unable to rename tab.', 'error', 3000, statusMessage);
    }
  }
}

/**
 * Initialize the popup based on login status.
 * @returns {Promise<void>}
 */
async function initializePopup() {
  try {
    const loggedIn = await isUserLoggedIn();
    if (loggedIn) {
      if (mirrorSection) {
        toggleMirrorSection(true, mirrorSection);
      }
    } else {
      if (statusMessage && openOptionsButton) {
        showLoginMessage(statusMessage, openOptionsButton);
      }
    }
  } catch (error) {
    console.error('[popup] Error initializing popup:', error);
    if (statusMessage && openOptionsButton) {
      showLoginMessage(statusMessage, openOptionsButton);
    }
  }
}

// Initialize the popup when the script loads
void initializePopup();

const GET_AUTO_RELOAD_STATUS_MESSAGE = 'autoReload:getStatus';
const AUTO_RELOAD_STATUS_REFRESH_INTERVAL = 1000;
let autoReloadStatusTimer = null;

/**
 * Format remaining milliseconds into a human-friendly countdown.
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemainingCountdown(remainingMs) {
  const safeMs = Math.max(0, Number(remainingMs) || 0);
  if (safeMs === 0) {
    return 'Reload in 0 seconds';
  }
  if (safeMs >= 60000) {
    const minutes = Math.max(1, Math.ceil(safeMs / 60000));
    return 'Reload in ' + minutes + (minutes === 1 ? ' minute' : ' minutes');
  }
  const seconds = Math.max(1, Math.ceil(safeMs / 1000));
  return 'Reload in ' + seconds + (seconds === 1 ? ' second' : ' seconds');
}

/**
 * Update the auto reload status indicator from background state.
 * @returns {Promise<void>}
 */
async function updateAutoReloadStatus() {
  if (!autoReloadStatusElement) {
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: GET_AUTO_RELOAD_STATUS_MESSAGE,
    });
    const status = response?.status;
    if (
      !status ||
      typeof status.remainingMs !== 'number' ||
      status.tabId === undefined
    ) {
      autoReloadStatusElement.hidden = true;
      autoReloadStatusElement.textContent = '';
      return;
    }
    autoReloadStatusElement.hidden = false;
    autoReloadStatusElement.textContent = formatRemainingCountdown(
      status.remainingMs,
    );
  } catch (error) {
    autoReloadStatusElement.hidden = true;
    autoReloadStatusElement.textContent = '';
    console.warn('[popup] Failed to read auto reload status:', error);
  }
}

/**
 * Start polling for auto reload countdown updates while popup is open.
 * @returns {void}
 */
function startAutoReloadStatusUpdates() {
  if (!autoReloadStatusElement) {
    return;
  }
  void updateAutoReloadStatus();
  if (autoReloadStatusTimer !== null) {
    clearInterval(autoReloadStatusTimer);
  }
  autoReloadStatusTimer = setInterval(() => {
    void updateAutoReloadStatus();
  }, AUTO_RELOAD_STATUS_REFRESH_INTERVAL);
}

startAutoReloadStatusUpdates();

window.addEventListener('unload', () => {
  if (autoReloadStatusTimer !== null) {
    clearInterval(autoReloadStatusTimer);
    autoReloadStatusTimer = null;
  }
});

// Listen for storage changes to update popup when user logs in/out
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.cloudAuthTokens) {
    void initializePopup();
  }
});
