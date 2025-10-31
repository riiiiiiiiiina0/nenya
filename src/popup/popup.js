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
import { icons } from '../shared/icons.js';

const getMarkdownButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('getMarkdownButton')
);
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
const customFilterButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('customFilterButton')
);
const importCustomCodeButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('importCustomCodeButton')
);

// Set icon SVGs for header buttons
if (getMarkdownButton) {
  getMarkdownButton.innerHTML = icons['chat-bubble-oval-left-ellipsis'];
}
if (pullButton) {
  pullButton.innerHTML = icons['cloud-arrow-down'];
}
if (saveUnsortedButton) {
  saveUnsortedButton.innerHTML = icons['document-arrow-up'];
}
if (importCustomCodeButton) {
  importCustomCodeButton.innerHTML = icons['code-bracket-square'];
}
if (customFilterButton) {
  customFilterButton.innerHTML = icons.bolt;
}
if (openOptionsButton) {
  openOptionsButton.innerHTML = icons['adjustments-horizontal'];
}
if (saveProjectButton) {
  saveProjectButton.innerHTML = icons['rectangle-group'];
}
if (renameTabButton) {
  renameTabButton.innerHTML = icons['pencil-square'];
}
const importCustomCodeFileInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('importCustomCodeFileInput')
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
const mirrorSection = /** @type {HTMLElement | null} */ (
  document.querySelector('article[aria-labelledby="mirror-heading"]')
);

// Initialize mirror functionality
if (pullButton && saveUnsortedButton && statusMessage) {
  initializeMirror(pullButton, saveUnsortedButton, statusMessage);
}

// Initialize projects functionality
if (saveProjectButton && projectsContainer && statusMessage) {
  initializeProjects(saveProjectButton, projectsContainer, statusMessage);
}

if (!statusMessage) {
  console.error('[popup] Status element not found.');
}

if (getMarkdownButton) {
  getMarkdownButton.addEventListener('click', () => {
    void handleGetMarkdown();
  });
} else {
  console.error('[popup] Get markdown button not found.');
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

if (customFilterButton) {
  customFilterButton.addEventListener('click', () => {
    void handleCustomFilter();
  });
} else {
  console.error('[popup] Custom filter button not found.');
}

if (importCustomCodeButton && importCustomCodeFileInput) {
  importCustomCodeButton.addEventListener('click', () => {
    importCustomCodeFileInput.click();
  });

  importCustomCodeFileInput.addEventListener('change', (event) => {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    if (!target) {
      return;
    }
    const file = target.files?.[0];
    if (file) {
      void handleImportCustomCode(file);
    }
    // Reset the input so the same file can be selected again
    target.value = '';
  });
} else {
  console.error('[popup] Import custom code elements not found.');
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
    const customTitle = window.prompt(
      'Enter custom title for this tab:',
      currentTitle,
    );

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
          title: customTitle.trim(),
        },
      });
    } catch (error) {
      console.error('[popup] Failed to save custom title to storage:', error);
    }

    // Send message to content script to rename the tab
    try {
      await chrome.tabs.sendMessage(currentTab.id, {
        type: 'renameTab',
        title: customTitle.trim(),
      });
      if (statusMessage) {
        concludeStatus(
          'Tab renamed successfully!',
          'success',
          3000,
          statusMessage,
        );
      }
    } catch (error) {
      // Fallback: if the content script isn't ready yet, apply directly in the page
      console.error(
        '[popup] Failed to send rename message, applying fallback:',
        error,
      );
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: (title) => {
            try {
              document.title = title;
            } catch (e) {}
            const el = document.querySelector('title');
            if (el) {
              el.textContent = title;
            } else {
              const t = document.createElement('title');
              t.textContent = title;
              (document.head || document.documentElement).appendChild(t);
            }
          },
          args: [customTitle.trim()],
          world: 'ISOLATED',
        });
        if (statusMessage) {
          concludeStatus(
            'Tab renamed successfully!',
            'success',
            3000,
            statusMessage,
          );
        }
      } catch (fallbackError) {
        console.error('[popup] Fallback title apply failed:', fallbackError);
        if (statusMessage) {
          concludeStatus(
            'Failed to rename tab. Please refresh the page and try again.',
            'error',
            4000,
            statusMessage,
          );
        }
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
 * Handle the custom filter creation.
 * @returns {Promise<void>}
 */
async function handleCustomFilter() {
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

    // Check if tab has a valid ID
    if (typeof currentTab.id !== 'number') {
      if (statusMessage) {
        concludeStatus('Invalid tab ID.', 'error', 3000, statusMessage);
      }
      return;
    }

    // Send message to background to launch the element picker
    await chrome.runtime.sendMessage({
      type: 'launchElementPicker',
      tabId: currentTab.id,
    });

    // Close the popup
    window.close();
  } catch (error) {
    console.error('[popup] Error launching element picker:', error);
    if (statusMessage) {
      concludeStatus(
        'Unable to launch element picker.',
        'error',
        3000,
        statusMessage,
      );
    }
  }
}

/**
 * @typedef {Object} CustomCodeRule
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const CUSTOM_CODE_STORAGE_KEY = 'customCodeRules';

/**
 * Generate a unique identifier for new rules.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Validate imported custom code rule data.
 * @param {unknown} data - The parsed JSON data
 * @returns {{ isValid: boolean, rule?: CustomCodeRule, error?: string }}
 */
function validateImportedRule(data) {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Invalid JSON structure' };
  }

  const raw = /** @type {Record<string, unknown>} */ (data);

  // Check required fields
  if (typeof raw.pattern !== 'string' || !raw.pattern.trim()) {
    return { isValid: false, error: 'Missing or invalid pattern field' };
  }

  if (typeof raw.css !== 'string' && typeof raw.js !== 'string') {
    return {
      isValid: false,
      error: 'At least one of CSS or JS code must be provided',
    };
  }

  // Validate URL pattern
  try {
    // eslint-disable-next-line no-new
    new URLPattern(raw.pattern);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL pattern format' };
  }

  // Create validated rule
  const rule = {
    id: generateRuleId(), // Generate new ID to avoid conflicts
    pattern: raw.pattern.trim(),
    css: typeof raw.css === 'string' ? raw.css : '',
    js: typeof raw.js === 'string' ? raw.js : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { isValid: true, rule };
}

/**
 * Load existing custom code rules from storage.
 * @returns {Promise<CustomCodeRule[]>}
 */
async function loadCustomCodeRules() {
  try {
    const stored = await chrome.storage.local.get(CUSTOM_CODE_STORAGE_KEY);
    const rules = stored?.[CUSTOM_CODE_STORAGE_KEY] || [];
    return Array.isArray(rules) ? rules : [];
  } catch (error) {
    console.error('[popup] Failed to load custom code rules:', error);
    return [];
  }
}

/**
 * Save custom code rules to storage.
 * @param {CustomCodeRule[]} rules - The rules to save
 * @returns {Promise<void>}
 */
async function saveCustomCodeRules(rules) {
  try {
    await chrome.storage.local.set({
      [CUSTOM_CODE_STORAGE_KEY]: rules,
    });
  } catch (error) {
    console.error('[popup] Failed to save custom code rules:', error);
    throw error;
  }
}

/**
 * Handle importing a custom code rule from JSON file.
 * @param {File} file - The JSON file to import
 * @returns {Promise<void>}
 */
async function handleImportCustomCode(file) {
  try {
    // Validate file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      if (statusMessage) {
        concludeStatus(
          'Please select a valid JSON file.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Read file content
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      if (statusMessage) {
        concludeStatus(
          'Invalid JSON file format.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Validate rule data
    const validation = validateImportedRule(data);
    if (!validation.isValid) {
      if (statusMessage) {
        concludeStatus(
          `Import failed: ${validation.error}`,
          'error',
          4000,
          statusMessage,
        );
      }
      return;
    }

    const newRule = validation.rule;
    if (!newRule) {
      if (statusMessage) {
        concludeStatus(
          'Failed to create rule from import.',
          'error',
          3000,
          statusMessage,
        );
      }
      return;
    }

    // Load existing rules
    const existingRules = await loadCustomCodeRules();

    // Check for duplicate pattern
    const duplicatePattern = existingRules.find(
      (rule) => rule.pattern === newRule.pattern,
    );
    if (duplicatePattern) {
      if (statusMessage) {
        concludeStatus(
          'A rule with this pattern already exists.',
          'error',
          4000,
          statusMessage,
        );
      }
      return;
    }

    // Add new rule
    const updatedRules = [...existingRules, newRule];
    await saveCustomCodeRules(updatedRules);

    if (statusMessage) {
      concludeStatus(
        `Custom code rule imported successfully for "${newRule.pattern}"`,
        'success',
        4000,
        statusMessage,
      );
    }
  } catch (error) {
    console.error('[popup] Error importing custom code rule:', error);
    if (statusMessage) {
      concludeStatus(
        'Failed to import custom code rule.',
        'error',
        3000,
        statusMessage,
      );
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

// Check if we should navigate to chat page (triggered by keyboard shortcut)
void (async () => {
  try {
    const result = await chrome.storage.local.get('openChatPage');
    if (result.openChatPage) {
      // Clear the flag
      await chrome.storage.local.remove('openChatPage');
      // Navigate to chat page
      window.location.href = 'chat.html';
      return;
    }
  } catch (error) {
    console.error('[popup] Failed to check chat page flag:', error);
  }

  // Initialize the popup normally
  void initializePopup();
})();

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

/**
 * Handle getting page content as markdown.
 * Opens the chat with LLM page within the same popup.
 * @returns {void}
 */
function handleGetMarkdown() {
  // Navigate to the chat page within the same popup window
  window.location.href = 'chat.html';
}

// Listen for storage changes to update popup when user logs in/out
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.cloudAuthTokens) {
    void initializePopup();
  }
});
