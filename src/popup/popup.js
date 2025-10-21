/* global chrome */

import '../options/theme.js';

const pullButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('pullButton'));
const saveUnsortedButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('saveUnsortedButton'));
const saveProjectButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('saveProjectButton'));
const openOptionsButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('openOptionsButton'));
const statusMessage = /** @type {HTMLDivElement | null} */ (document.getElementById('statusMessage'));
const projectsContainer = /** @type {HTMLDivElement | null} */ (document.getElementById('projectsContainer'));
const refreshProjectsButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('refreshProjectsButton'));

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

if (saveProjectButton) {
  saveProjectButton.addEventListener('click', () => {
    void handleSaveProject();
  });

  const refreshSaveProjectLabel = () => {
    void updateSaveProjectButtonLabel();
  };

  if (chrome.tabs?.onHighlighted?.addListener) {
    chrome.tabs.onHighlighted.addListener(refreshSaveProjectLabel);
  }
  if (chrome.tabs?.onActivated?.addListener) {
    chrome.tabs.onActivated.addListener(refreshSaveProjectLabel);
  }

  void updateSaveProjectButtonLabel();
} else {
  console.error('[popup] Save project button not found.');
}

if (refreshProjectsButton) {
  refreshProjectsButton.addEventListener('click', () => {
    void refreshProjectList();
  });
} else {
  console.error('[popup] Refresh projects button not found.');
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
        setStatus('Unable to open options page.', 'error');
      }
    });
  });
} else {
  console.error('[popup] Options button not found.');
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
 * Update the save project button label to reflect highlighted tab count.
 * @returns {Promise<void>}
 */
async function updateSaveProjectButtonLabel() {
  if (!saveProjectButton) {
    return;
  }

  try {
    const highlighted = await queryTabs({
      currentWindow: true,
      highlighted: true
    });

    let validCount = 0;
    highlighted.forEach((tab) => {
      if (!tab.url) {
        return;
      }
      const normalizedUrl = normalizeUrlForSave(tab.url);
      if (normalizedUrl) {
        validCount += 1;
      }
    });

    if (validCount > 1) {
      saveProjectButton.textContent = 'Save ' + validCount + ' tabs as project';
    } else {
      saveProjectButton.textContent = 'Save current tab as project';
    }
  } catch (error) {
    console.error('[popup] Unable to update save project button label.', error);
    saveProjectButton.textContent = 'Save current tab as project';
  }
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

/**
 * @typedef {Object} SavedProject
 * @property {number} id
 * @property {string} title
 * @property {number} itemCount
 * @property {string} url
 */

/**
 * Refresh the list of saved projects.
 * @returns {Promise<void>}
 */
async function refreshProjectList() {
  if (!projectsContainer) {
    return;
  }

  if (refreshProjectsButton) {
    refreshProjectsButton.disabled = true;
  }

  const loader = document.createElement('div');
  loader.className = 'text-sm text-base-content/70';
  loader.textContent = 'Loading...';
  projectsContainer.replaceChildren(loader);

  try {
    const response = await sendRuntimeMessage({ type: 'mirror:listProjects' });
    renderProjectsResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderProjectsError(message);
  } finally {
    if (refreshProjectsButton) {
      refreshProjectsButton.disabled = false;
    }
  }
}

/**
 * Render the projects list based on background response.
 * @param {any} response
 * @returns {void}
 */
function renderProjectsResponse(response) {
  if (!projectsContainer) {
    return;
  }

  if (!response || typeof response !== 'object') {
    renderProjectsError('Unable to load projects.');
    return;
  }

  if (!response.ok) {
    const errorText = typeof response.error === 'string'
      ? response.error
      : 'Unable to load projects.';
    renderProjectsError(errorText);
    return;
  }

  const projects = Array.isArray(response.projects) ? response.projects : [];
  if (projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-base-content/60';
    empty.textContent = 'No saved projects yet.';
    projectsContainer.replaceChildren(empty);
    return;
  }

  /** @type {HTMLElement[]} */
  const elements = [];
  projects.forEach((project) => {
    const element = renderProjectRow(project);
    if (element) {
      elements.push(element);
    }
  });

  if (elements.length === 0) {
    const fallback = document.createElement('div');
    fallback.className = 'text-sm text-error';
    fallback.textContent = 'Unable to display saved projects.';
    projectsContainer.replaceChildren(fallback);
    return;
  }

  projectsContainer.replaceChildren(...elements);
}

/**
 * Render an error message within the projects container.
 * @param {string} message
 * @returns {void}
 */
function renderProjectsError(message) {
  if (!projectsContainer) {
    return;
  }
  const errorNode = document.createElement('div');
  errorNode.className = 'text-sm text-error';
  errorNode.textContent = message;
  projectsContainer.replaceChildren(errorNode);
}

/**
 * Create an element for a single project row.
 * @param {SavedProject} project
 * @returns {HTMLElement | null}
 */
function renderProjectRow(project) {
  if (!project || typeof project !== 'object') {
    return null;
  }
  const id = Number(project.id);
  const title = typeof project.title === 'string' && project.title.trim()
    ? project.title.trim()
    : 'Untitled project';
  const itemCount = Number(project.itemCount);
  const url = typeof project.url === 'string' && project.url ? project.url : '';

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'btn btn-outline btn-sm w-full justify-between gap-2';
  row.setAttribute('role', 'listitem');
  row.textContent = title;

  const countBadge = document.createElement('span');
  countBadge.className = 'badge badge-neutral';
  countBadge.textContent = Number.isFinite(itemCount) && itemCount >= 0
    ? String(itemCount)
    : '—';

  row.appendChild(countBadge);

  if (url) {
    row.addEventListener('click', () => {
      openProjectUrl(url, id);
    });
  } else {
    row.disabled = true;
  }

  return row;
}

/**
 * Open the specified project URL in a new tab.
 * @param {string} url
 * @param {number} id
 * @returns {void}
 */
function openProjectUrl(url, id) {
  try {
    const maybePromise = chrome.tabs.create({ url });
    if (maybePromise && typeof maybePromise.then === 'function') {
      void maybePromise.catch((error) => {
        console.error('[popup] Failed to open project', id, error);
      });
    }
  } catch (error) {
    console.error('[popup] Failed to open project', id, error);
  }
}

void refreshProjectList();

/**
 * Handle the save project action from the popup.
 * @returns {Promise<void>}
 */
async function handleSaveProject() {
  if (!saveProjectButton) {
    return;
  }

  saveProjectButton.disabled = true;
  setStatus('Preparing project save...', 'info');

  try {
    const tabs = await collectSavableTabs();
    if (tabs.length === 0) {
      setStatus('No highlighted or active tabs available to save.', 'info');
      return;
    }

    const defaultName = await deriveDefaultProjectName(tabs[0]);
    const input = window.prompt('Project name', defaultName);
    if (input === null) {
      setStatus('Project save canceled.', 'info');
      return;
    }

    const projectName = input.trim();
    if (!projectName) {
      setStatus('Project name is required.', 'error');
      return;
    }

    const descriptors = buildProjectTabDescriptors(tabs);
    if (descriptors.length === 0) {
      setStatus('No valid tab URLs to save.', 'info');
      return;
    }

    setStatus('Saving project...', 'info');
    const response = await sendRuntimeMessage({
      type: 'mirror:saveProject',
      projectName,
      tabs: descriptors
    });

    handleSaveProjectResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'error');
  } finally {
    saveProjectButton.disabled = false;
  }
}

/**
 * @typedef {Object} ProjectTabDescriptor
 * @property {number} id
 * @property {number} windowId
 * @property {number} index
 * @property {number} groupId
 * @property {boolean} pinned
 * @property {string} url
 * @property {string} title
 */

/**
 * Build normalized tab descriptors for project saves.
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {ProjectTabDescriptor[]}
 */
function buildProjectTabDescriptors(tabs) {
  /** @type {ProjectTabDescriptor[]} */
  const descriptors = [];
  const seen = new Set();

  tabs.forEach((tab) => {
    if (!tab || typeof tab.id !== 'number' || !tab.url) {
      return;
    }

    const normalizedUrl = normalizeUrlForSave(tab.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    seen.add(normalizedUrl);

    descriptors.push({
      id: tab.id,
      windowId: typeof tab.windowId === 'number' ? tab.windowId : chrome.windows.WINDOW_ID_NONE,
      index: typeof tab.index === 'number' ? tab.index : -1,
      groupId: typeof tab.groupId === 'number' ? tab.groupId : chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
      pinned: Boolean(tab.pinned),
      url: normalizedUrl,
      title: typeof tab.title === 'string' ? tab.title : ''
    });
  });

  return descriptors;
}

/**
 * Compute the default project name from the first tab.
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<string>}
 */
async function deriveDefaultProjectName(tab) {
  const fallback = typeof tab.title === 'string' && tab.title.trim()
    ? tab.title.trim()
    : (typeof tab.url === 'string' ? safeHostname(tab.url) : '') || 'New project';

  if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
    return fallback;
  }

  const groupId = typeof tab.groupId === 'number' ? tab.groupId : -1;
  if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return fallback;
  }

  try {
    const group = await getTabGroup(groupId);
    const title = typeof group?.title === 'string' && group.title.trim() ? group.title.trim() : '';
    return title || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Get tab group details with promise semantics.
 * @param {number} groupId
 * @returns {Promise<chrome.tabGroups.TabGroup>}
 */
function getTabGroup(groupId) {
  return new Promise((resolve, reject) => {
    if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
      reject(new Error('Tab groups unavailable'));
      return;
    }

    chrome.tabGroups.get(groupId, (group) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(group);
    });
  });
}

/**
 * Extract hostname for fallback naming.
 * @param {string} url
 * @returns {string}
 */
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Update popup status based on a save project response.
 * @param {any} response
 * @returns {void}
 */
function handleSaveProjectResponse(response) {
  if (!response || typeof response !== 'object') {
    setStatus('Project save failed. Please try again.', 'error');
    return;
  }

  const projectName = typeof response.projectName === 'string' && response.projectName
    ? response.projectName
    : 'project';
  const created = Number(response.created) || 0;
  const skipped = Number(response.skipped) || 0;
  const failed = Number(response.failed) || 0;

  const fragments = [];
  fragments.push(created + ' tab(s) saved to ' + projectName);
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
