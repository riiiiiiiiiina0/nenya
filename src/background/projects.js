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
 */

/**
 * @typedef {Object} ParsedProjectItemMetadata
 * @property {number | undefined} tabIndex
 * @property {{ name: string, color: string, index: number } | undefined} group
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
 */

/**
 * @typedef {Object} SavedProjectDescriptor
 * @property {number} id
 * @property {string} title
 * @property {number} itemCount
 * @property {string} url
 */

// Message constants for saved projects
export const SAVE_PROJECT_MESSAGE = 'projects:saveProject';
export const LIST_PROJECTS_MESSAGE = 'projects:listProjects';
export const GET_CACHED_PROJECTS_MESSAGE = 'projects:getCachedProjects';
export const ADD_PROJECT_TABS_MESSAGE = 'projects:addTabsToProject';
export const REPLACE_PROJECT_ITEMS_MESSAGE =
  'projects:replaceProjectItems';

// Project-related constants
const SAVED_PROJECTS_GROUP_TITLE = 'Saved projects';
const FETCH_PAGE_SIZE = 100;

// Storage keys for caching
const CACHED_PROJECTS_KEY = 'cachedProjects';
const CACHED_PROJECTS_TIMESTAMP_KEY = 'cachedProjectsTimestamp';

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
 * Save highlighted tabs (or the active tab) as a Raindrop project.
 * @param {string} projectName
 * @param {ProjectTabDescriptor[]} rawTabs
 * @returns {Promise<SaveProjectResult>}
 */
export async function saveTabsAsProject(projectName, rawTabs) {
  const badgeAnimation = animateActionBadge(['🗂️', '📁']);
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

    return finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    finalize();
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
  const badgeAnimation = animateActionBadge(['🗂️', '➕']);
  /** @type {SaveProjectResult} */
  const summary = {
    ok: false,
    projectName: 'project',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
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

    return finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    finalize();
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
  const badgeAnimation = animateActionBadge(['🗂️', '♻️']);
  /** @type {SaveProjectResult} */
  const summary = {
    ok: false,
    projectName: 'project',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
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

    return finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = message;
    if (!summary.errors.includes(message)) {
      summary.errors.push(message);
    }
    finalize();
    throw error;
  } finally {
    concludeActionBadge(badgeAnimation, summary.ok ? '✅' : '❌');
  }
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
      projects.push({
        id,
        title,
        itemCount,
        url: buildRaindropCollectionUrl(id),
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
  };

  if (!Array.isArray(tabs) || tabs.length === 0) {
    return context;
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
 * Create a new Raindrop collection for the project.
 * @param {any} tokens
 * @param {string} projectName
 * @returns {Promise<{ id: number, title: string }>}
 */
async function createProjectCollection(tokens, projectName) {
  const payload = {
    title: projectName,
    view: 'list',
    public: false,
    sort: Date.now(),
  };

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
    return { tabIndex: undefined, group: undefined };
  }

  try {
    const parsed = JSON.parse(excerpt);
    if (!parsed || typeof parsed !== 'object') {
      return { tabIndex: undefined, group: undefined };
    }

    const tabIndexValue = Number(parsed?.tab?.index);
    const tabIndex = Number.isFinite(tabIndexValue) ? tabIndexValue : undefined;

    const groupValue = parsed?.group;
    if (!groupValue || typeof groupValue !== 'object') {
      return { tabIndex, group: undefined };
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
    };
  } catch (error) {
    return { tabIndex: undefined, group: undefined };
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
