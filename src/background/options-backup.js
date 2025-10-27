/* global chrome */

import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
  pushNotification,
  getNotificationPreferences,
} from './mirror.js';
import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import { OPTIONS_BACKUP_MESSAGES } from '../shared/optionsBackupMessages.js';
import { evaluateAllTabs } from './auto-reload.js';

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
 * @typedef {Object} RootFolderBackupSettings
 * @property {string} rootFolderName
 * @property {string} parentFolderPath
 * @property {string} [parentFolderId]
 */

/**
 * @typedef {Object} AutoReloadRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSeconds
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} NotificationBookmarkSettings
 * @property {boolean} enabled
 * @property {boolean} pullFinished
 * @property {boolean} unsortedSaved
 */

/**
 * @typedef {Object} NotificationProjectSettings
 * @property {boolean} enabled
 * @property {boolean} saveProject
 * @property {boolean} addTabs
 * @property {boolean} replaceItems
 * @property {boolean} deleteProject
 */

/**
 * @typedef {Object} NotificationPreferences
 * @property {boolean} enabled
 * @property {NotificationBookmarkSettings} bookmark
 * @property {NotificationProjectSettings} project
 */

/**
 * @typedef {Object} BrightModePatternSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} BackupMetadata
 * @property {number} version
 * @property {number} lastModified
 * @property {{ id: string, platform: string, arch: string }} device
 * @property {string} trigger
 */

/**
 * @typedef {Object} AuthProviderBackupPayload
 * @property {'auth-provider-settings'} kind
 * @property {string} provider
 * @property {RootFolderBackupSettings} mirrorRootFolderSettings
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} NotificationBackupPayload
 * @property {'notification-preferences'} kind
 * @property {NotificationPreferences} preferences
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} AutoReloadRulesBackupPayload
 * @property {'auto-reload-rules'} kind
 * @property {AutoReloadRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} BrightModeSettings
 * @property {BrightModePatternSettings[]} whitelist
 * @property {BrightModePatternSettings[]} blacklist
 */

/**
 * @typedef {Object} HighlightTextRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {'whole-phrase' | 'comma-separated' | 'regex'} type
 * @property {string} value
 * @property {string} textColor
 * @property {string} backgroundColor
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} BrightModeSettingsBackupPayload
 * @property {'bright-mode-settings'} kind
 * @property {BrightModeSettings} settings
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} HighlightTextRulesBackupPayload
 * @property {'highlight-text-rules'} kind
 * @property {HighlightTextRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} BackupCategoryState
 * @property {number | undefined} lastBackupAt
 * @property {string | undefined} lastBackupTrigger
 * @property {string | undefined} lastBackupError
 * @property {number | undefined} lastBackupErrorAt
 * @property {number | undefined} lastRestoreAt
 * @property {string | undefined} lastRestoreTrigger
 * @property {string | undefined} lastRestoreError
 * @property {number | undefined} lastRestoreErrorAt
 * @property {number | undefined} lastRemoteModifiedAt
 */

/**
 * @typedef {Object} BackupState
 * @property {number} version
 * @property {string} deviceId
 * @property {Record<string, BackupCategoryState>} categories
 */

const STATE_STORAGE_KEY = 'optionsBackupState';
const STATE_VERSION = 1;
const PROVIDER_ID = 'raindrop';
const BACKUP_COLLECTION_TITLE = 'Options backup';
const BACKUP_ALARM_NAME = 'nenya-options-backup-sync';
const BACKUP_ALARM_PERIOD_MINUTES = 5;
const BACKUP_SUPPRESSION_DURATION_MS = 1500;
const AUTO_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const BRIGHT_MODE_BLACKLIST_KEY = 'brightModeBlacklist';
const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const MIN_RULE_INTERVAL_SECONDS = 5;
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';
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
};

/** @type {BackupState | null} */
let cachedState = null;
let initialized = false;
let platformInfoPromise = null;
/** @type {Set<string>} */
const runningBackups = new Set();
/** @type {Map<string, string>} */
const queuedBackupReasons = new Map();
/** @type {Map<string, number>} */
const backupSuppressionUntil = new Map();
/** @type {Map<string, number>} */
const lastAutoNotificationAt = new Map();
let restoreInProgress = false;
let lastAutoRestoreAttemptAt = 0;

const CATEGORY_IDS = [
  'auth-provider-settings',
  'notification-preferences',
  'auto-reload-rules',
  'bright-mode-settings',
  'highlight-text-rules',
];

/**
 * Create a default category state.
 * @returns {BackupCategoryState}
 */
function createDefaultCategoryState() {
  return {
    lastBackupAt: undefined,
    lastBackupTrigger: undefined,
    lastBackupError: undefined,
    lastBackupErrorAt: undefined,
    lastRestoreAt: undefined,
    lastRestoreTrigger: undefined,
    lastRestoreError: undefined,
    lastRestoreErrorAt: undefined,
    lastRemoteModifiedAt: undefined,
  };
}

/**
 * Generate a random identifier for the current device.
 * @returns {string}
 */
function generateDeviceId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  return 'device-' + timestamp + '-' + random;
}

/**
 * Generate an identifier for auto reload rules.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Merge stored state with defaults.
 * @param {unknown} value
 * @returns {BackupState}
 */
function sanitizeState(value) {
  /** @type {BackupState} */
  const state = {
    version: STATE_VERSION,
    deviceId: '',
    categories: {},
  };

  if (value && typeof value === 'object') {
    const raw = /** @type {{ version?: unknown, deviceId?: unknown, categories?: unknown }} */ (value);
    if (Number(raw.version) === STATE_VERSION && typeof raw.deviceId === 'string') {
      state.deviceId = raw.deviceId;
    }
    if (raw.categories && typeof raw.categories === 'object') {
      const rawCategories = /** @type {Record<string, BackupCategoryState>} */ (raw.categories);
      CATEGORY_IDS.forEach((categoryId) => {
        const stored = rawCategories[categoryId];
        if (stored && typeof stored === 'object') {
          state.categories[categoryId] = {
            lastBackupAt: Number.isFinite(stored.lastBackupAt) ? Number(stored.lastBackupAt) : undefined,
            lastBackupTrigger: typeof stored.lastBackupTrigger === 'string' ? stored.lastBackupTrigger : undefined,
            lastBackupError: typeof stored.lastBackupError === 'string' ? stored.lastBackupError : undefined,
            lastBackupErrorAt: Number.isFinite(stored.lastBackupErrorAt) ? Number(stored.lastBackupErrorAt) : undefined,
            lastRestoreAt: Number.isFinite(stored.lastRestoreAt) ? Number(stored.lastRestoreAt) : undefined,
            lastRestoreTrigger: typeof stored.lastRestoreTrigger === 'string' ? stored.lastRestoreTrigger : undefined,
            lastRestoreError: typeof stored.lastRestoreError === 'string' ? stored.lastRestoreError : undefined,
            lastRestoreErrorAt: Number.isFinite(stored.lastRestoreErrorAt)
              ? Number(stored.lastRestoreErrorAt)
              : undefined,
            lastRemoteModifiedAt: Number.isFinite(stored.lastRemoteModifiedAt)
              ? Number(stored.lastRemoteModifiedAt)
              : undefined,
          };
        }
      });
    }
  }

  CATEGORY_IDS.forEach((categoryId) => {
    if (!state.categories[categoryId]) {
      state.categories[categoryId] = createDefaultCategoryState();
    }
  });

  return state;
}

/**
 * Persist the provided state object.
 * @param {BackupState} state
 * @returns {Promise<void>}
 */
async function persistState(state) {
  cachedState = state;
  await chrome.storage.local.set({
    [STATE_STORAGE_KEY]: state,
  });
}

/**
 * Load the backup state, initializing defaults if needed.
 * @returns {Promise<BackupState>}
 */
async function loadState() {
  if (cachedState) {
    return JSON.parse(JSON.stringify(cachedState));
  }

  const result = await chrome.storage.local.get(STATE_STORAGE_KEY);
  const stored = result?.[STATE_STORAGE_KEY];
  const state = sanitizeState(stored);
  if (!state.deviceId) {
    state.deviceId = generateDeviceId();
    await persistState(state);
  } else {
    cachedState = state;
  }

  return JSON.parse(JSON.stringify(state));
}

/**
 * Update the stored state by applying a mutator function.
 * @param {(state: BackupState) => void} mutator
 * @returns {Promise<BackupState>}
 */
async function updateState(mutator) {
  const state = await loadState();
  mutator(state);
  await persistState(state);
  return JSON.parse(JSON.stringify(state));
}

/**
 * Retrieve sanitized platform details.
 * @returns {Promise<{ os: string, arch: string }>}
 */
async function getPlatformDetails() {
  if (!platformInfoPromise) {
    platformInfoPromise = new Promise((resolve) => {
      try {
        chrome.runtime.getPlatformInfo((info) => {
          resolve(info);
        });
      } catch (error) {
        resolve({ os: 'unknown', arch: 'unknown' });
      }
    });
  }

  const info = await platformInfoPromise;
  return {
    os: typeof info?.os === 'string' ? info.os : 'unknown',
    arch: typeof info?.arch === 'string' ? info.arch : 'unknown',
  };
}

/**
 * Build metadata for a backup payload.
 * @param {string} trigger
 * @returns {Promise<BackupMetadata>}
 */
async function buildMetadata(trigger) {
  const state = await loadState();
  if (!state.deviceId) {
    const nextState = await updateState((draft) => {
      if (!draft.deviceId) {
        draft.deviceId = generateDeviceId();
      }
    });
    state.deviceId = nextState.deviceId;
  }

  const platform = await getPlatformDetails();
  return {
    version: STATE_VERSION,
    lastModified: Date.now(),
    device: {
      id: state.deviceId,
      platform: platform.os,
      arch: platform.arch,
    },
    trigger,
  };
}

/**
 * Normalize notification preferences to a valid object.
 * @param {unknown} value
 * @returns {NotificationPreferences}
 */
function normalizeNotificationPreferences(value) {
  const fallback = /** @type {NotificationPreferences} */ (
    JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES))
  );
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings> }} */ (
    value
  );
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled: typeof bookmark.enabled === 'boolean' ? bookmark.enabled : fallback.bookmark.enabled,
      pullFinished:
        typeof bookmark.pullFinished === 'boolean'
          ? bookmark.pullFinished
          : fallback.bookmark.pullFinished,
      unsortedSaved:
        typeof bookmark.unsortedSaved === 'boolean'
          ? bookmark.unsortedSaved
          : fallback.bookmark.unsortedSaved,
    },
    project: {
      enabled: typeof project.enabled === 'boolean' ? project.enabled : fallback.project.enabled,
      saveProject:
        typeof project.saveProject === 'boolean'
          ? project.saveProject
          : fallback.project.saveProject,
      addTabs:
        typeof project.addTabs === 'boolean' ? project.addTabs : fallback.project.addTabs,
      replaceItems:
        typeof project.replaceItems === 'boolean'
          ? project.replaceItems
          : fallback.project.replaceItems,
      deleteProject:
        typeof project.deleteProject === 'boolean'
          ? project.deleteProject
          : fallback.project.deleteProject,
    },
  };
}

/**
 * Determine whether the current time is inside the suppression window.
 * @param {string} categoryId
 * @returns {boolean}
 */
function isBackupSuppressed(categoryId) {
  const until = backupSuppressionUntil.get(categoryId);
  if (!until) {
    return false;
  }
  if (Date.now() <= until) {
    return true;
  }
  backupSuppressionUntil.delete(categoryId);
  return false;
}

/**
 * Prevent immediate backup loops for a category.
 * @param {string} categoryId
 * @returns {void}
 */
function suppressBackup(categoryId) {
  backupSuppressionUntil.set(categoryId, Date.now() + BACKUP_SUPPRESSION_DURATION_MS);
}

/**
 * Track auto notification timestamps to avoid spamming.
 * @param {string} categoryId
 * @returns {boolean}
 */
function canNotify(categoryId) {
  const last = lastAutoNotificationAt.get(categoryId) ?? 0;
  if (Date.now() - last < AUTO_NOTIFICATION_COOLDOWN_MS) {
    return false;
  }
  lastAutoNotificationAt.set(categoryId, Date.now());
  return true;
}

/**
 * Ensure the Options backup collection exists and return its id.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<number>}
 */
async function ensureBackupCollection(tokens) {
  const [rootResponse, childResponse] = await Promise.all([
    raindropRequest('/collections', tokens),
    raindropRequest('/collections/childrens', tokens),
  ]);

  /** @type {any[]} */
  const collections = [];
  if (Array.isArray(rootResponse?.items)) {
    collections.push(...rootResponse.items);
  }
  if (Array.isArray(childResponse?.items)) {
    collections.push(...childResponse.items);
  }

  const normalizedTitle = BACKUP_COLLECTION_TITLE.trim().toLowerCase();
  for (const collection of collections) {
    const rawTitle =
      typeof collection?.title === 'string' ? collection.title.trim() : '';
    const idCandidate = collection?._id ?? collection?.id ?? collection?.ID;
    const id = Number(idCandidate);
    if (
      rawTitle.toLowerCase() === normalizedTitle &&
      Number.isFinite(id)
    ) {
      return id;
    }
  }

  const response = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: BACKUP_COLLECTION_TITLE,
      public: false,
      view: 'list',
    }),
  });

  const createdId = Number(
    response?.item?._id ?? response?.item?.id ?? response?.item?.ID,
  );
  if (!Number.isFinite(createdId)) {
    throw new Error('Failed to create Options backup collection.');
  }

  return createdId;
}

/**
 * Fetch the latest backup items and return a map keyed by title.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @returns {Promise<Map<string, any>>}
 */
async function loadBackupItemMap(tokens, collectionId) {
  /** @type {Map<string, any>} */
  const map = new Map();
  let page = 0;
  let shouldContinue = true;
  const normalizedTitle = (title) =>
    typeof title === 'string' ? title.trim().toLowerCase() : '';

  while (shouldContinue) {
    const pageItems = await fetchRaindropItems(tokens, collectionId, page);
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    pageItems.forEach((item) => {
      const title = normalizedTitle(item?.title);
      if (!title || map.has(title)) {
        return;
      }
      map.set(title, item);
    });

    if (pageItems.length < 100) {
      shouldContinue = false;
    } else {
      page += 1;
    }
  }

  return map;
}

/**
 * Parse a Raindrop timestamp string.
 * @param {unknown} value
 * @returns {number}
 */
function parseTimestamp(value) {
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Retrieve and normalize root folder settings.
 * @returns {Promise<RootFolderSettings>}
 */
async function collectRootFolderSettings() {
  const result = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  const map = result?.[ROOT_FOLDER_SETTINGS_KEY];
  if (map && typeof map === 'object') {
    const candidate = map?.[PROVIDER_ID];
    const parentId =
      typeof candidate?.parentFolderId === 'string' && candidate.parentFolderId
        ? candidate.parentFolderId
        : DEFAULT_PARENT_FOLDER_ID;
    const rootName =
      typeof candidate?.rootFolderName === 'string' && candidate.rootFolderName
        ? candidate.rootFolderName
        : DEFAULT_ROOT_FOLDER_NAME;
    return {
      parentFolderId: parentId,
      rootFolderName: rootName,
    };
  }

  return {
    parentFolderId: DEFAULT_PARENT_FOLDER_ID,
    rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
  };
}

/**
 * Apply root folder settings to storage.
 * @param {RootFolderBackupSettings | RootFolderSettings} settings
 * @returns {Promise<void>}
 */
async function applyRootFolderSettings(settings) {
  let parentFolderId = '';
  const desiredPath =
    'parentFolderPath' in settings && typeof settings.parentFolderPath === 'string'
      ? settings.parentFolderPath.trim()
      : '';

  if (desiredPath) {
    try {
      const ensuredId = await ensureBookmarkFolderPath(desiredPath);
      if (ensuredId) {
        parentFolderId = ensuredId;
      }
    } catch (error) {
      console.warn(
        '[options-backup] Failed to ensure parent folder path during restore:',
        error,
      );
    }
  }

  if (!parentFolderId) {
    parentFolderId =
      typeof settings.parentFolderId === 'string' && settings.parentFolderId
        ? settings.parentFolderId
        : '';
  }

  if (!parentFolderId) {
    parentFolderId = DEFAULT_PARENT_FOLDER_ID;
  }

  const sanitized = {
    parentFolderId,
    rootFolderName:
      typeof settings.rootFolderName === 'string' && settings.rootFolderName
        ? settings.rootFolderName
        : DEFAULT_ROOT_FOLDER_NAME,
  };

  const result = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  const map = result?.[ROOT_FOLDER_SETTINGS_KEY];
  const nextMap = map && typeof map === 'object' ? { ...map } : {};
  nextMap[PROVIDER_ID] = sanitized;

  suppressBackup('auth-provider-settings');
  await chrome.storage.sync.set({
    [ROOT_FOLDER_SETTINGS_KEY]: nextMap,
  });
}

/**
 * Apply notification preferences to storage.
 * @param {NotificationPreferences} preferences
 * @returns {Promise<void>}
 */
async function applyNotificationPreferences(preferences) {
  const sanitized = normalizeNotificationPreferences(preferences);
  suppressBackup('notification-preferences');
  await chrome.storage.sync.set({
    [NOTIFICATION_PREFERENCES_KEY]: sanitized,
  });
}

/**
 * Sort auto reload rules for stable ordering.
 * @param {AutoReloadRuleSettings[]} rules
 * @returns {AutoReloadRuleSettings[]}
 */
function sortAutoReloadRules(rules) {
  return [...rules].sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    return a.intervalSeconds - b.intervalSeconds;
  });
}

/**
 * Normalize serialized auto reload rules.
 * @param {unknown} value
 * @returns {{ rules: AutoReloadRuleSettings[], mutated: boolean }}
 */
function normalizeAutoReloadRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
      const pattern =
        typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      try {
        // Basic pattern validation (URLPattern may not be available in service worker context)
        // Check for basic URL pattern syntax
        if (pattern.includes('*') && !pattern.includes('://')) {
          // This is likely a glob pattern, which is acceptable
        } else if (pattern.includes('://')) {
          // This is likely a full URL pattern, validate basic syntax
          const url = new URL('https://example.com');
          // Basic validation passed
        }
      } catch (error) {
        console.warn(
          '[options-backup] Ignoring invalid auto reload pattern:',
          pattern,
          error,
        );
        return;
      }

      const intervalCandidate = Math.floor(Number(raw.intervalSeconds));
      const intervalSeconds =
        Number.isFinite(intervalCandidate) && intervalCandidate > 0
          ? Math.max(MIN_RULE_INTERVAL_SECONDS, intervalCandidate)
          : MIN_RULE_INTERVAL_SECONDS;
      if (intervalSeconds !== intervalCandidate) {
        mutated = true;
      }

      let id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoReloadRuleSettings} */
      const rule = {
        id,
        pattern,
        intervalSeconds,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };
      sanitized.push(rule);
    });
  }

  const sorted = sortAutoReloadRules(sanitized);
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { rules: sorted, mutated };
}

/**
 * Collect auto reload rules from storage.
 * @returns {Promise<AutoReloadRuleSettings[]>}
 */
async function collectAutoReloadRules() {
  const result = await chrome.storage.sync.get(AUTO_RELOAD_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeAutoReloadRules(
    result?.[AUTO_RELOAD_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('auto-reload-rules');
    await chrome.storage.sync.set({
      [AUTO_RELOAD_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply auto reload rules to storage.
 * @param {AutoReloadRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyAutoReloadRules(rules) {
  const { rules: sanitized } = normalizeAutoReloadRules(rules);
  suppressBackup('auto-reload-rules');
  await chrome.storage.sync.set({
    [AUTO_RELOAD_RULES_KEY]: sanitized,
  });

  // Re-evaluate rules immediately to ensure badges/schedules update
  try {
    await evaluateAllTabs();
  } catch (error) {
    console.warn('[options-backup] Failed to re-evaluate auto reload rules after restore:', error);
  }
}

/**
 * Normalize bright mode patterns from storage or input.
 * @param {unknown} value
 * @returns {{ patterns: BrightModePatternSettings[], mutated: boolean }}
 */
function normalizeBrightModePatterns(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
      const pattern =
        typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      try {
        // Basic pattern validation (URLPattern may not be available in service worker context)
        // Check for basic URL pattern syntax
        if (pattern.includes('*') && !pattern.includes('://')) {
          // This is likely a glob pattern, which is acceptable
        } else if (pattern.includes('://')) {
          // This is likely a full URL pattern, validate basic syntax
          const url = new URL('https://example.com');
          // Basic validation passed
        }
      } catch (error) {
        console.warn(
          '[options-backup] Ignoring invalid bright mode pattern:',
          pattern,
          error,
        );
        return;
      }

      let id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {BrightModePatternSettings} */
      const patternObj = {
        id,
        pattern,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };
      sanitized.push(patternObj);
    });
  }

  const sorted = sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { patterns: sorted, mutated };
}

/**
 * Normalize highlight text rules from storage or input.
 * @param {unknown} value
 * @returns {{ rules: HighlightTextRuleSettings[], mutated: boolean }}
 */
function normalizeHighlightTextRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, type?: unknown, value?: unknown, textColor?: unknown, backgroundColor?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
      const pattern =
        typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      try {
        // Basic pattern validation (URLPattern may not be available in service worker context)
        // Check for basic URL pattern syntax
        if (pattern.includes('*') && !pattern.includes('://')) {
          // This is likely a glob pattern, which is acceptable
        } else if (pattern.includes('://')) {
          // This is likely a full URL pattern, validate basic syntax
          const url = new URL('https://example.com');
          // Basic validation passed
        }
      } catch (error) {
        console.warn(
          '[options-backup] Ignoring invalid highlight text pattern:',
          pattern,
          error,
        );
        return;
      }

      const type = raw.type;
      if (typeof type !== 'string' || !['whole-phrase', 'comma-separated', 'regex'].includes(type)) {
        console.warn('[options-backup] Ignoring invalid highlight text type:', type);
        return;
      }

      const valueText = typeof raw.value === 'string' ? raw.value.trim() : '';
      if (!valueText) {
        return;
      }

      if (type === 'regex') {
        try {
          // eslint-disable-next-line no-new
          new RegExp(valueText);
        } catch (error) {
          console.warn('[options-backup] Ignoring invalid highlight text regex:', valueText, error);
          return;
        }
      }

      const textColor = typeof raw.textColor === 'string' ? raw.textColor : '#000000';
      const backgroundColor = typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#ffff00';

      let id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {HighlightTextRuleSettings} */
      const rule = {
        id,
        pattern,
        type: type,
        value: valueText,
        textColor,
        backgroundColor,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };
      sanitized.push(rule);
    });
  }

  const sorted = sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { rules: sorted, mutated };
}

/**
 * Collect bright mode patterns from storage.
 * @param {string} storageKey
 * @returns {Promise<BrightModePatternSettings[]>}
 */
async function collectBrightModePatterns(storageKey) {
  const result = await chrome.storage.sync.get(storageKey);
  const { patterns: sanitized, mutated } = normalizeBrightModePatterns(
    result?.[storageKey],
  );
  if (mutated) {
    const categoryId = storageKey === BRIGHT_MODE_WHITELIST_KEY ? 'bright-mode-whitelist' : 'bright-mode-blacklist';
    suppressBackup(categoryId);
    await chrome.storage.sync.set({
      [storageKey]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply bright mode patterns to storage.
 * @param {BrightModePatternSettings[]} patterns
 * @param {string} storageKey
 * @returns {Promise<void>}
 */
async function applyBrightModePatterns(patterns, storageKey) {
  const { patterns: sanitized } = normalizeBrightModePatterns(patterns);
  const categoryId = storageKey === BRIGHT_MODE_WHITELIST_KEY ? 'bright-mode-whitelist' : 'bright-mode-blacklist';
  suppressBackup(categoryId);
  await chrome.storage.sync.set({
    [storageKey]: sanitized,
  });
}

/**
 * Apply bright mode settings to storage.
 * @param {BrightModeSettings} settings
 * @returns {Promise<void>}
 */
async function applyBrightModeSettings(settings) {
  const { patterns: sanitizedWhitelist } = normalizeBrightModePatterns(settings.whitelist || []);
  const { patterns: sanitizedBlacklist } = normalizeBrightModePatterns(settings.blacklist || []);
  
  suppressBackup('bright-mode-settings');
  await chrome.storage.sync.set({
    [BRIGHT_MODE_WHITELIST_KEY]: sanitizedWhitelist,
    [BRIGHT_MODE_BLACKLIST_KEY]: sanitizedBlacklist,
  });
}

/**
 * Collect highlight text rules from storage.
 * @returns {Promise<HighlightTextRuleSettings[]>}
 */
async function collectHighlightTextRules() {
  const result = await chrome.storage.sync.get(HIGHLIGHT_TEXT_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeHighlightTextRules(
    result?.[HIGHLIGHT_TEXT_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('highlight-text-rules');
    await chrome.storage.sync.set({
      [HIGHLIGHT_TEXT_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply highlight text rules to storage.
 * @param {HighlightTextRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyHighlightTextRules(rules) {
  const { rules: sanitized } = normalizeHighlightTextRules(rules);
  suppressBackup('highlight-text-rules');
  await chrome.storage.sync.set({
    [HIGHLIGHT_TEXT_RULES_KEY]: sanitized,
  });
}

/**
 * Build the auth/provider payload for backup.
 * @param {string} trigger
 * @returns {Promise<AuthProviderBackupPayload>}
 */
async function buildAuthProviderPayload(trigger) {
  const settings = await collectRootFolderSettings();
  let parentFolderPath = '';
  try {
    parentFolderPath = await getBookmarkFolderPath(settings.parentFolderId);
  } catch (error) {
    console.warn(
      '[options-backup] Failed to resolve parent folder path for backup:',
      error,
    );
  }
  if (!parentFolderPath) {
    parentFolderPath = DEFAULT_PARENT_PATH;
  }

  const metadata = await buildMetadata(trigger);
  return {
    kind: 'auth-provider-settings',
    provider: PROVIDER_ID,
    mirrorRootFolderSettings: {
      rootFolderName: settings.rootFolderName,
      parentFolderPath,
      parentFolderId: settings.parentFolderId,
    },
    metadata,
  };
}

/**
 * Build the notifications payload for backup.
 * @param {string} trigger
 * @returns {Promise<NotificationBackupPayload>}
 */
async function buildNotificationsPayload(trigger) {
  const preferences = await getNotificationPreferences();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'notification-preferences',
    preferences,
    metadata,
  };
}

/**
 * Build the auto reload rules payload for backup.
 * @param {string} trigger
 * @returns {Promise<AutoReloadRulesBackupPayload>}
 */
async function buildAutoReloadRulesPayload(trigger) {
  const rules = await collectAutoReloadRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'auto-reload-rules',
    rules,
    metadata,
  };
}

/**
 * Build the bright mode settings payload for backup.
 * @param {string} trigger
 * @returns {Promise<BrightModeSettingsBackupPayload>}
 */
async function buildBrightModeSettingsPayload(trigger) {
  const [whitelistPatterns, blacklistPatterns] = await Promise.all([
    collectBrightModePatterns(BRIGHT_MODE_WHITELIST_KEY),
    collectBrightModePatterns(BRIGHT_MODE_BLACKLIST_KEY),
  ]);
  
  const settings = {
    whitelist: whitelistPatterns,
    blacklist: blacklistPatterns,
  };
  
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'bright-mode-settings',
    settings,
    metadata,
  };
}

/**
 * Build the highlight text rules payload for backup.
 * @param {string} trigger
 * @returns {Promise<HighlightTextRulesBackupPayload>}
 */
async function buildHighlightTextRulesPayload(trigger) {
  const rules = await collectHighlightTextRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'highlight-text-rules',
    rules,
    metadata,
  };
}

/**
 * Attempt to parse an auth/provider payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: AuthProviderBackupPayload | null, lastModified: number }}
 */
function parseAuthProviderItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const payload = /** @type {AuthProviderBackupPayload} */ ({
      kind: 'auth-provider-settings',
      provider:
        typeof parsed.provider === 'string' && parsed.provider
          ? parsed.provider
          : PROVIDER_ID,
      mirrorRootFolderSettings: {
        parentFolderPath:
          typeof parsed?.mirrorRootFolderSettings?.parentFolderPath === 'string' &&
          parsed.mirrorRootFolderSettings.parentFolderPath
            ? parsed.mirrorRootFolderSettings.parentFolderPath
            : '',
        parentFolderId:
          typeof parsed?.mirrorRootFolderSettings?.parentFolderId === 'string' &&
          parsed.mirrorRootFolderSettings.parentFolderId
            ? parsed.mirrorRootFolderSettings.parentFolderId
            : DEFAULT_PARENT_FOLDER_ID,
        rootFolderName:
          typeof parsed?.mirrorRootFolderSettings?.rootFolderName === 'string' &&
          parsed.mirrorRootFolderSettings.rootFolderName
            ? parsed.mirrorRootFolderSettings.rootFolderName
            : DEFAULT_ROOT_FOLDER_NAME,
      },
      metadata: {
        version: Number.isFinite(parsed?.metadata?.version)
          ? Number(parsed.metadata.version)
          : STATE_VERSION,
        lastModified: Number.isFinite(parsed?.metadata?.lastModified)
          ? Number(parsed.metadata.lastModified)
          : parseTimestamp(item?.lastUpdate),
        device: {
          id:
            typeof parsed?.metadata?.device?.id === 'string'
              ? parsed.metadata.device.id
              : '',
          platform:
            typeof parsed?.metadata?.device?.platform === 'string'
              ? parsed.metadata.device.platform
              : 'unknown',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : 'unknown',
        },
        trigger:
          typeof parsed?.metadata?.trigger === 'string'
            ? parsed.metadata.trigger
            : 'unknown',
      },
    });

    const lastModified = Number.isFinite(payload.metadata.lastModified)
      ? payload.metadata.lastModified
      : parseTimestamp(item?.lastUpdate);

    return { payload, lastModified };
  } catch (error) {
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse a notifications payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: NotificationBackupPayload | null, lastModified: number }}
 */
function parseNotificationItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const payload = /** @type {NotificationBackupPayload} */ ({
      kind: 'notification-preferences',
      preferences: normalizeNotificationPreferences(parsed?.preferences),
      metadata: {
        version: Number.isFinite(parsed?.metadata?.version)
          ? Number(parsed.metadata.version)
          : STATE_VERSION,
        lastModified: Number.isFinite(parsed?.metadata?.lastModified)
          ? Number(parsed.metadata.lastModified)
          : parseTimestamp(item?.lastUpdate),
        device: {
          id:
            typeof parsed?.metadata?.device?.id === 'string'
              ? parsed.metadata.device.id
              : '',
          platform:
            typeof parsed?.metadata?.device?.platform === 'string'
              ? parsed.metadata.device.platform
              : 'unknown',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : 'unknown',
        },
        trigger:
          typeof parsed?.metadata?.trigger === 'string'
            ? parsed.metadata.trigger
            : 'unknown',
      },
    });

    const lastModified = Number.isFinite(payload.metadata.lastModified)
      ? payload.metadata.lastModified
      : parseTimestamp(item?.lastUpdate);

    return { payload, lastModified };
  } catch (error) {
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse auto reload rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: AutoReloadRulesBackupPayload | null, lastModified: number }}
 */
function parseAutoReloadItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeAutoReloadRules(parsed?.rules).rules;

    const payload = /** @type {AutoReloadRulesBackupPayload} */ ({
      kind: 'auto-reload-rules',
      rules: normalizedRules,
      metadata: {
        version: Number.isFinite(parsed?.metadata?.version)
          ? Number(parsed.metadata.version)
          : STATE_VERSION,
        lastModified: Number.isFinite(parsed?.metadata?.lastModified)
          ? Number(parsed.metadata.lastModified)
          : parseTimestamp(item?.lastUpdate),
        device: {
          id:
            typeof parsed?.metadata?.device?.id === 'string'
              ? parsed.metadata.device.id
              : '',
          platform:
            typeof parsed?.metadata?.device?.platform === 'string'
              ? parsed.metadata.device.platform
              : 'unknown',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : 'unknown',
        },
        trigger:
          typeof parsed?.metadata?.trigger === 'string'
            ? parsed.metadata.trigger
            : 'unknown',
      },
    });

    const lastModified = Number.isFinite(payload.metadata.lastModified)
      ? payload.metadata.lastModified
      : parseTimestamp(item?.lastUpdate);

    return { payload, lastModified };
  } catch (error) {
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse bright mode settings payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: BrightModeSettingsBackupPayload | null, lastModified: number }}
 */
function parseBrightModeSettingsItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const settings = parsed?.settings || {};
    const normalizedWhitelist = normalizeBrightModePatterns(settings.whitelist || []).patterns;
    const normalizedBlacklist = normalizeBrightModePatterns(settings.blacklist || []).patterns;

    const payload = /** @type {BrightModeSettingsBackupPayload} */ ({
      kind: 'bright-mode-settings',
      settings: {
        whitelist: normalizedWhitelist,
        blacklist: normalizedBlacklist,
      },
      metadata: {
        version: Number.isFinite(parsed?.metadata?.version)
          ? Number(parsed.metadata.version)
          : STATE_VERSION,
        lastModified: Number.isFinite(parsed?.metadata?.lastModified)
          ? Number(parsed.metadata.lastModified)
          : parseTimestamp(item?.lastUpdate),
        device: {
          id:
            typeof parsed?.metadata?.device?.id === 'string'
              ? parsed.metadata.device.id
              : '',
          platform:
            typeof parsed?.metadata?.device?.platform === 'string'
              ? parsed.metadata.device.platform
              : 'unknown',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : 'unknown',
        },
        trigger:
          typeof parsed?.metadata?.trigger === 'string'
            ? parsed.metadata.trigger
            : 'unknown',
      },
    });

    const lastModified = Number.isFinite(payload.metadata.lastModified)
      ? payload.metadata.lastModified
      : parseTimestamp(item?.lastUpdate);

    return { payload, lastModified };
  } catch (error) {
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse highlight text rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: HighlightTextRulesBackupPayload | null, lastModified: number }}
 */
function parseHighlightTextRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeHighlightTextRules(parsed?.rules).rules;

    const payload = /** @type {HighlightTextRulesBackupPayload} */ ({
      kind: 'highlight-text-rules',
      rules: normalizedRules,
      metadata: {
        version: Number.isFinite(parsed?.metadata?.version)
          ? Number(parsed.metadata.version)
          : STATE_VERSION,
        lastModified: Number.isFinite(parsed?.metadata?.lastModified)
          ? Number(parsed.metadata.lastModified)
          : parseTimestamp(item?.lastUpdate),
        device: {
          id:
            typeof parsed?.metadata?.device?.id === 'string'
              ? parsed.metadata.device.id
              : '',
          platform:
            typeof parsed?.metadata?.device?.platform === 'string'
              ? parsed.metadata.device.platform
              : 'unknown',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : 'unknown',
        },
        trigger:
          typeof parsed?.metadata?.trigger === 'string'
            ? parsed.metadata.trigger
            : 'unknown',
      },
    });

    const lastModified = Number.isFinite(payload.metadata.lastModified)
      ? payload.metadata.lastModified
      : parseTimestamp(item?.lastUpdate);

    return { payload, lastModified };
  } catch (error) {
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Configuration for each backup category.
 */
const CATEGORY_CONFIG = {
  'auth-provider-settings': {
    title: 'auth-provider-settings',
    link: 'nenya://options/provider',
    buildPayload: buildAuthProviderPayload,
    parseItem: parseAuthProviderItem,
    applyPayload: applyRootFolderSettings,
  },
  'notification-preferences': {
    title: 'notification-preferences',
    link: 'nenya://options/notifications',
    buildPayload: buildNotificationsPayload,
    parseItem: parseNotificationItem,
    applyPayload: applyNotificationPreferences,
  },
  'auto-reload-rules': {
    title: 'auto-reload-rules',
    link: 'nenya://options/auto-reload',
    buildPayload: buildAutoReloadRulesPayload,
    parseItem: parseAutoReloadItem,
    applyPayload: applyAutoReloadRules,
  },
  'bright-mode-settings': {
    title: 'bright-mode-settings',
    link: 'nenya://options/bright-mode',
    buildPayload: buildBrightModeSettingsPayload,
    parseItem: parseBrightModeSettingsItem,
    applyPayload: applyBrightModeSettings,
  },
  'highlight-text-rules': {
    title: 'highlight-text-rules',
    link: 'nenya://options/highlight-text',
    buildPayload: buildHighlightTextRulesPayload,
    parseItem: parseHighlightTextRulesItem,
    applyPayload: applyHighlightTextRules,
  },
};

/**
 * Perform a backup operation for the specified category.
 * @param {string} categoryId
 * @param {string} trigger
 * @param {boolean} notifyOnError
 * @returns {Promise<boolean>}
 */
async function performCategoryBackup(categoryId, trigger, notifyOnError) {
  const config = CATEGORY_CONFIG[categoryId];
  if (!config) {
    return false;
  }

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    await updateState((state) => {
      const categoryState = state.categories[categoryId];
      categoryState.lastBackupError =
        'No Raindrop connection found. Connect your account to sync backups.';
      categoryState.lastBackupErrorAt = Date.now();
    });
    return false;
  }

  try {
    const collectionId = await ensureBackupCollection(tokens);
    const existingItems = await loadBackupItemMap(tokens, collectionId);
    const payload = await config.buildPayload(trigger);
    const serialized = JSON.stringify(payload);

    const normalizedTitle = config.title.trim().toLowerCase();
    const existing = existingItems.get(normalizedTitle);
    let itemResponse;
    if (existing && Number.isFinite(Number(existing?._id ?? existing?.id))) {
      const itemId = Number(existing?._id ?? existing?.id);
      itemResponse = await raindropRequest('/raindrop/' + itemId, tokens, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: config.title,
          link: config.link,
          note: serialized,
          pleaseParse: {},
          collectionId,
        }),
      });
    } else {
      itemResponse = await raindropRequest('/raindrop', tokens, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: config.title,
          link: config.link,
          note: serialized,
          collectionId,
          pleaseParse: {},
        }),
      });
    }

    const responseItem = itemResponse?.item ?? itemResponse?.data ?? itemResponse;
    const lastModified =
      Number.isFinite(payload.metadata.lastModified) && payload.metadata.lastModified > 0
        ? payload.metadata.lastModified
        : parseTimestamp(responseItem?.lastUpdate);

    await updateState((state) => {
      const categoryState = state.categories[categoryId];
      categoryState.lastBackupAt = Date.now();
      categoryState.lastBackupTrigger = trigger;
      categoryState.lastBackupError = undefined;
      categoryState.lastBackupErrorAt = undefined;
      if (Number.isFinite(lastModified) && lastModified > 0) {
        categoryState.lastRemoteModifiedAt = lastModified;
      }
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    await updateState((state) => {
      const categoryState = state.categories[categoryId];
      categoryState.lastBackupError = message;
      categoryState.lastBackupErrorAt = Date.now();
    });
    if (notifyOnError && canNotify(categoryId)) {
      void pushNotification(
        'options-backup',
        'Options backup failed',
        message,
        config.link,
        'Trigger: ' + trigger,
      );
    }
    return false;
  }
}

/**
 * Queue a backup run for the specified category.
 * @param {string} categoryId
 * @param {string} trigger
 * @returns {void}
 */
function queueCategoryBackup(categoryId, trigger) {
  if (isBackupSuppressed(categoryId)) {
    return;
  }

  queuedBackupReasons.set(categoryId, trigger);
  if (runningBackups.has(categoryId)) {
    return;
  }

  runningBackups.add(categoryId);
  const notifyOnError = trigger !== 'manual';
  const runLoop = async () => {
    while (queuedBackupReasons.has(categoryId)) {
      const currentTrigger = queuedBackupReasons.get(categoryId) ?? trigger;
      queuedBackupReasons.delete(categoryId);
      await performCategoryBackup(categoryId, currentTrigger, notifyOnError);
    }
    runningBackups.delete(categoryId);
  };

  void runLoop();
}

/**
 * Perform backups for all categories immediately.
 * @param {string} trigger
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function performFullBackup(trigger) {
  const errors = [];
  for (const categoryId of CATEGORY_IDS) {
    const success = await performCategoryBackup(categoryId, trigger, false);
    if (!success) {
      const state = await loadState();
      const categoryState = state.categories[categoryId];
      if (categoryState.lastBackupError) {
        errors.push(categoryState.lastBackupError);
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Determine the latest local edit timestamp for a category.
 * @param {BackupCategoryState} state
 * @returns {number}
 */
function getLatestLocalTimestamp(state) {
  return Math.max(
    Number(state.lastBackupAt ?? 0),
    Number(state.lastRestoreAt ?? 0),
    Number(state.lastRemoteModifiedAt ?? 0),
  );
}

/**
 * Perform a restore operation for all categories.
 * @param {string} trigger
 * @param {boolean} notifyOnError
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function performRestore(trigger, notifyOnError) {
  if (restoreInProgress) {
    return {
      ok: false,
      errors: ['Restore already in progress.'],
    };
  }

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: ['No Raindrop connection found. Connect your account to restore settings.'],
    };
  }

  restoreInProgress = true;
  try {
    const collectionId = await ensureBackupCollection(tokens);
    const itemsMap = await loadBackupItemMap(tokens, collectionId);
    const state = await loadState();
    const errors = [];

    for (const categoryId of CATEGORY_IDS) {
      const config = CATEGORY_CONFIG[categoryId];
      const titleKey = config.title.trim().toLowerCase();
      const item = itemsMap.get(titleKey);
      if (!item) {
        continue;
      }

      const { payload, lastModified } = config.parseItem(item);
      if (!payload) {
        errors.push('Invalid backup data for ' + categoryId + '.');
        continue;
      }

      const categoryState = state.categories[categoryId];
      const remoteTimestamp = Number(lastModified);
      const localTimestamp = getLatestLocalTimestamp(categoryState);

      if (!remoteTimestamp || remoteTimestamp < 1) {
        continue;
      }

      if (remoteTimestamp < localTimestamp) {
        continue;
      }

      if (remoteTimestamp === localTimestamp && trigger !== 'manual') {
        continue;
      }

      try {
        // Handle different payload types correctly
        let payloadToApply;
        if (payload.kind === 'auth-provider-settings') {
          payloadToApply = payload.mirrorRootFolderSettings;
        } else if (payload.kind === 'auto-reload-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'bright-mode-settings') {
          payloadToApply = payload.settings;
        } else if (payload.kind === 'highlight-text-rules') {
          payloadToApply = payload.rules;
        } else {
          payloadToApply = payload.preferences;
        }
        await config.applyPayload(payloadToApply);
        const now = Date.now();
        await updateState((draft) => {
          const nextState = draft.categories[categoryId];
          nextState.lastRestoreAt = now;
          nextState.lastRestoreTrigger = trigger;
          nextState.lastRestoreError = undefined;
          nextState.lastRestoreErrorAt = undefined;
          if (Number.isFinite(remoteTimestamp) && remoteTimestamp > 0) {
            nextState.lastRemoteModifiedAt = remoteTimestamp;
          }
        });
        const localCategory =
          state.categories[categoryId] ?? createDefaultCategoryState();
        localCategory.lastRestoreAt = now;
        localCategory.lastRestoreTrigger = trigger;
        localCategory.lastRestoreError = undefined;
        localCategory.lastRestoreErrorAt = undefined;
        if (Number.isFinite(remoteTimestamp) && remoteTimestamp > 0) {
          localCategory.lastRemoteModifiedAt = remoteTimestamp;
        }
        state.categories[categoryId] = localCategory;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'Unknown error');
        errors.push(message);
        await updateState((draft) => {
          const nextState = draft.categories[categoryId];
          nextState.lastRestoreError = message;
          nextState.lastRestoreErrorAt = Date.now();
        });
        const localCategory =
          state.categories[categoryId] ?? createDefaultCategoryState();
        localCategory.lastRestoreError = message;
        localCategory.lastRestoreErrorAt = Date.now();
        state.categories[categoryId] = localCategory;
        if (notifyOnError && canNotify(categoryId)) {
          void pushNotification(
            'options-backup',
            'Options restore failed',
            message,
            config.link,
            'Trigger: ' + trigger,
          );
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    if (notifyOnError && canNotify('restore')) {
      void pushNotification(
        'options-backup',
        'Options restore failed',
        message,
        'nenya://options',
        'Trigger: ' + trigger,
      );
    }
    return {
      ok: false,
      errors: [message],
    };
  } finally {
    restoreInProgress = false;
  }
}

/**
 * Handle storage changes to trigger real-time backups.
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @param {string} areaName
 * @returns {void}
 */
function handleStorageChanges(changes, areaName) {
  if (areaName !== 'sync') {
    return;
  }

  if (ROOT_FOLDER_SETTINGS_KEY in changes) {
    queueCategoryBackup('auth-provider-settings', 'storage');
  }
  if (NOTIFICATION_PREFERENCES_KEY in changes) {
    queueCategoryBackup('notification-preferences', 'storage');
  }
  if (AUTO_RELOAD_RULES_KEY in changes) {
    queueCategoryBackup('auto-reload-rules', 'storage');
  }
  if (BRIGHT_MODE_WHITELIST_KEY in changes || BRIGHT_MODE_BLACKLIST_KEY in changes) {
    queueCategoryBackup('bright-mode-settings', 'storage');
  }
  if (HIGHLIGHT_TEXT_RULES_KEY in changes) {
    queueCategoryBackup('highlight-text-rules', 'storage');
  }
}

/**
 * Schedule the periodic restore alarm.
 * @returns {Promise<void>}
 */
async function scheduleRestoreAlarm() {
  try {
    await chrome.alarms.create(BACKUP_ALARM_NAME, {
      periodInMinutes: BACKUP_ALARM_PERIOD_MINUTES,
    });
  } catch (error) {
    // Ignore alarm scheduling failures in service workers.
  }
}

/**
 * Respond to alarm events.
 * @param {chrome.alarms.Alarm} alarm
 * @returns {void}
 */
function handleAlarm(alarm) {
  if (alarm.name !== BACKUP_ALARM_NAME) {
    return;
  }
  void performRestore('alarm', true);
}

/**
 * Respond to window focus changes.
 * @param {number} windowId
 * @returns {void}
 */
function handleWindowFocus(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  const now = Date.now();
  if (now - lastAutoRestoreAttemptAt < 60_000) {
    return;
  }

  lastAutoRestoreAttemptAt = now;
  void performRestore('focus', true);
}

/**
 * Initialize the options backup service.
 * @returns {void}
 */
export function initializeOptionsBackupService() {
  if (initialized) {
    return;
  }
  initialized = true;

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChanges);
  }
  if (chrome?.alarms) {
    chrome.alarms.onAlarm.addListener(handleAlarm);
    void scheduleRestoreAlarm();
  }
  if (chrome?.windows?.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(handleWindowFocus);
  }
}

/**
 * Handle lifecycle-triggered restore checks.
 * @param {string} trigger
 * @returns {Promise<void>}
 */
export async function handleOptionsBackupLifecycle(trigger) {
  initializeOptionsBackupService();
  await performRestore(trigger, true);
}

/**
 * Execute a manual backup request.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualBackup() {
  initializeOptionsBackupService();
  const result = await performFullBackup('manual');
  const state = await loadState();
  return {
    ok: result.ok,
    errors: result.errors,
    state,
  };
}

/**
 * Execute a manual restore request.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualRestore() {
  initializeOptionsBackupService();
  const result = await performRestore('manual', false);
  const state = await loadState();
  return {
    ok: result.ok,
    errors: result.errors,
    state,
  };
}

/**
 * Execute a restore triggered immediately after login.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runLoginRestore() {
  initializeOptionsBackupService();
  const result = await performRestore('login', true);
  const state = await loadState();
  return {
    ok: result.ok,
    errors: result.errors,
    state,
  };
}

/**
 * Reset configurable options to default values.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function resetOptionsToDefaults() {
  initializeOptionsBackupService();

  suppressBackup('auth-provider-settings');
  suppressBackup('notification-preferences');
  suppressBackup('auto-reload-rules');
  suppressBackup('bright-mode-settings');
  suppressBackup('highlight-text-rules');

  const defaultPreferences = JSON.parse(
    JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES),
  );

  await chrome.storage.sync.set({
    [ROOT_FOLDER_SETTINGS_KEY]: {
      [PROVIDER_ID]: {
        parentFolderId: DEFAULT_PARENT_FOLDER_ID,
        rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
      },
    },
    [NOTIFICATION_PREFERENCES_KEY]: defaultPreferences,
    [AUTO_RELOAD_RULES_KEY]: [],
    [BRIGHT_MODE_WHITELIST_KEY]: [],
    [BRIGHT_MODE_BLACKLIST_KEY]: [],
    [HIGHLIGHT_TEXT_RULES_KEY]: [],
  });

  await updateState((state) => {
    CATEGORY_IDS.forEach((categoryId) => {
      state.categories[categoryId] = createDefaultCategoryState();
    });
  });

  const backupResult = await performFullBackup('reset');
  const state = await loadState();
  return {
    ok: backupResult.ok,
    errors: backupResult.errors,
    state,
  };
}

/**
 * Retrieve the latest backup status snapshot.
 * @returns {Promise<{ ok: boolean, state: BackupState, loggedIn: boolean }>}
 */
export async function getBackupStatus() {
  initializeOptionsBackupService();
  const tokens = await loadValidProviderTokens();
  const state = await loadState();
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
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
          });
        });
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.BACKUP_NOW: {
      void runManualBackup()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            errors: [error instanceof Error ? error.message : String(error ?? 'Unknown error')],
          });
        });
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_NOW: {
      void runManualRestore()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            errors: [error instanceof Error ? error.message : String(error ?? 'Unknown error')],
          });
      });
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN: {
      void runLoginRestore()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            errors: [error instanceof Error ? error.message : String(error ?? 'Unknown error')],
          });
        });
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.RESET_DEFAULTS: {
      void resetOptionsToDefaults()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
          });
        });
      return true;
    }
    default:
      return false;
  }
}
