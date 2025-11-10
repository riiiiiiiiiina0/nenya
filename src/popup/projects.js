/* global chrome */

import {
  sendRuntimeMessage,
  setStatus,
  concludeStatus,
  queryTabs,
  normalizeUrlForSave,
  collectSavableTabs,
} from './shared.js';
import { icons } from '../shared/icons.js';
import {
  convertSplitUrlForRestore,
  convertSplitUrlForSave,
} from '../shared/splitUrl.js';

/**
 * @typedef {Object} SavedProject
 * @property {number} id
 * @property {string} title
 * @property {number} itemCount
 * @property {string} url
 * @property {string} [cover]
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
 * @typedef {Object} ReplacementActionMessages
 * @property {(name: string) => string} confirm
 * @property {(name: string) => string} preparing
 * @property {(name: string) => string} running
 * @property {string} emptySelection
 * @property {string} noValidTabs
 * @property {string} cancelMessage
 * @property {string} collectError
 */

/**
 * Create a button element with the given label/content and click handler.
 * @param {string} label - Text label or SVG HTML content
 * @param {(e: MouseEvent) => void} onClick
 * @returns {HTMLButtonElement}
 */
function createButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-xs btn-square flex-shrink-0';
  // Check if label contains SVG (starts with <svg)
  if (label.trim().startsWith('<svg')) {
    button.innerHTML = label;
    button.classList.add('project-icon-button');
  } else {
    button.textContent = label;
  }
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
  return button;
}

/**
 * Create a tooltip element with the given label and element.
 * @param {string} label
 * @param {HTMLElement} element
 * @param {'top' | 'bottom' | 'left' | 'right'} placement
 * @returns {HTMLDivElement}
 */
function createTooltip(label, placement, element) {
  const tooltip = document.createElement('div');
  tooltip.className = `tooltip tooltip-${placement}`;
  tooltip.setAttribute('data-tip', label);
  tooltip.appendChild(element);
  return tooltip;
}

/**
 * Set the projects container to disabled state.
 * @param {HTMLElement | null} projectsContainer
 * @param {boolean} disabled
 * @returns {void}
 */
function setProjectsContainerDisabled(projectsContainer, disabled) {
  if (!projectsContainer) {
    return;
  }

  if (disabled) {
    projectsContainer.style.opacity = '0.5';
    projectsContainer.style.pointerEvents = 'none';
  } else {
    projectsContainer.style.opacity = '';
    projectsContainer.style.pointerEvents = '';
  }
}

/**
 * Refresh the list of saved projects.
 * @param {HTMLElement} projectsContainer
 * @returns {Promise<void>}
 */
export async function refreshProjectList(projectsContainer) {
  if (!projectsContainer) {
    return;
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
  const cover =
    typeof project.cover === 'string' && project.cover ? project.cover : null;

  const container = document.createElement('div');
  container.className =
    'group flex items-center w-full border border-base-content/10 rounded-md p-1 my-2';
  container.setAttribute('role', 'listitem');

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className =
    'btn btn-ghost btn-sm flex-1 justify-between gap-3 min-w-0 py-2 mr-1';

  // Create icon element with hover affordance for Raindrop link
  const iconElement = document.createElement('div');
  const openCollectionLabel = 'Open ' + title + ' on Raindrop';

  const renderDefaultIcon = () => {
    iconElement.textContent = '📁';
    iconElement.className =
      'flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-lg';
  };

  const renderCoverIcon = () => {
    iconElement.dataset.state = 'cover';
    iconElement.className =
      'flex-shrink-0 w-4 h-4 flex items-center justify-center rounded';
    iconElement.innerHTML = '';
    iconElement.removeAttribute('role');
    iconElement.removeAttribute('tabindex');
    iconElement.removeAttribute('aria-label');

    if (cover) {
      const img = document.createElement('img');
      img.src = cover;
      img.alt = title + ' icon';
      img.className = 'w-4 h-4 object-cover rounded';
      img.onerror = () => {
        iconElement.innerHTML = '';
        renderDefaultIcon();
      };
      iconElement.appendChild(img);
    } else {
      renderDefaultIcon();
    }
  };

  const renderArrowIcon = () => {
    if (!url) {
      return;
    }
    iconElement.dataset.state = 'link';
    iconElement.className =
      'btn btn-ghost btn-sm btn-square flex-shrink-0 -mx-2 border-none shadow-none bg-transparent';
    iconElement.textContent = '↗️';
    iconElement.setAttribute('role', 'button');
    iconElement.setAttribute('tabindex', '0');
    iconElement.setAttribute('aria-label', openCollectionLabel);
  };

  renderCoverIcon();

  if (url) {
    container.addEventListener('mouseenter', () => {
      renderArrowIcon();
    });
    container.addEventListener('mouseleave', () => {
      renderCoverIcon();
    });
    container.addEventListener('focusin', () => {
      renderArrowIcon();
    });
    container.addEventListener('focusout', (event) => {
      if (
        event.relatedTarget &&
        event.relatedTarget instanceof Node &&
        container.contains(event.relatedTarget)
      ) {
        return;
      }
      renderCoverIcon();
    });

    iconElement.addEventListener('click', (event) => {
      if (iconElement.dataset.state !== 'link') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openProjectUrl(url, id);
    });

    iconElement.addEventListener('keydown', (event) => {
      if (iconElement.dataset.state !== 'link') {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        openProjectUrl(url, id);
      }
    });
  }

  // Create title element with truncation
  const titleElement = document.createElement('span');
  titleElement.className =
    'text-left truncate flex-1 min-w-0 text-sm font-normal';
  titleElement.textContent = title;
  titleElement.title = title; // Show full title on hover

  openButton.appendChild(iconElement);
  openButton.appendChild(titleElement);

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    void handleRestoreProjectTabs(id, title, openButton);
  });

  // add tabs to project button
  const addButton = createTooltip(
    'Add highlighted tabs to project',
    'left',
    createButton('🔼', (event) => {
      void handleAddTabsToProject(
        id,
        title,
        /** @type {HTMLButtonElement} */ (event.target),
      );
    }),
  );
  addButton.classList.add(
    'project-action-button',
    'hidden',
    'group-hover:flex',
  );

  // replace project items with highlighted/active tabs button
  const replaceButton = createTooltip(
    'Replace with highlighted tabs',
    'left',
    createButton('⏏️', (event) => {
      void handleReplaceProjectItems(
        id,
        title,
        /** @type {HTMLButtonElement} */ (event.target),
      );
    }),
  );
  replaceButton.classList.add(
    'project-action-button',
    'hidden',
    'group-hover:flex',
  );

  // replace project items with all tabs in current window button
  const replaceWindowButton = createTooltip(
    'Replace with current window tabs',
    'left',
    createButton('⏫️', (event) => {
      void handleReplaceProjectItemsWithWindowTabs(
        id,
        title,
        /** @type {HTMLButtonElement} */ (event.target),
      );
    }),
  );
  replaceWindowButton.classList.add(
    'project-action-button',
    'hidden',
    'group-hover:flex',
  );

  container.append(
    openButton,
    addButton,
    replaceButton,
    replaceWindowButton,
    // deleteButton
  );

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
    // Convert nenya.local split URLs back to extension format
    const restoredUrl = convertSplitUrlForRestore(url);
    const maybePromise = chrome.tabs.create({ url: restoredUrl });
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
 * Restore saved project tabs into the current window.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @returns {Promise<void>}
 */
async function handleRestoreProjectTabs(projectId, projectTitle, trigger) {
  const normalizedId = Number(projectId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
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
  if (button) {
    button.disabled = true;
  }

  const projectsContainer = document.getElementById('projectsContainer');
  setProjectsContainerDisabled(projectsContainer, true);

  const displayName =
    typeof projectTitle === 'string' && projectTitle.trim()
      ? projectTitle.trim()
      : 'project';
  const statusElement = document.getElementById('statusMessage');
  if (statusElement) {
    setStatus('Restoring ' + displayName + '...', 'info', statusElement);
  }

  try {
    const response = await sendRuntimeMessage({
      type: 'projects:restoreProjectTabs',
      projectId: normalizedId,
      projectTitle: displayName,
    });

    if (!response || typeof response !== 'object') {
      if (statusElement) {
        concludeStatus(
          'Unable to restore ' + displayName + '.',
          'error',
          4000,
          statusElement,
        );
      }
      return;
    }

    if (response.ok) {
      const restoredCount = Number(response.created);
      const message =
        Number.isFinite(restoredCount) && restoredCount > 0
          ? 'Restored ' +
            restoredCount +
            ' tab' +
            (restoredCount === 1 ? '' : 's') +
            ' from ' +
            displayName +
            '.'
          : 'No tabs were restored from ' + displayName + '.';
      if (statusElement) {
        concludeStatus(
          message,
          restoredCount > 0 ? 'success' : 'info',
          4000,
          statusElement,
        );
      }
      return;
    }

    const errorText =
      typeof response.error === 'string'
        ? response.error
        : 'Unable to restore ' + displayName + '.';
    if (statusElement) {
      concludeStatus(errorText, 'error', 4000, statusElement);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackStatus = document.getElementById('statusMessage');
    if (fallbackStatus) {
      concludeStatus(message, 'error', 4000, fallbackStatus);
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
    setProjectsContainerDisabled(
      document.getElementById('projectsContainer'),
      false,
    );
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

    const descriptors = await buildProjectTabDescriptors(tabs);
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

  // Disable projects container during operation
  const projectsContainer = document.getElementById('projectsContainer');
  setProjectsContainerDisabled(projectsContainer, true);

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

    const descriptors = await buildProjectTabDescriptors(tabs);
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
    // Re-enable projects container
    setProjectsContainerDisabled(projectsContainer, false);
  }
}

/**
 * Replace project items using highlighted tabs or the active tab.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @returns {Promise<void>}
 */
async function handleReplaceProjectItems(projectId, projectTitle, trigger) {
  await handleProjectReplacementAction(
    projectId,
    projectTitle,
    trigger,
    collectSavableTabs,
    {
      confirm: (name) =>
        'Replace all items in ' +
        name +
        ' with highlighted tabs? Existing project items in Raindrop will be removed.',
      preparing: (name) => 'Preparing to replace items in ' + name + '...',
      running: (name) => 'Replacing items in ' + name + '...',
      emptySelection: 'No highlighted or active tabs available to save.',
      noValidTabs: 'No valid tab URLs to save.',
      cancelMessage: 'Replace project canceled.',
      collectError: 'Unable to access highlighted tabs.',
    },
  );
}

/**
 * Replace project items using all tabs from the current window.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @returns {Promise<void>}
 */
async function handleReplaceProjectItemsWithWindowTabs(
  projectId,
  projectTitle,
  trigger,
) {
  await handleProjectReplacementAction(
    projectId,
    projectTitle,
    trigger,
    collectCurrentWindowSavableTabs,
    {
      confirm: (name) =>
        'Replace all items in ' +
        name +
        ' with every savable tab in the current window? Existing project items in Raindrop will be removed.',
      preparing: (name) =>
        'Preparing to replace items in ' +
        name +
        ' using current window tabs...',
      running: (name) =>
        'Replacing items in ' + name + ' using current window tabs...',
      emptySelection: 'No tabs in the current window can be saved.',
      noValidTabs: 'No valid tab URLs to save.',
      cancelMessage: 'Replace project canceled.',
      collectError: 'Unable to access tabs in the current window.',
    },
  );
}

/**
 * Handle delete project action.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @returns {Promise<void>}
 */
async function handleDeleteProject(projectId, projectTitle, trigger) {
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

  const displayName =
    typeof projectTitle === 'string' && projectTitle.trim()
      ? projectTitle.trim()
      : 'project';

  const statusElement = document.getElementById('statusMessage');

  const confirmText =
    'Are you sure you want to delete ' +
    displayName +
    '? This will permanently remove the collection and all its items from Raindrop.';
  if (confirmText && !window.confirm(confirmText)) {
    if (statusElement) {
      concludeStatus('Delete canceled.', 'info', 3000, statusElement);
    }
    return;
  }

  const button = trigger;
  if (button) {
    /** @type {HTMLButtonElement} */ (button).disabled = true;
  }

  // Find and store reference to the project row for immediate removal
  const projectRow = trigger.closest('[role="listitem"]');

  // Disable projects container during operation
  const projectsContainer = document.getElementById('projectsContainer');
  setProjectsContainerDisabled(projectsContainer, true);

  try {
    if (statusElement) {
      setStatus('Deleting ' + displayName + '...', 'info', statusElement);
    }

    const response = await sendRuntimeMessage({
      type: 'projects:deleteProject',
      projectId,
    });

    // Immediately remove the project row from DOM if deletion was successful
    if (response && response.ok && projectRow) {
      projectRow.remove();
    }

    if (statusElement) {
      handleDeleteProjectResponse(response, statusElement, displayName);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (statusElement) {
      concludeStatus(message, 'error', 3000, statusElement);
    }
  } finally {
    if (button) {
      /** @type {HTMLButtonElement} */ (button).disabled = false;
    }
    // Re-enable projects container
    setProjectsContainerDisabled(projectsContainer, false);
  }
}

/**
 * Handle replace project workflow with custom tab collector.
 * @param {number} projectId
 * @param {string} projectTitle
 * @param {HTMLButtonElement} trigger
 * @param {() => Promise<chrome.tabs.Tab[]>} tabCollector
 * @param {ReplacementActionMessages} messages
 * @returns {Promise<void>}
 */
async function handleProjectReplacementAction(
  projectId,
  projectTitle,
  trigger,
  tabCollector,
  messages,
) {
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

  const displayName =
    typeof projectTitle === 'string' && projectTitle.trim()
      ? projectTitle.trim()
      : 'project';

  const statusElement = document.getElementById('statusMessage');

  const confirmText = messages.confirm(displayName);
  if (confirmText && !window.confirm(confirmText)) {
    if (statusElement) {
      concludeStatus(messages.cancelMessage, 'info', 3000, statusElement);
    }
    return;
  }

  const button = trigger;
  if (button) {
    /** @type {HTMLButtonElement} */ (button).disabled = true;
  }

  // Disable projects container during operation
  const projectsContainer = document.getElementById('projectsContainer');
  setProjectsContainerDisabled(projectsContainer, true);

  try {
    if (statusElement) {
      setStatus(messages.preparing(displayName), 'info', statusElement);
    }

    let tabs;
    try {
      tabs = await tabCollector();
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : String(error);
      if (statusElement) {
        concludeStatus(
          messages.collectError + ' ' + fallbackMessage,
          'error',
          3000,
          statusElement,
        );
      }
      return;
    }

    if (!tabs || tabs.length === 0) {
      if (statusElement) {
        concludeStatus(messages.emptySelection, 'info', 3000, statusElement);
      }
      return;
    }

    const descriptors = await buildProjectTabDescriptors(tabs);
    if (descriptors.length === 0) {
      if (statusElement) {
        concludeStatus(messages.noValidTabs, 'info', 3000, statusElement);
      }
      return;
    }

    if (statusElement) {
      setStatus(messages.running(displayName), 'info', statusElement);
    }
    const response = await sendRuntimeMessage({
      type: 'projects:replaceProjectItems',
      projectId,
      tabs: descriptors,
    });

    if (statusElement) {
      handleSaveProjectResponse(response, statusElement);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (statusElement) {
      concludeStatus(message, 'error', 3000, statusElement);
    }
  } finally {
    if (button) {
      /** @type {HTMLButtonElement} */ (button).disabled = false;
    }
    // Re-enable projects container
    setProjectsContainerDisabled(projectsContainer, false);
  }
}

/**
 * Build normalized tab descriptors for project saves.
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Promise<ProjectTabDescriptor[]>}
 */
async function buildProjectTabDescriptors(tabs) {
  /** @type {ProjectTabDescriptor[]} */
  const descriptors = [];
  const seen = new Set();

  // Get all custom titles at once for efficiency
  const tabIds = tabs
    .filter((tab) => tab && typeof tab.id === 'number')
    .map((tab) => tab.id);

  const customTitleKeys = tabIds.map((id) => `customTitle_${id}`);
  const customTitles = await chrome.storage.local.get(customTitleKeys);

  tabs.forEach((tab) => {
    if (!tab || typeof tab.id !== 'number' || !tab.url) {
      return;
    }

    // Convert split page URLs to nenya.local format before normalizing
    const convertedUrl = convertSplitUrlForSave(tab.url);
    const normalizedUrl = normalizeUrlForSave(convertedUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    seen.add(normalizedUrl);

    // Check for custom title (handle both old string format and new object format)
    const customTitleData = customTitles[`customTitle_${tab.id}`];
    let customTitle = '';

    if (typeof customTitleData === 'string' && customTitleData.trim() !== '') {
      // Old format: just a string
      customTitle = customTitleData.trim();
    } else if (
      customTitleData &&
      typeof customTitleData === 'object' &&
      customTitleData.title &&
      typeof customTitleData.title === 'string' &&
      customTitleData.title.trim() !== ''
    ) {
      // New format: object with tabId, url, and title
      customTitle = customTitleData.title.trim();
    }

    const finalTitle =
      customTitle || (typeof tab.title === 'string' ? tab.title : '');

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
      title: finalTitle,
    });
  });

  return descriptors;
}

/**
 * Gather all savable tabs in the current window.
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function collectCurrentWindowSavableTabs() {
  const allTabs = await queryTabs({
    currentWindow: true,
  });
  return allTabs.filter((tab) => {
    if (!tab?.url) {
      return false;
    }
    // Convert split page URLs to nenya.local format before checking
    const convertedUrl = convertSplitUrlForSave(tab.url);
    return Boolean(normalizeUrlForSave(convertedUrl));
  });
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
    if (projectsContainer) {
      void refreshProjectList(projectsContainer);
    }
    return;
  }

  const errorText =
    typeof response.error === 'string' ? response.error : message;
  concludeStatus(errorText, 'error', 3000, statusMessage);
}

/**
 * Update popup status based on a delete project response.
 * @param {any} response
 * @param {HTMLElement} statusMessage
 * @param {string} projectName
 * @returns {void}
 */
function handleDeleteProjectResponse(response, statusMessage, projectName) {
  if (!response || typeof response !== 'object') {
    concludeStatus(
      'Project deletion failed. Please try again.',
      'error',
      3000,
      statusMessage,
    );
    return;
  }

  if (response.ok) {
    concludeStatus(
      projectName + ' has been deleted successfully.',
      'success',
      3000,
      statusMessage,
    );
    // Note: DOM element is already removed in handleDeleteProject, no need to refresh
    return;
  }

  const errorText =
    typeof response.error === 'string'
      ? response.error
      : 'Project deletion failed.';
  concludeStatus(errorText, 'error', 3000, statusMessage);
}

/**
 * Update the save project button label to reflect highlighted tab count.
 * @param {HTMLButtonElement} saveProjectButton
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

    const active = await queryTabs({
      currentWindow: true,
      active: true,
    });

    // Combine highlighted and active tabs, deduplicating by tab id
    /** @type {chrome.tabs.Tab[]} */
    const tabs = [
      ...new Map(
        [...highlighted, ...active].map((tab) => [tab.id, tab]),
      ).values(),
    ];
    console.log(tabs);

    let validCount = 0;
    tabs.forEach((tab) => {
      if (!tab.url) {
        return;
      }
      // Convert split page URLs to nenya.local format before checking
      const convertedUrl = convertSplitUrlForSave(tab.url);
      const normalizedUrl = normalizeUrlForSave(convertedUrl);
      if (normalizedUrl) {
        validCount += 1;
      }
    });

    // Always show the icon, enable/disable based on tab count
    saveProjectButton.innerHTML = icons['rectangle-group'];
    if (validCount > 0) {
      saveProjectButton.disabled = false;
    } else {
      saveProjectButton.disabled = true;
    }
  } catch (error) {
    console.error('[popup] Unable to update save project button label.', error);
    saveProjectButton.innerHTML = icons['rectangle-group'];
    saveProjectButton.disabled = true;
  }
}

/**
 * Initialize projects functionality with event listeners.
 * @param {HTMLButtonElement} saveProjectButton
 * @param {HTMLElement} projectsContainer
 * @param {HTMLElement} statusMessage
 * @returns {void}
 */
export function initializeProjects(
  saveProjectButton,
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

  // Initial load
  void refreshProjectList(projectsContainer);
}
