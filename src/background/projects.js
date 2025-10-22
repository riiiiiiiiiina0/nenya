import {
  animateActionBadge,
  concludeActionBadge,
  raindropRequest,
  loadValidProviderTokens,
  normalizeFolderTitle,
  normalizeBookmarkTitle,
  normalizeHttpUrl,
  buildRaindropCollectionUrl,
  fetchRaindropItems,
  isPromiseLike,
  pushNotification,
  getNotificationPreferences,
} from './mirror.js';

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
 * @typedef {Object} ResolvedProjectTab
 * @property {number} id
 * @property {number} windowId
 * @property {number} index
 * @property {number} groupId
 * @property {boolean} pinned
 * @property {string} url
 * @property {string} title
 */

/**
 * @typedef {Object} ProjectGroupMetadata
 * @property {string} name
 * @property {string} color
 * @property {number} index
 * @property {number} windowId
 */

/**
 * @typedef {Object} ProjectGroupContext
 * @property {Map<number, ProjectGroupMetadata>} groupInfo
 * @property {Map<number, number>} tabIndexById
 * @property {Map<number, string>} [customTitles]
 */

/**
 * @typedef {Object} ParsedProjectItemMetadata
 * @property {number | undefined} tabIndex
 * @property {{ name: string, color: string, index: number } | undefined} group
 * @property {boolean} pinned
 * @property {string | undefined} customTitle
 */

/**
 * @typedef {Object} SaveProjectResult
 * @property {boolean} ok
 * @property {string} projectName
 * @property {number} created
 * @property {number} skipped
 * @property {number} failed
 * @property {string[]} errors
 * @property {string} [error]
 * @property {number} [collectionId]
 */

/**
 * @typedef {Object} SavedProjectDescriptor
 * @property {number} id
 * @property {string} title
 * @property {number} itemCount
 * @property {string} url
 * @property {string} [cover]
 */

/**
 * @typedef {Object} ProjectRestoreEntry
 * @property {string} url
 * @property {string} title
 * @property {boolean} pinned
 * @property {number | undefined} tabIndex
 * @property {{ name: string, color: string, index: number } | undefined} group
 * @property {string | undefined} customTitle
 * @property {number} order
 */

/**
 * @typedef {Object} RestoreProjectResult
 * @property {boolean} ok
 * @property {number} created
 * @property {number} pinned
 * @property {number} grouped
 * @property {string[]} errors
 * @property {string} [error]
 */

// Message constants for saved projects
export const SAVE_PROJECT_MESSAGE = 'projects:saveProject';
export const LIST_PROJECTS_MESSAGE = 'projects:listProjects';
export const GET_CACHED_PROJECTS_MESSAGE = 'projects:getCachedProjects';
export const ADD_PROJECT_TABS_MESSAGE = 'projects:addTabsToProject';
export const REPLACE_PROJECT_ITEMS_MESSAGE =
  'projects:replaceProjectItems';
export const DELETE_PROJECT_MESSAGE = 'projects:deleteProject';
export const RESTORE_PROJECT_TABS_MESSAGE = 'projects:restoreProjectTabs';

// Project-related constants
const SAVED_PROJECTS_GROUP_TITLE = 'Saved projects';
const FETCH_PAGE_SIZE = 100;

// Storage keys for caching
const CACHED_PROJECTS_KEY = 'cachedProjects';
const CACHED_PROJECTS_TIMESTAMP_KEY = 'cachedProjectsTimestamp';

/**
 * Show notification for project save success.
 * @param {SaveProjectResult} result
 * @returns {Promise<void>}
 */
async function showProjectSaveNotification(result) {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled || !preferences.project?.enabled || !preferences.project?.saveProject) {
    return;
  }

  if (result.ok) {
    const title = `Project "${result.projectName}" Saved`;
    const message = `Successfully saved ${result.created} tab${result.created !== 1 ? 's' : ''}`;
    const contextParts = [];
    
    if (result.skipped > 0) {
      contextParts.push(`${result.skipped} skipped`);
    }
    if (result.failed > 0) {
      contextParts.push(`${result.failed} failed`);
    }
    
    const contextMessage = contextParts.length > 0 ? contextParts.join(', ') : undefined;
    const targetUrl = result.collectionId ? buildRaindropCollectionUrl(result.collectionId) : undefined;
    await pushNotification('project-save-success', title, message, targetUrl, contextMessage);
  } else {
    const reason = result.error || 'Unknown error';
    await pushNotification('project-save-failure', 'Failed to Save Project', reason);
  }
}

/**
 * Show notification for add tabs to project success.
 * @param {SaveProjectResult} result
 * @returns {Promise<void>}
 */
async function showAddTabsNotification(result) {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled || !preferences.project?.enabled || !preferences.project?.addTabs) {
    return;
  }

  if (result.ok) {
    const title = `Added to "${result.projectName}"`;
    const message = `Successfully added ${result.created} tab${result.created !== 1 ? 's' : ''}`;
    const contextParts = [];
    
    if (result.skipped > 0) {
      contextParts.push(`${result.skipped} skipped`);
    }
    if (result.failed > 0) {
      contextParts.push(`${result.failed} failed`);
    }
    
    const contextMessage = contextParts.length > 0 ? contextParts.join(', ') : undefined;
    const targetUrl = result.collectionId ? buildRaindropCollectionUrl(result.collectionId) : undefined;
    await pushNotification('project-add-success', title, message, targetUrl, contextMessage);
  } else {
    const reason = result.error || 'Unknown error';
    await pushNotification('project-add-failure', 'Failed to Add Tabs', reason);
  }
}

/**
 * Show notification for replace project items success.
 * @param {SaveProjectResult} result
 * @returns {Promise<void>}
 */
async function showReplaceItemsNotification(result) {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled || !preferences.project?.enabled || !preferences.project?.replaceItems) {
    return;
  }

  if (result.ok) {
    const title = `Project "${result.projectName}" Updated`;
    const message = `Successfully replaced with ${result.created} tab${result.created !== 1 ? 's' : ''}`;
    const contextParts = [];
    
    if (result.skipped > 0) {
      contextParts.push(`${result.skipped} skipped`);
    }
    if (result.failed > 0) {
      contextParts.push(`${result.failed} failed`);
    }
    
    const contextMessage = contextParts.length > 0 ? contextParts.join(', ') : undefined;
    const targetUrl = result.collectionId ? buildRaindropCollectionUrl(result.collectionId) : undefined;
    await pushNotification('project-replace-success', title, message, targetUrl, contextMessage);
  } else {
    const reason = result.error || 'Unknown error';
    await pushNotification('project-replace-failure', 'Failed to Replace Items', reason);
  }
}

/**
 * Show notification for project deletion success.
 * @param {Object} result
 * @param {string} projectName
 * @returns {Promise<void>}
 */
async function showDeleteProjectNotification(result, projectName) {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled || !preferences.project?.enabled || !preferences.project?.deleteProject) {
    return;
  }

  if (result.ok) {
    const title = `Project Deleted`;
    const message = `"${projectName}" has been deleted`;
    await pushNotification('project-delete-success', title, message);
  } else {
    const reason = result.error || 'Unknown error';
    await pushNotification('project-delete-failure', 'Failed to Delete Project', reason);
  }
}

// Animation sequences
const CLOCK_SEQUENCE = ['🕛', '🕑', '🕒', '🕓', '🕧', '🕗', '🕘', '🕙'];

/**
 * Cache the projects list to local storage.
 * @param {any[]} projects
 * @returns {Promise<void>}
 */
export async function cacheProjectsList(projects) {
  try {
    const timestamp = Date.now();
    await chrome.storage.local.set({
      [CACHED_PROJECTS_KEY]: projects,
      [CACHED_PROJECTS_TIMESTAMP_KEY]: timestamp,
    });
  } catch (error) {
    console.warn('[projects] Failed to cache projects list:', error);
  }
}

/**
 * Get cached projects from local storage.
 * @returns {Promise<{ ok: boolean, projects?: any[], error?: string, cachedAt?: number }>}
 */
export async function getCachedProjects() {
  try {
    const result = await chrome.storage.local.get([
      CACHED_PROJECTS_KEY,
      CACHED_PROJECTS_TIMESTAMP_KEY,
    ]);
    const projects = result[CACHED_PROJECTS_KEY];
    const timestamp = result[CACHED_PROJECTS_TIMESTAMP_KEY];

    if (!Array.isArray(projects)) {
      return { ok: false, error: 'No cached projects found' };
    }

    return {
      ok: true,
      projects,
      cachedAt: timestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/**
 * Handle save project message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleSaveProjectMessage(message, sendResponse) {
  const projectName =
    typeof message.projectName === 'string' ? message.projectName : '';
  const tabs = Array.isArray(message.tabs) ? message.tabs : [];
  saveTabsAsProject(projectName, tabs)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle add tabs to project message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleAddTabsToProjectMessage(message, sendResponse) {
  const projectId = Number(message.projectId);
  const tabs = Array.isArray(message.tabs) ? message.tabs : [];
  addTabsToProject(projectId, tabs)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle replace project items message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleReplaceProjectItemsMessage(message, sendResponse) {
  const projectId = Number(message.projectId);
  const tabs = Array.isArray(message.tabs) ? message.tabs : [];
  replaceProjectItems(projectId, tabs)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle list projects message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleListProjectsMessage(message, sendResponse) {
  listSavedProjects()
    .then((result) => {
      // Cache the projects list if successful
      if (result && result.ok && Array.isArray(result.projects)) {
        void cacheProjectsList(result.projects);
      }
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle get cached projects message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleGetCachedProjectsMessage(message, sendResponse) {
  getCachedProjects()
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle delete project message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleDeleteProjectMessage(message, sendResponse) {
  const projectId = Number(message.projectId);
  if (!Number.isFinite(projectId)) {
    sendResponse({ ok: false, error: 'Invalid project ID.' });
    return true;
  }

  deleteProject(projectId)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Handle restore project tabs message.
 * @param {any} message
 * @param {Function} sendResponse
 * @returns {boolean}
 */
export function handleRestoreProjectTabsMessage(message, sendResponse) {
  const projectId = Number(message.projectId);
  restoreProjectTabs(projectId)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      const messageText =
        error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
}

/**
 * Save highlighted tabs (or the active tab) as a Raindrop project.
 * @param {string} projectName
 * @param {ProjectTabDescriptor[]} rawTabs
 * @returns {Promise<SaveProjectResult>}
 */
export async function saveTabsAsProject(projectName, rawTabs) {
  const badgeAnimation = animateActionBadge(CLOCK_SEQUENCE);
  /** @type {SaveProjectResult} */
  const summary = {
    ok: false,
    projectName: normalizeProjectName(projectName) || 'project',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const finalize = () => summary;

  try {
    const normalizedName = normalizeProjectName(projectName);
    if (!normalizedName) {
      summary.error = 'Project name is required.';
      return finalize();
    }

    summary.projectName = normalizedName;

    const sanitized = sanitizeProjectTabDescriptors(rawTabs);
    summary.skipped += sanitized.skipped;
    if (sanitized.errors.length > 0) {
      summary.errors.push(...sanitized.errors);
    }

    if (sanitized.tabs.length === 0) {
      summary.error = 'No valid tabs to save.';
      return finalize();
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return finalize();
    }

    const resolved = await resolveProjectTabs(sanitized.tabs);
    summary.skipped += resolved.skipped;
    if (resolved.errors.length > 0) {
      summary.errors.push(...resolved.errors);
    }

    if (resolved.tabs.length === 0) {
      summary.error = 'Selected tabs are no longer available.';
      return finalize();
    }

    const groupContext = await buildProjectGroupContext(resolved.tabs);

    const ensureResult = await ensureSavedProjectsGroup(tokens);
    const collection = await createProjectCollection(tokens, normalizedName);
    summary.projectName = collection.title;
    summary.collectionId = collection.id;

    await assignCollectionToGroup(
      tokens,
      ensureResult.groups,
      ensureResult.index,
      collection.id,
    );

    for (const tab of resolved.tabs) {
      const itemPayload = buildProjectItemPayload(
        tab,
        groupContext,
        collection.id,
      );
      try {
        await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(itemPayload),
        });
        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(tab.url + ': ' + message);
      }
    }

    summary.ok = summary.failed === 0;
    if (!summary.ok && !summary.error && summary.errors.length > 0) {
      summary.error = summary.errors[0];
    }

    const result = finalize();
    await showProjectSaveNotification(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    const result = finalize();
    await showProjectSaveNotification(result);
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
}

/**
 * Add tabs to an existing Raindrop project collection.
 * @param {number} projectId
 * @param {ProjectTabDescriptor[]} rawTabs
 * @returns {Promise<SaveProjectResult>}
 */
export async function addTabsToProject(projectId, rawTabs) {
  const badgeAnimation = animateActionBadge(CLOCK_SEQUENCE);
  /** @type {SaveProjectResult} */
  const summary = {
    ok: false,
    projectName: 'project',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    collectionId: Number(projectId),
  };

  const finalize = () => summary;

  try {
    const normalizedId = Number(projectId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
      summary.error = 'Project selection is invalid.';
      return finalize();
    }

    const sanitized = sanitizeProjectTabDescriptors(rawTabs);
    summary.skipped += sanitized.skipped;
    if (sanitized.errors.length > 0) {
      summary.errors.push(...sanitized.errors);
    }

    if (sanitized.tabs.length === 0) {
      summary.error = 'No valid tabs to save.';
      return finalize();
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return finalize();
    }

    const resolved = await resolveProjectTabs(sanitized.tabs);
    summary.skipped += resolved.skipped;
    if (resolved.errors.length > 0) {
      summary.errors.push(...resolved.errors);
    }

    if (resolved.tabs.length === 0) {
      summary.error = 'Selected tabs are no longer available.';
      return finalize();
    }

    let collectionResponse;
    try {
      collectionResponse = await raindropRequest(
        '/collection/' + normalizedId,
        tokens,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    const collection = collectionResponse?.item;
    if (!collection || typeof collection !== 'object') {
      summary.error = 'Selected project could not be found.';
      return finalize();
    }
    summary.projectName = normalizeFolderTitle(
      collection?.title,
      summary.projectName,
    );

    let existingItems;
    try {
      existingItems = await fetchAllProjectItems(tokens, normalizedId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    const existingUrls = new Set();
    let maxIndex = -1;
    /** @type {{ name: string, color: string, index: number } | undefined} */
    let groupCandidate;
    let consistentGroup = true;

    existingItems.forEach((item) => {
      const itemUrl = typeof item?.link === 'string' ? item.link : '';
      const normalizedUrl = normalizeHttpUrl(itemUrl);
      if (normalizedUrl) {
        existingUrls.add(normalizedUrl);
      }

      const metadata = parseProjectItemMetadata(item);
      if (Number.isFinite(metadata.tabIndex)) {
        maxIndex = Math.max(maxIndex, Number(metadata.tabIndex));
      }

      if (metadata.group) {
        if (!groupCandidate) {
          groupCandidate = metadata.group;
        } else if (!isMatchingGroupMetadata(groupCandidate, metadata.group)) {
          consistentGroup = false;
        }
      } else {
        consistentGroup = false;
      }
    });

    if (!consistentGroup) {
      groupCandidate = undefined;
    }

    const context = await buildProjectGroupContext(resolved.tabs);
    const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
    const allTabsUngrouped = resolved.tabs.every(
      (tab) => tab.groupId === noneGroupId,
    );
    if (allTabsUngrouped && groupCandidate) {
      context.groupInfo.set(noneGroupId, {
        name: groupCandidate.name,
        color: groupCandidate.color,
        index: groupCandidate.index,
        windowId: chrome.windows?.WINDOW_ID_NONE ?? -1,
      });
    }

    let currentIndex = Number.isFinite(maxIndex) ? Number(maxIndex) : -1;

    for (const tab of resolved.tabs) {
      const normalizedUrl = normalizeHttpUrl(tab.url);
      if (!normalizedUrl) {
        summary.skipped += 1;
        continue;
      }

      if (existingUrls.has(normalizedUrl)) {
        summary.skipped += 1;
        continue;
      }

      const candidateIndex = currentIndex + 1;
      context.tabIndexById.set(tab.id, candidateIndex);

      const itemPayload = buildProjectItemPayload(tab, context, normalizedId);

      try {
        await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(itemPayload),
        });
        summary.created += 1;
        existingUrls.add(normalizedUrl);
        currentIndex = candidateIndex;
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(tab.url + ': ' + message);
      }
    }

    summary.ok = summary.failed === 0;
    if (!summary.ok && !summary.error && summary.errors.length > 0) {
      summary.error = summary.errors[0];
    }

    const result = finalize();
    await showAddTabsNotification(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    const result = finalize();
    await showAddTabsNotification(result);
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
}

/**
 * Replace all items in an existing Raindrop project collection.
 * @param {number} projectId
 * @param {ProjectTabDescriptor[]} rawTabs
 * @returns {Promise<SaveProjectResult>}
 */
export async function replaceProjectItems(projectId, rawTabs) {
  const badgeAnimation = animateActionBadge(CLOCK_SEQUENCE);
  /** @type {SaveProjectResult} */
  const summary = {
    ok: false,
    projectName: 'project',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    collectionId: Number(projectId),
  };

  const finalize = () => summary;

  try {
    const normalizedId = Number(projectId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
      summary.error = 'Project selection is invalid.';
      return finalize();
    }

    const sanitized = sanitizeProjectTabDescriptors(rawTabs);
    summary.skipped += sanitized.skipped;
    if (sanitized.errors.length > 0) {
      summary.errors.push(...sanitized.errors);
    }

    if (sanitized.tabs.length === 0) {
      summary.error = 'No valid tabs to save.';
      return finalize();
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return finalize();
    }

    const resolved = await resolveProjectTabs(sanitized.tabs);
    summary.skipped += resolved.skipped;
    if (resolved.errors.length > 0) {
      summary.errors.push(...resolved.errors);
    }

    if (resolved.tabs.length === 0) {
      summary.error = 'Selected tabs are no longer available.';
      return finalize();
    }

    let collectionResponse;
    try {
      collectionResponse = await raindropRequest(
        '/collection/' + normalizedId,
        tokens,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    const collection = collectionResponse?.item;
    if (!collection || typeof collection !== 'object') {
      summary.error = 'Selected project could not be found.';
      return finalize();
    }
    summary.projectName = normalizeFolderTitle(
      collection?.title,
      summary.projectName,
    );

    let existingItems;
    try {
      existingItems = await fetchAllProjectItems(tokens, normalizedId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.error = message;
      if (!summary.errors.includes(message)) {
        summary.errors.push(message);
      }
      return finalize();
    }

    const deletionIds = existingItems
      .map((item) => Number(item?._id ?? item?.id ?? item?.ID))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (deletionIds.length > 0) {
      try {
        await raindropRequest('/raindrops/' + normalizedId, tokens, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids: deletionIds }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.error =
          'Failed to remove existing items before replacing the project.';
        summary.errors.push('Bulk delete: ' + message);
        return finalize();
      }
    }

    const context = await buildProjectGroupContext(resolved.tabs);
    resolved.tabs.forEach((tab, orderIndex) => {
      if (!context.tabIndexById.has(tab.id)) {
        context.tabIndexById.set(tab.id, orderIndex);
      }
    });

    for (const tab of resolved.tabs) {
      const itemPayload = buildProjectItemPayload(
        tab,
        context,
        normalizedId,
      );
      try {
        await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(itemPayload),
        });
        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(tab.url + ': ' + message);
      }
    }

    summary.ok = summary.failed === 0;
    if (!summary.ok && !summary.error && summary.errors.length > 0) {
      summary.error = summary.errors[0];
    }

    const result = finalize();
    await showReplaceItemsNotification(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    const result = finalize();
    await showReplaceItemsNotification(result);
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
}

/**
 * Delete a project (collection) from Raindrop.
 * @param {number} projectId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deleteProject(projectId) {
  const badgeAnimation = animateActionBadge(CLOCK_SEQUENCE);
  
  try {
    const normalizedId = Number(projectId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
      return { ok: false, error: 'Invalid project ID.' };
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }

    if (!tokens) {
      return {
        ok: false,
        error: 'No Raindrop connection found. Connect in Options to enable deletion.',
      };
    }

    // Get project name before deletion for notification
    let projectName = 'Project';
    try {
      const collectionResponse = await raindropRequest(`/collection/${normalizedId}`, tokens);
      if (collectionResponse?.item?.title) {
        projectName = collectionResponse.item.title;
      }
    } catch (error) {
      // Continue with deletion even if we can't get the name
      console.warn('[deleteProject] Could not get project name:', error);
    }

    // Delete the collection using Raindrop API
    const deleteResponse = await raindropRequest(
      `/collection/${normalizedId}`,
      tokens,
      {
        method: 'DELETE',
      },
    );

    if (!deleteResponse || !deleteResponse.result) {
      return {
        ok: false,
        error: 'Failed to delete project from Raindrop.',
      };
    }

    // Clear cached projects since we deleted one
    await chrome.storage.local.remove([CACHED_PROJECTS_KEY, CACHED_PROJECTS_TIMESTAMP_KEY]);

    const result = { ok: true };
    await showDeleteProjectNotification(result, projectName);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = { ok: false, error: message };
    await showDeleteProjectNotification(result, 'Project');
    return result;
  } finally {
    concludeActionBadge(badgeAnimation, '🗑️');
  }
}

/**
 * Clear all project-related cache and custom title records.
 * @returns {Promise<void>}
 */
export async function clearAllProjectData() {
  try {
    // Clear project cache
    await chrome.storage.local.remove([CACHED_PROJECTS_KEY, CACHED_PROJECTS_TIMESTAMP_KEY]);
    
    // Clear all custom title records
    const allStorage = await chrome.storage.local.get(null);
    const customTitleKeys = Object.keys(allStorage).filter(key => key.startsWith('customTitle_'));
    
    if (customTitleKeys.length > 0) {
      await chrome.storage.local.remove(customTitleKeys);
    }
  } catch (error) {
    console.warn('[projects] Failed to clear project data:', error);
  }
}

/**
 * Restore saved project tabs into the current browser window.
 * @param {number} projectId
 * @returns {Promise<RestoreProjectResult>}
 */
export async function restoreProjectTabs(projectId) {
  /** @type {RestoreProjectResult} */
  const summary = {
    ok: false,
    created: 0,
    pinned: 0,
    grouped: 0,
    errors: [],
  };

  const normalizedId = Number(projectId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    summary.error = 'Project selection is invalid.';
    summary.errors.push(summary.error);
    return summary;
  }

  let tokens;
  try {
    tokens = await loadValidProviderTokens();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    summary.errors.push(message);
    return summary;
  }

  if (!tokens) {
    const message =
      'No Raindrop connection found. Connect in Options to restore projects.';
    summary.error = message;
    summary.errors.push(message);
    return summary;
  }

  let items;
  try {
    items = await fetchAllProjectItems(tokens, normalizedId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    summary.errors.push(message);
    return summary;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const message = 'Project does not contain any saved tabs.';
    summary.error = message;
    summary.errors.push(message);
    return summary;
  }

  const sanitized = sanitizeProjectItemsForRestore(items);
  if (sanitized.errors.length > 0) {
    summary.errors.push(...sanitized.errors);
  }

  if (sanitized.entries.length === 0) {
    const message = 'Project does not contain any valid tabs to restore.';
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    return summary;
  }

  try {
    const restoreOutcome = await applyProjectRestore(sanitized.entries);
    summary.created = restoreOutcome.created;
    summary.pinned = restoreOutcome.pinned;
    summary.grouped = restoreOutcome.grouped;
    if (restoreOutcome.errors.length > 0) {
      summary.errors.push(...restoreOutcome.errors);
    }

    summary.ok =
      restoreOutcome.created > 0 && restoreOutcome.errors.length === 0;
    if (!summary.ok && !summary.error) {
      summary.error =
        restoreOutcome.errors[0] ??
        sanitized.errors[0] ??
        'Failed to restore project tabs.';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
  }

  return summary;
}

/**
 * List the saved projects (collections in the Saved projects group).
 * @returns {Promise<{ ok: boolean, projects?: SavedProjectDescriptor[], error?: string }>}
 */
export async function listSavedProjects() {
  let tokens;
  try {
    tokens = await loadValidProviderTokens();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  if (!tokens) {
    return {
      ok: false,
      error:
        'No Raindrop connection found. Connect in Options to view projects.',
    };
  }

  try {
    const userData = await raindropRequest('/user', tokens);
    const groups = Array.isArray(userData?.user?.groups)
      ? userData.user.groups
      : [];
    const savedGroup = groups.find((group) => {
      const title = typeof group?.title === 'string' ? group.title : '';
      return (
        title.trim().toLowerCase() === SAVED_PROJECTS_GROUP_TITLE.toLowerCase()
      );
    });

    if (!savedGroup) {
      return { ok: true, projects: [] };
    }

    const rawCollectionIds = Array.isArray(savedGroup?.collections)
      ? savedGroup.collections
      : [];
    /** @type {number[]} */
    const collectionIds = [];
    const seen = new Set();
    rawCollectionIds.forEach((value) => {
      const id = Number(value);
      if (!Number.isFinite(id) || seen.has(id)) {
        return;
      }
      seen.add(id);
      collectionIds.push(id);
    });

    if (collectionIds.length === 0) {
      return { ok: true, projects: [] };
    }

    const [rootResponse, childResponse] = await Promise.all([
      raindropRequest('/collections', tokens),
      raindropRequest('/collections/childrens', tokens),
    ]);

    /** @type {Map<number, any>} */
    const collectionMap = new Map();

    const registerCollection = (collection) => {
      if (!collection || typeof collection !== 'object') {
        return;
      }
      const rawId = collection._id ?? collection.id ?? collection.ID;
      const id = Number(rawId);
      if (!Number.isFinite(id)) {
        return;
      }
      collectionMap.set(id, collection);
    };

    const rootItems = Array.isArray(rootResponse?.items)
      ? rootResponse.items
      : [];
    rootItems.forEach(registerCollection);
    const childItems = Array.isArray(childResponse?.items)
      ? childResponse.items
      : [];
    childItems.forEach(registerCollection);

    const missingIds = collectionIds.filter((id) => !collectionMap.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.map(async (id) => {
          try {
            const single = await raindropRequest('/collection/' + id, tokens);
            if (single && typeof single === 'object' && single.item) {
              registerCollection(single.item);
            }
          } catch (error) {
            console.warn('[projects] Failed to load collection', id, error);
          }
        }),
      );
    }

    /** @type {SavedProjectDescriptor[]} */
    const projects = [];
    collectionIds.forEach((id) => {
      const collection = collectionMap.get(id);
      if (!collection) {
        return;
      }
      const title = normalizeFolderTitle(collection?.title, 'Untitled project');
      const countValue = Number(collection?.count);
      const itemCount =
        Number.isFinite(countValue) && countValue >= 0 ? countValue : 0;
      
      // Extract cover URL from collection
      const coverArray = Array.isArray(collection?.cover) ? collection.cover : [];
      const cover = coverArray.length > 0 ? coverArray[0] : undefined;
      
      projects.push({
        id,
        title,
        itemCount,
        url: buildRaindropCollectionUrl(id),
        cover,
      });
    });

    return { ok: true, projects };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/**
 * Fetch all pages of Raindrop items for the specified project collection.
 * @param {any} tokens
 * @param {number} collectionId
 * @returns {Promise<any[]>}
 */
async function fetchAllProjectItems(tokens, collectionId) {
  /** @type {any[]} */
  const items = [];
  let page = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const pageItems = await fetchRaindropItems(tokens, collectionId, page);
    if (!pageItems || pageItems.length === 0) {
      break;
    }
    items.push(...pageItems);
    if (pageItems.length < FETCH_PAGE_SIZE) {
      shouldContinue = false;
    } else {
      page += 1;
    }
  }

  return items;
}

/**
 * Prepare Raindrop items for tab restoration.
 * @param {any[]} items
 * @returns {{ entries: ProjectRestoreEntry[], errors: string[] }}
 */
function sanitizeProjectItemsForRestore(items) {
  /** @type {ProjectRestoreEntry[]} */
  const entries = [];
  /** @type {string[]} */
  const errors = [];

  if (!Array.isArray(items)) {
    return { entries, errors };
  }

  items.forEach((item, index) => {
    const rawLink = typeof item?.link === 'string' ? item.link : '';
    const normalizedUrl = normalizeHttpUrl(rawLink);
    if (!normalizedUrl) {
      errors.push('Item at index ' + index + ' is missing a supported URL.');
      return;
    }

    const metadata = parseProjectItemMetadata(item);
    const title = normalizeBookmarkTitle(item?.title, normalizedUrl);
    const finalTitle = metadata.customTitle && typeof metadata.customTitle === 'string' && metadata.customTitle.trim() !== ''
      ? metadata.customTitle.trim()
      : title;

    entries.push({
      url: normalizedUrl,
      title: finalTitle,
      pinned: metadata.pinned,
      tabIndex: metadata.tabIndex,
      group: metadata.group,
      customTitle: metadata.customTitle,
      order: index,
    });
  });

  return { entries, errors };
}

/**
 * Sort restore entries to approximate the original tab ordering.
 * @param {ProjectRestoreEntry[]} entries
 * @returns {ProjectRestoreEntry[]}
 */
function sortProjectRestoreEntries(entries) {
  const clones = [...entries];
  clones.sort((a, b) => {
    const pinnedA = a.pinned ? 0 : 1;
    const pinnedB = b.pinned ? 0 : 1;
    if (pinnedA !== pinnedB) {
      return pinnedA - pinnedB;
    }
    const indexA = computeProjectEntryIndex(a);
    const indexB = computeProjectEntryIndex(b);
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return a.order - b.order;
  });
  return clones;
}

/**
 * Compute a sortable index for a restored project entry.
 * @param {ProjectRestoreEntry} entry
 * @returns {number}
 */
function computeProjectEntryIndex(entry) {
  const fallback = 1000000 + entry.order;
  if (entry.group) {
    const groupIndex = Number.isFinite(entry.group.index)
      ? Number(entry.group.index)
      : 100000;
    const tabIndex = Number.isFinite(entry.tabIndex)
      ? Number(entry.tabIndex)
      : entry.order;
    return groupIndex * 1000 + tabIndex;
  }
  if (Number.isFinite(entry.tabIndex)) {
    return Number(entry.tabIndex);
  }
  return fallback;
}

/**
 * Restore project tabs into the current window based on sanitized entries.
 * @param {ProjectRestoreEntry[]} entries
 * @returns {Promise<{ created: number, pinned: number, grouped: number, errors: string[] }>}
 */
async function applyProjectRestore(entries) {
  /** @type {string[]} */
  const errors = [];
  const outcome = {
    created: 0,
    pinned: 0,
    grouped: 0,
    errors,
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    return outcome;
  }

  /** @type {chrome.tabs.Tab[]} */
  let activeTabs = [];
  try {
    activeTabs = await tabsQuery({ active: true, currentWindow: true });
  } catch (error) {
    activeTabs = [];
  }

  let windowId = Number(
    activeTabs?.[0]?.windowId ?? chrome.windows?.WINDOW_ID_CURRENT ?? -1,
  );
  if (!Number.isFinite(windowId) || windowId < 0) {
    try {
      const currentWindow = await windowsGetCurrent();
      windowId = Number(
        currentWindow?.id ?? chrome.windows?.WINDOW_ID_CURRENT ?? -1,
      );
    } catch (error) {
      windowId = chrome.windows?.WINDOW_ID_CURRENT ?? -1;
    }
  }

  if (!Number.isFinite(windowId) || windowId < 0) {
    outcome.errors.push('No active window available to restore tabs.');
    return outcome;
  }

  /** @type {chrome.tabs.Tab[]} */
  let existingTabs = [];
  try {
    existingTabs = await tabsQuery({ windowId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outcome.errors.push(message);
    existingTabs = [];
  }

  const existingPinnedCount = existingTabs.filter((tab) => tab?.pinned).length;
  const existingTabCount = existingTabs.length;

  // Check if current window has only 1 empty tab (new tab page)
  const hasOnlyEmptyTab = existingTabCount === 1 && 
    existingTabs[0] && 
    existingTabs[0].url && 
    (existingTabs[0].url === 'chrome://newtab/' || 
     existingTabs[0].url === 'chrome://new-tab-page/' ||
     existingTabs[0].url === 'edge://newtab/' ||
     existingTabs[0].url === 'about:newtab' ||
     existingTabs[0].url === 'about:blank' ||
     existingTabs[0].url.startsWith('chrome://newtab/') ||
     existingTabs[0].url.startsWith('chrome://new-tab-page/') ||
     existingTabs[0].url.startsWith('edge://newtab/'));

  const sortedEntries = sortProjectRestoreEntries(entries);
  /** @type {{ tab: chrome.tabs.Tab, entry: ProjectRestoreEntry }[]} */
  const createdEntries = [];

  let totalCreated = 0;
  let pinnedOffset = existingPinnedCount;

  for (const entry of sortedEntries) {
    const targetIndex = entry.pinned
      ? pinnedOffset
      : existingTabCount + totalCreated;
    try {
      const tab = await tabsCreate({
        windowId,
        url: entry.url,
        active: false,
        index: targetIndex,
        pinned: entry.pinned,
      });
      if (tab && typeof tab.id === 'number') {
        createdEntries.push({ tab, entry });
        outcome.created += 1;
        if (entry.pinned) {
          pinnedOffset += 1;
          outcome.pinned += 1;
        }
        
        // Save custom title as object with tab ID, URL, and title to local storage if it exists
        if (entry.customTitle && typeof entry.customTitle === 'string' && entry.customTitle.trim() !== '') {
          try {
            await chrome.storage.local.set({
              [`customTitle_${tab.id}`]: {
                tabId: tab.id,
                url: entry.url,
                title: entry.customTitle.trim()
              }
            });
          } catch (error) {
            console.log('Could not save custom title for tab', tab.id, ':', error);
          }
        }
      }
      totalCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(entry.url + ': ' + message);
    }
  }

  if (createdEntries.length === 0) {
    return outcome;
  }

  // Close the empty tab if we had only one empty tab and successfully created new tabs
  if (hasOnlyEmptyTab && createdEntries.length > 0) {
    try {
      const emptyTab = existingTabs[0];
      if (emptyTab && typeof emptyTab.id === 'number') {
        await chrome.tabs.remove(emptyTab.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push('Failed to close empty tab: ' + message);
    }
  }

  if (
    !chrome.tabs ||
    typeof chrome.tabs.group !== 'function' ||
    !chrome.tabGroups ||
    typeof chrome.tabGroups.update !== 'function'
  ) {
    return outcome;
  }

  /** @type {Map<string, { meta: { name: string, color: string, index: number }, tabIds: number[], firstIndex: number }>} */
  const groupingMap = new Map();
  createdEntries.forEach(({ tab, entry }) => {
    if (!entry.group || typeof tab?.id !== 'number') {
      return;
    }
    const key = JSON.stringify({
      name: entry.group.name,
      color: entry.group.color,
      index: entry.group.index,
    });
    const tabIndex = Number.isFinite(tab.index)
      ? Number(tab.index)
      : Number.POSITIVE_INFINITY;
    const existing = groupingMap.get(key);
    if (existing) {
      existing.tabIds.push(tab.id);
      existing.firstIndex = Math.min(existing.firstIndex, tabIndex);
      return;
    }
    groupingMap.set(key, {
      meta: entry.group,
      tabIds: [tab.id],
      firstIndex: tabIndex,
    });
  });

  const groupingRecords = Array.from(groupingMap.values()).filter(
    (record) => record.tabIds.length > 0,
  );
  groupingRecords.sort((a, b) => {
    const metaIndexA = Number.isFinite(a.meta.index)
      ? Number(a.meta.index)
      : Number.POSITIVE_INFINITY;
    const metaIndexB = Number.isFinite(b.meta.index)
      ? Number(b.meta.index)
      : Number.POSITIVE_INFINITY;
    if (metaIndexA !== metaIndexB) {
      return metaIndexA - metaIndexB;
    }
    return a.firstIndex - b.firstIndex;
  });

  for (const record of groupingRecords) {
    if (record.tabIds.length === 0) {
      continue;
    }
    try {
      const groupId = await tabsGroup({
        tabIds: record.tabIds.length === 1 ? record.tabIds[0] : /** @type {[number, ...number[]]} */ (record.tabIds),
        createProperties: { windowId },
      });
      outcome.grouped += 1;
      try {
        await tabGroupsUpdate(groupId, {
          title: record.meta.name || 'Tab group',
          color: (record.meta.color && ['grey', 'blue', 'cyan', 'green', 'orange', 'pink', 'purple', 'red', 'yellow'].includes(record.meta.color)) 
            ? /** @type {'grey' | 'blue' | 'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'yellow'} */ (record.meta.color)
            : 'grey',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outcome.errors.push(
          'Group ' + (record.meta.name || 'Tab group') + ': ' + message,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(
        'Failed to restore group ' +
          (record.meta.name || 'Tab group') +
          ': ' +
          message,
      );
    }
  }

  // Auto-activate and focus on the first created tab
  if (createdEntries.length > 0) {
    try {
      const firstTab = createdEntries[0].tab;
      if (firstTab && typeof firstTab.id === 'number') {
        await tabsUpdate(firstTab.id, { active: true });
        await tabsHighlight({ tabs: [firstTab.id] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push('Failed to activate first tab: ' + message);
    }
  }

  return outcome;
}

/**
 * Normalize a project name to a trimmed string.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeProjectName(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed;
}

/**
 * Sanitize raw project tab descriptors from the popup.
 * @param {ProjectTabDescriptor[]} rawTabs
 * @returns {{ tabs: ProjectTabDescriptor[], skipped: number, errors: string[] }}
 */
function sanitizeProjectTabDescriptors(rawTabs) {
  const tabs = [];
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {Set<string>} */
  const seenUrls = new Set();
  const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
  const defaultWindowId = chrome.windows?.WINDOW_ID_NONE ?? -1;

  if (!Array.isArray(rawTabs)) {
    return { tabs, skipped, errors };
  }

  rawTabs.forEach((entry, index) => {
    const id = Number(entry?.id);
    if (!Number.isFinite(id) || id < 0) {
      skipped += 1;
      errors.push('Entry at index ' + index + ' is missing a valid tab id.');
      return;
    }

    const normalizedUrl = normalizeHttpUrl(entry?.url);
    if (!normalizedUrl) {
      skipped += 1;
      errors.push('Tab ' + id + ' has an unsupported URL.');
      return;
    }

    if (seenUrls.has(normalizedUrl)) {
      skipped += 1;
      return;
    }
    seenUrls.add(normalizedUrl);

    tabs.push({
      id,
      windowId: Number.isFinite(entry?.windowId)
        ? Number(entry.windowId)
        : defaultWindowId,
      index: Number.isFinite(entry?.index) ? Number(entry.index) : -1,
      groupId: Number.isFinite(entry?.groupId)
        ? Number(entry.groupId)
        : noneGroupId,
      pinned: Boolean(entry?.pinned),
      url: normalizedUrl,
      title: typeof entry?.title === 'string' ? entry.title : '',
    });
  });

  return { tabs, skipped, errors };
}

/**
 * Resolve current tab state for project saving.
 * @param {ProjectTabDescriptor[]} descriptors
 * @returns {Promise<{ tabs: ResolvedProjectTab[], skipped: number, errors: string[] }>}
 */
async function resolveProjectTabs(descriptors) {
  const results = [];
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];

  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return { tabs: results, skipped, errors };
  }

  if (!chrome.tabs || typeof chrome.tabs.get !== 'function') {
    descriptors.forEach((descriptor) => {
      results.push({
        id: descriptor.id,
        windowId: descriptor.windowId,
        index: descriptor.index,
        groupId: descriptor.groupId,
        pinned: descriptor.pinned,
        url: descriptor.url,
        title: descriptor.title,
      });
    });
    return { tabs: results, skipped, errors };
  }

  for (const descriptor of descriptors) {
    try {
      const tab = await tabsGet(descriptor.id);
      const normalizedUrl = normalizeHttpUrl(tab?.url ?? descriptor.url);
      if (!normalizedUrl) {
        skipped += 1;
        continue;
      }

      const title =
        typeof tab?.title === 'string' ? tab.title : descriptor.title;
      results.push({
        id: descriptor.id,
        windowId: Number.isFinite(tab?.windowId)
          ? Number(tab.windowId)
          : descriptor.windowId,
        index: Number.isFinite(tab?.index)
          ? Number(tab.index)
          : descriptor.index,
        groupId: Number.isFinite(tab?.groupId)
          ? Number(tab.groupId)
          : descriptor.groupId,
        pinned: Boolean(tab?.pinned ?? descriptor.pinned),
        url: normalizedUrl,
        title: typeof title === 'string' ? title : '',
      });
    } catch (error) {
      skipped += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push('Tab ' + descriptor.id + ': ' + message);
    }
  }

  return { tabs: results, skipped, errors };
}

/**
 * Build metadata context for project tabs grouped by tab group.
 * @param {ResolvedProjectTab[]} tabs
 * @returns {Promise<ProjectGroupContext>}
 */
async function buildProjectGroupContext(tabs) {
  /** @type {ProjectGroupContext} */
  const context = {
    groupInfo: new Map(),
    tabIndexById: new Map(),
    customTitles: new Map(),
  };

  if (!Array.isArray(tabs) || tabs.length === 0) {
    return context;
  }

  // Fetch custom titles for all tabs
  const tabIds = tabs.map(tab => tab.id).filter(id => typeof id === 'number');
  const customTitleKeys = tabIds.map(id => `customTitle_${id}`);
  if (customTitleKeys.length > 0) {
    try {
      const customTitles = await chrome.storage.local.get(customTitleKeys);
      tabIds.forEach((id) => {
        const customTitleData = customTitles[`customTitle_${id}`];
        if (!context.customTitles || !customTitleData) {
          return;
        }

        if (typeof customTitleData === 'string' && customTitleData.trim() !== '') {
          context.customTitles.set(id, customTitleData.trim());
          return;
        }

        if (
          typeof customTitleData === 'object' &&
          typeof customTitleData.title === 'string' &&
          customTitleData.title.trim() !== ''
        ) {
          context.customTitles.set(id, customTitleData.title.trim());
        }
      });
    } catch (error) {
      console.warn('[projects] Failed to fetch custom titles:', error);
    }
  }

  const noneGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;

  const groupIds = new Set();
  tabs.forEach((tab) => {
    if (typeof tab.groupId === 'number' && tab.groupId !== noneGroupId) {
      groupIds.add(tab.groupId);
    }
  });

  if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
    tabs.forEach((tab) => {
      context.tabIndexById.set(tab.id, tab.index);
    });
    return context;
  }

  for (const groupId of groupIds) {
    try {
      const group = await tabGroupsGet(groupId);
      const groupTitle = normalizeFolderTitle(group?.title, 'Tab group');
      const groupColor =
        typeof group?.color === 'string' && group.color ? group.color : 'grey';
      let groupIndex = Number.POSITIVE_INFINITY;
      /** @type {chrome.tabs.Tab[]} */
      let groupTabs = [];

      try {
        groupTabs = await tabsQuery({ groupId });
      } catch (error) {
        groupTabs = [];
      }

      groupTabs.sort((a, b) => {
        const indexA = Number.isFinite(a.index) ? Number(a.index) : 0;
        const indexB = Number.isFinite(b.index) ? Number(b.index) : 0;
        return indexA - indexB;
      });

      groupTabs.forEach((tab, idx) => {
        if (typeof tab.id === 'number') {
          context.tabIndexById.set(tab.id, idx);
        }
        if (Number.isFinite(tab.index)) {
          groupIndex = Math.min(groupIndex, Number(tab.index));
        }
      });

      if (!Number.isFinite(groupIndex)) {
        const localFallback = tabs
          .filter((tab) => tab.groupId === groupId)
          .reduce(
            (min, tab) => Math.min(min, Number(tab.index)),
            Number.POSITIVE_INFINITY,
          );
        groupIndex = Number.isFinite(localFallback) ? localFallback : 0;
      }

      context.groupInfo.set(groupId, {
        name: groupTitle,
        color: groupColor,
        index: Number.isFinite(groupIndex) ? Number(groupIndex) : 0,
        windowId: Number(
          group?.windowId ?? chrome.windows?.WINDOW_ID_NONE ?? -1,
        ),
      });
    } catch (error) {
      // Ignore failures and fall back to basic index tracking.
    }
  }

  tabs.forEach((tab) => {
    if (!context.tabIndexById.has(tab.id)) {
      context.tabIndexById.set(
        tab.id,
        Number.isFinite(tab.index) ? Number(tab.index) : 0,
      );
    }
  });

  return context;
}

/**
 * Ensure the Saved projects group exists and return its index.
 * @param {any} tokens
 * @returns {Promise<{ groups: any[], index: number }>}
 */
async function ensureSavedProjectsGroup(tokens) {
  const userData = await raindropRequest('/user', tokens);
  const groups = Array.isArray(userData?.user?.groups)
    ? [...userData.user.groups]
    : [];

  const matchIndex = groups.findIndex((group) => {
    const title = typeof group?.title === 'string' ? group.title : '';
    return (
      title.trim().toLowerCase() === SAVED_PROJECTS_GROUP_TITLE.toLowerCase()
    );
  });

  if (matchIndex >= 0) {
    return { groups, index: matchIndex };
  }

  let maxSort = -1;
  groups.forEach((group) => {
    const sortValue = Number(group?.sort);
    if (Number.isFinite(sortValue)) {
      maxSort = Math.max(maxSort, sortValue);
    }
  });

  const newGroup = {
    title: SAVED_PROJECTS_GROUP_TITLE,
    hidden: false,
    sort: maxSort + 1,
    collections: [],
  };

  groups.push(newGroup);
  const updatedGroups = await updateUserGroups(tokens, groups);

  const updatedIndex = updatedGroups.findIndex((group) => {
    const title = typeof group?.title === 'string' ? group.title : '';
    return (
      title.trim().toLowerCase() === SAVED_PROJECTS_GROUP_TITLE.toLowerCase()
    );
  });

  return {
    groups: updatedGroups,
    index: updatedIndex >= 0 ? updatedIndex : updatedGroups.length - 1,
  };
}

/**
 * Search for a cover using Raindrop's cover search API.
 * @param {any} tokens
 * @param {string} searchText
 * @returns {Promise<string | null>}
 */
async function searchForCover(tokens, searchText) {
  if (!searchText || typeof searchText !== 'string') {
    return null;
  }

  try {
    const response = await raindropRequest(
      '/collections/covers/' + encodeURIComponent(searchText.trim()),
      tokens,
    );

    if (!response?.result || !Array.isArray(response.items)) {
      return null;
    }

    // Look for the first available cover from any source
    for (const item of response.items) {
      if (Array.isArray(item.icons) && item.icons.length > 0) {
        const icon = item.icons[0];
        if (icon.png) {
          return icon.png;
        }
        if (icon.svg) {
          return icon.svg;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('[projects] Failed to search for cover:', error);
    return null;
  }
}

/**
 * Create a new Raindrop collection for the project.
 * @param {any} tokens
 * @param {string} projectName
 * @returns {Promise<{ id: number, title: string, cover?: string }>}
 */
async function createProjectCollection(tokens, projectName) {
  // Search for a cover based on the project name
  let coverUrl = null;
  try {
    coverUrl = await searchForCover(tokens, projectName);
  } catch (error) {
    console.warn('[projects] Cover search failed, proceeding without cover:', error);
  }

  const payload = {
    title: projectName,
    view: 'list',
    public: false,
    sort: Date.now(),
  };

  // If we found a cover, add it to the collection
  if (coverUrl) {
    payload.cover = coverUrl;
  }

  const response = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const item = response?.item;
  const id = Number(item?._id ?? item?.id);
  if (!Number.isFinite(id)) {
    throw new Error('Failed to create Raindrop collection for project.');
  }

  const title = normalizeFolderTitle(item?.title, projectName);
  return {
    id,
    title,
    cover: coverUrl || undefined,
  };
}

/**
 * Ensure the new collection is listed under the Saved projects group.
 * @param {any} tokens
 * @param {any[]} groups
 * @param {number} index
 * @param {number} collectionId
 * @returns {Promise<void>}
 */
async function assignCollectionToGroup(tokens, groups, index, collectionId) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return;
  }
  const normalizedId = Number(collectionId);
  if (!Number.isFinite(normalizedId)) {
    throw new Error('Invalid collection id.');
  }

  if (index < 0 || index >= groups.length) {
    return;
  }

  const updatedGroups = groups.map((group, groupIndex) => {
    if (groupIndex !== index) {
      if (!group || typeof group !== 'object') {
        return group;
      }
      const clone = { ...group };
      if (Array.isArray(group?.collections)) {
        clone.collections = [...group.collections];
      }
      return clone;
    }

    const clone = { ...group };
    const collections = Array.isArray(group?.collections)
      ? [...group.collections]
      : [];
    const filtered = collections.filter(
      (value) => Number(value) !== normalizedId,
    );
    filtered.unshift(normalizedId);
    clone.collections = filtered;
    return clone;
  });

  const originalCollections = Array.isArray(groups[index]?.collections)
    ? groups[index].collections
    : [];
  if (
    originalCollections.length > 0 &&
    Number(originalCollections[0]) === normalizedId &&
    originalCollections.length === updatedGroups[index].collections.length
  ) {
    return;
  }

  await updateUserGroups(tokens, updatedGroups);
}

/**
 * Build the Raindrop item payload for a project tab.
 * @param {ResolvedProjectTab} tab
 * @param {ProjectGroupContext} context
 * @param {number} collectionId
 * @returns {{ link: string, title: string, collectionId: number, pleaseParse: {}, excerpt: string }}
 */
function buildProjectItemPayload(tab, context, collectionId) {
  const relativeIndex = context.tabIndexById.get(tab.id);
  const tabIndex = Number.isFinite(relativeIndex)
    ? Number(relativeIndex)
    : Number(tab.index);
  const metadata = {
    tab: {
      index: Number.isFinite(tabIndex) ? tabIndex : 0,
      pinned: Boolean(tab.pinned),
    },
  };

  const groupInfo = context.groupInfo.get(tab.groupId);
  if (groupInfo) {
    metadata.group = {
      name: groupInfo.name,
      color: groupInfo.color,
      index: groupInfo.index,
    };
  }

  // Include custom title in metadata if it exists
  const customTitle = context.customTitles?.get(tab.id);
  if (customTitle && typeof customTitle === 'string' && customTitle.trim() !== '') {
    metadata.customTitle = customTitle.trim();
  }

  return {
    link: tab.url,
    title: normalizeBookmarkTitle(tab.title, tab.url),
    collectionId,
    pleaseParse: {},
    excerpt: JSON.stringify(metadata),
  };
}

/**
 * Parse stored project metadata from a Raindrop item.
 * @param {any} item
 * @returns {ParsedProjectItemMetadata}
 */
function parseProjectItemMetadata(item) {
  const excerpt = typeof item?.excerpt === 'string' ? item.excerpt : '';
  if (!excerpt) {
    return { tabIndex: undefined, group: undefined, pinned: false, customTitle: undefined };
  }

  try {
    const parsed = JSON.parse(excerpt);
    if (!parsed || typeof parsed !== 'object') {
      return { tabIndex: undefined, group: undefined, pinned: false, customTitle: undefined };
    }

    const tabIndexValue = Number(parsed?.tab?.index);
    const tabIndex = Number.isFinite(tabIndexValue) ? tabIndexValue : undefined;
    const pinned = Boolean(parsed?.tab?.pinned);
    const customTitle = typeof parsed?.customTitle === 'string' ? parsed.customTitle.trim() : undefined;

    const groupValue = parsed?.group;
    if (!groupValue || typeof groupValue !== 'object') {
      return { tabIndex, group: undefined, pinned, customTitle };
    }

    const groupName =
      typeof groupValue.name === 'string' ? groupValue.name.trim() : '';
    const groupColor =
      typeof groupValue.color === 'string' ? groupValue.color : '';
    const groupIndexValue = Number(groupValue.index);
    const groupIndex = Number.isFinite(groupIndexValue) ? groupIndexValue : 0;

    return {
      tabIndex,
      group: {
        name: groupName,
        color: groupColor,
        index: groupIndex,
      },
      pinned,
      customTitle,
    };
  } catch (error) {
    return { tabIndex: undefined, group: undefined, pinned: false, customTitle: undefined };
  }
}

/**
 * Determine whether two project group metadata objects represent the same group.
 * @param {{ name: string, color: string, index: number }} a
 * @param {{ name: string, color: string, index: number }} b
 * @returns {boolean}
 */
function isMatchingGroupMetadata(a, b) {
  return (
    a.name === b.name &&
    a.color === b.color &&
    Number(a.index) === Number(b.index)
  );
}

/**
 * Update the user's Raindrop groups ordering.
 * @param {any} tokens
 * @param {any[]} groups
 * @returns {Promise<any[]>}
 */
async function updateUserGroups(tokens, groups) {
  const response = await raindropRequest('/user', tokens, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groups }),
  });
  return Array.isArray(response?.user?.groups) ? response.user.groups : groups;
}

/**
 * Promise wrapper for chrome.tabs.get.
 * @param {number} tabId
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function tabsGet(tabId) {
  try {
    const maybe = chrome.tabs.get(tabId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

/**
 * Promise wrapper for chrome.tabs.query.
 * @param {chrome.tabs.QueryInfo} queryInfo
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function tabsQuery(queryInfo) {
  try {
    const maybe = chrome.tabs.query(queryInfo);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

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
 * Promise wrapper for chrome.tabGroups.get.
 * @param {number} groupId
 * @returns {Promise<chrome.tabGroups.TabGroup>}
 */
async function tabGroupsGet(groupId) {
  if (!chrome.tabGroups || typeof chrome.tabGroups.get !== 'function') {
    throw new Error('Tab groups API unavailable.');
  }

  try {
    const maybe = chrome.tabGroups.get(groupId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
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
 * Promise wrapper for chrome.tabs.create.
 * @param {chrome.tabs.CreateProperties} createProperties
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function tabsCreate(createProperties) {
  try {
    const maybe = chrome.tabs.create(createProperties);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

/**
 * Promise wrapper for chrome.tabs.group.
 * @param {chrome.tabs.GroupOptions} groupOptions
 * @returns {Promise<number>}
 */
async function tabsGroup(groupOptions) {
  if (!chrome.tabs || typeof chrome.tabs.group !== 'function') {
    throw new Error('Tab groups API unavailable.');
  }

  try {
    const maybe = chrome.tabs.group(groupOptions);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.group(groupOptions, (groupId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(groupId);
    });
  });
}

/**
 * Promise wrapper for chrome.tabGroups.update.
 * @param {number} groupId
 * @param {chrome.tabGroups.UpdateProperties} updateProperties
 * @returns {Promise<chrome.tabGroups.TabGroup>}
 */
async function tabGroupsUpdate(groupId, updateProperties) {
  if (!chrome.tabGroups || typeof chrome.tabGroups.update !== 'function') {
    throw new Error('Tab groups API unavailable.');
  }

  try {
    const maybe = chrome.tabGroups.update(groupId, updateProperties);
    if (isPromiseLike(maybe)) {
      return /** @type {chrome.tabGroups.TabGroup} */ (await maybe);
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabGroups.update(groupId, updateProperties, (group) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(/** @type {chrome.tabGroups.TabGroup} */ (group || {}));
    });
  });
}

/**
 * Promise wrapper for chrome.windows.getCurrent.
 * @returns {Promise<chrome.windows.Window>}
 */
async function windowsGetCurrent() {
  try {
    const maybe = chrome.windows.getCurrent();
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((window) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(window);
    });
  });
}

/**
 * Promise wrapper for chrome.tabs.update.
 * @param {number} tabId
 * @param {chrome.tabs.UpdateProperties} updateProperties
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function tabsUpdate(tabId, updateProperties) {
  try {
    const maybe = chrome.tabs.update(tabId, updateProperties);
    if (isPromiseLike(maybe)) {
      return /** @type {chrome.tabs.Tab} */ (await maybe);
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(/** @type {chrome.tabs.Tab} */ (tab));
    });
  });
}

/**
 * Promise wrapper for chrome.tabs.highlight.
 * @param {chrome.tabs.HighlightInfo} highlightInfo
 * @returns {Promise<chrome.windows.Window>}
 */
async function tabsHighlight(highlightInfo) {
  try {
    const maybe = chrome.tabs.highlight(highlightInfo);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall through to callback variant.
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.highlight(highlightInfo, (window) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(window);
    });
  });
}
