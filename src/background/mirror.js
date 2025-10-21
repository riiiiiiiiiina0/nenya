/* global chrome */

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} RootFolderSettings
 * @property {string} parentFolderId
 * @property {string} rootFolderName
 */

/**
 * @typedef {Object} BookmarkFolderInfo
 * @property {string} id
 * @property {string} parentId
 * @property {string} title
 * @property {string[]} pathSegments
 * @property {number} depth
 */

/**
 * @typedef {Object} BookmarkNodeIndex
 * @property {Map<string, BookmarkFolderInfo>} folders
 * @property {Map<string, BookmarkFolderInfo[]>} childrenByParent
 * @property {Map<string, BookmarkEntry>} bookmarks
 * @property {Map<string, BookmarkEntry[]>} bookmarksByUrl
 */

/**
 * @typedef {Object} BookmarkEntry
 * @property {string} id
 * @property {string} parentId
 * @property {string} title
 * @property {string} url
 * @property {string[]} pathSegments
*/

/**
 * @typedef {Object} MirrorStats
 * @property {number} foldersCreated
 * @property {number} foldersRemoved
 * @property {number} foldersMoved
 * @property {number} bookmarksCreated
 * @property {number} bookmarksUpdated
 * @property {number} bookmarksMoved
 * @property {number} bookmarksDeleted
 */

/**
 * @typedef {Object} MirrorContext
 * @property {string} rootFolderId
 * @property {string} unsortedFolderId
 * @property {Map<number, string>} collectionFolderMap
 * @property {BookmarkNodeIndex} index
 */

export const MIRROR_ALARM_NAME = 'nenya-raindrop-mirror-pull';
export const MIRROR_PULL_INTERVAL_MINUTES = 10;

const PROVIDER_ID = 'raindrop';
const STORAGE_KEY_TOKENS = 'cloudAuthTokens';
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const LOCAL_KEY_OLDEST_ITEM = 'OLDEST_RAINDROP_ITEM';
const LOCAL_KEY_OLDEST_DELETED = 'OLDEST_DELETED_RAINDROP_ITEM';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';
const UNSORTED_TITLE = 'Unsorted';
const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
const FETCH_PAGE_SIZE = 100;

let syncInProgress = false;

/**
 * Read a numeric value from chrome.storage.local.
 * @param {string} key
 * @param {number} defaultValue
 * @returns {Promise<number>}
 */
async function readLocalNumber(key, defaultValue) {
  const result = await chrome.storage.local.get(key);
  const value = Number(result?.[key]);
  if (!Number.isFinite(value) || value < 0) {
    return defaultValue;
  }
  return value;
}

/**
 * Persist a numeric value in chrome.storage.local.
 * @param {string} key
 * @param {number} value
 * @returns {Promise<void>}
 */
async function writeLocalNumber(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Trigger a mirror pull operation, avoiding concurrent runs.
 * @param {string} trigger
 * @returns {Promise<{ ok: boolean, stats?: MirrorStats, error?: string }>}
 */
export async function runMirrorPull(trigger) {
  if (syncInProgress) {
    return {
      ok: false,
      error: 'Sync already in progress.'
    };
  }

  syncInProgress = true;
  try {
    const stats = await performMirrorPull(trigger);
    return { ok: true, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Reset mirror state before performing a fresh pull.
 * @returns {Promise<{ ok: boolean, stats?: MirrorStats, error?: string }>}
 */
export async function resetAndPull() {
  if (syncInProgress) {
    return {
      ok: false,
      error: 'Sync already in progress.'
    };
  }

  syncInProgress = true;
  try {
    const settingsData = await loadRootFolderSettings();
    await resetMirrorState(settingsData);
    const stats = await performMirrorPull('reset');
    return { ok: true, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Execute the mirror pull steps.
 * @param {string} trigger
 * @returns {Promise<MirrorStats>}
 */
async function performMirrorPull(trigger) {
  console.info('[mirror] Starting Raindrop pull (trigger:', trigger + ')');

  const stats = createEmptyStats();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error('No Raindrop connection found. Connect in Options to enable syncing.');
  }

  const remoteData = await fetchRaindropStructure(tokens);
  const settingsData = await loadRootFolderSettings();
  const mirrorContext = await ensureMirrorStructure(remoteData, settingsData, stats);

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }

  await processDeletedItems(tokens, mirrorContext, stats);
  await processUpdatedItems(tokens, mirrorContext, stats);

  console.info('[mirror] Raindrop pull complete with stats:', stats);
  return stats;
}

/**
 * Create an empty stats object.
 * @returns {MirrorStats}
 */
function createEmptyStats() {
  return {
    foldersCreated: 0,
    foldersRemoved: 0,
    foldersMoved: 0,
    bookmarksCreated: 0,
    bookmarksUpdated: 0,
    bookmarksMoved: 0,
    bookmarksDeleted: 0
  };
}

/**
 * Sanitize a bookmark folder title.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeFolderTitle(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Execute three Raindrop API calls to retrieve sidebar structure.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<{ groups: any[], rootCollections: any[], childCollections: any[] }>}
 */
async function fetchRaindropStructure(tokens) {
  const [userResponse, rootResponse, childResponse] = await Promise.all([
    raindropRequest('/user', tokens),
    raindropRequest('/collections', tokens),
    raindropRequest('/collections/childrens', tokens)
  ]);

  const groups = Array.isArray(userResponse?.user?.groups)
    ? userResponse.user.groups
    : [];
  const rootCollections = Array.isArray(rootResponse?.items) ? rootResponse.items : [];
  const childCollections = Array.isArray(childResponse?.items) ? childResponse.items : [];

  return { groups, rootCollections, childCollections };
}

/**
 * Perform an authenticated Raindrop API request.
 * @param {string} path
 * @param {StoredProviderTokens} tokens
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function raindropRequest(path, tokens, init) {
  const url = RAINDROP_API_BASE + path;
  const headers = new Headers(init?.headers ?? {});
  headers.set('Authorization', 'Bearer ' + tokens.accessToken);
  headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new Error('Raindrop request failed (' + response.status + '): ' + response.statusText);
  }

  const data = await response.json();
  if (data && data.result === false && data.errorMessage) {
    throw new Error(data.errorMessage);
  }

  return data;
}

/**
 * Ensure the mirror bookmark tree matches the remote Raindrop structure.
 * @param {{ groups: any[], rootCollections: any[], childCollections: any[] }} remoteData
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @param {MirrorStats} stats
 * @returns {Promise<MirrorContext>}
 */
async function ensureMirrorStructure(remoteData, settingsData, stats) {
  const settings = settingsData.settings;
  const parentId = await ensureParentFolderAvailable(settingsData);
  const rootTitle = normalizeFolderTitle(settings.rootFolderName, DEFAULT_ROOT_FOLDER_NAME);

  if (rootTitle !== settings.rootFolderName) {
    settings.rootFolderName = rootTitle;
    settingsData.didMutate = true;
  }

  const rootNode = await ensureRootFolder(parentId, rootTitle, stats);
  const index = await buildBookmarkIndex(rootNode.id);

  const { collectionFolderMap, unsortedFolderId } = await synchronizeFolderTree(
    remoteData,
    rootNode.id,
    index,
    stats
  );

  return {
    rootFolderId: rootNode.id,
    unsortedFolderId,
    collectionFolderMap,
    index
  };
}

/**
 * Ensure the configured parent folder exists, falling back to the bookmarks bar when necessary.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @returns {Promise<string>}
 */
async function ensureParentFolderAvailable(settingsData) {
  const settings = settingsData.settings;
  const existing = await bookmarkNodeExists(settings.parentFolderId);
  if (existing) {
    return settings.parentFolderId;
  }

  settings.parentFolderId = DEFAULT_PARENT_FOLDER_ID;
  settingsData.didMutate = true;
  return settings.parentFolderId;
}

/**
 * Ensure the root mirror folder exists beneath the configured parent.
 * @param {string} parentId
 * @param {string} title
 * @param {MirrorStats} stats
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function ensureRootFolder(parentId, title, stats) {
  const existing = await findChildFolderByTitle(parentId, title);
  if (existing) {
    return existing;
  }

  const created = await bookmarksCreate({
    parentId,
    title
  });

  stats.foldersCreated += 1;
  return created;
}

/**
 * Determine whether the given value is promise-like.
 * @param {unknown} value
 * @returns {value is PromiseLike<any>}
 */
function isPromiseLike(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

/**
 * Check if a bookmark node exists.
 * @param {string} nodeId
 * @returns {Promise<boolean>}
 */
async function bookmarkNodeExists(nodeId) {
  if (!nodeId) {
    return false;
  }

  try {
    const nodes = await bookmarksGet([nodeId]);
    return Array.isArray(nodes) && nodes.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Retrieve bookmark nodes by id.
 * @param {string[]} ids
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGet(ids) {
  try {
    const maybe = chrome.bookmarks.get(ids);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.get(ids, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Retrieve immediate bookmark children.
 * @param {string} parentId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGetChildren(parentId) {
  try {
    const maybe = chrome.bookmarks.getChildren(parentId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(parentId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Retrieve a subtree beneath the specified node.
 * @param {string} nodeId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGetSubTree(nodeId) {
  try {
    const maybe = chrome.bookmarks.getSubTree(nodeId);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getSubTree(nodeId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Create a bookmark node.
 * @param {chrome.bookmarks.BookmarkCreateArg} details
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksCreate(details) {
  try {
    const maybe = chrome.bookmarks.create(details);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(details, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Move a bookmark node.
 * @param {string} nodeId
 * @param {chrome.bookmarks.Destination} destination
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksMove(nodeId, destination) {
  try {
    const maybe = chrome.bookmarks.move(nodeId, destination);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(nodeId, destination, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Update a bookmark node.
 * @param {string} nodeId
 * @param {chrome.bookmarks.BookmarkChangesArg} changes
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function bookmarksUpdate(nodeId, changes) {
  try {
    const maybe = chrome.bookmarks.update(nodeId, changes);
    if (isPromiseLike(maybe)) {
      return await maybe;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(nodeId, changes, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Remove an entire bookmark subtree.
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function bookmarksRemoveTree(nodeId) {
  try {
    const maybe = chrome.bookmarks.removeTree(nodeId);
    if (isPromiseLike(maybe)) {
      await maybe;
      return;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  await new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(nodeId, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(undefined);
    });
  });
}

/**
 * Locate a child folder by title.
 * @param {string} parentId
 * @param {string} title
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | undefined>}
 */
async function findChildFolderByTitle(parentId, title) {
  const children = await bookmarksGetChildren(parentId);
  for (const child of children) {
    if (!child.url && normalizeFolderTitle(child.title, '') === title) {
      return child;
    }
  }
  return undefined;
}

/**
 * Build an index of bookmark folders and items under the provided root.
 * @param {string} rootId
 * @returns {Promise<BookmarkNodeIndex>}
 */
async function buildBookmarkIndex(rootId) {
  const subTree = await bookmarksGetSubTree(rootId);
  if (!Array.isArray(subTree) || subTree.length === 0) {
    throw new Error('Unable to read bookmark subtree for root ' + rootId + '.');
  }

  const rootNode = subTree[0];
  /** @type {Map<string, BookmarkFolderInfo>} */
  const folders = new Map();
  /** @type {Map<string, BookmarkFolderInfo[]>} */
  const childrenByParent = new Map();
  /** @type {Map<string, BookmarkEntry>} */
  const bookmarks = new Map();
  /** @type {Map<string, BookmarkEntry[]>} */
  const bookmarksByUrl = new Map();

  /**
   * Register a folder in the index.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} pathSegments
   */
  function registerFolder(node, pathSegments) {
    const parentId = node.parentId ?? '';
    const info = {
      id: node.id,
      parentId,
      title: normalizeFolderTitle(node.title, ''),
      pathSegments,
      depth: pathSegments.length
    };
    folders.set(node.id, info);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    const siblings = childrenByParent.get(parentId);
    siblings.push(info);
  }

  /**
   * Register a bookmark item in the index.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} pathSegments
   */
  function registerBookmark(node, pathSegments) {
    if (!node.url) {
      return;
    }
    const entry = {
      id: node.id,
      parentId: node.parentId ?? '',
      title: node.title ?? '',
      url: node.url,
      pathSegments
    };
    bookmarks.set(node.id, entry);
    if (!bookmarksByUrl.has(entry.url)) {
      bookmarksByUrl.set(entry.url, []);
    }
    bookmarksByUrl.get(entry.url).push(entry);
  }

  /**
   * Walk the bookmark tree recursively.
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @param {string[]} ancestorSegments
   */
  function traverse(node, ancestorSegments) {
    const isFolder = !node.url;
    let nextSegments = ancestorSegments;

    if (isFolder) {
      if (node.id === rootNode.id) {
        registerFolder(node, []);
        nextSegments = [];
      } else {
        const currentSegments = ancestorSegments.concat([normalizeFolderTitle(node.title, '')]);
        registerFolder(node, currentSegments);
        nextSegments = currentSegments;
      }
    } else {
      registerBookmark(node, ancestorSegments);
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        traverse(child, nextSegments);
      });
    }
  }

  traverse(rootNode, []);

  return {
    folders,
    childrenByParent,
    bookmarks,
    bookmarksByUrl
  };
}

/**
 * Build a collection node map from remote Raindrop responses.
 * @param {any[]} rootCollections
 * @param {any[]} childCollections
 * @returns {Map<number, CollectionNode>}
 */
function buildCollectionNodeMap(rootCollections, childCollections) {
  /** @type {Map<number, CollectionNode>} */
  const map = new Map();

  /**
   * Ensure a node exists in the map.
   * @param {any} collection
   * @returns {CollectionNode}
   */
  function ensureNode(collection) {
    const id = Number(collection?._id);
    if (!Number.isFinite(id)) {
      return undefined;
    }

    let node = map.get(id);
    if (!node) {
      node = {
        id,
        title: normalizeFolderTitle(collection?.title, 'Untitled'),
        sort: Number(collection?.sort) || 0,
        parentId: null,
        children: []
      };
      map.set(id, node);
    } else {
      node.title = normalizeFolderTitle(collection?.title, node.title);
      node.sort = Number(collection?.sort) || node.sort;
    }
    return node;
  }

  rootCollections.forEach((collection) => {
    const node = ensureNode(collection);
    if (node) {
      node.parentId = null;
    }
  });

  childCollections.forEach((collection) => {
    const node = ensureNode(collection);
    if (!node) {
      return;
    }

    const parentId = Number(collection?.parent?.$id);
    if (Number.isFinite(parentId)) {
      node.parentId = parentId;
    }
  });

  // Attach children after nodes are registered to avoid duplicates.
  map.forEach((node) => {
    node.children = [];
  });

  childCollections.forEach((collection) => {
    const childId = Number(collection?._id);
    const parentId = Number(collection?.parent?.$id);
    if (!Number.isFinite(childId) || !Number.isFinite(parentId)) {
      return;
    }

    const childNode = map.get(childId);
    const parentNode = map.get(parentId);
    if (childNode && parentNode && !parentNode.children.includes(childNode)) {
      parentNode.children.push(childNode);
    }
  });

  map.forEach((node) => {
    node.children.sort(compareCollectionNodes);
  });

  return map;
}

/**
 * Compare two collection nodes using Raindrop sort semantics.
 * @param {CollectionNode} a
 * @param {CollectionNode} b
 * @returns {number}
 */
function compareCollectionNodes(a, b) {
  if (a.sort !== b.sort) {
    return b.sort - a.sort;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Build the ordered group descriptors for folder synchronization.
 * @param {{ groups: any[], rootCollections: any[], childCollections: any[] }} remoteData
 * @param {Map<number, CollectionNode>} collectionMap
 * @returns {{ title: string, collections: CollectionNode[] }[]}
 */
function buildGroupPlan(remoteData, collectionMap) {
  /** @type {{ title: string, collections: CollectionNode[] }[]} */
  const plan = [];
  /** @type {Set<number>} */
  const assignedRootIds = new Set();

  const groups = Array.isArray(remoteData.groups) ? remoteData.groups : [];
  groups.forEach((group) => {
    const groupTitle = normalizeFolderTitle(group?.title, 'Group');
    const collectionIds = Array.isArray(group?.collections) ? group.collections : [];
    /** @type {CollectionNode[]} */
    const nodes = [];
    collectionIds.forEach((idValue) => {
      const id = Number(idValue);
      if (!Number.isFinite(id)) {
        return;
      }
      const node = collectionMap.get(id);
      if (node) {
        nodes.push(node);
        assignedRootIds.add(id);
      }
    });
    plan.push({ title: groupTitle, collections: nodes });
  });

  const unassigned = [];
  const roots = Array.isArray(remoteData.rootCollections) ? remoteData.rootCollections : [];
  roots.forEach((collection) => {
    const id = Number(collection?._id);
    if (!Number.isFinite(id)) {
      return;
    }
    if (assignedRootIds.has(id)) {
      return;
    }
    const node = collectionMap.get(id);
    if (node) {
      unassigned.push(node);
    }
  });

  if (unassigned.length > 0) {
    plan.push({
      title: 'Ungrouped',
      collections: unassigned
    });
  }

  return plan;
}

/**
 * Synchronize bookmark folders to mirror the Raindrop structure.
 * @param {{ groups: any[], rootCollections: any[], childCollections: any[] }} remoteData
 * @param {string} rootId
 * @param {BookmarkNodeIndex} index
 * @param {MirrorStats} stats
 * @returns {Promise<{ collectionFolderMap: Map<number, string>, unsortedFolderId: string }>}
 */
async function synchronizeFolderTree(remoteData, rootId, index, stats) {
  const collectionMap = buildCollectionNodeMap(remoteData.rootCollections, remoteData.childCollections);
  const groupPlan = buildGroupPlan(remoteData, collectionMap);

  /** @type {Set<string>} */
  const usedFolders = new Set([rootId]);
  /** @type {Map<string, string[]>} */
  const orderByParent = new Map();
  /** @type {Map<number, string>} */
  const collectionFolderMap = new Map();

  // Ensure group folders and nested collections.
  for (const group of groupPlan) {
    const groupTitle = group.title;
    const groupSegments = [groupTitle];
    const groupFolder = await ensureFolder(
      rootId,
      groupTitle,
      groupSegments,
      index,
      usedFolders,
      stats
    );
    addOrderEntry(orderByParent, rootId, groupFolder.id);

    for (const collectionNode of group.collections) {
      await ensureCollectionHierarchy(
        collectionNode,
        groupFolder.id,
        groupSegments,
        index,
        usedFolders,
        orderByParent,
        collectionFolderMap,
        stats
      );
    }
  }

  // Ensure the Unsorted folder under the root.
  const unsortedSegments = [UNSORTED_TITLE];
  const unsortedFolder = await ensureFolder(
    rootId,
    UNSORTED_TITLE,
    unsortedSegments,
    index,
    usedFolders,
    stats
  );
  addOrderEntry(orderByParent, rootId, unsortedFolder.id);

  await removeUnusedFolders(rootId, index, usedFolders, stats);
  await enforceFolderOrder(orderByParent, index, stats);

  return {
    collectionFolderMap,
    unsortedFolderId: unsortedFolder.id
  };
}

/**
 * Ensure a folder exists, creating it when necessary and updating the index.
 * @param {string} parentId
 * @param {string} title
 * @param {string[]} pathSegments
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {MirrorStats} stats
 * @returns {Promise<BookmarkFolderInfo>}
 */
async function ensureFolder(parentId, title, pathSegments, index, usedFolders, stats) {
  const siblings = index.childrenByParent.get(parentId) ?? [];
  let folderInfo = siblings.find((info) => info.title === title);

  if (!folderInfo) {
    const created = await bookmarksCreate({
      parentId,
      title
    });
    stats.foldersCreated += 1;

    folderInfo = {
      id: created.id,
      parentId,
      title,
      pathSegments,
      depth: pathSegments.length
    };

    index.folders.set(folderInfo.id, folderInfo);

    if (!index.childrenByParent.has(parentId)) {
      index.childrenByParent.set(parentId, []);
    }
    index.childrenByParent.get(parentId).push(folderInfo);
  } else {
    if (folderInfo.title !== title) {
      await bookmarksUpdate(folderInfo.id, { title });
      folderInfo.title = title;
    }
    folderInfo.pathSegments = pathSegments;
    folderInfo.depth = pathSegments.length;
  }

  if (!index.childrenByParent.has(folderInfo.id)) {
    index.childrenByParent.set(folderInfo.id, []);
  }

  usedFolders.add(folderInfo.id);
  return folderInfo;
}

/**
 * Add a folder id to the ordering map for a parent.
 * @param {Map<string, string[]>} orderByParent
 * @param {string} parentId
 * @param {string} childId
 * @returns {void}
 */
function addOrderEntry(orderByParent, parentId, childId) {
  if (!orderByParent.has(parentId)) {
    orderByParent.set(parentId, []);
  }
  const list = orderByParent.get(parentId);
  if (!list.includes(childId)) {
    list.push(childId);
  }
}

/**
 * Ensure the hierarchy for a collection node, including descendants.
 * @param {CollectionNode} node
 * @param {string} parentFolderId
 * @param {string[]} parentSegments
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {Map<string, string[]>} orderByParent
 * @param {Map<number, string>} collectionFolderMap
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function ensureCollectionHierarchy(
  node,
  parentFolderId,
  parentSegments,
  index,
  usedFolders,
  orderByParent,
  collectionFolderMap,
  stats
) {
  const title = normalizeFolderTitle(node.title, 'Collection ' + node.id);
  const currentSegments = parentSegments.concat([title]);

  const folder = await ensureFolder(
    parentFolderId,
    title,
    currentSegments,
    index,
    usedFolders,
    stats
  );

  collectionFolderMap.set(node.id, folder.id);
  addOrderEntry(orderByParent, parentFolderId, folder.id);

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    await ensureCollectionHierarchy(
      child,
      folder.id,
      currentSegments,
      index,
      usedFolders,
      orderByParent,
      collectionFolderMap,
      stats
    );
  }
}

/**
 * Remove folders that are no longer needed.
 * @param {string} rootId
 * @param {BookmarkNodeIndex} index
 * @param {Set<string>} usedFolders
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function removeUnusedFolders(rootId, index, usedFolders, stats) {
  /** @type {BookmarkFolderInfo[]} */
  const removable = [];
  index.folders.forEach((info, folderId) => {
    if (folderId === rootId) {
      return;
    }
    if (!usedFolders.has(folderId)) {
      removable.push(info);
    }
  });

  removable.sort((a, b) => b.depth - a.depth);

  for (const info of removable) {
    await bookmarksRemoveTree(info.id);
    stats.foldersRemoved += 1;

    index.folders.delete(info.id);
    index.childrenByParent.delete(info.id);

    const siblings = index.childrenByParent.get(info.parentId);
    if (siblings) {
      index.childrenByParent.set(
        info.parentId,
        siblings.filter((child) => child.id !== info.id)
      );
    }

    // Remove bookmarks that belonged to this branch.
    const pathPrefix = info.pathSegments;
    index.bookmarks.forEach((entry, bookmarkId) => {
      if (isPathWithin(entry.pathSegments, pathPrefix)) {
        index.bookmarks.delete(bookmarkId);
        const list = index.bookmarksByUrl.get(entry.url);
        if (list) {
          index.bookmarksByUrl.set(
            entry.url,
            list.filter((candidate) => candidate.id !== bookmarkId)
          );
          if (index.bookmarksByUrl.get(entry.url).length === 0) {
            index.bookmarksByUrl.delete(entry.url);
          }
        }
      }
    });
  }
}

/**
 * Check whether a bookmark path falls under the given prefix.
 * @param {string[]} path
 * @param {string[]} prefix
 * @returns {boolean}
 */
function isPathWithin(path, prefix) {
  if (prefix.length === 0) {
    return true;
  }
  if (path.length < prefix.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (path[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Reorder folders to match the desired sequence.
 * @param {Map<string, string[]>} orderByParent
 * @param {BookmarkNodeIndex} index
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function enforceFolderOrder(orderByParent, index, stats) {
  for (const [parentId, orderedIds] of orderByParent.entries()) {
    const siblings = index.childrenByParent.get(parentId) ?? [];
    const currentOrder = siblings.map((info) => info.id);
    let changed = false;

    for (let i = 0; i < orderedIds.length; i += 1) {
      const childId = orderedIds[i];
      if (currentOrder[i] !== childId) {
        await bookmarksMove(childId, { parentId, index: i });
        changed = true;
      }
    }

    if (changed) {
      stats.foldersMoved += 1;
    }

    const updatedChildren = orderedIds
      .map((id) => index.folders.get(id))
      .filter((entry) => entry);
    index.childrenByParent.set(parentId, updatedChildren);
  }
}

/**
 * Process deleted Raindrop items and remove corresponding bookmarks.
 * @param {StoredProviderTokens} tokens
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function processDeletedItems(tokens, context, stats) {
  const threshold = await readLocalNumber(LOCAL_KEY_OLDEST_DELETED, 0);
  let newestProcessed = 0;
  let page = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const items = await fetchRaindropItems(tokens, -99, page);
    if (!items || items.length === 0) {
      break;
    }

    for (const item of items) {
      const lastUpdate = parseRaindropTimestamp(item?.lastUpdate ?? item?.created);
      if (threshold > 0 && lastUpdate > 0 && lastUpdate <= threshold) {
        shouldContinue = false;
        break;
      }

      if (lastUpdate > 0) {
        newestProcessed = Math.max(newestProcessed, lastUpdate);
      }

      const url = typeof item?.link === 'string' ? item.link : '';
      if (!url) {
        continue;
      }

      await removeBookmarksByUrl(url, context, stats);
    }

    if (!shouldContinue) {
      break;
    }

    page += 1;
  }

  if (newestProcessed > 0) {
    await writeLocalNumber(LOCAL_KEY_OLDEST_DELETED, newestProcessed);
  }
}

/**
 * Process new or updated Raindrop items and mirror them as bookmarks.
 * @param {StoredProviderTokens} tokens
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function processUpdatedItems(tokens, context, stats) {
  const threshold = await readLocalNumber(LOCAL_KEY_OLDEST_ITEM, 0);
  let newestProcessed = 0;
  let page = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const items = await fetchRaindropItems(tokens, 0, page);
    if (!items || items.length === 0) {
      break;
    }

    for (const item of items) {
      const lastUpdate = parseRaindropTimestamp(item?.lastUpdate ?? item?.created);
      if (threshold > 0 && lastUpdate > 0 && lastUpdate <= threshold) {
        shouldContinue = false;
        break;
      }

      if (lastUpdate > 0) {
        newestProcessed = Math.max(newestProcessed, lastUpdate);
      }

      const url = typeof item?.link === 'string' ? item.link : '';
      if (!url) {
        continue;
      }

      const collectionId = extractCollectionId(item);
      let targetFolderId;

      if (collectionId === -1) {
        targetFolderId = context.unsortedFolderId;
      } else if (typeof collectionId === 'number') {
        targetFolderId = context.collectionFolderMap.get(collectionId);
      }

      if (!targetFolderId) {
        // Skip items that do not belong to mapped collections.
        continue;
      }

      const bookmarkTitle = normalizeBookmarkTitle(item?.title, url);
      await upsertBookmark(url, bookmarkTitle, targetFolderId, context, stats);
    }

    if (!shouldContinue) {
      break;
    }

    page += 1;
  }

  if (newestProcessed > 0) {
    await writeLocalNumber(LOCAL_KEY_OLDEST_ITEM, newestProcessed);
  }
}

/**
 * Extract the Raindrop collection id from an item.
 * @param {any} item
 * @returns {number | undefined}
 */
function extractCollectionId(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const raw =
    item.collectionId ??
    item?.collection?.$id ??
    item?.collection?._id ??
    item?.collection ??
    item?.collectionID;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Fetch a page of Raindrop items for the specified collection.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {number} page
 * @returns {Promise<any[]>}
 */
async function fetchRaindropItems(tokens, collectionId, page) {
  const params = new URLSearchParams({
    perpage: String(FETCH_PAGE_SIZE),
    page: String(page),
    sort: '-lastUpdate'
  });
  const data = await raindropRequest('/raindrops/' + collectionId + '?' + params.toString(), tokens);
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * Convert a Raindrop timestamp string to a numeric value.
 * @param {unknown} value
 * @returns {number}
 */
function parseRaindropTimestamp(value) {
  if (typeof value !== 'string') {
    return 0;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return 0;
  }
  return time;
}

/**
 * Remove bookmarks that match the provided URL within the mirror tree.
 * @param {string} url
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function removeBookmarksByUrl(url, context, stats) {
  const entries = context.index.bookmarksByUrl.get(url);
  if (!entries || entries.length === 0) {
    return;
  }

  const copies = [...entries];
  for (const entry of copies) {
    await bookmarksRemove(entry.id);
    stats.bookmarksDeleted += 1;
    context.index.bookmarks.delete(entry.id);
  }

  context.index.bookmarksByUrl.delete(url);
}

/**
 * Generate a bookmark title, falling back to the URL when necessary.
 * @param {unknown} title
 * @param {string} url
 * @returns {string}
 */
function normalizeBookmarkTitle(title, url) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed.length > 0 ? trimmed : url;
}

/**
 * Create or update a bookmark for the provided Raindrop item.
 * @param {string} url
 * @param {string} title
 * @param {string} targetFolderId
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function upsertBookmark(url, title, targetFolderId, context, stats) {
  const folderInfo = context.index.folders.get(targetFolderId);
  if (!folderInfo) {
    return;
  }

  const existingEntries = context.index.bookmarksByUrl.get(url) ?? [];
  let bookmarkEntry = existingEntries.find((entry) => entry.parentId === targetFolderId);

  if (!bookmarkEntry && existingEntries.length > 0) {
    bookmarkEntry = existingEntries[0];
    if (bookmarkEntry.parentId !== targetFolderId) {
      await bookmarksMove(bookmarkEntry.id, { parentId: targetFolderId });
      stats.bookmarksMoved += 1;
      bookmarkEntry.parentId = targetFolderId;
      bookmarkEntry.pathSegments = [...folderInfo.pathSegments];
    }
  }

  if (bookmarkEntry) {
    if (bookmarkEntry.title !== title) {
      await bookmarksUpdate(bookmarkEntry.id, { title });
      bookmarkEntry.title = title;
      stats.bookmarksUpdated += 1;
    }
    context.index.bookmarks.set(bookmarkEntry.id, bookmarkEntry);
    if (!existingEntries.includes(bookmarkEntry)) {
      existingEntries.push(bookmarkEntry);
      context.index.bookmarksByUrl.set(url, existingEntries);
    }
    bookmarkEntry.pathSegments = [...folderInfo.pathSegments];
    return;
  }

  const created = await bookmarksCreate({
    parentId: targetFolderId,
    title,
    url
  });

  stats.bookmarksCreated += 1;

  const newEntry = {
    id: created.id,
    parentId: targetFolderId,
    title,
    url,
    pathSegments: [...folderInfo.pathSegments]
  };

  context.index.bookmarks.set(newEntry.id, newEntry);
  if (!context.index.bookmarksByUrl.has(url)) {
    context.index.bookmarksByUrl.set(url, []);
  }
  context.index.bookmarksByUrl.get(url).push(newEntry);
}

/**
 * Remove a single bookmark node.
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function bookmarksRemove(nodeId) {
  try {
    const maybe = chrome.bookmarks.remove(nodeId);
    if (isPromiseLike(maybe)) {
      await maybe;
      return;
    }
  } catch (error) {
    // Fall back to callback form.
  }

  await new Promise((resolve, reject) => {
    chrome.bookmarks.remove(nodeId, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(undefined);
    });
  });
}






/**
 * Load the stored tokens for the Raindrop provider and ensure they are valid.
 * @returns {Promise<StoredProviderTokens | undefined>}
 */
async function loadValidProviderTokens() {
  const result = await chrome.storage.sync.get(STORAGE_KEY_TOKENS);
  /** @type {Record<string, StoredProviderTokens> | undefined} */
  const tokensMap = /** @type {*} */ (result[STORAGE_KEY_TOKENS]);
  if (!tokensMap) {
    return undefined;
  }

  const record = tokensMap[PROVIDER_ID];
  if (!record || typeof record.accessToken !== 'string') {
    return undefined;
  }

  const expiresAt = Number(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Raindrop credentials expired. Reconnect in Options to continue syncing.');
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt
  };
}

/**
 * Load the persisted root folder settings for the Raindrop provider.
 * @returns {Promise<{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }>}
 */
async function loadRootFolderSettings() {
  const result = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings> | undefined} */
  const storedMap = /** @type {*} */ (result[ROOT_FOLDER_SETTINGS_KEY]);
  const map = storedMap ? { ...storedMap } : {};

  let settings = map[PROVIDER_ID];
  let didMutate = false;

  if (!settings) {
    settings = {
      parentFolderId: DEFAULT_PARENT_FOLDER_ID,
      rootFolderName: DEFAULT_ROOT_FOLDER_NAME
    };
    map[PROVIDER_ID] = settings;
    didMutate = true;
  } else {
    if (!settings.parentFolderId) {
      settings.parentFolderId = DEFAULT_PARENT_FOLDER_ID;
      didMutate = true;
    }
    if (!settings.rootFolderName) {
      settings.rootFolderName = DEFAULT_ROOT_FOLDER_NAME;
      didMutate = true;
    }
  }

  return { settings, map, didMutate };
}

/**
 * Persist updated root folder settings map.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings> }} data
 * @returns {Promise<void>}
 */
async function persistRootFolderSettings(data) {
  data.map[PROVIDER_ID] = data.settings;
  await chrome.storage.sync.set({
    [ROOT_FOLDER_SETTINGS_KEY]: data.map
  });
}

/**
 * Reset stored timestamps and remove the current mirror root folder.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @returns {Promise<void>}
 */
async function resetMirrorState(settingsData) {
  await chrome.storage.local.remove([LOCAL_KEY_OLDEST_ITEM, LOCAL_KEY_OLDEST_DELETED]);

  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME
  );
  if (normalizedTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedTitle;
    settingsData.didMutate = true;
  }

  const parentExists = await bookmarkNodeExists(parentId);
  if (parentExists) {
    const existingRoot = await findChildFolderByTitle(parentId, normalizedTitle);
    if (existingRoot) {
      await bookmarksRemoveTree(existingRoot.id);
    }
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }
}

/**
 * @typedef {Object} CollectionNode
 * @property {number} id
 * @property {string} title
 * @property {number} sort
 * @property {number | null} parentId
 * @property {CollectionNode[]} children
 */
