/* global chrome */

const UNTITLED_FOLDER_LABEL = 'Untitled folder';

/**
 * Normalize a bookmark folder title.
 * @param {string | undefined} title
 * @returns {string}
 */
function normalizeTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed.length > 0 ? trimmed : UNTITLED_FOLDER_LABEL;
}

/**
 * Parse a bookmark folder path into trimmed segments.
 * @param {string} path
 * @returns {string[]}
 */
function parsePath(path) {
  if (typeof path !== 'string') {
    return [];
  }
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Wrap chrome.bookmarks.get with a Promise API.
 * @param {string} nodeId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | null>}
 */
async function getBookmarkNode(nodeId) {
  try {
    /** @type {any} */
    const maybePromise = chrome.bookmarks.get(nodeId);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      typeof maybePromise.then === 'function'
    ) {
      const nodes = /** @type {chrome.bookmarks.BookmarkTreeNode[]} */ (
        await maybePromise
      );
      return nodes.length > 0 ? nodes[0] : null;
    }
  } catch (error) {
    // Fall back to callback pattern below.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.get(nodeId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      if (!Array.isArray(nodes) || nodes.length === 0) {
        resolve(null);
        return;
      }
      resolve(nodes[0]);
    });
  });
}

/**
 * Wrap chrome.bookmarks.getChildren with a Promise API.
 * @param {string} parentId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function getBookmarkChildren(parentId) {
  try {
    /** @type {any} */
    const maybePromise = chrome.bookmarks.getChildren(parentId);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {chrome.bookmarks.BookmarkTreeNode[]} */ (
        await maybePromise
      );
    }
  } catch (error) {
    // Fall back to callback pattern.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(parentId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(Array.isArray(nodes) ? nodes : []);
    });
  });
}

/**
 * Wrap chrome.bookmarks.create with a Promise API.
 * @param {chrome.bookmarks.CreateDetails} details
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function createBookmark(details) {
  try {
    /** @type {any} */
    const maybePromise = chrome.bookmarks.create(details);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {chrome.bookmarks.BookmarkTreeNode} */ (
        await maybePromise
      );
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(details, (node) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(node);
    });
  });
}

/**
 * Build the full path string for the provided folder id.
 * @param {string} folderId
 * @returns {Promise<string>}
 */
export async function getBookmarkFolderPath(folderId) {
  if (typeof folderId !== 'string' || folderId.length === 0) {
    return '';
  }

  let currentId = folderId;
  /** @type {string[]} */
  const segments = [];

  while (currentId && currentId !== '0') {
    const node = await getBookmarkNode(currentId);
    if (!node || node.url) {
      break;
    }

    segments.push(normalizeTitle(node.title));
    if (!node.parentId || node.parentId === currentId) {
      break;
    }
    currentId = node.parentId;
  }

  if (segments.length === 0) {
    return '';
  }

  return '/' + segments.reverse().join('/');
}

/**
 * Locate a bookmark folder id by its full path.
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
export async function findBookmarkFolderIdByPath(path) {
  const segments = parsePath(path);
  if (segments.length === 0) {
    return undefined;
  }

  let parentId = '0';
  let currentId;

  for (const segment of segments) {
    const children = await getBookmarkChildren(parentId);
    const match = children.find(
      (child) => !child.url && normalizeTitle(child.title) === segment,
    );
    if (!match) {
      return undefined;
    }
    currentId = match.id;
    parentId = match.id;
  }

  return currentId;
}

/**
 * Ensure a bookmark folder path exists, creating missing segments when needed.
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
export async function ensureBookmarkFolderPath(path) {
  const segments = parsePath(path);
  if (segments.length === 0) {
    return undefined;
  }

  let parentId = '0';
  let currentId;

  for (const segment of segments) {
    const children = await getBookmarkChildren(parentId);
    let match = children.find(
      (child) => !child.url && normalizeTitle(child.title) === segment,
    );
    if (!match) {
      match = await createBookmark({
        parentId,
        title: segment,
      });
    }
    currentId = match.id;
    parentId = match.id;
  }

  return currentId;
}
