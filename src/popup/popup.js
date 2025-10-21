/* global chrome */

const pullButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('pullButton'));
const saveUnsortedButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('saveUnsortedButton'));
const statusMessage = /** @type {HTMLDivElement | null} */ (document.getElementById('statusMessage'));

const STATUS_CLASS_SUCCESS = 'text-success';
const STATUS_CLASS_ERROR = 'text-error';
const STATUS_CLASS_INFO = 'text-base-content/80';

/**
 * @typedef {Object} SaveUnsortedEntry
 * @property {string} url
 * @property {string} [title]
 */

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

if (saveUnsortedButton) {
  saveUnsortedButton.addEventListener('click', () => {
    void handleSaveToUnsorted();
  });
} else {
  console.error('[popup] Save button not found.');
}

if (!statusMessage) {
  console.error('[popup] Status element not found.');
}

/**
 * Handle the save to Unsorted action from the popup.
 * @returns {Promise<void>}
 */
async function handleSaveToUnsorted() {
  if (!saveUnsortedButton) {
    return;
  }

  saveUnsortedButton.disabled = true;
  setStatus('Saving tabs to Unsorted...', 'info');

  try {
    const tabs = await collectSavableTabs();
    if (tabs.length === 0) {
      setStatus('No highlighted or active tabs available to save.', 'info');
      return;
    }

    const entries = buildSaveEntriesFromTabs(tabs);
    if (entries.length === 0) {
      setStatus('No valid tab URLs to save.', 'info');
      return;
    }

    const response = await sendRuntimeMessage({
      type: 'mirror:saveToUnsorted',
      entries
    });

    handleSaveResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'error');
  } finally {
    saveUnsortedButton.disabled = false;
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
    const normalizedUrl = normalizeUrlForSave(tab.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    seen.add(normalizedUrl);
    entries.push({
      url: normalizedUrl,
      title: typeof tab.title === 'string' ? tab.title : ''
    });
  });

  return entries;
}

/**
 * Gather highlighted tabs or fall back to the active tab in the current window.
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function collectSavableTabs() {
  const highlighted = await queryTabs({
    currentWindow: true,
    highlighted: true
  });
  const candidates = highlighted.length > 0 ? highlighted : await queryTabs({
    currentWindow: true,
    active: true
  });
  return candidates.filter((tab) => Boolean(tab.url) && Boolean(normalizeUrlForSave(tab.url)));
}

/**
 * Query chrome tabs, returning a promise.
 * @param {chrome.tabs.QueryInfo} queryInfo
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tabs);
    });
  });
}

/**
 * Normalize a URL string for saving, ensuring supported protocols.
 * @param {string} url
 * @returns {string | undefined}
 */
function normalizeUrlForSave(url) {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Update popup status based on a save response.
 * @param {any} response
 * @returns {void}
 */
function handleSaveResponse(response) {
  if (!response || typeof response !== 'object') {
    setStatus('Save failed. Please try again.', 'error');
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
    setStatus(message, 'success');
    return;
  }

  const errorText = typeof response.error === 'string' ? response.error : message;
  setStatus(errorText, 'error');
}
