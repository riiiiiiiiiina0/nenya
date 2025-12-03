/* global chrome */

import {
  sendRuntimeMessage,
  setStatus,
  concludeStatus,
  queryTabs,
  normalizeUrlForSave,
  collectSavableTabs,
} from './shared.js';
import { convertSplitUrlForSave } from '../shared/splitUrl.js';
import { TOKEN_VALIDATION_MESSAGE } from '../shared/tokenRefresh.js';

/**
 * @typedef {Object} TokenValidationResult
 * @property {boolean} isValid
 * @property {boolean} needsReauth
 * @property {string} [error]
 */

/**
 * Check if tokens exist in storage (quick local check).
 * @returns {Promise<boolean>}
 */
async function hasStoredTokens() {
  try {
    const result = await chrome.storage.sync.get('cloudAuthTokens');
    const tokens = result.cloudAuthTokens;
    if (!tokens || typeof tokens !== 'object') {
      return false;
    }

    for (const providerId in tokens) {
      const providerTokens = tokens[providerId];
      if (
        providerTokens &&
        typeof providerTokens === 'object' &&
        providerTokens.accessToken
      ) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if user is logged in to any cloud bookmark provider.
 * This asks the background to validate tokens (and attempt refresh if expired).
 * @returns {Promise<boolean>}
 */
export async function isUserLoggedIn() {
  try {
    // First, quick local check - if no tokens exist, user is not logged in
    const hasTokens = await hasStoredTokens();
    if (!hasTokens) {
      return false;
    }

    // Ask background to validate tokens (this will attempt refresh if expired)
    const response = await sendRuntimeMessage({
      type: TOKEN_VALIDATION_MESSAGE,
    });

    if (response && response.isValid) {
      return true;
    }

    // If needsReauth is true, tokens exist but are expired and couldn't be refreshed
    // We still return true so the popup shows the UI, but operations will fail
    // and guide user to reconnect
    if (response && response.needsReauth) {
      // Return true so user sees the UI but with appropriate error messages
      return true;
    }

    return false;
  } catch (error) {
    console.error('[popup] Error checking login status:', error);
    // Fall back to local check if background communication fails
    return hasStoredTokens();
  }
}

/**
 * Get detailed token validation status.
 * @returns {Promise<TokenValidationResult>}
 */
export async function getTokenValidationStatus() {
  try {
    const hasTokens = await hasStoredTokens();
    if (!hasTokens) {
      return {
        isValid: false,
        needsReauth: true,
        error: 'No tokens stored. Please connect to Raindrop.',
      };
    }

    const response = await sendRuntimeMessage({
      type: TOKEN_VALIDATION_MESSAGE,
    });

    return {
      isValid: response?.isValid ?? false,
      needsReauth: response?.needsReauth ?? true,
      error: response?.error,
    };
  } catch (error) {
    return {
      isValid: false,
      needsReauth: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Show or hide the Mirror Cloud Bookmarks section based on login status.
 * @param {boolean} isLoggedIn
 * @param {HTMLElement} mirrorSection
 * @returns {void}
 */
export function toggleMirrorSection(isLoggedIn, mirrorSection) {
  if (!mirrorSection) {
    return;
  }

  if (isLoggedIn) {
    mirrorSection.style.display = 'block';
  } else {
    mirrorSection.style.display = 'none';
  }
}

/**
 * Show a message directing users to login via options page.
 * @param {HTMLElement} statusMessage
 * @param {HTMLElement} openOptionsButton
 * @param {string} [errorMessage] - Optional custom error message for reauth scenarios
 * @returns {void}
 */
export function showLoginMessage(statusMessage, openOptionsButton, errorMessage) {
  if (!statusMessage) {
    return;
  }

  const isReauth = Boolean(errorMessage);
  const displayMessage = errorMessage ||
    'Connect to a cloud bookmark provider to sync your bookmarks, saved projects, and options.';
  const buttonText = isReauth ? 'Reconnect in Options' : 'Go to Options to Connect';

  const loginMessage = document.createElement('div');
  loginMessage.className = 'card w-full bg-base-100 shadow-xl';
  loginMessage.innerHTML = `
    <div class="card-body gap-4">
      <div class="text-center space-y-2">
        <p class="text-sm ${isReauth ? 'text-warning' : 'text-base-content/70'}">${displayMessage}</p>
        <button id="goToOptionsButton" class="btn ${isReauth ? 'btn-warning' : 'btn-primary'} w-full" type="button">
          ${buttonText}
        </button>
      </div>
    </div>
  `;

  // Replace the main content with login message
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = '';
    main.appendChild(loginMessage);

    // Add event listener for the options button
    const goToOptionsButton = document.getElementById('goToOptionsButton');
    if (goToOptionsButton && openOptionsButton) {
      goToOptionsButton.addEventListener('click', () => {
        openOptionsButton.click();
      });
    }
  }
}

/**
 * Format a summary of applied changes.
 * @param {{ bookmarksCreated?: number, bookmarksUpdated?: number, bookmarksMoved?: number, bookmarksDeleted?: number, foldersCreated?: number, foldersRemoved?: number } | undefined} stats
 * @returns {string}
 */
export function formatStats(stats) {
  if (!stats) {
    return 'No changes detected.';
  }

  const entries = [];
  if (stats.bookmarksCreated) {
    entries.push(stats.bookmarksCreated + ' bookmark(s) created');
  }
  if (stats.bookmarksUpdated) {
    entries.push(stats.bookmarksUpdated + ' bookmark(s) updated');
  }
  if (stats.bookmarksMoved) {
    entries.push(stats.bookmarksMoved + ' bookmark(s) moved');
  }
  if (stats.bookmarksDeleted) {
    entries.push(stats.bookmarksDeleted + ' bookmark(s) removed');
  }
  if (stats.foldersCreated) {
    entries.push(stats.foldersCreated + ' folder(s) added');
  }
  if (stats.foldersRemoved) {
    entries.push(stats.foldersRemoved + ' folder(s) removed');
  }

  if (entries.length === 0) {
    return 'No changes detected.';
  }

  return entries.join(', ');
}

/**
 * @typedef {Object} SaveUnsortedEntry
 * @property {string} url
 * @property {string} [title]
 */

/**
 * Handle the save to Unsorted action from the popup.
 * @param {HTMLElement} saveUnsortedButton
 * @param {HTMLElement} statusMessage
 * @returns {Promise<void>}
 */
export async function handleSaveToUnsorted(saveUnsortedButton, statusMessage) {
  if (!saveUnsortedButton) {
    return;
  }

  /** @type {HTMLButtonElement} */ (saveUnsortedButton).disabled = true;
  setStatus('Saving tabs to Unsorted...', 'info', statusMessage);

  try {
    const tabs = await collectSavableTabs();
    if (tabs.length === 0) {
      concludeStatus(
        'No highlighted or active tabs available to save.',
        'info',
        3000,
        statusMessage,
      );
      return;
    }

    const entries = buildSaveEntriesFromTabs(tabs);
    if (entries.length === 0) {
      concludeStatus('No valid tab URLs to save.', 'info', 3000, statusMessage);
      return;
    }

    const response = await sendRuntimeMessage({
      type: 'mirror:saveToUnsorted',
      entries,
    });

    handleSaveResponse(response, statusMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    concludeStatus(message, 'error', 3000, statusMessage);
  } finally {
    /** @type {HTMLButtonElement} */ (saveUnsortedButton).disabled = false;
  }
}

/**
 * Build save entries from tab descriptors.
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {SaveUnsortedEntry[]}
 */
function buildSaveEntriesFromTabs(tabs) {
  /** @type {SaveUnsortedEntry[]} */
  const entries = [];
  const seen = new Set();

  tabs.forEach((tab) => {
    if (!tab.url) {
      return;
    }
    // Convert split page URLs to nenya.local format before normalizing
    const convertedUrl = convertSplitUrlForSave(tab.url);
    const normalizedUrl = normalizeUrlForSave(convertedUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    seen.add(normalizedUrl);
    entries.push({
      url: normalizedUrl,
      title: typeof tab.title === 'string' ? tab.title : '',
    });
  });

  return entries;
}

/**
 * Update popup status based on a save response.
 * @param {any} response
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
function handleSaveResponse(response, statusMessage) {
  if (!response || typeof response !== 'object') {
    concludeStatus(
      'Save failed. Please try again.',
      'error',
      3000,
      statusMessage,
    );
    return;
  }

  const created = Number(response.created) || 0;
  const updated = Number(response.updated) || 0;
  const skipped = Number(response.skipped) || 0;
  const failed = Number(response.failed) || 0;
  const savedCount = created + updated;
  const fragments = [];

  fragments.push(savedCount + ' tab(s) saved');
  if (skipped > 0) {
    fragments.push(skipped + ' skipped');
  }
  if (failed > 0) {
    fragments.push(failed + ' failed');
  }

  const message = fragments.join('. ') + '.';

  if (response.ok) {
    concludeStatus(message, 'success', 3000, statusMessage);
    return;
  }

  const errorText =
    typeof response.error === 'string' ? response.error : message;
  concludeStatus(errorText, 'error', 3000, statusMessage);
}

/**
 * Initialize mirror functionality with event listeners.
 * @param {HTMLElement} pullButton
 * @param {HTMLElement} saveUnsortedButton
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
export function initializeMirror(
  pullButton,
  saveUnsortedButton,
  statusMessage,
) {
  if (pullButton) {
    pullButton.addEventListener('click', () => {
      /** @type {HTMLButtonElement} */ (pullButton).disabled = true;
      setStatus('Syncing bookmarks...', 'info', statusMessage);

      sendRuntimeMessage({ type: 'mirror:pull' })
        .then((response) => {
          if (response && response.ok) {
            const summary = formatStats(response.stats);
            concludeStatus(
              'Sync complete. ' + summary,
              'success',
              3000,
              statusMessage,
            );
          } else {
            const message =
              response && typeof response.error === 'string'
                ? response.error
                : 'Sync failed. Please try again.';
            concludeStatus(message, 'error', 3000, statusMessage);
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          concludeStatus(message, 'error', 3000, statusMessage);
        })
        .finally(() => {
          /** @type {HTMLButtonElement} */ (pullButton).disabled = false;
        });
    });
  } else {
    console.error('[popup] Sync button not found.');
    concludeStatus(
      'Unable to locate sync controls.',
      'error',
      3000,
      statusMessage,
    );
  }

  if (saveUnsortedButton) {
    saveUnsortedButton.addEventListener('click', () => {
      void handleSaveToUnsorted(saveUnsortedButton, statusMessage);
    });
  } else {
    console.error('[popup] Save button not found.');
  }
}
