/* global chrome */

import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
  pushNotification,
} from './mirror.js';
import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';

const PROVIDER_ID = 'raindrop';
const BACKUP_COLLECTION_TITLE = 'nenya / options backup';
const LEGACY_BACKUP_COLLECTION_TITLE = 'Options backup';
const BACKUP_ITEM_PREFIX = 'options-backup-chunk-';
const BACKUP_TAGS = ['nenya', 'options-backup'];
const BACKUP_CHUNK_SIZE = 10000;
const STATE_STORAGE_KEY = 'optionsBackupState';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';

const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const DARK_MODE_RULES_KEY = 'darkModeRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const VIDEO_ENHANCEMENT_RULES_KEY = 'videoEnhancementRules';
const BLOCK_ELEMENT_RULES_KEY = 'blockElementRules';
const CUSTOM_CODE_RULES_KEY = 'customCodeRules';
const LLM_PROMPTS_KEY = 'llmPrompts';
const URL_PROCESS_RULES_KEY = 'urlProcessRules';
const AUTO_GOOGLE_LOGIN_RULES_KEY = 'autoGoogleLoginRules';
const SCREENSHOT_SETTINGS_KEY = 'screenshotSettings';
const PINNED_SHORTCUTS_KEY = 'pinnedShortcuts';

const OPTION_KEYS = [
  ROOT_FOLDER_SETTINGS_KEY,
  NOTIFICATION_PREFERENCES_KEY,
  AUTO_RELOAD_RULES_KEY,
  DARK_MODE_RULES_KEY,
  BRIGHT_MODE_WHITELIST_KEY,
  HIGHLIGHT_TEXT_RULES_KEY,
  VIDEO_ENHANCEMENT_RULES_KEY,
  BLOCK_ELEMENT_RULES_KEY,
  CUSTOM_CODE_RULES_KEY,
  LLM_PROMPTS_KEY,
  URL_PROCESS_RULES_KEY,
  AUTO_GOOGLE_LOGIN_RULES_KEY,
  SCREENSHOT_SETTINGS_KEY,
  PINNED_SHORTCUTS_KEY,
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  bookmark: {
    enabled: true,
    pullFinished: true,
    unsortedSaved: true,
  },
  project: {
    enabled: true,
    saveProject: true,
    addTabs: true,
    replaceItems: true,
    deleteProject: true,
  },
  clipboard: {
    enabled: true,
    copySuccess: true,
  },
};

let initialized = false;

/**
 * @typedef {Object} BackupState
 * @property {number | undefined} lastBackupAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastError
 * @property {number | undefined} lastErrorAt
 * @property {number | undefined} lastChunkCount
 */

/**
 * @typedef {Object} RootFolderBackupSettings
 * @property {string} parentFolderId
 * @property {string} parentFolderPath
 * @property {string} rootFolderName
 */

/**
 * @typedef {Object} OptionsBackupPayload
 * @property {number} version
 * @property {number} savedAt
 * @property {RootFolderBackupSettings} rootFolder
 * @property {any} notificationPreferences
 * @property {any[]} autoReloadRules
 * @property {any[]} darkModeRules
 * @property {any[]} brightModeWhitelist
 * @property {any[]} highlightTextRules
 * @property {any[]} videoEnhancementRules
 * @property {any[]} blockElementRules
 * @property {any[]} customCodeRules
 * @property {any[]} llmPrompts
 * @property {any[]} urlProcessRules
 * @property {any[]} autoGoogleLoginRules
 * @property {any} screenshotSettings
 * @property {any[]} pinnedShortcuts
 */

/**
 * Create a default backup state.
 * @returns {BackupState}
 */
function createDefaultState() {
  return {
    lastBackupAt: undefined,
    lastRestoreAt: undefined,
    lastError: undefined,
    lastErrorAt: undefined,
    lastChunkCount: undefined,
  };
}

/**
 * Deep clone a JSON-compatible value.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Ensure local storage has values for all option keys by migrating any
 * existing sync-stored values. Sync keys are no longer written to, but we
 * migrate once so users do not lose prior data.
 * @returns {Promise<void>}
 */
async function migrateOptionsToLocal() {
  const [localValues, syncValues] = await Promise.all([
    chrome.storage.local.get(OPTION_KEYS),
    chrome.storage.sync.get(OPTION_KEYS),
  ]);

  /** @type {Record<string, any>} */
  const updates = {};
  OPTION_KEYS.forEach((key) => {
    if (localValues[key] === undefined && syncValues[key] !== undefined) {
      updates[key] = syncValues[key];
    }
  });

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

/**
 * Run one-time initialization (migration).
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
  if (initialized) {
    return;
  }
  await migrateOptionsToLocal();
  initialized = true;
}

/**
 * Load the persisted backup state.
 * @returns {Promise<BackupState>}
 */
async function loadState() {
  const stored = await chrome.storage.local.get(STATE_STORAGE_KEY);
  const state = stored?.[STATE_STORAGE_KEY];
  if (state && typeof state === 'object') {
    return { ...createDefaultState(), ...state };
  }
  return createDefaultState();
}

/**
 * Update the persisted backup state.
 * @param {(draft: BackupState) => void} updater
 * @returns {Promise<BackupState>}
 */
async function updateState(updater) {
  const current = await loadState();
  updater(current);
  const next = { ...createDefaultState(), ...current };
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: next });
  return next;
}

/**
 * Build a snapshot of all option categories from local storage.
 * @returns {Promise<OptionsBackupPayload>}
 */
async function buildBackupPayload() {
  const stored = await chrome.storage.local.get(OPTION_KEYS);
  const rootMap = stored?.[ROOT_FOLDER_SETTINGS_KEY] || {};
  const providerRoot = rootMap?.[PROVIDER_ID] || {};
  const parentFolderId =
    typeof providerRoot.parentFolderId === 'string' &&
    providerRoot.parentFolderId.trim()
      ? providerRoot.parentFolderId.trim()
      : DEFAULT_PARENT_FOLDER_ID;
  const rootFolderName =
    typeof providerRoot.rootFolderName === 'string' &&
    providerRoot.rootFolderName.trim()
      ? providerRoot.rootFolderName.trim()
      : DEFAULT_ROOT_FOLDER_NAME;

  let parentFolderPath = '';
  try {
    parentFolderPath = await getBookmarkFolderPath(parentFolderId);
  } catch (error) {
    console.warn('[options-backup] Failed to resolve parent folder path:', error);
  }
  if (!parentFolderPath) {
    parentFolderPath = DEFAULT_PARENT_PATH;
  }

  /** @type {OptionsBackupPayload} */
  const payload = {
    version: 1,
    savedAt: Date.now(),
    rootFolder: {
      parentFolderId,
      parentFolderPath,
      rootFolderName,
    },
    notificationPreferences:
      stored?.[NOTIFICATION_PREFERENCES_KEY] || clone(DEFAULT_NOTIFICATION_PREFERENCES),
    autoReloadRules: stored?.[AUTO_RELOAD_RULES_KEY] || [],
    darkModeRules: stored?.[DARK_MODE_RULES_KEY] || [],
    brightModeWhitelist: stored?.[BRIGHT_MODE_WHITELIST_KEY] || [],
    highlightTextRules: stored?.[HIGHLIGHT_TEXT_RULES_KEY] || [],
    videoEnhancementRules: stored?.[VIDEO_ENHANCEMENT_RULES_KEY] || [],
    blockElementRules: stored?.[BLOCK_ELEMENT_RULES_KEY] || [],
    customCodeRules: stored?.[CUSTOM_CODE_RULES_KEY] || [],
    llmPrompts: stored?.[LLM_PROMPTS_KEY] || [],
    urlProcessRules: stored?.[URL_PROCESS_RULES_KEY] || [],
    autoGoogleLoginRules: stored?.[AUTO_GOOGLE_LOGIN_RULES_KEY] || [],
    screenshotSettings:
      stored?.[SCREENSHOT_SETTINGS_KEY] || {
        autoSave: false,
      },
    pinnedShortcuts: stored?.[PINNED_SHORTCUTS_KEY] || [],
  };

  return clone(payload);
}

/**
 * Apply a backup payload to local storage, overwriting existing option keys.
 * @param {OptionsBackupPayload} payload
 * @returns {Promise<void>}
 */
async function applyBackupPayload(payload) {
  const rootFolder = payload?.rootFolder || {
    parentFolderId: DEFAULT_PARENT_FOLDER_ID,
    parentFolderPath: DEFAULT_PARENT_PATH,
    rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
  };

  let parentFolderId = '';
  const desiredPath =
    typeof rootFolder.parentFolderPath === 'string'
      ? rootFolder.parentFolderPath.trim()
      : '';
  if (desiredPath) {
    try {
      const ensured = await ensureBookmarkFolderPath(desiredPath);
      if (ensured) {
        parentFolderId = ensured;
      }
    } catch (error) {
      console.warn(
        '[options-backup] Failed to ensure parent folder path during restore:',
        error,
      );
    }
  }
  if (!parentFolderId) {
    const providedId =
      typeof rootFolder.parentFolderId === 'string'
        ? rootFolder.parentFolderId.trim()
        : '';
    parentFolderId = providedId || DEFAULT_PARENT_FOLDER_ID;
  }

  const rootFolderName =
    typeof rootFolder.rootFolderName === 'string' && rootFolder.rootFolderName.trim()
      ? rootFolder.rootFolderName.trim()
      : DEFAULT_ROOT_FOLDER_NAME;

  const existing = await chrome.storage.local.get(ROOT_FOLDER_SETTINGS_KEY);
  const map =
    (existing?.[ROOT_FOLDER_SETTINGS_KEY] &&
      typeof existing[ROOT_FOLDER_SETTINGS_KEY] === 'object')
      ? existing[ROOT_FOLDER_SETTINGS_KEY]
      : {};
  map[PROVIDER_ID] = { parentFolderId, rootFolderName };

  /** @type {Record<string, any>} */
  const updates = {
    [ROOT_FOLDER_SETTINGS_KEY]: map,
    [NOTIFICATION_PREFERENCES_KEY]:
      payload.notificationPreferences || clone(DEFAULT_NOTIFICATION_PREFERENCES),
    [AUTO_RELOAD_RULES_KEY]: payload.autoReloadRules || [],
    [DARK_MODE_RULES_KEY]: payload.darkModeRules || [],
    [BRIGHT_MODE_WHITELIST_KEY]: payload.brightModeWhitelist || [],
    [HIGHLIGHT_TEXT_RULES_KEY]: payload.highlightTextRules || [],
    [VIDEO_ENHANCEMENT_RULES_KEY]: payload.videoEnhancementRules || [],
    [BLOCK_ELEMENT_RULES_KEY]: payload.blockElementRules || [],
    [CUSTOM_CODE_RULES_KEY]: payload.customCodeRules || [],
    [LLM_PROMPTS_KEY]: payload.llmPrompts || [],
    [URL_PROCESS_RULES_KEY]: payload.urlProcessRules || [],
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: payload.autoGoogleLoginRules || [],
    [SCREENSHOT_SETTINGS_KEY]:
      payload.screenshotSettings || {
        autoSave: false,
      },
    [PINNED_SHORTCUTS_KEY]: payload.pinnedShortcuts || [],
  };

  await chrome.storage.local.set(updates);
}

/**
 * Split a string into fixed-size chunks.
 * @param {string} input
 * @param {number} size
 * @returns {string[]}
 */
function chunkString(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

/**
 * Extract a numeric Raindrop collection id.
 * @param {any} collection
 * @returns {number | null}
 */
function getCollectionId(collection) {
  const rawId = collection?._id ?? collection?.id;
  const id = typeof rawId === 'string' ? Number(rawId) : rawId;
  return Number.isFinite(id) ? Number(id) : null;
}

/**
 * Fetch all Raindrop collections.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<any[]>}
 */
async function fetchBackupCollections(tokens) {
  const collectionsResponse = await raindropRequest('/collections', tokens);
  return Array.isArray(collectionsResponse?.items) ? collectionsResponse.items : [];
}

/**
 * Find existing backup collection ids (current and legacy).
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<{ primaryId: number | null, legacyId: number | null }>}
 */
async function findBackupCollectionIds(tokens) {
  const items = await fetchBackupCollections(tokens);
  const primary = items.find((item) => item.title === BACKUP_COLLECTION_TITLE);
  const legacy = items.find((item) => item.title === LEGACY_BACKUP_COLLECTION_TITLE);
  return {
    primaryId: getCollectionId(primary),
    legacyId: getCollectionId(legacy),
  };
}

/**
 * Ensure the backup collection exists and return its ID.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureBackupCollection(tokens) {
  const { primaryId } = await findBackupCollectionIds(tokens);
  if (primaryId) {
    return primaryId;
  }

  const createResponse = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: BACKUP_COLLECTION_TITLE }),
  });
  const collectionId = getCollectionId(createResponse?.item);
  if (collectionId === null) {
    throw new Error('Unable to prepare Raindrop collection for backups.');
  }
  return collectionId;
}

/**
 * Fetch all items within a collection (all pages).
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @returns {Promise<any[]>}
 */
async function fetchAllCollectionItems(tokens, collectionId) {
  /** @type {any[]} */
  const allItems = [];
  for (let page = 0; page < 50; page += 1) {
    const pageItems = await fetchRaindropItems(tokens, collectionId, page);
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }
    allItems.push(...pageItems);
    if (pageItems.length < 100) {
      break;
    }
  }
  return allItems;
}

/**
 * Delete a list of item IDs from a collection.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {number[]} ids
 * @returns {Promise<void>}
 */
async function deleteItems(tokens, collectionId, ids) {
  if (!ids.length) {
    return;
  }
  await raindropRequest('/raindrops/' + collectionId, tokens, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/**
 * Save chunked payload items to Raindrop, replacing previous backups.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {string[]} chunks
 * @returns {Promise<void>}
 */
async function saveChunks(tokens, collectionId, chunks) {
  const existingItems = await fetchAllCollectionItems(tokens, collectionId);
  const existingIds = existingItems
    .map((item) => Number(item?._id ?? item?.id))
    .filter((id) => Number.isFinite(id));
  await deleteItems(tokens, collectionId, existingIds);

  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const items = batch.map((chunk, index) => {
      const chunkIndex = i + index + 1;
      return {
        title: `${BACKUP_ITEM_PREFIX}${chunkIndex}`,
        link: `https://nenya.local/options-backup/${chunkIndex}`,
        excerpt: chunk,
        collectionId,
        tags: [...BACKUP_TAGS, `total:${chunks.length}`],
      };
    });
    await raindropRequest('/raindrops', tokens, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  }
}

/**
 * Load and reassemble backup chunks from Raindrop.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @returns {Promise<{ payload: OptionsBackupPayload | null, lastModified: number }>}
 */
async function loadChunks(tokens, collectionId) {
  const items = await fetchAllCollectionItems(tokens, collectionId);
  const chunkItems = items.filter((item) =>
    typeof item?.title === 'string' && item.title.startsWith(BACKUP_ITEM_PREFIX),
  );

  if (chunkItems.length === 0) {
    return { payload: null, lastModified: 0 };
  }

  const sorted = chunkItems.sort((a, b) => {
    const aMatch = String(a.title || '').match(/(\d+)$/);
    const bMatch = String(b.title || '').match(/(\d+)$/);
    const aNum = aMatch ? Number(aMatch[1]) : 0;
    const bNum = bMatch ? Number(bMatch[1]) : 0;
    return aNum - bNum;
  });

  const joined = sorted
    .map((item) => String(item.excerpt ?? item.note ?? ''))
    .join('');

  const lastModified = Math.max(
    0,
    ...items.map((item) => Date.parse(item?.lastUpdate || '') || 0),
  );

  try {
    /** @type {OptionsBackupPayload} */
    const payload = JSON.parse(joined);
    return { payload, lastModified };
  } catch (error) {
    console.warn('[options-backup] Failed to parse backup payload:', error);
    return { payload: null, lastModified };
  }
}

/**
 * Execute a manual backup.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualBackup() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to back up settings.',
      ],
      state: await loadState(),
    };
  }

  try {
    const collectionId = await ensureBackupCollection(tokens);
    const payload = await buildBackupPayload();
    const serialized = JSON.stringify(payload);
    const chunks = chunkString(serialized, BACKUP_CHUNK_SIZE);
    await saveChunks(tokens, collectionId, chunks);

    const state = await updateState((draft) => {
      draft.lastBackupAt = Date.now();
      draft.lastError = undefined;
      draft.lastErrorAt = undefined;
      draft.lastChunkCount = chunks.length;
    });

    return { ok: true, errors: [], state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const state = await updateState((draft) => {
      draft.lastError = message;
      draft.lastErrorAt = Date.now();
    });
    return {
      ok: false,
      errors: [message],
      state,
    };
  }
}

/**
 * Execute a manual restore.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualRestore() {
  await ensureInitialized();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to restore settings.',
      ],
      state: await loadState(),
    };
  }

  try {
    const { primaryId, legacyId } = await findBackupCollectionIds(tokens);
    const targetCollectionId = primaryId ?? legacyId;

    if (!targetCollectionId) {
      const state = await updateState((draft) => {
        draft.lastError = 'No backup found in Raindrop.';
        draft.lastErrorAt = Date.now();
      });
      return {
        ok: false,
        errors: ['No backup found in Raindrop.'],
        state,
      };
    }

    let { payload, lastModified } = await loadChunks(tokens, targetCollectionId);

    if (!payload && primaryId && legacyId && legacyId !== targetCollectionId) {
      const legacyResult = await loadChunks(tokens, legacyId);
      payload = legacyResult.payload;
      lastModified = legacyResult.lastModified;
    }

    if (!payload) {
      const state = await updateState((draft) => {
        draft.lastError = 'No backup found in Raindrop.';
        draft.lastErrorAt = Date.now();
      });
      return {
        ok: false,
        errors: ['No backup found in Raindrop.'],
        state,
      };
    }

    await applyBackupPayload(payload);
    const state = await updateState((draft) => {
      draft.lastRestoreAt = Date.now();
      draft.lastError = undefined;
      draft.lastErrorAt = undefined;
      if (lastModified > 0) {
        draft.lastBackupAt = lastModified;
      }
    });
    return { ok: true, errors: [], state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const state = await updateState((draft) => {
      draft.lastError = message;
      draft.lastErrorAt = Date.now();
    });
    return {
      ok: false,
      errors: [message],
      state,
    };
  }
}

/**
 * Reset configurable options to defaults and clear backup state errors.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function resetOptionsToDefaults() {
  await ensureInitialized();

  await chrome.storage.local.set({
    [ROOT_FOLDER_SETTINGS_KEY]: {
      [PROVIDER_ID]: {
        parentFolderId: DEFAULT_PARENT_FOLDER_ID,
        rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
      },
    },
    [NOTIFICATION_PREFERENCES_KEY]: clone(DEFAULT_NOTIFICATION_PREFERENCES),
    [AUTO_RELOAD_RULES_KEY]: [],
    [DARK_MODE_RULES_KEY]: [],
    [BRIGHT_MODE_WHITELIST_KEY]: [],
    [HIGHLIGHT_TEXT_RULES_KEY]: [],
    [VIDEO_ENHANCEMENT_RULES_KEY]: [],
    [BLOCK_ELEMENT_RULES_KEY]: [],
    [CUSTOM_CODE_RULES_KEY]: [],
    [LLM_PROMPTS_KEY]: [],
    [URL_PROCESS_RULES_KEY]: [],
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: [],
    [SCREENSHOT_SETTINGS_KEY]: { autoSave: false },
    [PINNED_SHORTCUTS_KEY]: [],
  });

  const state = await updateState((draft) => {
    draft.lastRestoreAt = Date.now();
    draft.lastError = undefined;
    draft.lastErrorAt = undefined;
  });

  return { ok: true, errors: [], state };
}

/**
 * Retrieve the latest backup status snapshot.
 * @returns {Promise<{ ok: boolean, state: BackupState, loggedIn: boolean }>}
 */
export async function getBackupStatus() {
  await ensureInitialized();
  const [tokens, state] = await Promise.all([
    loadValidProviderTokens(),
    loadState(),
  ]);
  return {
    ok: true,
    state,
    loggedIn: Boolean(tokens),
  };
}

/**
 * Handle incoming runtime messages related to options backup.
 * @param {{ type?: string }} message
 * @param {(response?: any) => void} sendResponse
 * @returns {boolean}
 */
export function handleOptionsBackupMessage(message, sendResponse) {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case OPTIONS_BACKUP_MESSAGES.STATUS: {
      void getBackupStatus()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.BACKUP_NOW: {
      void runManualBackup()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [error instanceof Error ? error.message : String(error ?? 'Unknown error')],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_NOW: {
      void runManualRestore()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errors: [error instanceof Error ? error.message : String(error ?? 'Unknown error')],
          }),
        );
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESET_DEFAULTS: {
      void resetOptionsToDefaults()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
          }),
        );
      return true;
    }
    default:
      return false;
  }
}

/**
 * Initialize backup service (currently only runs migration).
 * @returns {Promise<void>}
 */
export async function initializeOptionsBackupService() {
  await ensureInitialized();
}

/**
 * Lifecycle handler (noop manual backup/restore).
 * @param {string} trigger
 * @returns {Promise<void>}
 */
export async function handleOptionsBackupLifecycle(trigger) {
  await ensureInitialized();
  if (trigger === 'login') {
    const status = await getBackupStatus();
    if (!status.loggedIn) {
      void pushNotification(
        'options-backup',
        'Options backup',
        'Connect Raindrop to enable manual backup and restore.',
        'nenya://options',
      );
    }
  }
}

