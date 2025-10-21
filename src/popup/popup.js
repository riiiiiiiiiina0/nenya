/* global chrome */

const pullButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('pullButton'));
const statusMessage = /** @type {HTMLDivElement | null} */ (document.getElementById('statusMessage'));

const STATUS_CLASS_SUCCESS = 'text-success';
const STATUS_CLASS_ERROR = 'text-error';
const STATUS_CLASS_INFO = 'text-base-content/80';

/**
 * Send a runtime message with promise semantics.
 * @template T
 * @param {any} payload
 * @returns {Promise<T>}
 */
function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
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
 * Update the popup status text and styling.
 * @param {string} text
 * @param {'success' | 'error' | 'info'} tone
 * @returns {void}
 */
function setStatus(text, tone) {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = text;
  statusMessage.classList.remove(STATUS_CLASS_SUCCESS, STATUS_CLASS_ERROR, STATUS_CLASS_INFO);
  if (tone === 'success') {
    statusMessage.classList.add(STATUS_CLASS_SUCCESS);
  } else if (tone === 'error') {
    statusMessage.classList.add(STATUS_CLASS_ERROR);
  } else {
    statusMessage.classList.add(STATUS_CLASS_INFO);
  }
}

/**
 * Format a summary of applied changes.
 * @param {{ bookmarksCreated?: number, bookmarksUpdated?: number, bookmarksMoved?: number, bookmarksDeleted?: number, foldersCreated?: number, foldersRemoved?: number } | undefined} stats
 * @returns {string}
 */
function formatStats(stats) {
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

if (pullButton) {
  pullButton.addEventListener('click', () => {
    pullButton.disabled = true;
    setStatus('Syncing bookmarks...', 'info');

    sendRuntimeMessage({ type: 'mirror:pull' }).then((response) => {
      if (response && response.ok) {
        const summary = formatStats(response.stats);
        setStatus('Sync complete. ' + summary, 'success');
      } else {
        const message = response && typeof response.error === 'string'
          ? response.error
          : 'Sync failed. Please try again.';
        setStatus(message, 'error');
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, 'error');
    }).finally(() => {
      pullButton.disabled = false;
    });
  });
} else {
  console.error('[popup] Sync button not found.');
  setStatus('Unable to locate sync controls.', 'error');
}

if (!statusMessage) {
  console.error('[popup] Status element not found.');
}
