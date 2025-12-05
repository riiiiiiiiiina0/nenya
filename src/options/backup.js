/* global chrome */

import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';

/**
 * @typedef {Object} BackupState
 * @property {number | undefined} lastBackupAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastError
 * @property {number | undefined} lastErrorAt
 */

const statusElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('optionsBackupFloatingStatus')
);
const backupButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsFloatingBackupButton')
);
const restoreButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsFloatingRestoreButton')
);

const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

let loggedIn = false;
let actionInProgress = false;

/**
 * Show a toast via Toastify when available.
 * @param {string} message
 * @param {'success' | 'error' | 'info'} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;
  if (typeof windowWithToastify.Toastify === 'function') {
    windowWithToastify
      .Toastify({
        text: message,
        duration: 4000,
        gravity: 'top',
        position: 'right',
        close: true,
        style: { background },
      })
      .showToast();
  }
}

/**
 * Format a timestamp as MM/DD HH:mm (24h).
 * @param {number | undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value || !Number.isFinite(value)) {
    return '—';
  }
  try {
    const date = new Date(Number(value));
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${M}/${D} ${h}:${m}`;
  } catch (error) {
    return '—';
  }
}

/**
 * Update the status text.
 * @param {string} message
 * @returns {void}
 */
function setStatus(message) {
  if (!statusElement) {
    return;
  }
  statusElement.innerHTML = message.replace(/\n/g, '<br>');
  statusElement.setAttribute('aria-label', message.replace(/\n/g, ' '));
}

/**
 * Enable/disable buttons based on busy/logged in state.
 * @param {boolean} disabled
 * @returns {void}
 */
function updateButtonStates(disabled) {
  const disableBackupActions = disabled || !loggedIn;
  if (backupButton) {
    backupButton.disabled = disableBackupActions;
    backupButton.setAttribute(
      'aria-disabled',
      disableBackupActions ? 'true' : 'false',
    );
  }
  if (restoreButton) {
    restoreButton.disabled = disableBackupActions;
    restoreButton.setAttribute(
      'aria-disabled',
      disableBackupActions ? 'true' : 'false',
    );
  }
}

/**
 * Send a runtime message and resolve with the response.
 * @template T
 * @param {string} type
 * @returns {Promise<T>}
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
 * Refresh backup status from background.
 * @returns {Promise<void>}
 */
async function refreshStatus() {
  if (!statusElement) {
    return;
  }
  try {
    /** @type {{ ok: boolean, state?: BackupState, loggedIn?: boolean, error?: string }} */
    const response = await sendRuntimeMessage(OPTIONS_BACKUP_MESSAGES.STATUS);
    loggedIn = Boolean(response.loggedIn);
    const state = response.state;

    if (!response.ok || !state) {
      setStatus(
        response.error ||
          'Unable to load backup status. Connect Raindrop to enable manual backups.',
      );
      updateButtonStates(true);
      return;
    }

    const backupText = formatTimestamp(state.lastBackupAt);
    const restoreText = formatTimestamp(state.lastRestoreAt);
    if (!loggedIn) {
      setStatus('Connect your Raindrop account to back up or restore options.');
    } else if (state.lastError) {
      setStatus(
        'Last error: ' +
          state.lastError +
          '\nBackup ' +
          backupText +
          '\nRestore ' +
          restoreText,
      );
    } else {
      setStatus('Backup ' + backupText + '\nRestore ' + restoreText);
    }

    updateButtonStates(false);
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : 'Unable to load backup status. Try again later.',
    );
    updateButtonStates(true);
  }
}

/**
 * Run a backup/restore action.
 * @param {string} messageType
 * @param {string} successMessage
 * @returns {Promise<void>}
 */
async function runAction(messageType, successMessage) {
  if (actionInProgress) {
    return;
  }
  actionInProgress = true;
  updateButtonStates(true);
  try {
    /** @type {{ ok: boolean, errors?: string[], state?: BackupState }} */
    const response = await sendRuntimeMessage(messageType);
    if (response.state) {
      loggedIn = true;
    }
    if (response.ok) {
      showToast(successMessage, 'success');
    } else {
      const message =
        (Array.isArray(response.errors) && response.errors[0]) ||
        'The requested action failed. Check your Raindrop connection.';
      showToast(message, 'error');
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected error. Try again later.';
    showToast(message, 'error');
  } finally {
    actionInProgress = false;
    updateButtonStates(false);
    void refreshStatus();
  }
}

/**
 * Initialize floating backup controls.
 * @returns {void}
 */
function initializeBackupControls() {
  if (!backupButton || !restoreButton || !statusElement) {
    return;
  }

  backupButton.addEventListener('click', () => {
    void runAction(
      OPTIONS_BACKUP_MESSAGES.BACKUP_NOW,
      'Options backup saved to Raindrop.',
    );
  });

  restoreButton.addEventListener('click', () => {
    void runAction(
      OPTIONS_BACKUP_MESSAGES.RESTORE_NOW,
      'Options restored from Raindrop backup.',
    );
  });

  void refreshStatus();
}

document.addEventListener('DOMContentLoaded', initializeBackupControls);

/**
 * Allow other modules to update connection state (login/logout).
 * @param {boolean} isLoggedIn
 * @returns {void}
 */
export function setBackupConnectionState(isLoggedIn) {
  loggedIn = Boolean(isLoggedIn);
  updateButtonStates(false);
}

/**
 * Expose status refresh for other modules (options/bookmarks).
 * @returns {Promise<void>}
 */
export function refreshBackupStatus() {
  return refreshStatus();
}
