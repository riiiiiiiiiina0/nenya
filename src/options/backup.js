/* global chrome */

import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';

/**
 * @typedef {Object} BackupCategoryState
 * @property {number | undefined} lastBackupAt
 * @property {string | undefined} lastBackupError
 * @property {number | undefined} lastBackupErrorAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastRestoreError
 * @property {number | undefined} lastRestoreErrorAt
 * @property {number | undefined} lastRemoteModifiedAt
 */

/**
 * @typedef {Object} AutomergeSyncState
 * @property {boolean} enabled
 * @property {number | undefined} lastSyncAt
 * @property {number | undefined} lastMergeAt
 * @property {number | undefined} conflictsResolved
 * @property {number | undefined} documentSize
 * @property {number | undefined} chunkCount
 * @property {string | undefined} lastSyncError
 * @property {number | undefined} lastSyncErrorAt
 */

/**
 * @typedef {Object} BackupState
 * @property {Record<string, BackupCategoryState>} categories
 * @property {AutomergeSyncState} [automerge]
 */

/**
 * @typedef {Object} BackupStatusResponse
 * @property {boolean} ok
 * @property {BackupState} [state]
 * @property {boolean} [loggedIn]
 * @property {string} [actorId]
 * @property {string} [error]
 */

/**
 * @typedef {Object} BackupActionResponse
 * @property {boolean} ok
 * @property {BackupState} [state]
 * @property {string[]} [errors]
 * @property {string} [error]
 */

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

const statusMessageElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('optionsBackupStatusMessage')
);
const lastBackupElement = /** @type {HTMLElement | null} */ (
  document.getElementById('optionsBackupLastBackup')
);
const lastRestoreElement = /** @type {HTMLElement | null} */ (
  document.getElementById('optionsBackupLastRestore')
);
const backupButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsBackupBackupButton')
);
const restoreButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsBackupRestoreButton')
);
const resetButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsBackupResetButton')
);

const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {BackupState | null} */
let currentState = null;
let loggedIn = false;
let actionInProgress = false;

/**
 * Display a toast using Toastify when available.
 * @param {string} message
 * @param {ToastVariant} variant
 * @returns {void}
 */
function showToast(message, variant) {
  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] ?? TOAST_BACKGROUND_BY_VARIANT.info;
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  if (typeof windowWithToastify.Toastify !== 'function') {
    return;
  }

  windowWithToastify.Toastify({
    text: message,
    duration: 4000,
    gravity: 'top',
    position: 'right',
    close: true,
    style: {
      background,
    },
  }).showToast();
}

/**
 * Format a timestamp for display.
 * @param {number | undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value || !Number.isFinite(value)) {
    return 'Never';
  }
  try {
    return dateFormatter.format(new Date(Number(value)));
  } catch (error) {
    return 'Never';
  }
}

/**
 * Determine the latest non-zero timestamp in the provided list.
 * @param {number[]} values
 * @returns {number}
 */
function getLatestTimestamp(values) {
  return values.reduce((latest, candidate) => {
    const normalized = Number(candidate);
    if (!Number.isFinite(normalized)) {
      return latest;
    }
    return Math.max(latest, normalized);
  }, 0);
}

/**
 * Compute the most recent error message across categories.
 * @param {BackupState | null} state
 * @returns {string | undefined}
 */
function extractLatestError(state) {
  if (!state || !state.categories) {
    return undefined;
  }

  let latestMessage;
  let latestTimestamp = 0;

  Object.values(state.categories).forEach((category) => {
    if (!category) {
      return;
    }
    const entries = [
      { message: category.lastBackupError, timestamp: category.lastBackupErrorAt },
      { message: category.lastRestoreError, timestamp: category.lastRestoreErrorAt },
    ];
    entries.forEach((entry) => {
      if (
        entry.message &&
        typeof entry.message === 'string' &&
        Number.isFinite(entry.timestamp) &&
        Number(entry.timestamp) > latestTimestamp
      ) {
        latestMessage = entry.message;
        latestTimestamp = Number(entry.timestamp);
      }
    });
  });

  if (
    state.automerge &&
    typeof state.automerge.lastSyncError === 'string' &&
    Number.isFinite(state.automerge.lastSyncErrorAt) &&
    Number(state.automerge.lastSyncErrorAt) > latestTimestamp
  ) {
    latestMessage = state.automerge.lastSyncError;
    latestTimestamp = Number(state.automerge.lastSyncErrorAt);
  }

  return latestMessage;
}

/**
 * Enable or disable controls based on connection and busy state.
 * @returns {void}
 */
function updateButtonStates() {
  const disableBackupActions = actionInProgress || !loggedIn;
  if (backupButton) {
    backupButton.disabled = disableBackupActions;
    backupButton.setAttribute('aria-disabled', disableBackupActions ? 'true' : 'false');
  }
  if (restoreButton) {
    restoreButton.disabled = disableBackupActions;
    restoreButton.setAttribute('aria-disabled', disableBackupActions ? 'true' : 'false');
  }
  if (resetButton) {
    resetButton.disabled = actionInProgress;
    resetButton.setAttribute('aria-disabled', actionInProgress ? 'true' : 'false');
  }
}

/**
 * Apply status data to the UI fields.
 * @param {BackupState | null} state
 * @param {boolean} isLoggedIn
 * @returns {void}
 */
function renderStatus(state, isLoggedIn) {
  currentState = state;
  loggedIn = isLoggedIn;

  if (lastBackupElement && state && state.categories) {
    const lastBackupTimes = Object.values(state.categories).map(
      (category) => Number(category?.lastBackupAt ?? 0),
    );
    if (state.automerge?.lastSyncAt) {
      lastBackupTimes.push(Number(state.automerge.lastSyncAt));
    }
    lastBackupElement.textContent = formatTimestamp(
      getLatestTimestamp(lastBackupTimes),
    );
  } else if (lastBackupElement) {
    lastBackupElement.textContent = 'Never';
  }

  if (lastRestoreElement && state && state.categories) {
    const lastRestoreTimes = Object.values(state.categories).map(
      (category) => Number(category?.lastRestoreAt ?? 0),
    );
    if (state.automerge?.lastMergeAt) {
      lastRestoreTimes.push(Number(state.automerge.lastMergeAt));
    }
    lastRestoreElement.textContent = formatTimestamp(
      getLatestTimestamp(lastRestoreTimes),
    );
  } else if (lastRestoreElement) {
    lastRestoreElement.textContent = 'Never';
  }

  if (statusMessageElement) {
    const latestError = extractLatestError(state);
    if (!isLoggedIn) {
      statusMessageElement.textContent =
        'Connect your Raindrop account to enable automatic backups.';
    } else if (latestError) {
      statusMessageElement.textContent = latestError;
    } else {
      statusMessageElement.textContent =
        'Backups are active and will run automatically when settings change.';
    }
  }

  updateButtonStates();
}

/**
 * Update the connection state for backup controls without fetching new data.
 * @param {boolean} isLoggedIn
 * @returns {void}
 */
export function setBackupConnectionState(isLoggedIn) {
  renderStatus(currentState, isLoggedIn);
}

/**
 * Request a fresh status snapshot from the background script.
 * @returns {Promise<void>}
 */
export function refreshBackupStatus() {
  return refreshStatus();
}

/**
 * Send a message to the background script.
 * @param {string} type
 * @returns {Promise<any>}
 */
function sendRuntimeMessage(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Refresh the current status from the background script.
 * @returns {Promise<void>}
 */
async function refreshStatus() {
  if (!statusMessageElement) {
    return;
  }

  try {
    const response = /** @type {BackupStatusResponse} */ (
      await sendRuntimeMessage(OPTIONS_BACKUP_MESSAGES.STATUS)
    );

    if (!response.ok || !response.state) {
      const message =
        response.error ||
        'Unable to load backup status. Try again after connecting to Raindrop.';
      statusMessageElement.textContent = message;
      const nextLoggedIn =
        typeof response.loggedIn === 'boolean' ? response.loggedIn : loggedIn;
      renderStatus(response.state ?? currentState, nextLoggedIn);
      return;
    }

    const nextLoggedIn =
      typeof response.loggedIn === 'boolean' ? response.loggedIn : loggedIn;
    renderStatus(response.state, nextLoggedIn);
  } catch (error) {
    statusMessageElement.textContent =
      error instanceof Error
        ? error.message
        : 'Unable to load backup status. Try again later.';
  }
}

/**
 * Execute an action and refresh the status afterwards.
 * @param {string} messageType
 * @param {string} successMessage
 * @returns {Promise<void>}
 */
async function runAction(messageType, successMessage) {
  if (actionInProgress) {
    return;
  }

  actionInProgress = true;
  updateButtonStates();

  try {
    const response = /** @type {BackupActionResponse} */ (
      await sendRuntimeMessage(messageType)
    );

    if (response.state) {
      renderStatus(response.state, loggedIn);
    }

    if (response.ok) {
      showToast(successMessage, 'success');
    } else {
      const message =
        (Array.isArray(response.errors) && response.errors[0]) ||
        response.error ||
        'The requested action failed. Try again later.';
      showToast(message, 'error');
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error. Try again later.';
    showToast(message, 'error');
  } finally {
    actionInProgress = false;
    void refreshStatus();
  }
}

/**
 * Initialize the backup controls.
 * @returns {void}
 */
function initializeBackupControls() {
  if (
    !statusMessageElement ||
    !lastBackupElement ||
    !lastRestoreElement ||
    !backupButton ||
    !restoreButton ||
    !resetButton
  ) {
    return;
  }

  backupButton.addEventListener('click', () => {
    void runAction(
      OPTIONS_BACKUP_MESSAGES.BACKUP_NOW,
      'Options backup completed successfully.',
    );
  });

  restoreButton.addEventListener('click', () => {
    void runAction(
      OPTIONS_BACKUP_MESSAGES.RESTORE_NOW,
      'Options restored from remote backup. Local changes discarded.',
    );
  });

  resetButton.addEventListener('click', () => {
    const confirmed = window.confirm(
      'Resetting will restore default options and overwrite your current settings. Continue?',
    );
    if (!confirmed) {
      return;
    }
    void runAction(
      OPTIONS_BACKUP_MESSAGES.RESET_DEFAULTS,
      'Options reset to defaults.',
    );
  });

  void refreshStatus();
}

initializeBackupControls();
