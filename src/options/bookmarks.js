/* global chrome */

import { resetMirrorState } from '../background/mirror.js';
import { clearAllProjectData } from '../background/projects.js';
import { updateNotificationSectionsVisibility } from './notifications.js';
import { setBackupConnectionState, refreshBackupStatus } from './backup.js';
import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';

/**
 * @typedef {Object} ToastifyOptions
 * @property {string} text
 * @property {number} duration
 * @property {string} gravity
 * @property {string} position
 * @property {boolean} close
 * @property {Object} style
 */

/**
 * @typedef {Object} ToastifyInstance
 * @property {() => void} showToast
 */

/**
 * @typedef {function(ToastifyOptions): ToastifyInstance} ToastifyFunction
 */

/**
 * @typedef {Object} WindowWithToastify
 * @property {ToastifyFunction} Toastify
 */

/**
 * @typedef {function(number|Date|string): {format: function(string): string}} DayjsFunction
 */

/**
 * @typedef {Object} ProviderDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} oauthProviderId
 * @property {string} defaultRootFolderName
 * @property {string} [description]
 */

/**
 * @typedef {Object} OAuthSuccessMessage
 * @property {'oauth_success'} type
 * @property {string} provider
 * @property {{ access_token: string, refresh_token: string, expires_in: number }} tokens
 */

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
 */

/** @typedef {Record<string, StoredProviderTokens>} StoredTokenMap */

/**
 * @typedef {Object} RootFolderSettings
 * @property {string} parentFolderId
 * @property {string} rootFolderName
 */

/** @typedef {Record<string, RootFolderSettings>} RootFolderSettingsMap */

/**
 * @typedef {Object} BookmarkFolderOption
 * @property {string} id
 * @property {string} path
 */

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

const PROVIDERS = [
  {
    id: 'raindrop',
    name: 'Raindrop.io',
    oauthProviderId: 'raindrop',
    defaultRootFolderName: 'Raindrop',
    description: 'Sync collections and bookmarks from Raindrop.io.',
  },
];

const STORAGE_KEY = 'cloudAuthTokens';
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';
const UNTITLED_FOLDER_LABEL = 'Untitled folder';

const providerSelect = /** @type {HTMLSelectElement} */ (
  document.getElementById('providerSelect')
);
const connectButton = /** @type {HTMLButtonElement} */ (
  document.getElementById('connectButton')
);
const disconnectButton = /** @type {HTMLButtonElement} */ (
  document.getElementById('disconnectButton')
);
const statusMessage = /** @type {HTMLDivElement} */ (
  document.getElementById('statusMessage')
);
const providerDescription = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('providerDescription')
);
const rootFolderSection = /** @type {HTMLDivElement | null} */ (
  document.getElementById('rootFolderSection')
);
const rootFolderParentSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('rootFolderParentSelect')
);
const rootFolderNameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('rootFolderNameInput')
);
const rootFolderSaveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('rootFolderSaveButton')
);
const resetMirrorButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('resetMirrorButton')
);
const pullMirrorButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('pullMirrorButton')
);

const STATUS_BASE_CLASS = 'text-sm font-medium min-h-6';
const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

/** @type {StoredTokenMap} */
let tokenCache = {};
/** @type {RootFolderSettingsMap} */
let rootFolderSettingsCache = {};
/** @type {RootFolderSettingsMap} */
let pendingRootFolderSettings = {};
/** @type {BookmarkFolderOption[]} */
let bookmarkFolderOptions = [];
/** @type {Promise<BookmarkFolderOption[]> | undefined} */
let bookmarkFoldersLoadPromise;
/** @type {ProviderDefinition | undefined} */
let currentProvider;

/**
 * Populate the provider selector with the supported providers.
 */
function populateProviderOptions() {
  providerSelect.innerHTML = '';
  PROVIDERS.forEach((provider) => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    providerSelect.append(option);
  });
}

/**
 * Retrieve the persisted provider token map.
 * @returns {Promise<StoredTokenMap>}
 */
async function readTokenCache() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = /** @type {StoredTokenMap | undefined} */ (
    result[STORAGE_KEY]
  );
  return stored ?? {};
}

/**
 * Persist the provided token map.
 * @param {StoredTokenMap} map
 * @returns {Promise<void>}
 */
async function writeTokenCache(map) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: map });
}

/**
 * Retrieve the persisted root folder settings map.
 * @returns {Promise<RootFolderSettingsMap>}
 */
async function readRootFolderSettings() {
  const result = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  const stored = /** @type {RootFolderSettingsMap | undefined} */ (
    result[ROOT_FOLDER_SETTINGS_KEY]
  );
  return stored ?? {};
}

/**
 * Persist the root folder settings map.
 * @param {RootFolderSettingsMap} map
 * @returns {Promise<void>}
 */
async function writeRootFolderSettings(map) {
  await chrome.storage.sync.set({ [ROOT_FOLDER_SETTINGS_KEY]: map });
}

/**
 * Store tokens for the given provider.
 * @param {string} providerId
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<void>}
 */
async function setProviderTokens(providerId, tokens) {
  tokenCache[providerId] = tokens;
  await writeTokenCache(tokenCache);
}

/**
 * Remove stored tokens for the given provider.
 * @param {string} providerId
 * @returns {Promise<void>}
 */
async function clearProviderTokens(providerId) {
  delete tokenCache[providerId];
  await writeTokenCache(tokenCache);
}

/**
 * Clone the provided root folder settings.
 * @param {RootFolderSettings} settings
 * @returns {RootFolderSettings}
 */
function cloneRootFolderSettings(settings) {
  return {
    parentFolderId: settings.parentFolderId,
    rootFolderName: settings.rootFolderName,
  };
}

/**
 * Display a toast notification if Toastify is available.
 * @param {string} message
 * @param {ToastVariant} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  /** @type {WindowWithToastify} */
  const windowWithToastify = /** @type {any} */ (window);
  if (typeof windowWithToastify.Toastify !== 'function') {
    return;
  }

  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] ?? TOAST_BACKGROUND_BY_VARIANT.info;

  windowWithToastify.Toastify({
    text: message,
    duration: 4000,
    gravity: 'top',
    position: 'right',
    close: true,
    style: {
      background,
    },
  }).showToast();
}

/**
 * Send a runtime message to the background script.
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
 * Format a compact summary of mirror stats.
 * @param {{ bookmarksCreated?: number, bookmarksUpdated?: number, bookmarksMoved?: number, bookmarksDeleted?: number, foldersCreated?: number, foldersRemoved?: number, foldersMoved?: number } | undefined} stats
 * @returns {string}
 */
function formatMirrorStats(stats) {
  if (!stats) {
    return 'No changes detected.';
  }

  /** @type {string[]} */
  const parts = [];
  if (stats.bookmarksCreated) {
    parts.push(stats.bookmarksCreated + ' bookmark(s) created');
  }
  if (stats.bookmarksUpdated) {
    parts.push(stats.bookmarksUpdated + ' bookmark(s) updated');
  }
  if (stats.bookmarksMoved) {
    parts.push(stats.bookmarksMoved + ' bookmark(s) moved');
  }
  if (stats.bookmarksDeleted) {
    parts.push(stats.bookmarksDeleted + ' bookmark(s) removed');
  }
  if (stats.foldersCreated) {
    parts.push(stats.foldersCreated + ' folder(s) added');
  }
  if (stats.foldersRemoved) {
    parts.push(stats.foldersRemoved + ' folder(s) removed');
  }
  if (stats.foldersMoved) {
    parts.push('Folder order adjusted');
  }

  if (parts.length === 0) {
    return 'No changes detected.';
  }

  return parts.join(', ');
}

/**
 * Ensure root folder settings exist for the given provider.
 * @param {ProviderDefinition} provider
 * @returns {{ settings: RootFolderSettings, didMutate: boolean }}
 */
function ensureProviderRootSettings(provider) {
  let didMutate = false;
  let settings = rootFolderSettingsCache[provider.id];
  if (!settings) {
    settings = {
      parentFolderId: DEFAULT_PARENT_FOLDER_ID,
      rootFolderName: provider.defaultRootFolderName,
    };
    rootFolderSettingsCache[provider.id] = settings;
    didMutate = true;
  } else {
    if (!settings.parentFolderId) {
      settings.parentFolderId = DEFAULT_PARENT_FOLDER_ID;
      didMutate = true;
    }
    if (!settings.rootFolderName) {
      settings.rootFolderName = provider.defaultRootFolderName;
      didMutate = true;
    }
  }

  return { settings, didMutate };
}

/**
 * Find the preferred default parent bookmark folder.
 * @param {BookmarkFolderOption[]} options
 * @returns {BookmarkFolderOption | undefined}
 */
function findDefaultParentOption(options) {
  return (
    options.find((option) => option.path === DEFAULT_PARENT_PATH) ?? options[0]
  );
}

/**
 * Build the full path for the configured root folder.
 * @param {RootFolderSettings} settings
 * @param {BookmarkFolderOption[]} options
 * @returns {string}
 */
function computeRootFolderPath(settings, options) {
  const parent = options.find(
    (option) => option.id === settings.parentFolderId,
  );
  const folderName = settings.rootFolderName.trim();
  if (!parent || folderName.length === 0) {
    return '';
  }

  return parent.path + '/' + folderName;
}

/**
 * Fetch the bookmark tree nodes.
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
function getBookmarkTree() {
  try {
    /** @type {unknown} */
    const maybePromise = chrome.bookmarks.getTree();
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
        maybePromise
      );
    }
  } catch (error) {
    // Fall back to the callback form below.
  }

  return new Promise((resolve) => {
    chrome.bookmarks.getTree((nodes) => {
      resolve(nodes);
    });
  });
}

/**
 * Retrieve the children of the provided bookmark folder.
 * @param {string} parentId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
function getBookmarkChildren(parentId) {
  try {
    /** @type {unknown} */
    const maybePromise = chrome.bookmarks.getChildren(parentId);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
        maybePromise
      );
    }
  } catch (error) {
    // Fall back to the callback pattern.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(parentId, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Search for bookmarks matching the provided query.
 * @param {{ url?: string, title?: string, query?: string }} query
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
function bookmarksSearch(query) {
  try {
    /** @type {unknown} */
    const maybePromise = chrome.bookmarks.search(query);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
        maybePromise
      );
    }
  } catch (error) {
    // Fall back to callback pattern.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.search(query, (nodes) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(nodes);
    });
  });
}

/**
 * Move a bookmark node to a new destination.
 * @param {string} nodeId
 * @param {chrome.bookmarks.MoveDestination} destination
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
function moveBookmark(nodeId, destination) {
  console.log('moveBookmark:', nodeId, destination);
  try {
    /** @type {unknown} */
    const maybePromise = chrome.bookmarks.move(nodeId, destination);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {Promise<chrome.bookmarks.BookmarkTreeNode>} */ (
        maybePromise
      );
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(nodeId, destination, (node) => {
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
 * Update properties on the bookmark node.
 * @param {string} nodeId
 * @param {any} changes
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
function updateBookmark(nodeId, changes) {
  try {
    /** @type {unknown} */
    const maybePromise = chrome.bookmarks.update(nodeId, changes);
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof maybePromise.then === 'function'
    ) {
      return /** @type {Promise<chrome.bookmarks.BookmarkTreeNode>} */ (
        maybePromise
      );
    }
  } catch (error) {
    // Fall back to callback form.
  }

  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(nodeId, changes, (node) => {
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
 * Locate the id for the mirror root folder using its parent and title.
 * @param {string} parentId
 * @param {string} folderName
 * @returns {Promise<string | undefined>}
 */
async function findRootFolderId(parentId, folderName) {
  const trimmedName = folderName.trim();
  if (trimmedName.length === 0) {
    return undefined;
  }

  try {
    const children = await getBookmarkChildren(parentId);
    console.log('children:', children);
    for (const child of children) {
      if (!child.url) {
        const title = (child.title ?? '').trim();
        if (title === trimmedName) {
          return child.id;
        }
      }
    }
  } catch (error) {
    // Ignore and fall back to global search.
  }

  try {
    const matches = await bookmarksSearch({ title: trimmedName });
    for (const node of matches) {
      if (Array.isArray(node.children) && node.parentId === parentId) {
        return node.id;
      }
    }
    for (const node of matches) {
      if (Array.isArray(node.children)) {
        return node.id;
      }
    }
  } catch (error) {
    return undefined;
  }

  return undefined;
}

/**
 * Apply the saved mirror folder settings changes to the bookmark tree.
 * @param {RootFolderSettings} previous
 * @param {RootFolderSettings} next
 * @returns {Promise<void>}
 */
async function applyRootFolderSettingsChange(previous, next) {
  const previousName = previous.rootFolderName.trim();
  const nextName = next.rootFolderName.trim();

  const parentChanged = previous.parentFolderId !== next.parentFolderId;
  const nameChanged = previousName !== nextName;

  if (!parentChanged && !nameChanged) {
    return;
  }

  const existingFolderId = await findRootFolderId(
    previous.parentFolderId,
    previousName,
  );
  console.log('existingFolderId:', existingFolderId, previous);
  if (!existingFolderId) {
    return;
  }

  if (parentChanged) {
    await moveBookmark(existingFolderId, { parentId: next.parentFolderId });
  }

  if (nameChanged || parentChanged) {
    await updateBookmark(existingFolderId, { title: nextName });
  }
}

/**
 * Collect bookmark folder options from the tree.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @param {string[]} pathParts
 * @param {BookmarkFolderOption[]} collector
 * @returns {void}
 */
function collectFolderOptions(node, pathParts, collector) {
  const isFolder = Array.isArray(node.children);
  if (!isFolder) {
    return;
  }

  let nextPathParts = pathParts;
  if (node.id !== '0') {
    const title = (node.title ?? '').trim() || UNTITLED_FOLDER_LABEL;
    nextPathParts = pathParts.concat([title]);
    collector.push({
      id: node.id,
      path: '/' + nextPathParts.join('/'),
    });
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => {
      collectFolderOptions(child, nextPathParts, collector);
    });
  }
}

/**
 * Fetch selectable bookmark folder options.
 * @returns {Promise<BookmarkFolderOption[]>}
 */
async function fetchBookmarkFolderOptions() {
  const tree = await getBookmarkTree();
  /** @type {BookmarkFolderOption[]} */
  const folders = [];
  tree.forEach((node) => {
    collectFolderOptions(node, [], folders);
  });
  folders.sort((a, b) => a.path.localeCompare(b.path));
  return folders;
}

/**
 * Ensure bookmark folder options have been loaded.
 * @returns {Promise<BookmarkFolderOption[]>}
 */
async function ensureBookmarkFoldersLoaded() {
  if (bookmarkFolderOptions.length > 0) {
    return bookmarkFolderOptions;
  }

  if (bookmarkFoldersLoadPromise) {
    await bookmarkFoldersLoadPromise;
    return bookmarkFolderOptions;
  }

  bookmarkFoldersLoadPromise = fetchBookmarkFolderOptions()
    .then((options) => {
      bookmarkFolderOptions = options;
      return options;
    })
    .finally(() => {
      bookmarkFoldersLoadPromise = undefined;
    });

  await bookmarkFoldersLoadPromise;
  return bookmarkFolderOptions;
}

/**
 * Populate the parent folder selector with available options.
 * @param {BookmarkFolderOption[]} options
 * @param {RootFolderSettings} settings
 * @returns {BookmarkFolderOption[]}
 */
function populateRootFolderParentOptions(options, settings) {
  if (!rootFolderParentSelect) {
    return [];
  }

  const rootPath = computeRootFolderPath(settings, options);
  rootFolderParentSelect.innerHTML = '';

  /** @type {BookmarkFolderOption[]} */
  const selectable = [];
  options.forEach((option) => {
    if (option.path === rootPath || option.path.startsWith(rootPath + '/')) {
      return;
    }

    selectable.push(option);
    const optionElement = document.createElement('option');
    optionElement.value = option.id;
    optionElement.textContent = option.path;
    rootFolderParentSelect.append(optionElement);
  });

  return selectable;
}

/**
 * Determine whether the pending settings differ from the saved settings.
 * @param {RootFolderSettings} saved
 * @param {RootFolderSettings} pending
 * @returns {boolean}
 */
function hasPendingRootFolderChanges(saved, pending) {
  return (
    saved.parentFolderId !== pending.parentFolderId ||
    saved.rootFolderName !== pending.rootFolderName
  );
}

/**
 * Update the root bookmark folder controls.
 * @param {StoredProviderTokens | undefined} storedTokens
 * @returns {Promise<void>}
 */
async function updateRootFolderSection(storedTokens) {
  if (
    !rootFolderSection ||
    !rootFolderParentSelect ||
    !rootFolderNameInput ||
    !rootFolderSaveButton
  ) {
    return;
  }

  if (!currentProvider || !storedTokens) {
    rootFolderSection.hidden = true;
    rootFolderParentSelect.innerHTML = '';
    rootFolderParentSelect.disabled = true;
    rootFolderNameInput.value = '';
    rootFolderNameInput.disabled = true;
    rootFolderSaveButton.disabled = true;
    return;
  }

  const providerId = currentProvider.id;
  rootFolderSection.hidden = false;
  rootFolderNameInput.disabled = false;
  rootFolderParentSelect.disabled = true;
  rootFolderSaveButton.disabled = true;

  const ensured = ensureProviderRootSettings(currentProvider);
  const savedSettings = ensured.settings;
  if (ensured.didMutate) {
    await writeRootFolderSettings(rootFolderSettingsCache);
  }

  let pending = pendingRootFolderSettings[providerId];
  if (!pending) {
    pending = cloneRootFolderSettings(savedSettings);
    pendingRootFolderSettings[providerId] = pending;
  }

  rootFolderNameInput.value = pending.rootFolderName;

  try {
    const options = await ensureBookmarkFoldersLoaded();
    if (!currentProvider || currentProvider.id !== providerId) {
      return;
    }

    let storageNeedsWrite = false;

    if (!options.some((option) => option.id === savedSettings.parentFolderId)) {
      const fallbackParent = findDefaultParentOption(options);
      if (fallbackParent) {
        savedSettings.parentFolderId = fallbackParent.id;
        storageNeedsWrite = true;
      }
    }

    if (storageNeedsWrite) {
      await writeRootFolderSettings(rootFolderSettingsCache);
      pendingRootFolderSettings[providerId] =
        cloneRootFolderSettings(savedSettings);
      pending = pendingRootFolderSettings[providerId];
      rootFolderNameInput.value = pending.rootFolderName;
    }

    if (!options.some((option) => option.id === pending.parentFolderId)) {
      const fallbackPending = findDefaultParentOption(options);
      if (fallbackPending) {
        pending.parentFolderId = fallbackPending.id;
      }
    }

    rootFolderParentSelect.innerHTML = '';
    populateRootFolderParentOptions(options, pending);

    if (pending.parentFolderId) {
      rootFolderParentSelect.value = pending.parentFolderId;
    }

    rootFolderParentSelect.disabled =
      rootFolderParentSelect.options.length === 0;

    rootFolderSaveButton.disabled = !hasPendingRootFolderChanges(
      savedSettings,
      pending,
    );
  } catch (error) {
    rootFolderParentSelect.innerHTML = '';
    rootFolderParentSelect.disabled = true;
    rootFolderSaveButton.disabled = true;
  }
}

/**
 * Handle updates to the parent folder selector.
 * @returns {void}
 */
function handleRootFolderParentChange() {
  if (!currentProvider || !rootFolderParentSelect || !rootFolderSaveButton) {
    return;
  }

  const newParentId = rootFolderParentSelect.value;
  if (!newParentId) {
    return;
  }

  const providerId = currentProvider.id;
  const pending = pendingRootFolderSettings[providerId];
  if (!pending || newParentId === pending.parentFolderId) {
    return;
  }

  pending.parentFolderId = newParentId;

  const saved = rootFolderSettingsCache[providerId];
  if (saved) {
    rootFolderSaveButton.disabled = !hasPendingRootFolderChanges(
      saved,
      pending,
    );
  }

  const storedTokens = tokenCache[providerId];
  if (storedTokens) {
    void updateRootFolderSection(storedTokens);
  }
}

/**
 * Handle updates to the root folder name input.
 * @returns {void}
 */
function handleRootFolderNameChange() {
  if (!currentProvider || !rootFolderNameInput || !rootFolderSaveButton) {
    return;
  }

  const sanitized = rootFolderNameInput.value.trim();
  const providerId = currentProvider.id;
  const pending = pendingRootFolderSettings[providerId];
  if (!pending) {
    return;
  }

  if (sanitized.length === 0) {
    rootFolderNameInput.value = pending.rootFolderName;
    return;
  }

  pending.rootFolderName = sanitized;
  rootFolderNameInput.value = sanitized;

  const saved = rootFolderSettingsCache[providerId];
  if (saved) {
    rootFolderSaveButton.disabled = !hasPendingRootFolderChanges(
      saved,
      pending,
    );
  }

  const storedTokens = tokenCache[providerId];
  if (storedTokens) {
    void updateRootFolderSection(storedTokens);
  }
}

/**
 * Persist pending root folder settings and move the existing folder when needed.
 * @returns {Promise<void>}
 */
async function handleRootFolderSaveClick() {
  if (!currentProvider || !rootFolderSaveButton || !rootFolderNameInput) {
    return;
  }

  const providerId = currentProvider.id;
  const ensured = ensureProviderRootSettings(currentProvider);
  const savedSettings = ensured.settings;
  if (ensured.didMutate) {
    await writeRootFolderSettings(rootFolderSettingsCache);
  }

  const pending = pendingRootFolderSettings[providerId];
  if (!pending) {
    return;
  }

  const trimmedName = pending.rootFolderName.trim();
  if (trimmedName.length === 0) {
    rootFolderNameInput.value = savedSettings.rootFolderName;
    pending.rootFolderName = savedSettings.rootFolderName;
    rootFolderSaveButton.disabled = true;
    return;
  }

  const nextSettings = {
    parentFolderId: pending.parentFolderId,
    rootFolderName: trimmedName,
  };

  if (!hasPendingRootFolderChanges(savedSettings, nextSettings)) {
    rootFolderSaveButton.disabled = true;
    return;
  }

  rootFolderSaveButton.disabled = true;

  try {
    await applyRootFolderSettingsChange(savedSettings, nextSettings);

    rootFolderSettingsCache[providerId] = cloneRootFolderSettings(nextSettings);
    pendingRootFolderSettings[providerId] =
      cloneRootFolderSettings(nextSettings);
    await writeRootFolderSettings(rootFolderSettingsCache);

    bookmarkFolderOptions = [];
    const updatedOptions = await ensureBookmarkFoldersLoaded();
    const storedTokens = tokenCache[providerId];
    if (storedTokens) {
      await updateRootFolderSection(storedTokens);
    }

    const resolvedPath = computeRootFolderPath(nextSettings, updatedOptions);
    const message = resolvedPath
      ? 'Root bookmark folder updated to ' + resolvedPath + '.'
      : 'Root bookmark folder updated.';
    showToast(message, 'success');
  } catch (error) {
    pendingRootFolderSettings[providerId] =
      cloneRootFolderSettings(savedSettings);
    const storedTokens = tokenCache[providerId];
    if (storedTokens) {
      await updateRootFolderSection(storedTokens);
    }
    showToast(
      'Unable to update root bookmark folder. Please try again.',
      'error',
    );
  }
}

/**
 * Reset mirror state and trigger a fresh pull.
 * @returns {Promise<void>}
 */
async function runMirrorAction(actionType, pendingMessage) {
  if (!currentProvider) {
    return;
  }

  const storedTokens = tokenCache[currentProvider.id];
  if (!storedTokens) {
    showToast('Connect to the provider before running sync.', 'error');
    return;
  }

  const buttons = [resetMirrorButton, pullMirrorButton];
  buttons.forEach((button) => {
    if (button) {
      button.disabled = true;
    }
  });

  showToast(pendingMessage, 'info');

  try {
    const response = await sendRuntimeMessage({ type: actionType });
    if (response && response.ok) {
      const summary = formatMirrorStats(response.stats);
      const prefix =
        actionType === 'mirror:resetPull'
          ? 'Mirror refreshed. '
          : 'Mirror pulled. ';
      showToast(prefix + summary, 'success');
      bookmarkFolderOptions = [];
      const tokens = tokenCache[currentProvider.id];
      if (tokens) {
        await updateRootFolderSection(tokens);
      }
    } else {
      const message =
        response && typeof response.error === 'string'
          ? response.error
          : 'Action failed. Please try again.';
      showToast(message, 'error');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast(message, 'error');
  } finally {
    buttons.forEach((button) => {
      if (button) {
        button.disabled = false;
      }
    });
  }
}

/**
 * Trigger the regular pull without resetting state.
 * @returns {Promise<void>}
 */
async function handlePullMirrorClick() {
  await runMirrorAction('mirror:pull', 'Pulling latest Raindrop data...');
}

/**
 * Reset mirror state and trigger a fresh pull.
 * @returns {Promise<void>}
 */
async function handleResetMirrorClick() {
  await runMirrorAction(
    'mirror:resetPull',
    'Resetting mirror and pulling fresh data...',
  );
}

/**
 * Derive the status string for the current provider.
 * @param {StoredProviderTokens | undefined} storedTokens
 * @returns {{ message: string, statusClass: string }}
 */
function getProviderStatus(storedTokens) {
  if (!currentProvider) {
    return {
      message: 'Choose a provider to get started.',
      statusClass: 'text-base-content/70',
    };
  }

  if (!storedTokens) {
    return {
      message: 'Not connected to ' + currentProvider.name + '.',
      statusClass: 'text-error',
    };
  }

  const now = Date.now();
  const isActive = storedTokens.expiresAt > now;
  if (isActive) {
    // @ts-ignore - dayjs is loaded globally via script tag
    const formattedDate = dayjs(storedTokens.expiresAt).format('YYYY-MM-DD HH:mm');
    return {
      message:
        'Connected to ' +
        currentProvider.name +
        '. Token expires at ' +
        formattedDate +
        '.',
      statusClass: 'text-success',
    };
  }

  const expiredAt = new Date(storedTokens.expiresAt);
  return {
    message:
      'Connection expired on ' +
      expiredAt.toLocaleString() +
      '. Reconnect to continue syncing.',
    statusClass: 'text-error',
  };
}

/**
 * Update the UI to reflect the currently selected provider and tokens.
 */
function renderProviderState() {
  const storedTokens = currentProvider
    ? tokenCache[currentProvider.id]
    : undefined;
  const status = getProviderStatus(storedTokens);
  statusMessage.textContent = status.message;
  statusMessage.className =
    STATUS_BASE_CLASS + (status.statusClass ? ' ' + status.statusClass : '');

  if (providerDescription) {
    providerDescription.textContent = currentProvider?.description ?? '';
  }

  const hasSelection = Boolean(currentProvider);
  connectButton.hidden = !hasSelection;
  disconnectButton.hidden = !hasSelection || !storedTokens;
  connectButton.textContent = storedTokens ? 'Reconnect' : 'Connect';
  if (resetMirrorButton) {
    const shouldShow = hasSelection && Boolean(storedTokens);
    resetMirrorButton.hidden = !shouldShow;
    resetMirrorButton.disabled = !shouldShow;
  }
  if (pullMirrorButton) {
    const shouldShow = hasSelection && Boolean(storedTokens);
    pullMirrorButton.hidden = !shouldShow;
    pullMirrorButton.disabled = !shouldShow;
  }

  void updateRootFolderSection(storedTokens);
  
  // Update notification sections visibility based on login status
  const isLoggedIn = hasSelection && Boolean(storedTokens);
  updateNotificationSectionsVisibility(isLoggedIn);
}

/**
 * Handle provider selection changes.
 */
function handleProviderChange() {
  const selectedId = providerSelect.value;
  currentProvider = PROVIDERS.find((provider) => provider.id === selectedId);
  renderProviderState();
}

/**
 * Start the OAuth flow for the selected provider.
 */
function handleConnectClick() {
  if (!currentProvider) {
    return;
  }

  const statePayload = {
    extensionId: chrome.runtime.id,
    providerId: currentProvider.id,
  };

  const oauthUrl =
    'https://ohauth.vercel.app/oauth/' +
    currentProvider.oauthProviderId +
    '?state=' +
    encodeURIComponent(JSON.stringify(statePayload));
  void chrome.tabs.create({ url: oauthUrl });
}

/**
 * Clear stored tokens for the selected provider and reset all local data.
 */
async function handleDisconnectClick() {
  if (!currentProvider) {
    return;
  }

  try {
    // Clear provider tokens
    await clearProviderTokens(currentProvider.id);
    
    // Reset mirror state (bookmark root folder and timestamps)
    const rootFolderSettings = await readRootFolderSettings();
    const providerSettings = rootFolderSettings[currentProvider.id];
    if (providerSettings) {
      const settingsData = {
        settings: providerSettings,
        map: rootFolderSettings,
        didMutate: false
      };
      await resetMirrorState(settingsData);
    }
    
    // Clear all project-related data and custom title records
    await clearAllProjectData();
    
    renderProviderState();
    setBackupConnectionState(false);
    await refreshBackupStatus();
    showToast('Disconnected from ' + currentProvider.name + '. All local data has been cleared.', 'info');
  } catch (error) {
    console.error('[bookmarks] Error during logout:', error);
    showToast('Error during logout. Some data may not have been cleared.', 'error');
  }
}

/**
 * Process successful OAuth responses delivered to the extension.
 * @param {OAuthSuccessMessage} message
 */
async function processOAuthSuccess(message) {
  const provider = PROVIDERS.find(
    (definition) => definition.oauthProviderId === message.provider,
  );
  if (!provider) {
    return;
  }

  const expiresInMs = Number(message.tokens.expires_in) * 1000;
  const record = {
    accessToken: message.tokens.access_token,
    refreshToken: message.tokens.refresh_token,
    expiresAt: Date.now() + expiresInMs,
  };

  await setProviderTokens(provider.id, record);

  if (currentProvider && currentProvider.id === provider.id) {
    renderProviderState();
  }

  setBackupConnectionState(true);
  showToast('Connected to ' + provider.name + '.', 'success');
  
  try {
    await sendRuntimeMessage({ type: OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN });
  } catch (error) {
    console.warn(
      '[bookmarks] Failed to restore options after login:',
      error instanceof Error ? error.message : error,
    );
  }

  await refreshBackupStatus();
  
  // Automatically start pulling when user logs in
  try {
    await sendRuntimeMessage({ type: 'mirror:pull' });
  } catch (error) {
    console.warn('[bookmarks] Failed to start automatic pull after login:', error);
    // Don't show error to user as the login was successful
  }
}

/**
 * Listen for external OAuth messages sent back to the extension.
 */
function registerExternalMessageListener() {
  chrome.runtime.onMessageExternal.addListener((message) => {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    if (message.type === 'oauth_success') {
      void processOAuthSuccess(/** @type {OAuthSuccessMessage} */ (message));
    }

    return false;
  });
}

/**
 * Initialize the options page.
 */
async function init() {
  populateProviderOptions();

  tokenCache = await readTokenCache();
  rootFolderSettingsCache = await readRootFolderSettings();

  providerSelect.addEventListener('change', handleProviderChange);
  connectButton.addEventListener('click', handleConnectClick);
  disconnectButton.addEventListener('click', () => {
    void handleDisconnectClick();
  });
  if (rootFolderParentSelect) {
    rootFolderParentSelect.addEventListener('change', () => {
      void handleRootFolderParentChange();
    });
  }
  if (rootFolderNameInput) {
    rootFolderNameInput.addEventListener('change', () => {
      void handleRootFolderNameChange();
    });
  }
  if (resetMirrorButton) {
    resetMirrorButton.addEventListener('click', () => {
      void handleResetMirrorClick();
    });
  }
  if (pullMirrorButton) {
    pullMirrorButton.addEventListener('click', () => {
      void handlePullMirrorClick();
    });
  }
  if (rootFolderSaveButton) {
    rootFolderSaveButton.addEventListener('click', () => {
      void handleRootFolderSaveClick();
    });
  }

  registerExternalMessageListener();

  if (PROVIDERS.length > 0) {
    providerSelect.value = PROVIDERS[0].id;
    currentProvider = PROVIDERS[0];
  }

  renderProviderState();
}

/**
 * Subscribe to storage changes for root folder settings to reflect imports/restores.
 * When settings change, update UI controls and move/rename the existing root folder accordingly.
 * @returns {void}
 */
function subscribeToRootFolderStorageChanges() {
  if (!chrome?.storage?.onChanged) {
    return;
  }

  /** @type {boolean} */
  let suppressOnce = false;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes || !changes[ROOT_FOLDER_SETTINGS_KEY]) {
      return;
    }

    if (suppressOnce) {
      suppressOnce = false;
      return;
    }

    void (async () => {
      /** @type {RootFolderSettingsMap | undefined} */
      const newMap = /** @type {*} */ (changes[ROOT_FOLDER_SETTINGS_KEY].newValue) || {};

      // Determine provider to apply (default to 'raindrop' if none selected yet)
      const providerId = currentProvider ? currentProvider.id : 'raindrop';

      /** @type {RootFolderSettings | undefined} */
      const previous = rootFolderSettingsCache[providerId];
      /** @type {RootFolderSettings | undefined} */
      const rawNext = /** @type {*} */ (newMap?.[providerId]);

      // Update local caches immediately
      rootFolderSettingsCache = newMap || {};
      if (rawNext) {
        pendingRootFolderSettings[providerId] = cloneRootFolderSettings(rawNext);
      }

      /**
       * Validate parent folder existence.
       * @param {string} parentId
       * @returns {Promise<boolean>}
       */
      async function parentFolderExists(parentId) {
        try {
          await getBookmarkChildren(parentId);
          return true;
        } catch (error) {
          return false;
        }
      }

      /** @type {RootFolderSettings | undefined} */
      let next = rawNext ? cloneRootFolderSettings(rawNext) : undefined;

      if (next) {
        const exists = await parentFolderExists(next.parentFolderId);
        if (!exists) {
          next.parentFolderId = DEFAULT_PARENT_FOLDER_ID;

          // Persist sanitized parent id to storage to avoid invalid state
          const sanitizedMap = { ...(newMap || {}) };
          sanitizedMap[providerId] = next;
          suppressOnce = true;
          await chrome.storage.sync.set({ [ROOT_FOLDER_SETTINGS_KEY]: sanitizedMap });

          // Update caches to sanitized values
          rootFolderSettingsCache = sanitizedMap;
          pendingRootFolderSettings[providerId] = cloneRootFolderSettings(next);
        }
      }

      // Apply folder move/rename if settings changed and we have both sides
      if (previous && next && hasPendingRootFolderChanges(previous, next)) {
        try {
          await applyRootFolderSettingsChange(previous, next);
        } catch (error) {
          // Ignore failures; UI will still reflect latest settings
        }
      }

      // Clear cached folder option data so newly created folders appear.
      bookmarkFolderOptions = [];
      bookmarkFoldersLoadPromise = undefined;

      // Refresh the Root bookmark folder section UI
      const storedTokens = currentProvider ? tokenCache[currentProvider.id] : undefined;
      await updateRootFolderSection(storedTokens);
    })();
  });
}

subscribeToRootFolderStorageChanges();

void init();
