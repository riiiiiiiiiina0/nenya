/* global chrome */

import {
  sendRuntimeMessage,
  setStatus,
  concludeStatus,
  queryTabs,
  normalizeUrlForSave,
  collectSavableTabs,
} from './shared.js';

/**
 * @typedef {Object} SavedProject
 * @property {number} id
 * @property {string} title
 * @property {number} itemCount
 * @property {string} url
 */

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
 * Refresh the list of saved projects.
 * @param {HTMLElement} projectsContainer
 * @param {HTMLElement} refreshProjectsButton
 * @returns {Promise<void>}
 */
export async function refreshProjectList(
  projectsContainer,
  refreshProjectsButton,
) {
  if (!projectsContainer) {
    return;
  }

  if (refreshProjectsButton) {
    /** @type {HTMLButtonElement} */ (refreshProjectsButton).disabled = true;
    refreshProjectsButton.textContent = 'Loading...';
  }

  // Apply loading state to projects container
  projectsContainer.style.opacity = '0.5';
  projectsContainer.style.pointerEvents = 'none';

  try {
    // First, try to load cached projects for immediate display
    const cachedResponse = await sendRuntimeMessage({
      type: 'projects:getCachedProjects',
    });
    if (
      cachedResponse &&
      cachedResponse.ok &&
      Array.isArray(cachedResponse.projects)
    ) {
      // Render cached data immediately
      renderProjectsResponse(cachedResponse, projectsContainer);

      // Reset loading state for cached data
      projectsContainer.style.opacity = '';
      projectsContainer.style.pointerEvents = '';

      if (refreshProjectsButton) {
        /** @type {HTMLButtonElement} */ (
          refreshProjectsButton
        ).disabled = false;
        refreshProjectsButton.textContent = '🔄️';
      }
    }

    // Then fetch fresh data in the background
    const response = await sendRuntimeMessage({
      type: 'projects:listProjects',
    });
    renderProjectsResponse(response, projectsContainer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderProjectsError(message, projectsContainer);
  } finally {
    // Reset loading state
    projectsContainer.style.opacity = '';
    projectsContainer.style.pointerEvents = '';

    if (refreshProjectsButton) {
      /** @type {HTMLButtonElement} */ (refreshProjectsButton).disabled = false;
      refreshProjectsButton.textContent = '🔄️';
    }
  }
}

/**
 * Render the projects list based on background response.
 * @param {any} response
 * @param {HTMLElement} projectsContainer
 * @returns {void}
 */
function renderProjectsResponse(response, projectsContainer) {
  if (!projectsContainer) {
    return;
  }

  if (!response || typeof response !== 'object') {
    renderProjectsError('Unable to load projects.', projectsContainer);
    return;
  }

  if (!response.ok) {
    const errorText =
      typeof response.error === 'string'
        ? response.error
        : 'Unable to load projects.';
    renderProjectsError(errorText, projectsContainer);
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
 * @param {HTMLElement} projectsContainer
 * @returns {void}
 */
function renderProjectsError(message, projectsContainer) {
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
  if (!Number.isFinite(id)) {
    return null;
  }
  const title =
    typeof project.title === 'string' && project.title.trim()
      ? project.title.trim()
      : 'Untitled project';
  const itemCount = Number(project.itemCount);
  const url = typeof project.url === 'string' && project.url ? project.url : '';

  const container = document.createElement('div');
  container.className = 'flex items-center gap-2 w-full';
  container.setAttribute('role', 'listitem');

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className =
    'btn btn-outline btn-sm flex-1 justify-between gap-2 min-w-0';

  // Create title element with truncation
  const titleElement = document.createElement('span');
  titleElement.className = 'text-left truncate flex-1 min-w-0';
  titleElement.textContent = title;
  titleElement.title = title; // Show full title on hover

  // Create count badge
  const countBadge = document.createElement('span');
  countBadge.className = 'badge badge-neutral flex-shrink-0';
  countBadge.textContent =
    Number.isFinite(itemCount) && itemCount >= 0 ? String(itemCount) : '—';

  openButton.appendChild(titleElement);
  openButton.appendChild(countBadge);

  if (url) {
    openButton.addEventListener('click', () => {
      openProjectUrl(url, id);
    });
  } else {
    /** @type {HTMLButtonElement} */ (openButton).disabled = true;
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn-ghost btn-sm flex-shrink-0';
  addButton.textContent = '🔼';
  const addLabel = 'Add current tabs to ' + title;
  addButton.setAttribute('aria-label', addLabel);
  addButton.title = addLabel;
  addButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleAddTabsToProject(id, title, addButton);
  });

  container.append(openButton, addButton);

  return container;
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

/**
 * Handle the save project action from the popup.
 * @param {HTMLElement} saveProjectButton
 * @param {HTMLElement} statusMessage
 * @returns {Promise<void>}
 */
export async function handleSaveProject(saveProjectButton, statusMessage) {
  if (!saveProjectButton) {
    return;
  }

  /** @type {HTMLButtonElement} */ (saveProjectButton).disabled = true;
  setStatus('Preparing project save...', 'info', statusMessage);

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

    const defaultName = await deriveDefaultProjectName(tabs[0]);
    const input = window.prompt('Project name', defaultName);
    if (input === null) {
      concludeStatus('Project save canceled.', 'info', 3000, statusMessage);
      return;
    }

    const projectName = input.trim();
    if (!projectName) {
      concludeStatus('Project name is required.', 'error', 3000, statusMessage);
      return;
    }

    const descriptors = buildProjectTabDescriptors(tabs);
    if (descriptors.length === 0) {
      concludeStatus('No valid tab URLs to save.', 'info', 3000, statusMessage);
      return;
    }

    setStatus('Saving project...', 'info', statusMessage);
    const response = await sendRuntimeMessage({
      type: 'projects:saveProject',
      projectName,
      tabs: descriptors,
    });

    handleSaveProjectResponse(response, statusMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    concludeStatus(message, 'error', 3000, statusMessage);
  } finally {
    /** @type {HTMLButtonElement} */ (saveProjectButton).disabled = false;
  }
}

/**
 * Add highlighted or active tabs to an existing project.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @returns {Promise<void>}
 */
async function handleAddTabsToProject(projectId, projectTitle, trigger) {
  if (!Number.isFinite(projectId)) {
    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
      concludeStatus(
        'Project unavailable. Please refresh and try again.',
        'error',
        3000,
        statusElement,
      );
    }
    return;
  }

  const button = trigger;
  const displayName =
    typeof projectTitle === 'string' && projectTitle.trim()
      ? projectTitle.trim()
      : 'project';

  if (button) {
    /** @type {HTMLButtonElement} */ (button).disabled = true;
  }

  const statusElement = document.getElementById('statusMessage');
  if (statusElement) {
    setStatus(
      'Preparing to add tabs to ' + displayName + '...',
      'info',
      statusElement,
    );
  }

  try {
    const tabs = await collectSavableTabs();
    if (tabs.length === 0) {
      const statusElement = document.getElementById('statusMessage');
      if (statusElement) {
        concludeStatus(
          'No highlighted or active tabs available to save.',
          'info',
          3000,
          statusElement,
        );
      }
      return;
    }

    const descriptors = buildProjectTabDescriptors(tabs);
    if (descriptors.length === 0) {
      const statusElement = document.getElementById('statusMessage');
      if (statusElement) {
        concludeStatus(
          'No valid tab URLs to save.',
          'info',
          3000,
          statusElement,
        );
      }
      return;
    }

    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
      setStatus('Adding tabs to ' + displayName + '...', 'info', statusElement);
    }
    const response = await sendRuntimeMessage({
      type: 'projects:addTabsToProject',
      projectId,
      tabs: descriptors,
    });

    if (statusElement) {
      handleSaveProjectResponse(response, statusElement);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorStatusElement = document.getElementById('statusMessage');
    if (errorStatusElement) {
      concludeStatus(message, 'error', 3000, errorStatusElement);
    }
  } finally {
    if (button) {
      /** @type {HTMLButtonElement} */ (button).disabled = false;
    }
  }
}

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
      windowId:
        typeof tab.windowId === 'number'
          ? tab.windowId
          : chrome.windows.WINDOW_ID_NONE,
      index: typeof tab.index === 'number' ? tab.index : -1,
      groupId:
        typeof tab.groupId === 'number'
          ? tab.groupId
          : chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
      pinned: Boolean(tab.pinned),
      url: normalizedUrl,
      title: typeof tab.title === 'string' ? tab.title : '',
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
  const fallback =
    typeof tab.title === 'string' && tab.title.trim()
      ? tab.title.trim()
      : (typeof tab.url === 'string' ? safeHostname(tab.url) : '') ||
        'New project';

  if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
    return fallback;
  }

  const groupId = typeof tab.groupId === 'number' ? tab.groupId : -1;
  if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return fallback;
  }

  try {
    const group = await getTabGroup(groupId);
    const title =
      typeof group?.title === 'string' && group.title.trim()
        ? group.title.trim()
        : '';
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
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
function handleSaveProjectResponse(response, statusMessage) {
  if (!response || typeof response !== 'object') {
    concludeStatus(
      'Project save failed. Please try again.',
      'error',
      3000,
      statusMessage,
    );
    return;
  }

  const projectName =
    typeof response.projectName === 'string' && response.projectName
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
    concludeStatus(message, 'success', 3000, statusMessage);
    // Auto-refresh the projects list after successful save
    const projectsContainer = document.getElementById('projectsContainer');
    const refreshButton = document.getElementById('refreshProjectsButton');
    if (projectsContainer && refreshButton) {
      void refreshProjectList(projectsContainer, refreshButton);
    }
    return;
  }

  const errorText =
    typeof response.error === 'string' ? response.error : message;
  concludeStatus(errorText, 'error', 3000, statusMessage);
}

/**
 * Update the save project button label to reflect highlighted tab count.
 * @param {HTMLElement} saveProjectButton
 * @returns {Promise<void>}
 */
export async function updateSaveProjectButtonLabel(saveProjectButton) {
  if (!saveProjectButton) {
    return;
  }

  try {
    const highlighted = await queryTabs({
      currentWindow: true,
      highlighted: true,
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
 * Initialize projects functionality with event listeners.
 * @param {HTMLElement} saveProjectButton
 * @param {HTMLElement} refreshProjectsButton
 * @param {HTMLElement} projectsContainer
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
export function initializeProjects(
  saveProjectButton,
  refreshProjectsButton,
  projectsContainer,
  statusMessage,
) {
  if (saveProjectButton) {
    saveProjectButton.addEventListener('click', () => {
      void handleSaveProject(saveProjectButton, statusMessage);
    });

    const refreshSaveProjectLabel = () => {
      void updateSaveProjectButtonLabel(saveProjectButton);
    };

    if (chrome.tabs?.onHighlighted?.addListener) {
      chrome.tabs.onHighlighted.addListener(refreshSaveProjectLabel);
    }
    if (chrome.tabs?.onActivated?.addListener) {
      chrome.tabs.onActivated.addListener(refreshSaveProjectLabel);
    }

    void updateSaveProjectButtonLabel(saveProjectButton);
  } else {
    console.error('[popup] Save project button not found.');
  }

  if (refreshProjectsButton) {
    refreshProjectsButton.addEventListener('click', () => {
      void refreshProjectList(projectsContainer, refreshProjectsButton);
    });
  } else {
    console.error('[popup] Refresh projects button not found.');
  }

  // Initial load
  void refreshProjectList(projectsContainer, refreshProjectsButton);
}
