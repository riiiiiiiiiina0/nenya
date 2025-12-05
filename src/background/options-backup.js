/* global chrome, URLPattern */

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
import {
  syncWithRemote,
  applyStorageChangesToDoc,
  getAutomergeActorId,
} from './automerge-options-sync.js';

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
 * @property {boolean | undefined} disabled
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
 * @typedef {Object} NotificationClipboardSettings
 * @property {boolean} enabled
 * @property {boolean} copySuccess
 */

/**
 * @typedef {Object} NotificationPreferences
 * @property {boolean} enabled
 * @property {NotificationBookmarkSettings} bookmark
 * @property {NotificationProjectSettings} project
 * @property {NotificationClipboardSettings} clipboard
 */

/**
 * @typedef {Object} ScreenshotSettings
 * @property {boolean} autoSave
 */

/**
 * @typedef {Object} ScreenshotSettingsBackupPayload
 * @property {'screenshot-settings'} kind
 * @property {ScreenshotSettings} settings
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} BrightModePatternSettings
 * @property {string} id
 * @property {string} pattern
 * @property {boolean | undefined} disabled
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
 */

/**
 * @typedef {Object} HighlightTextRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {'whole-phrase' | 'comma-separated' | 'regex'} type
 * @property {string} value
 * @property {string} textColor
 * @property {string} backgroundColor
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} ignoreCase
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} BlockElementRuleSettings
 * @property {string} id
 * @property {string} urlPattern
 * @property {string[]} selectors
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {'url-pattern' | 'wildcard'} VideoEnhancementPatternType
 */

/**
 * @typedef {Object} VideoEnhancementsSettings
 * @property {boolean} autoFullscreen
 */

/**
 * @typedef {Object} VideoEnhancementRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {VideoEnhancementPatternType} patternType
 * @property {VideoEnhancementsSettings} enhancements
 * @property {boolean | undefined} disabled
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
 * @typedef {Object} DarkModeRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {boolean} enabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} DarkModeRulesBackupPayload
 * @property {'dark-mode-rules'} kind
 * @property {DarkModeRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} HighlightTextRulesBackupPayload
 * @property {'highlight-text-rules'} kind
 * @property {HighlightTextRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} BlockElementRulesBackupPayload
 * @property {'block-element-rules'} kind
 * @property {BlockElementRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} VideoEnhancementRulesBackupPayload
 * @property {'video-enhancement-rules'} kind
 * @property {VideoEnhancementRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} CustomCodeRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} LLMPromptSettings
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} CustomCodeRulesBackupPayload
 * @property {'custom-code-rules'} kind
 * @property {CustomCodeRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} LLMPromptsBackupPayload
 * @property {'llm-prompts'} kind
 * @property {LLMPromptSettings[]} prompts
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} UrlProcessRuleSettings
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {UrlProcessor[]} processors
 * @property {ApplyWhenOption[]} applyWhen
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} UrlProcessRulesBackupPayload
 * @property {'url-process-rules'} kind
 * @property {UrlProcessRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} AutoGoogleLoginRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} [email]
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} AutoGoogleLoginRulesBackupPayload
 * @property {'auto-google-login-rules'} kind
 * @property {AutoGoogleLoginRuleSettings[]} rules
 * @property {BackupMetadata} metadata
 */

/**
 * @typedef {Object} PinnedShortcutsBackupPayload
 * @property {'pinned-shortcuts'} kind
 * @property {string[]} shortcuts
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
 * @typedef {Object} AutomergeSyncState
 * @property {boolean} enabled
 * @property {number | undefined} lastSyncAt
 * @property {number | undefined} lastMergeAt
 * @property {number | undefined} conflictsResolved
 * @property {number | undefined} documentSize
 * @property {number | undefined} chunkCount
 * @property {string | undefined} lastSyncError
 * @property {number | undefined} lastSyncErrorAt
 */

/**
 * @typedef {Object} BackupState
 * @property {number} version
 * @property {string} deviceId
 * @property {Record<string, BackupCategoryState>} categories
 * @property {AutomergeSyncState | undefined} automerge
 */

const STATE_STORAGE_KEY = 'optionsBackupState';
const STATE_VERSION = 1;
const PROVIDER_ID = 'raindrop';
const BACKUP_COLLECTION_TITLE = 'Options backup';
const BACKUP_ALARM_NAME = 'nenya-options-backup-sync';
const BACKUP_ALARM_PERIOD_MINUTES = 5;
const BACKUP_SUPPRESSION_DURATION_MS = 1500;
const AUTO_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const AUTOMERGE_SYNC_DEBOUNCE_MS = 2_000;
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
const PINNED_SHORTCUTS_KEY = 'pinnedShortcuts';
const SCREENSHOT_SETTINGS_KEY = 'screenshotSettings';
const VALID_PINNED_SHORTCUT_IDS = [
  'getMarkdown',
  'pull',
  'saveUnsorted',
  'importCustomCode',
  'customFilter',
  'splitPage',
  'autoReload',
  'brightMode',
  'darkMode',
  'highlightText',
  'customCode',
  'pictureInPicture',
];
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
  clipboard: {
    enabled: true,
    copySuccess: true,
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
let automergeApplyInProgress = false;

// Automerge sync state
let automergeSyncQueued = false;
let automergeSyncRunning = false;
/** @type {number | null} */
let automergeSyncDebounceTimer = null;
let pendingAutomergeTrigger = 'storage';
let storageListenerRegistered = false;
let alarmListenerRegistered = false;
let focusListenerRegistered = false;

const CATEGORY_IDS = [
  'auth-provider-settings',
  'notification-preferences',
  'auto-reload-rules',
  'dark-mode-rules',
  'bright-mode-settings',
  'highlight-text-rules',
  'video-enhancement-rules',
  'block-element-rules',
  'custom-code-rules',
  'llm-prompts',
  'url-process-rules',
  'auto-google-login-rules',
  'pinned-shortcuts',
  'screenshot-settings',
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
    const raw =
      /** @type {{ version?: unknown, deviceId?: unknown, categories?: unknown }} */ (
        value
      );
    if (
      Number(raw.version) === STATE_VERSION &&
      typeof raw.deviceId === 'string'
    ) {
      state.deviceId = raw.deviceId;
    }
    if (raw.categories && typeof raw.categories === 'object') {
      const rawCategories = /** @type {Record<string, BackupCategoryState>} */ (
        raw.categories
      );
      CATEGORY_IDS.forEach((categoryId) => {
        const stored = rawCategories[categoryId];
        if (stored && typeof stored === 'object') {
          state.categories[categoryId] = {
            lastBackupAt: Number.isFinite(stored.lastBackupAt)
              ? Number(stored.lastBackupAt)
              : undefined,
            lastBackupTrigger:
              typeof stored.lastBackupTrigger === 'string'
                ? stored.lastBackupTrigger
                : undefined,
            lastBackupError:
              typeof stored.lastBackupError === 'string'
                ? stored.lastBackupError
                : undefined,
            lastBackupErrorAt: Number.isFinite(stored.lastBackupErrorAt)
              ? Number(stored.lastBackupErrorAt)
              : undefined,
            lastRestoreAt: Number.isFinite(stored.lastRestoreAt)
              ? Number(stored.lastRestoreAt)
              : undefined,
            lastRestoreTrigger:
              typeof stored.lastRestoreTrigger === 'string'
                ? stored.lastRestoreTrigger
                : undefined,
            lastRestoreError:
              typeof stored.lastRestoreError === 'string'
                ? stored.lastRestoreError
                : undefined,
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

  const raw =
    /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings>, clipboard?: Partial<NotificationClipboardSettings> }} */ (
      value
    );
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};
  const clipboard = raw.clipboard ?? {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled:
        typeof bookmark.enabled === 'boolean'
          ? bookmark.enabled
          : fallback.bookmark.enabled,
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
      enabled:
        typeof project.enabled === 'boolean'
          ? project.enabled
          : fallback.project.enabled,
      saveProject:
        typeof project.saveProject === 'boolean'
          ? project.saveProject
          : fallback.project.saveProject,
      addTabs:
        typeof project.addTabs === 'boolean'
          ? project.addTabs
          : fallback.project.addTabs,
      replaceItems:
        typeof project.replaceItems === 'boolean'
          ? project.replaceItems
          : fallback.project.replaceItems,
      deleteProject:
        typeof project.deleteProject === 'boolean'
          ? project.deleteProject
          : fallback.project.deleteProject,
    },
    clipboard: {
      enabled:
        typeof clipboard.enabled === 'boolean'
          ? clipboard.enabled
          : fallback.clipboard.enabled,
      copySuccess:
        typeof clipboard.copySuccess === 'boolean'
          ? clipboard.copySuccess
          : fallback.clipboard.copySuccess,
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
  backupSuppressionUntil.set(
    categoryId,
    Date.now() + BACKUP_SUPPRESSION_DURATION_MS,
  );
}

/**
 * Map storage change keys to backup category ids.
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @returns {string[]}
 */
function getCategoriesForChanges(changes) {
  const categories = new Set();
  if (ROOT_FOLDER_SETTINGS_KEY in changes) {
    categories.add('auth-provider-settings');
  }
  if (NOTIFICATION_PREFERENCES_KEY in changes) {
    categories.add('notification-preferences');
  }
  if (AUTO_RELOAD_RULES_KEY in changes) {
    categories.add('auto-reload-rules');
  }
  if (DARK_MODE_RULES_KEY in changes) {
    categories.add('dark-mode-rules');
  }
  if (BRIGHT_MODE_WHITELIST_KEY in changes) {
    categories.add('bright-mode-settings');
  }
  if (HIGHLIGHT_TEXT_RULES_KEY in changes) {
    categories.add('highlight-text-rules');
  }
  if (VIDEO_ENHANCEMENT_RULES_KEY in changes) {
    categories.add('video-enhancement-rules');
  }
  if (BLOCK_ELEMENT_RULES_KEY in changes) {
    categories.add('block-element-rules');
  }
  if (CUSTOM_CODE_RULES_KEY in changes) {
    categories.add('custom-code-rules');
  }
  if (LLM_PROMPTS_KEY in changes) {
    categories.add('llm-prompts');
  }
  if (URL_PROCESS_RULES_KEY in changes) {
    categories.add('url-process-rules');
  }
  if (AUTO_GOOGLE_LOGIN_RULES_KEY in changes) {
    categories.add('auto-google-login-rules');
  }
  if (PINNED_SHORTCUTS_KEY in changes) {
    categories.add('pinned-shortcuts');
  }
  if (SCREENSHOT_SETTINGS_KEY in changes) {
    categories.add('screenshot-settings');
  }
  return Array.from(categories);
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
    if (rawTitle.toLowerCase() === normalizedTitle && Number.isFinite(id)) {
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

    if (!Array.isArray(pageItems)) {
      break;
    }

    if (pageItems.length === 0) {
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
    'parentFolderPath' in settings &&
    typeof settings.parentFolderPath === 'string'
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
 * Apply pinned shortcuts to storage.
 * @param {string[]} shortcuts
 * @returns {Promise<void>}
 */
async function applyPinnedShortcuts(shortcuts) {
  if (!Array.isArray(shortcuts)) {
    return;
  }
  // Valid shortcut IDs (excluding openOptions which is always shown)
  const sanitized = shortcuts
    .filter(
      (id) => typeof id === 'string' && VALID_PINNED_SHORTCUT_IDS.includes(id),
    )
    .slice(0, 6);
  suppressBackup('pinned-shortcuts');
  await chrome.storage.sync.set({
    [PINNED_SHORTCUTS_KEY]: sanitized,
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
 * Apply screenshot settings to storage.
 * @param {ScreenshotSettings} settings
 * @returns {Promise<void>}
 */
async function applyScreenshotSettings(settings) {
  const sanitized = normalizeScreenshotSettings(settings);
  suppressBackup('screenshot-settings');
  await chrome.storage.sync.set({
    [SCREENSHOT_SETTINGS_KEY]: sanitized,
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
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
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

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoReloadRuleSettings} */
      const rule = {
        id,
        pattern,
        intervalSeconds,
        disabled: !!raw.disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
    console.warn(
      '[options-backup] Failed to re-evaluate auto reload rules after restore:',
      error,
    );
  }
}

/**
 * Normalize dark mode rules.
 * @param {unknown} value
 * @returns {{ rules: DarkModeRuleSettings[], mutated: boolean }}
 */
function normalizeDarkModeRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, enabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      // Validate URLPattern but don't skip - content script handles invalid patterns
      try {
        new URLPattern(pattern);
      } catch (error) {
        console.warn(
          '[options-backup] Dark mode pattern may be invalid but will be backed up:',
          pattern,
          error,
        );
        // Don't return - continue to back up the pattern
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {DarkModeRuleSettings} */
      const rule = {
        id,
        pattern,
        enabled: !!raw.enabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
 * Collect dark mode rules from storage.
 * @returns {Promise<DarkModeRuleSettings[]>}
 */
async function collectDarkModeRules() {
  const result = await chrome.storage.sync.get(DARK_MODE_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeDarkModeRules(
    result?.[DARK_MODE_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('dark-mode-rules');
    await chrome.storage.sync.set({
      [DARK_MODE_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply dark mode rules to storage.
 * @param {DarkModeRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyDarkModeRules(rules) {
  const { rules: sanitized } = normalizeDarkModeRules(rules);
  suppressBackup('dark-mode-rules');
  await chrome.storage.sync.set({
    [DARK_MODE_RULES_KEY]: sanitized,
  });
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
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
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

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {BrightModePatternSettings} */
      const patternObj = {
        id,
        pattern,
        disabled: !!raw.disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, type?: unknown, value?: unknown, textColor?: unknown, backgroundColor?: unknown, bold?: unknown, italic?: unknown, underline?: unknown, ignoreCase?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
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
      if (
        typeof type !== 'string' ||
        !['whole-phrase', 'comma-separated', 'regex'].includes(type)
      ) {
        console.warn(
          '[options-backup] Ignoring invalid highlight text type:',
          type,
        );
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
          console.warn(
            '[options-backup] Ignoring invalid highlight text regex:',
            valueText,
            error,
          );
          return;
        }
      }

      const textColor =
        typeof raw.textColor === 'string' ? raw.textColor : '#000000';
      const backgroundColor =
        typeof raw.backgroundColor === 'string'
          ? raw.backgroundColor
          : '#ffff00';
      const bold = typeof raw.bold === 'boolean' ? raw.bold : false;
      const italic = typeof raw.italic === 'boolean' ? raw.italic : false;
      const underline =
        typeof raw.underline === 'boolean' ? raw.underline : false;
      const ignoreCase =
        typeof raw.ignoreCase === 'boolean' ? raw.ignoreCase : false;
      const disabled = typeof raw.disabled === 'boolean' ? raw.disabled : false;

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {HighlightTextRuleSettings} */
      const rule = {
        id,
        pattern,
        type: /** @type {'whole-phrase' | 'comma-separated' | 'regex'} */ (
          type
        ),
        value: valueText,
        textColor,
        backgroundColor,
        bold,
        italic,
        underline,
        ignoreCase,
        disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
    suppressBackup('bright-mode-whitelist');
    await chrome.storage.sync.set({
      [storageKey]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply bright mode patterns to storage.
 * @param {BrightModePatternSettings[]} patterns
 * @returns {Promise<void>}
 */
async function applyBrightModePatterns(patterns) {
  const { patterns: sanitized } = normalizeBrightModePatterns(patterns);
  suppressBackup('bright-mode-whitelist');
  await chrome.storage.sync.set({
    [BRIGHT_MODE_WHITELIST_KEY]: sanitized,
  });
}

/**
 * Apply bright mode settings to storage.
 * @param {BrightModeSettings} settings
 * @returns {Promise<void>}
 */
async function applyBrightModeSettings(settings) {
  const { patterns: sanitizedWhitelist } = normalizeBrightModePatterns(
    settings.whitelist || [],
  );

  suppressBackup('bright-mode-settings');
  await chrome.storage.sync.set({
    [BRIGHT_MODE_WHITELIST_KEY]: sanitizedWhitelist,
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
 * Validate wildcard patterns for video enhancements.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidVideoEnhancementWildcardPattern(pattern) {
  const value = pattern.trim();
  if (!value) {
    return false;
  }
  return !/\s/.test(value);
}

/**
 * Validate URLPattern strings for video enhancements.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidVideoEnhancementUrlPattern(pattern) {
  if (!pattern.trim()) {
    return false;
  }
  if (typeof URLPattern !== 'function') {
    return true;
  }
  try {
    // eslint-disable-next-line no-new
    new URLPattern(pattern);
    return true;
  } catch (error) {
    console.warn(
      '[options-backup] Ignoring invalid video enhancement URLPattern:',
      pattern,
      error,
    );
    return false;
  }
}

/**
 * Normalize video enhancement rules from storage or input.
 * @param {unknown} value
 * @returns {{ rules: VideoEnhancementRuleSettings[], mutated: boolean }}
 */
function normalizeVideoEnhancementRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, patternType?: unknown, enhancements?: { autoFullscreen?: unknown }, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      /** @type {VideoEnhancementPatternType} */
      const patternType =
        raw.patternType === 'wildcard' ? 'wildcard' : 'url-pattern';

      const isPatternValid =
        patternType === 'url-pattern'
          ? isValidVideoEnhancementUrlPattern(pattern)
          : isValidVideoEnhancementWildcardPattern(pattern);
      if (!isPatternValid) {
        return;
      }

      const autoFullscreen =
        typeof raw.enhancements?.autoFullscreen === 'boolean'
          ? raw.enhancements.autoFullscreen
          : false;

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {VideoEnhancementRuleSettings} */
      const rule = {
        id,
        pattern,
        patternType,
        enhancements: {
          autoFullscreen,
        },
        disabled: Boolean(raw.disabled),
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
 * Collect video enhancement rules from storage.
 * @returns {Promise<VideoEnhancementRuleSettings[]>}
 */
async function collectVideoEnhancementRules() {
  const result = await chrome.storage.sync.get(VIDEO_ENHANCEMENT_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeVideoEnhancementRules(
    result?.[VIDEO_ENHANCEMENT_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('video-enhancement-rules');
    await chrome.storage.sync.set({
      [VIDEO_ENHANCEMENT_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply video enhancement rules to storage.
 * @param {VideoEnhancementRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyVideoEnhancementRules(rules) {
  const { rules: sanitized } = normalizeVideoEnhancementRules(rules);
  suppressBackup('video-enhancement-rules');
  await chrome.storage.sync.set({
    [VIDEO_ENHANCEMENT_RULES_KEY]: sanitized,
  });
}

/**
 * Normalize block element rules from storage or input.
 * @param {unknown} value
 * @returns {{ rules: BlockElementRuleSettings[], mutated: boolean }}
 */
function normalizeBlockElementRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, urlPattern?: unknown, selectors?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const urlPattern =
        typeof raw.urlPattern === 'string' ? raw.urlPattern.trim() : '';
      if (!urlPattern) {
        return;
      }

      try {
        // Basic pattern validation
        if (urlPattern.includes('*') && !urlPattern.includes('://')) {
          // This is likely a glob pattern, which is acceptable
        } else if (urlPattern.includes('://')) {
          // This is likely a full URL pattern, validate basic syntax
          const url = new URL('https://example.com');
          // Basic validation passed
        }
      } catch (error) {
        console.warn(
          '[options-backup] Ignoring invalid block element pattern:',
          urlPattern,
          error,
        );
        return;
      }

      const selectors = Array.isArray(raw.selectors)
        ? raw.selectors.filter((s) => typeof s === 'string' && s.trim())
        : [];

      if (selectors.length === 0) {
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {BlockElementRuleSettings} */
      const rule = {
        id,
        urlPattern,
        selectors,
        disabled: !!raw.disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };
      sanitized.push(rule);
    });
  }

  const sorted = sanitized.sort((a, b) =>
    a.urlPattern.localeCompare(b.urlPattern),
  );
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { rules: sorted, mutated };
}

/**
 * Normalize custom code rules.
 * @param {unknown} value
 * @returns {{ rules: CustomCodeRuleSettings[], mutated: boolean }}
 */
function normalizeCustomCodeRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, css?: unknown, js?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      // Validate URLPattern but don't skip - content script handles invalid patterns
      try {
        // @ts-ignore - URLPattern is a browser API
        // eslint-disable-next-line no-new
        new URLPattern(pattern);
      } catch (error) {
        console.warn(
          '[options-backup] Custom code pattern may be invalid but will be backed up:',
          pattern,
          error,
        );
        // Don't return - continue to back up the pattern
      }

      const css = typeof raw.css === 'string' ? raw.css : '';
      const js = typeof raw.js === 'string' ? raw.js : '';

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {CustomCodeRuleSettings} */
      const rule = {
        id,
        pattern,
        css,
        js,
        disabled: !!raw.disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
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
 * Collect block element rules from storage.
 * @returns {Promise<BlockElementRuleSettings[]>}
 */
async function collectBlockElementRules() {
  const result = await chrome.storage.sync.get(BLOCK_ELEMENT_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeBlockElementRules(
    result?.[BLOCK_ELEMENT_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('block-element-rules');
    await chrome.storage.sync.set({
      [BLOCK_ELEMENT_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Collect custom code rules from storage.
 * @returns {Promise<CustomCodeRuleSettings[]>}
 */
async function collectCustomCodeRules() {
  const result = await chrome.storage.local.get(CUSTOM_CODE_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeCustomCodeRules(
    result?.[CUSTOM_CODE_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('custom-code-rules');
    await chrome.storage.local.set({
      [CUSTOM_CODE_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply block element rules to storage.
 * @param {BlockElementRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyBlockElementRules(rules) {
  const { rules: sanitized } = normalizeBlockElementRules(rules);
  suppressBackup('block-element-rules');
  await chrome.storage.sync.set({
    [BLOCK_ELEMENT_RULES_KEY]: sanitized,
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
 * Build the dark mode rules payload for backup.
 * @param {string} trigger
 * @returns {Promise<DarkModeRulesBackupPayload>}
 */
async function buildDarkModeRulesPayload(trigger) {
  const rules = await collectDarkModeRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'dark-mode-rules',
    rules,
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
 * Normalize screenshot settings to a valid object.
 * @param {unknown} value
 * @returns {ScreenshotSettings}
 */
function normalizeScreenshotSettings(value) {
  const fallback = { autoSave: false };
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = /** @type {Partial<ScreenshotSettings>} */ (value);
  return {
    autoSave: typeof raw.autoSave === 'boolean' ? raw.autoSave : fallback.autoSave,
  };
}

/**
 * Get screenshot settings from storage.
 * @returns {Promise<ScreenshotSettings>}
 */
async function collectScreenshotSettings() {
  try {
    const result = await chrome.storage.sync.get(SCREENSHOT_SETTINGS_KEY);
    return normalizeScreenshotSettings(result?.[SCREENSHOT_SETTINGS_KEY]);
  } catch (error) {
    console.warn('[options-backup] Failed to collect screenshot settings:', error);
    return { autoSave: false };
  }
}

/**
 * Build the screenshot settings payload for backup.
 * @param {string} trigger
 * @returns {Promise<ScreenshotSettingsBackupPayload>}
 */
async function buildScreenshotSettingsPayload(trigger) {
  const settings = await collectScreenshotSettings();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'screenshot-settings',
    settings,
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
  const whitelistPatterns = await collectBrightModePatterns(
    BRIGHT_MODE_WHITELIST_KEY,
  );

  const settings = {
    whitelist: whitelistPatterns,
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
 * Build the video enhancement rules payload for backup.
 * @param {string} trigger
 * @returns {Promise<VideoEnhancementRulesBackupPayload>}
 */
async function buildVideoEnhancementRulesPayload(trigger) {
  const rules = await collectVideoEnhancementRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'video-enhancement-rules',
    rules,
    metadata,
  };
}

/**
 * Build the block element rules payload for backup.
 * @param {string} trigger
 * @returns {Promise<BlockElementRulesBackupPayload>}
 */
async function buildBlockElementRulesPayload(trigger) {
  const rules = await collectBlockElementRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'block-element-rules',
    rules,
    metadata,
  };
}

/**
 * Apply custom code rules to storage.
 * @param {CustomCodeRulesBackupPayload} payload
 * @returns {Promise<void>}
 */
async function applyCustomCodeRules(payload) {
  if (!payload || !payload.rules || !Array.isArray(payload.rules)) {
    return;
  }
  const { rules: sanitized } = normalizeCustomCodeRules(payload.rules);
  suppressBackup('custom-code-rules');
  await chrome.storage.local.set({
    [CUSTOM_CODE_RULES_KEY]: sanitized,
  });
}

/**
 * Build custom code rules payload.
 * @param {string} trigger
 * @returns {Promise<CustomCodeRulesBackupPayload>}
 */
async function buildCustomCodeRulesPayload(trigger) {
  const rules = await collectCustomCodeRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'custom-code-rules',
    rules,
    metadata,
  };
}

/**
 * Normalize LLM prompts.
 * @param {unknown} value
 * @returns {{ prompts: LLMPromptSettings[], mutated: boolean }}
 */
function normalizeLLMPrompts(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, name?: unknown, prompt?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );

      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return;
      }

      const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
      if (!prompt) {
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {LLMPromptSettings} */
      const promptSettings = {
        id,
        name,
        prompt,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };

      sanitized.push(promptSettings);
    });
  }

  if (sanitized.length !== originalLength) {
    mutated = true;
  }

  sanitized.sort((a, b) => a.name.localeCompare(b.name));

  return { prompts: sanitized, mutated };
}

/**
 * Normalize URL process rules.
 * @param {unknown} value
 * @returns {{ rules: UrlProcessRuleSettings[], mutated: boolean }}
 */
function normalizeUrlProcessRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, processors?: unknown, applyWhen?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );

      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return;
      }

      const urlPatterns = Array.isArray(raw.urlPatterns)
        ? raw.urlPatterns
            .map((p) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p) => {
              if (!p) {
                return false;
              }
              try {
                // Basic pattern validation
                if (p.includes('*') && !p.includes('://')) {
                  return true;
                } else if (p.includes('://')) {
                  const url = new URL('https://example.com');
                  return true;
                }
                return true;
              } catch {
                return false;
              }
            })
        : [];
      if (urlPatterns.length === 0) {
        return;
      }

      const processors = Array.isArray(raw.processors)
        ? raw.processors
            .map((p) => {
              if (!p || typeof p !== 'object') {
                return null;
              }
              const procRaw =
                /** @type {{ id?: unknown, type?: unknown, name?: unknown, value?: unknown }} */ (
                  p
                );
              const type = procRaw.type;
              if (
                typeof type !== 'string' ||
                !['add', 'replace', 'remove'].includes(type)
              ) {
                return null;
              }
              const procName =
                typeof procRaw.name === 'string' ? procRaw.name.trim() : '';
              if (!procName) {
                return null;
              }
              // For replace and remove, name can be regex
              if (type === 'replace' || type === 'remove') {
                if (procName.startsWith('/') && procName.endsWith('/')) {
                  const regexPattern = procName.slice(1, -1);
                  try {
                    new RegExp(regexPattern);
                  } catch {
                    return null;
                  }
                }
              }
              const procId =
                typeof procRaw.id === 'string' && procRaw.id.trim()
                  ? procRaw.id.trim()
                  : generateRuleId();
              if (!procRaw.id) {
                mutated = true;
              }

              /** @type {UrlProcessor} */
              const processor = {
                id: procId,
                type: /** @type {ProcessorType} */ (type),
                name: procName,
              };

              if (type === 'add' || type === 'replace') {
                const procValue =
                  typeof procRaw.value === 'string' ? procRaw.value : '';
                processor.value = procValue;
              }

              return processor;
            })
            .filter((p) => p !== null)
        : [];
      if (processors.length === 0) {
        return;
      }

      const applyWhen = Array.isArray(raw.applyWhen)
        ? raw.applyWhen.filter((aw) =>
            [
              'copy-to-clipboard',
              'save-to-raindrop',
              'open-in-new-tab',
            ].includes(aw),
          )
        : [];
      if (applyWhen.length === 0) {
        return;
      }

      const id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        mutated = true;
      }

      /** @type {UrlProcessRuleSettings} */
      const rule = {
        id: id || generateRuleId(),
        name,
        urlPatterns,
        processors,
        applyWhen: /** @type {ApplyWhenOption[]} */ (applyWhen),
        disabled: !!raw.disabled,
        createdAt:
          typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt:
          typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      };

      sanitized.push(rule);
    });
  }

  if (sanitized.length !== originalLength) {
    mutated = true;
  }

  sanitized.sort((a, b) => a.name.localeCompare(b.name));

  return { rules: sanitized, mutated };
}

/**
 * Collect LLM prompts from storage.
 * @returns {Promise<LLMPromptSettings[]>}
 */
async function collectLLMPrompts() {
  const result = await chrome.storage.sync.get(LLM_PROMPTS_KEY);
  const { prompts: sanitized, mutated } = normalizeLLMPrompts(
    result?.[LLM_PROMPTS_KEY],
  );
  if (mutated) {
    suppressBackup('llm-prompts');
    await chrome.storage.sync.set({
      [LLM_PROMPTS_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply LLM prompts to storage.
 * @param {LLMPromptSettings[]} prompts
 * @returns {Promise<void>}
 */
async function applyLLMPrompts(prompts) {
  if (!Array.isArray(prompts)) {
    return;
  }
  const { prompts: sanitized } = normalizeLLMPrompts(prompts);
  suppressBackup('llm-prompts');
  await chrome.storage.sync.set({
    [LLM_PROMPTS_KEY]: sanitized,
  });
}

/**
 * Collect URL process rules from storage.
 * @returns {Promise<UrlProcessRuleSettings[]>}
 */
async function collectUrlProcessRules() {
  const result = await chrome.storage.sync.get(URL_PROCESS_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeUrlProcessRules(
    result?.[URL_PROCESS_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('url-process-rules');
    await chrome.storage.sync.set({
      [URL_PROCESS_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply URL process rules to storage.
 * @param {UrlProcessRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyUrlProcessRules(rules) {
  if (!Array.isArray(rules)) {
    return;
  }
  const { rules: sanitized } = normalizeUrlProcessRules(rules);
  suppressBackup('url-process-rules');
  await chrome.storage.sync.set({
    [URL_PROCESS_RULES_KEY]: sanitized,
  });
}

/**
 * Build URL process rules payload.
 * @param {string} trigger
 * @returns {Promise<UrlProcessRulesBackupPayload>}
 */
async function buildUrlProcessRulesPayload(trigger) {
  const rules = await collectUrlProcessRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'url-process-rules',
    rules,
    metadata,
  };
}

/**
 * Normalize auto Google login rules from storage or input.
 * @param {unknown} value
 * @returns {{ rules: AutoGoogleLoginRuleSettings[], mutated: boolean }}
 */
function normalizeAutoGoogleLoginRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, email?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );

      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      // Validate URLPattern but don't skip - content script handles invalid patterns
      try {
        // eslint-disable-next-line no-new
        new URLPattern(pattern);
      } catch (error) {
        console.warn(
          '[options-backup] Auto Google login pattern may be invalid but will be backed up:',
          pattern,
          error,
        );
        // Don't return - continue to back up the pattern
      }

      const email =
        typeof raw.email === 'string' ? raw.email.trim() : undefined;
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return;
        }
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoGoogleLoginRuleSettings} */
      const rule = {
        id,
        pattern,
        disabled: !!raw.disabled,
      };

      if (email) {
        rule.email = email;
      }

      if (typeof raw.createdAt === 'string') {
        rule.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        rule.updatedAt = raw.updatedAt;
      }

      sanitized.push(rule);
    });
  }

  const sorted = sanitized.sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    const emailA = a.email || '';
    const emailB = b.email || '';
    return emailA.localeCompare(emailB);
  });

  return {
    rules: sorted,
    mutated: mutated || sorted.length !== originalLength,
  };
}

/**
 * Collect auto Google login rules from storage.
 * @returns {Promise<AutoGoogleLoginRuleSettings[]>}
 */
async function collectAutoGoogleLoginRules() {
  const result = await chrome.storage.sync.get(AUTO_GOOGLE_LOGIN_RULES_KEY);
  const { rules: sanitized, mutated } = normalizeAutoGoogleLoginRules(
    result?.[AUTO_GOOGLE_LOGIN_RULES_KEY],
  );
  if (mutated) {
    suppressBackup('auto-google-login-rules');
    await chrome.storage.sync.set({
      [AUTO_GOOGLE_LOGIN_RULES_KEY]: sanitized,
    });
  }
  return sanitized;
}

/**
 * Apply auto Google login rules to storage.
 * @param {AutoGoogleLoginRuleSettings[]} rules
 * @returns {Promise<void>}
 */
async function applyAutoGoogleLoginRules(rules) {
  if (!Array.isArray(rules)) {
    return;
  }
  const { rules: sanitized } = normalizeAutoGoogleLoginRules(rules);
  suppressBackup('auto-google-login-rules');
  await chrome.storage.sync.set({
    [AUTO_GOOGLE_LOGIN_RULES_KEY]: sanitized,
  });
}

/**
 * Build auto Google login rules payload.
 * @param {string} trigger
 * @returns {Promise<AutoGoogleLoginRulesBackupPayload>}
 */
async function buildAutoGoogleLoginRulesPayload(trigger) {
  const rules = await collectAutoGoogleLoginRules();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'auto-google-login-rules',
    rules,
    metadata,
  };
}

/**
 * Collect pinned shortcuts from storage.
 * @returns {Promise<string[]>}
 */
async function collectPinnedShortcuts() {
  const result = await chrome.storage.sync.get(PINNED_SHORTCUTS_KEY);
  const shortcuts = result?.[PINNED_SHORTCUTS_KEY];
  if (!Array.isArray(shortcuts)) {
    return [];
  }
  // Valid shortcut IDs (excluding openOptions which is always shown)
  return shortcuts
    .filter(
      (id) => typeof id === 'string' && VALID_PINNED_SHORTCUT_IDS.includes(id),
    )
    .slice(0, 6);
}

/**
 * Build pinned shortcuts payload.
 * @param {string} trigger
 * @returns {Promise<PinnedShortcutsBackupPayload>}
 */
async function buildPinnedShortcutsPayload(trigger) {
  const shortcuts = await collectPinnedShortcuts();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'pinned-shortcuts',
    shortcuts,
    metadata,
  };
}

/**
 * Build LLM prompts payload.
 * @param {string} trigger
 * @returns {Promise<LLMPromptsBackupPayload>}
 */
async function buildLLMPromptsPayload(trigger) {
  const prompts = await collectLLMPrompts();
  const metadata = await buildMetadata(trigger);
  return {
    kind: 'llm-prompts',
    prompts,
    metadata,
  };
}

/**
 * Generic backup function with chunking support for all categories.
 * @param {string} categoryId
 * @param {string} trigger
 * @param {boolean} notifyOnError
 * @returns {Promise<boolean>}
 */
async function performCategoryBackupWithChunking(
  categoryId,
  trigger,
  notifyOnError,
) {
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

    const MAX_CHUNK_SIZE = 10000;
    const chunks = [];

    // Split into chunks if needed
    if (serialized.length <= MAX_CHUNK_SIZE) {
      chunks.push(serialized);
    } else {
      for (let i = 0; i < serialized.length; i += MAX_CHUNK_SIZE) {
        chunks.push(serialized.slice(i, i + MAX_CHUNK_SIZE));
      }
    }

    // Delete old non-indexed item for backward compatibility migration
    const oldNonIndexedTitle = config.title.trim().toLowerCase();
    const oldNonIndexedItem = existingItems.get(oldNonIndexedTitle);
    if (
      oldNonIndexedItem &&
      Number.isFinite(Number(oldNonIndexedItem?._id ?? oldNonIndexedItem?.id))
    ) {
      const oldItemId = Number(oldNonIndexedItem?._id ?? oldNonIndexedItem?.id);
      try {
        await raindropRequest('/raindrop/' + oldItemId, tokens, {
          method: 'DELETE',
        });
      } catch (error) {
        // Ignore deletion errors
      }
    }

    // Delete old chunks that are no longer needed
    for (let i = chunks.length + 1; i <= 100; i++) {
      const oldTitle = config.title + '-' + i;
      const normalizedOldTitle = oldTitle.trim().toLowerCase();
      const oldItem = existingItems.get(normalizedOldTitle);
      if (oldItem && Number.isFinite(Number(oldItem?._id ?? oldItem?.id))) {
        const oldItemId = Number(oldItem?._id ?? oldItem?.id);
        try {
          await raindropRequest('/raindrop/' + oldItemId, tokens, {
            method: 'DELETE',
          });
        } catch (error) {
          // Ignore deletion errors
        }
      }
    }

    // Save each chunk - always use indexed naming (e.g., category-1, category-2)
    let lastModified = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkNum = i + 1;
      const title = config.title + '-' + chunkNum;
      const link = config.link + '/' + chunkNum;
      const normalizedTitle = title.trim().toLowerCase();
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
            title,
            link,
            note: chunks[i],
            excerpt:
              chunks.length === 1
                ? ''
                : 'Chunk ' + chunkNum + ' of ' + chunks.length,
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
            title,
            link,
            note: chunks[i],
            excerpt:
              chunks.length === 1
                ? ''
                : 'Chunk ' + chunkNum + ' of ' + chunks.length,
            collectionId,
            pleaseParse: {},
          }),
        });
      }

      const responseItem =
        itemResponse?.item ?? itemResponse?.data ?? itemResponse;
      const itemLastModified = parseTimestamp(responseItem?.lastUpdate);
      if (itemLastModified > lastModified) {
        lastModified = itemLastModified;
      }
    }

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
 * Generic restore function with chunking support for all categories.
 * @param {string} categoryId
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {Map<string, any>} existingItems
 * @returns {Promise<{ payload: any | null, lastModified: number }>}
 */
async function restoreCategoryFromChunks(
  categoryId,
  tokens,
  collectionId,
  existingItems,
) {
  const config = CATEGORY_CONFIG[categoryId];
  if (!config) {
    return { payload: null, lastModified: 0 };
  }

  try {
    // Collect all indexed chunks (always use indexed format: category-1, category-2, etc.)
    const chunks = [];
    let maxLastModified = 0;

    for (let i = 1; i <= 100; i++) {
      const title = config.title + '-' + i;
      const normalizedTitle = title.trim().toLowerCase();
      const item = existingItems.get(normalizedTitle);

      if (!item) {
        // No more chunks
        break;
      }

      const note = typeof item?.note === 'string' ? item.note : '';
      if (note) {
        chunks.push(note);
      }

      const itemLastModified = parseTimestamp(item?.lastUpdate);
      if (itemLastModified > maxLastModified) {
        maxLastModified = itemLastModified;
      }
    }

    // Backward compatibility: Check for old non-indexed format
    if (chunks.length === 0) {
      const titleKey = config.title.trim().toLowerCase();
      const singleItem = existingItems.get(titleKey);
      if (singleItem) {
        return config.parseItem(singleItem);
      }
      return { payload: null, lastModified: 0 };
    }

    // Combine chunks and parse
    const combined = chunks.join('');

    // Create a temporary item object with the combined note
    const combinedItem = {
      note: combined,
      lastUpdate:
        maxLastModified > 0
          ? new Date(maxLastModified).toISOString()
          : new Date().toISOString(),
    };

    // Use the category's parseItem function to parse the combined data
    return config.parseItem(combinedItem);
  } catch (error) {
    console.error(
      '[options-backup] Failed to restore ' + categoryId + ' chunks:',
      error,
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse dark mode rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: DarkModeRulesBackupPayload | null, lastModified: number }}
 */
function parseDarkModeRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeDarkModeRules(parsed?.rules).rules;

    const payload = /** @type {DarkModeRulesBackupPayload} */ ({
      kind: 'dark-mode-rules',
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
          typeof parsed?.mirrorRootFolderSettings?.parentFolderPath ===
            'string' && parsed.mirrorRootFolderSettings.parentFolderPath
            ? parsed.mirrorRootFolderSettings.parentFolderPath
            : '',
        parentFolderId:
          typeof parsed?.mirrorRootFolderSettings?.parentFolderId ===
            'string' && parsed.mirrorRootFolderSettings.parentFolderId
            ? parsed.mirrorRootFolderSettings.parentFolderId
            : DEFAULT_PARENT_FOLDER_ID,
        rootFolderName:
          typeof parsed?.mirrorRootFolderSettings?.rootFolderName ===
            'string' && parsed.mirrorRootFolderSettings.rootFolderName
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
 * Attempt to parse a screenshot settings payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: ScreenshotSettingsBackupPayload | null, lastModified: number }}
 */
function parseScreenshotSettingsItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const payload = /** @type {ScreenshotSettingsBackupPayload} */ ({
      kind: 'screenshot-settings',
      settings: normalizeScreenshotSettings(parsed?.settings),
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
    const normalizedWhitelist = normalizeBrightModePatterns(
      settings.whitelist || [],
    ).patterns;

    const payload = /** @type {BrightModeSettingsBackupPayload} */ ({
      kind: 'bright-mode-settings',
      settings: {
        whitelist: normalizedWhitelist,
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
      console.warn(
        '[options-backup] parseHighlightTextRulesItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.rules)) {
      console.warn(
        '[options-backup] parseHighlightTextRulesItem: parsed.rules is not an array',
        typeof parsed?.rules,
      );
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeHighlightTextRules(parsed?.rules).rules;

    if (normalizedRules.length === 0 && parsed?.rules?.length > 0) {
      console.warn(
        '[options-backup] parseHighlightTextRulesItem: all rules were filtered out',
        'original count:',
        parsed?.rules?.length,
      );
    }

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
    console.error(
      '[options-backup] parseHighlightTextRulesItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse video enhancement rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: VideoEnhancementRulesBackupPayload | null, lastModified: number }}
 */
function parseVideoEnhancementRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(
        '[options-backup] parseVideoEnhancementRulesItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.rules)) {
      console.warn(
        '[options-backup] parseVideoEnhancementRulesItem: parsed.rules is not an array',
        typeof parsed?.rules,
      );
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeVideoEnhancementRules(parsed?.rules).rules;

    if (normalizedRules.length === 0 && parsed?.rules?.length > 0) {
      console.warn(
        '[options-backup] parseVideoEnhancementRulesItem: all rules were filtered out',
        'original count:',
        parsed?.rules?.length,
      );
    }

    const payload = /** @type {VideoEnhancementRulesBackupPayload} */ ({
      kind: 'video-enhancement-rules',
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
    console.error(
      '[options-backup] parseVideoEnhancementRulesItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse block element rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: BlockElementRulesBackupPayload | null, lastModified: number }}
 */
function parseBlockElementRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeBlockElementRules(parsed?.rules).rules;

    const payload = /** @type {BlockElementRulesBackupPayload} */ ({
      kind: 'block-element-rules',
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
 * Attempt to parse custom code rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: CustomCodeRulesBackupPayload | null, lastModified: number }}
 */
function parseCustomCodeRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeCustomCodeRules(parsed?.rules).rules;

    const payload = /** @type {CustomCodeRulesBackupPayload} */ ({
      kind: 'custom-code-rules',
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
 * Attempt to parse URL process rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: UrlProcessRulesBackupPayload | null, lastModified: number }}
 */
function parseUrlProcessRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(
        '[options-backup] parseUrlProcessRulesItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.rules)) {
      console.warn(
        '[options-backup] parseUrlProcessRulesItem: parsed.rules is not an array',
        typeof parsed?.rules,
      );
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeUrlProcessRules(parsed?.rules).rules;

    if (normalizedRules.length === 0 && parsed?.rules?.length > 0) {
      console.warn(
        '[options-backup] parseUrlProcessRulesItem: all rules were filtered out',
        'original count:',
        parsed?.rules?.length,
      );
    }

    const payload = /** @type {UrlProcessRulesBackupPayload} */ ({
      kind: 'url-process-rules',
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
    console.error(
      '[options-backup] parseUrlProcessRulesItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse LLM prompts payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: LLMPromptsBackupPayload | null, lastModified: number }}
 */
function parseLLMPromptsItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(
        '[options-backup] parseLLMPromptsItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.prompts)) {
      console.warn(
        '[options-backup] parseLLMPromptsItem: parsed.prompts is not an array',
        typeof parsed?.prompts,
      );
      return { payload: null, lastModified: 0 };
    }

    const normalizedPrompts = normalizeLLMPrompts(parsed?.prompts).prompts;

    if (normalizedPrompts.length === 0 && parsed?.prompts?.length > 0) {
      console.warn(
        '[options-backup] parseLLMPromptsItem: all prompts were filtered out',
        'original count:',
        parsed?.prompts?.length,
      );
    }

    const payload = /** @type {LLMPromptsBackupPayload} */ ({
      kind: 'llm-prompts',
      prompts: normalizedPrompts,
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
    console.error(
      '[options-backup] parseLLMPromptsItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse auto Google login rules payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: AutoGoogleLoginRulesBackupPayload | null, lastModified: number }}
 */
function parseAutoGoogleLoginRulesItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(
        '[options-backup] parseAutoGoogleLoginRulesItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.rules)) {
      console.warn(
        '[options-backup] parseAutoGoogleLoginRulesItem: parsed.rules is not an array',
        typeof parsed?.rules,
      );
      return { payload: null, lastModified: 0 };
    }

    const normalizedRules = normalizeAutoGoogleLoginRules(parsed?.rules).rules;

    if (normalizedRules.length === 0 && parsed?.rules?.length > 0) {
      console.warn(
        '[options-backup] parseAutoGoogleLoginRulesItem: all rules were filtered out',
        'original count:',
        parsed?.rules?.length,
      );
    }

    const payload = /** @type {AutoGoogleLoginRulesBackupPayload} */ ({
      kind: 'auto-google-login-rules',
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
              : '',
          arch:
            typeof parsed?.metadata?.device?.arch === 'string'
              ? parsed.metadata.device.arch
              : '',
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
    console.error(
      '[options-backup] parseAutoGoogleLoginRulesItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Attempt to parse pinned shortcuts payload from Raindrop.
 * @param {any} item
 * @returns {{ payload: PinnedShortcutsBackupPayload | null, lastModified: number }}
 */
function parsePinnedShortcutsItem(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note) {
    return { payload: null, lastModified: 0 };
  }

  try {
    const parsed = JSON.parse(note);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(
        '[options-backup] parsePinnedShortcutsItem: parsed is not an object',
      );
      return { payload: null, lastModified: 0 };
    }

    if (!Array.isArray(parsed?.shortcuts)) {
      console.warn(
        '[options-backup] parsePinnedShortcutsItem: parsed.shortcuts is not an array',
        typeof parsed?.shortcuts,
      );
      return { payload: null, lastModified: 0 };
    }

    // Valid shortcut IDs (excluding openOptions which is always shown)
    const normalizedShortcuts = parsed.shortcuts
      .filter(
        (id) =>
          typeof id === 'string' && VALID_PINNED_SHORTCUT_IDS.includes(id),
      )
      .slice(0, 6);

    const payload = /** @type {PinnedShortcutsBackupPayload} */ ({
      kind: 'pinned-shortcuts',
      shortcuts: normalizedShortcuts,
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
    console.error(
      '[options-backup] parsePinnedShortcutsItem failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { payload: null, lastModified: 0 };
  }
}

/**
 * Configuration for each backup category.
 */
const CATEGORY_CONFIG = {
  'auth-provider-settings': {
    title: 'auth-provider-settings',
    link: 'https://nenya.local/options/provider',
    buildPayload: buildAuthProviderPayload,
    parseItem: parseAuthProviderItem,
    applyPayload: applyRootFolderSettings,
  },
  'notification-preferences': {
    title: 'notification-preferences',
    link: 'https://nenya.local/options/notifications',
    buildPayload: buildNotificationsPayload,
    parseItem: parseNotificationItem,
    applyPayload: applyNotificationPreferences,
  },
  'auto-reload-rules': {
    title: 'auto-reload-rules',
    link: 'https://nenya.local/options/auto-reload',
    buildPayload: buildAutoReloadRulesPayload,
    parseItem: parseAutoReloadItem,
    applyPayload: applyAutoReloadRules,
  },
  'dark-mode-rules': {
    title: 'dark-mode-rules',
    link: 'https://nenya.local/options/dark-mode',
    buildPayload: buildDarkModeRulesPayload,
    parseItem: parseDarkModeRulesItem,
    applyPayload: applyDarkModeRules,
  },
  'bright-mode-settings': {
    title: 'bright-mode-settings',
    link: 'https://nenya.local/options/bright-mode',
    buildPayload: buildBrightModeSettingsPayload,
    parseItem: parseBrightModeSettingsItem,
    applyPayload: applyBrightModeSettings,
  },
  'highlight-text-rules': {
    title: 'highlight-text-rules',
    link: 'https://nenya.local/options/highlight-text',
    buildPayload: buildHighlightTextRulesPayload,
    parseItem: parseHighlightTextRulesItem,
    applyPayload: applyHighlightTextRules,
  },
  'video-enhancement-rules': {
    title: 'video-enhancement-rules',
    link: 'https://nenya.local/options/video-enhancements',
    buildPayload: buildVideoEnhancementRulesPayload,
    parseItem: parseVideoEnhancementRulesItem,
    applyPayload: applyVideoEnhancementRules,
  },
  'block-element-rules': {
    title: 'block-element-rules',
    link: 'https://nenya.local/options/block-elements',
    buildPayload: buildBlockElementRulesPayload,
    parseItem: parseBlockElementRulesItem,
    applyPayload: applyBlockElementRules,
  },
  'custom-code-rules': {
    title: 'custom-code-rules',
    link: 'https://nenya.local/options/custom-code',
    buildPayload: buildCustomCodeRulesPayload,
    parseItem: parseCustomCodeRulesItem,
    applyPayload: applyCustomCodeRules,
  },
  'llm-prompts': {
    title: 'llm-prompts',
    link: 'https://nenya.local/options/llm-prompts',
    buildPayload: buildLLMPromptsPayload,
    parseItem: parseLLMPromptsItem,
    applyPayload: applyLLMPrompts,
  },
  'url-process-rules': {
    title: 'url-process-rules',
    link: 'https://nenya.local/options/url-process-rules',
    buildPayload: buildUrlProcessRulesPayload,
    parseItem: parseUrlProcessRulesItem,
    applyPayload: applyUrlProcessRules,
  },
  'auto-google-login-rules': {
    title: 'auto-google-login-rules',
    link: 'https://nenya.local/options/auto-google-login',
    buildPayload: buildAutoGoogleLoginRulesPayload,
    parseItem: parseAutoGoogleLoginRulesItem,
    applyPayload: applyAutoGoogleLoginRules,
  },
  'screenshot-settings': {
    title: 'screenshot-settings',
    link: 'https://nenya.local/options/screenshot',
    buildPayload: buildScreenshotSettingsPayload,
    parseItem: parseScreenshotSettingsItem,
    applyPayload: applyScreenshotSettings,
  },
  'pinned-shortcuts': {
    title: 'pinned-shortcuts',
    link: 'https://nenya.local/options/pinned-shortcuts',
    buildPayload: buildPinnedShortcutsPayload,
    parseItem: parsePinnedShortcutsItem,
    applyPayload: applyPinnedShortcuts,
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
  // Use generic chunked backup for all categories
  return performCategoryBackupWithChunking(categoryId, trigger, notifyOnError);
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
 * Update Automerge sync state in storage.
 * @param {Partial<AutomergeSyncState>} updates - State updates
 * @returns {Promise<void>}
 */
async function updateAutomergeState(updates) {
  await updateState((state) => {
    if (!state.automerge) {
      state.automerge = {
        enabled: true,
        lastSyncAt: undefined,
        lastMergeAt: undefined,
        conflictsResolved: 0,
        documentSize: undefined,
        chunkCount: undefined,
        lastSyncError: undefined,
        lastSyncErrorAt: undefined,
      };
    }
    Object.assign(state.automerge, updates);
  });
}

/**
 * Ensure automerge state is present on BackupState.
 * @param {BackupState} state
 * @returns {AutomergeSyncState}
 */
function ensureAutomergeState(state) {
  if (!state.automerge) {
    state.automerge = {
      enabled: true,
      lastSyncAt: undefined,
      lastMergeAt: undefined,
      conflictsResolved: 0,
      documentSize: undefined,
      chunkCount: undefined,
      lastSyncError: undefined,
      lastSyncErrorAt: undefined,
    };
  }
  return state.automerge;
}

/**
 * Record a successful automerge sync into state and category timestamps.
 * @param {string} trigger
 * @param {{ merged?: boolean, conflictsResolved?: number, documentSize?: number, chunkCount?: number, pulled?: boolean, pushed?: boolean, remoteLastModifiedAt?: number }} syncInfo
 * @param {{ markBackup?: boolean, markRestore?: boolean, forceRestore?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function recordAutomergeSuccess(trigger, syncInfo, options = {}) {
  const now = Date.now();
  const pulled =
    Boolean(syncInfo?.pulled) ||
    Boolean(options.markRestore) ||
    Boolean(options.forceRestore);
  const pushed = Boolean(syncInfo?.pushed) || Boolean(options.markBackup);
  const remoteLastModifiedAt = Number(syncInfo?.remoteLastModifiedAt ?? 0);

  await updateState((state) => {
    const automerge = ensureAutomergeState(state);
    automerge.enabled = true;
    automerge.lastSyncAt = now;
    if (syncInfo?.merged || pulled) {
      automerge.lastMergeAt = now;
    }
    if (Number.isFinite(syncInfo?.conflictsResolved)) {
      automerge.conflictsResolved = Number(syncInfo.conflictsResolved);
    }
    if (Number.isFinite(syncInfo?.documentSize)) {
      automerge.documentSize = Number(syncInfo.documentSize);
    }
    if (Number.isFinite(syncInfo?.chunkCount)) {
      automerge.chunkCount = Number(syncInfo.chunkCount);
    }
    automerge.lastSyncError = undefined;
    automerge.lastSyncErrorAt = undefined;

    CATEGORY_IDS.forEach((categoryId) => {
      const category = state.categories[categoryId];
      if (!category) {
        return;
      }
      if (pushed) {
        category.lastBackupAt = now;
        category.lastBackupTrigger = trigger;
        category.lastBackupError = undefined;
        category.lastBackupErrorAt = undefined;
      }
      if (pulled) {
        category.lastRestoreAt = now;
        category.lastRestoreTrigger = trigger;
        category.lastRestoreError = undefined;
        category.lastRestoreErrorAt = undefined;
      }
      if (remoteLastModifiedAt > 0) {
        category.lastRemoteModifiedAt = remoteLastModifiedAt;
      }
    });
  });
}

/**
 * Record a failed automerge sync attempt.
 * @param {string} trigger
 * @param {string} message
 * @param {boolean} isBackupError
 * @returns {Promise<void>}
 */
async function recordAutomergeFailure(trigger, message, isBackupError) {
  const now = Date.now();
  const normalizedMessage = message || 'Sync failed';
  await updateState((state) => {
    const automerge = ensureAutomergeState(state);
    automerge.lastSyncError = normalizedMessage;
    automerge.lastSyncErrorAt = now;

    CATEGORY_IDS.forEach((categoryId) => {
      const category = state.categories[categoryId];
      if (!category) {
        return;
      }
      if (isBackupError) {
        category.lastBackupError = normalizedMessage;
        category.lastBackupErrorAt = now;
      } else {
        category.lastRestoreError = normalizedMessage;
        category.lastRestoreErrorAt = now;
      }
    });
  });
}

/**
 * Queue an Automerge sync operation (debounced).
 * @param {string} trigger - Reason for sync ('storage', 'manual', 'alarm', etc.)
 * @returns {void}
 */
function queueAutomergeSync(trigger) {
  if (trigger === 'manual') {
    pendingAutomergeTrigger = 'manual';
    if (automergeSyncDebounceTimer) {
      clearTimeout(automergeSyncDebounceTimer);
      automergeSyncDebounceTimer = null;
    }
    startAutomergeSyncRun();
    return;
  }

  if (pendingAutomergeTrigger !== 'manual') {
    pendingAutomergeTrigger = trigger;
  }

  if (automergeSyncDebounceTimer) {
    return;
  }

  automergeSyncDebounceTimer = setTimeout(() => {
    automergeSyncDebounceTimer = null;
    startAutomergeSyncRun();
  }, AUTOMERGE_SYNC_DEBOUNCE_MS);
}

function startAutomergeSyncRun() {
  automergeSyncQueued = true;

  if (automergeSyncRunning) {
    return;
  }

  automergeSyncRunning = true;

  const runLoop = async () => {
    while (automergeSyncQueued) {
      automergeSyncQueued = false;
      const trigger = pendingAutomergeTrigger;
      pendingAutomergeTrigger = 'storage';
      try {
        automergeApplyInProgress = true;
        const syncInfo = await syncWithRemote({
          forceRestore: false,
          trigger,
        });
        console.log('[automerge] Sync completed successfully');

        await recordAutomergeSuccess(trigger, syncInfo);

        if (syncInfo?.pulled) {
          try {
            await evaluateAllTabs();
          } catch (error) {
            console.warn(
              '[automerge] Failed to re-evaluate auto reload rules after sync:',
              error,
            );
          }
        }
      } catch (error) {
        console.error('[automerge] Sync failed:', error);

        await recordAutomergeFailure(
          trigger,
          error?.message || 'Sync failed',
          trigger === 'manual',
        );

        if (trigger === 'manual') {
          void pushNotification(
            'options-backup-error',
            'Options Sync Failed',
            `Failed to sync settings: ${error?.message || 'Unknown error'}`,
          );
        } else if (canNotify('automerge-sync')) {
          void pushNotification(
            'options-backup',
            'Options sync failed',
            error?.message || 'Failed to sync settings',
          );
        }
      } finally {
        automergeApplyInProgress = false;
      }
    }
    automergeSyncRunning = false;
  };

  void runLoop();
}

/**
 * Perform backups for all categories immediately using bulk operations.
 * Simple approach: delete all existing, create all new.
 * @param {string} trigger
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function performFullBackup(trigger) {
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      errors: [
        'No Raindrop connection found. Connect your account to sync backups.',
      ],
    };
  }

  const errors = [];

  try {
    // Step 1: Ensure collection exists
    const collectionId = await ensureBackupCollection(tokens);

    // Step 2: Fetch all existing backup items
    const existingItems = await loadBackupItemMap(tokens, collectionId);

    // Step 3: Prepare all category backup data
    /** @type {Array<{title: string, link: string, note: string, excerpt: string, collectionId: number, categoryId: string}>} */
    const allItemsToCreate = [];

    for (const categoryId of CATEGORY_IDS) {
      const config = CATEGORY_CONFIG[categoryId];
      if (!config) {
        continue;
      }

      try {
        const payload = await config.buildPayload(trigger);
        const serialized = JSON.stringify(payload);

        const MAX_CHUNK_SIZE = 10000;
        const chunks = [];

        // Split into chunks if needed
        if (serialized.length <= MAX_CHUNK_SIZE) {
          chunks.push(serialized);
        } else {
          for (let i = 0; i < serialized.length; i += MAX_CHUNK_SIZE) {
            chunks.push(serialized.slice(i, i + MAX_CHUNK_SIZE));
          }
        }

        // Add all chunks for this category
        for (let i = 0; i < chunks.length; i++) {
          const chunkNum = i + 1;
          const title = config.title + '-' + chunkNum;
          const link = config.link + '/' + chunkNum;

          allItemsToCreate.push({
            title,
            link,
            note: chunks[i],
            excerpt:
              chunks.length === 1
                ? ''
                : 'Chunk ' + chunkNum + ' of ' + chunks.length,
            collectionId,
            categoryId,
          });
        }
      } catch (error) {
        console.error(
          '[options-backup] Failed to prepare backup for ' + categoryId + ':',
          error,
        );
        errors.push('Failed to prepare backup for ' + categoryId);
      }
    }

    // Step 4: Delete ALL existing backup items in one bulk request
    const existingIds = [];
    for (const item of existingItems.values()) {
      const itemId = Number(item?._id ?? item?.id);
      if (Number.isFinite(itemId)) {
        existingIds.push(itemId);
      }
    }

    if (existingIds.length > 0) {
      try {
        await raindropRequest('/raindrops/' + collectionId, tokens, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ids: existingIds,
          }),
        });
      } catch (error) {
        console.warn(
          '[options-backup] Failed to delete existing items:',
          error,
        );
        errors.push('Failed to delete existing backup items');
      }
    }

    // Step 5: Create ALL new items in batches of 100 (Raindrop limit)
    const batchSize = 100;
    const createdItemsByCategory = new Map();

    for (let i = 0; i < allItemsToCreate.length; i += batchSize) {
      const batch = allItemsToCreate.slice(i, i + batchSize);
      try {
        const response = await raindropRequest('/raindrops', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: batch.map((item) => ({
              title: item.title,
              link: item.link,
              note: item.note,
              excerpt: item.excerpt,
              collectionId: item.collectionId,
              pleaseParse: {},
            })),
          }),
        });

        // Track created items by category
        const createdItems = response?.items || [];
        if (createdItems.length === 0) {
          console.error(
            '[options-backup] Bulk create returned no items. Response:',
            response,
          );
          throw new Error('Bulk create failed - no items returned');
        }

        for (let j = 0; j < batch.length && j < createdItems.length; j++) {
          const item = batch[j];
          const createdItem = createdItems[j];

          if (!createdItemsByCategory.has(item.categoryId)) {
            createdItemsByCategory.set(item.categoryId, []);
          }
          createdItemsByCategory.get(item.categoryId).push(createdItem);
        }
      } catch (error) {
        console.error(
          '[options-backup] Failed to create batch of items:',
          error,
        );
        errors.push(
          'Failed to create backup items: ' + String(error?.message || error),
        );

        // Mark affected categories as failed
        for (const item of batch) {
          await updateState((state) => {
            const categoryState = state.categories[item.categoryId];
            if (!categoryState) {
              return;
            }
            categoryState.lastBackupError =
              'Failed to save backup: ' + String(error?.message || error);
            categoryState.lastBackupErrorAt = Date.now();
          });
        }
      }
    }

    // Step 6: Update all category states with success
    for (const categoryId of CATEGORY_IDS) {
      const createdItems = createdItemsByCategory.get(categoryId) || [];

      if (createdItems.length > 0) {
        // Find the latest lastUpdate timestamp from created items
        let maxLastModified = 0;
        for (const item of createdItems) {
          const itemLastModified = parseTimestamp(item?.lastUpdate);
          if (itemLastModified > maxLastModified) {
            maxLastModified = itemLastModified;
          }
        }

        await updateState((state) => {
          const categoryState = state.categories[categoryId];
          if (!categoryState) {
            return;
          }
          categoryState.lastBackupAt = Date.now();
          categoryState.lastBackupTrigger = trigger;
          categoryState.lastBackupError = undefined;
          categoryState.lastBackupErrorAt = undefined;
          if (Number.isFinite(maxLastModified) && maxLastModified > 0) {
            categoryState.lastRemoteModifiedAt = maxLastModified;
          }
        });
      } else if (errors.length === 0) {
        // No items created for this category, but no errors either - still mark as success
        await updateState((state) => {
          const categoryState = state.categories[categoryId];
          if (!categoryState) {
            return;
          }
          categoryState.lastBackupAt = Date.now();
          categoryState.lastBackupTrigger = trigger;
          categoryState.lastBackupError = undefined;
          categoryState.lastBackupErrorAt = undefined;
        });
      }
    }
  } catch (error) {
    console.error('[options-backup] Full backup failed:', error);
    errors.push('Backup operation failed: ' + String(error?.message || error));
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
  if (!state || typeof state !== 'object') {
    return 0;
  }
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
      errors: [
        'No Raindrop connection found. Connect your account to restore settings.',
      ],
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

      // Use generic chunked restore for all categories
      const { payload, lastModified } = await restoreCategoryFromChunks(
        categoryId,
        tokens,
        collectionId,
        itemsMap,
      );

      if (!payload) {
        // Only add error if the category exists but data is invalid
        const titleKey = config.title.trim().toLowerCase();
        const hasAnyData =
          itemsMap.get(titleKey) || itemsMap.get(titleKey + '-1');
        if (hasAnyData) {
          errors.push('Invalid backup data for ' + categoryId + '.');
        }
        continue;
      }

      const categoryState = state.categories[categoryId];
      const remoteTimestamp = Number(lastModified);
      const localTimestamp = getLatestLocalTimestamp(categoryState);

      if (!remoteTimestamp || remoteTimestamp < 1) {
        continue;
      }

      // Always restore from remote (Raindrop is source of truth)

      try {
        // Handle different payload types correctly
        let payloadToApply;
        if (payload.kind === 'auth-provider-settings') {
          payloadToApply = payload.mirrorRootFolderSettings;
        } else if (payload.kind === 'auto-reload-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'dark-mode-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'bright-mode-settings') {
          payloadToApply = payload.settings;
        } else if (payload.kind === 'highlight-text-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'video-enhancement-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'block-element-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'custom-code-rules') {
          payloadToApply = payload;
        } else if (payload.kind === 'llm-prompts') {
          payloadToApply = payload.prompts;
        } else if (payload.kind === 'url-process-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'auto-google-login-rules') {
          payloadToApply = payload.rules;
        } else if (payload.kind === 'pinned-shortcuts') {
          payloadToApply = payload.shortcuts;
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
        console.error(
          '[options-backup] Failed to restore',
          categoryId,
          ':',
          error,
        );
        const message =
          error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error');
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
  if (areaName === 'sync' || areaName === 'local') {
    if (automergeApplyInProgress) {
      return;
    }

    const affectedCategories = getCategoriesForChanges(changes);
    const hasUnsuppressed =
      affectedCategories.length === 0 ||
      affectedCategories.some((categoryId) => !isBackupSuppressed(categoryId));

    if (!hasUnsuppressed) {
      return;
    }

    void applyStorageChangesToDoc(changes).catch((error) => {
      console.error('[options-backup] Failed to apply changes to Automerge:', error);
    });

    // Queue sync with remote (debounced)
    queueAutomergeSync('storage');
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
  queueAutomergeSync('alarm');
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
  queueAutomergeSync('focus');
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

  if (chrome?.storage?.onChanged && !storageListenerRegistered) {
    chrome.storage.onChanged.addListener(handleStorageChanges);
    storageListenerRegistered = true;
  }

  if (chrome?.alarms && !alarmListenerRegistered) {
    chrome.alarms.onAlarm.addListener(handleAlarm);
    alarmListenerRegistered = true;
    void scheduleRestoreAlarm();
  }

  if (chrome?.windows?.onFocusChanged && !focusListenerRegistered) {
    chrome.windows.onFocusChanged.addListener(handleWindowFocus);
    focusListenerRegistered = true;
  }

  console.log('[options-backup] Automerge backup service initialized');
}

/**
 * Handle lifecycle-triggered restore checks.
 * @param {string} trigger
 * @returns {Promise<void>}
 */
export async function handleOptionsBackupLifecycle(trigger) {
  initializeOptionsBackupService();

  const lifecycleTrigger = trigger || 'lifecycle';

  // Use Automerge sync for lifecycle restore
  try {
    automergeApplyInProgress = true;
    const syncInfo = await syncWithRemote({
      forceRestore: false,
      trigger: lifecycleTrigger,
    });
    await recordAutomergeSuccess(lifecycleTrigger, syncInfo);
    console.log('[options-backup] Lifecycle sync completed');

    if (syncInfo?.pulled) {
      try {
        await evaluateAllTabs();
      } catch (error) {
        console.warn(
          '[options-backup] Failed to re-evaluate auto reload rules after lifecycle sync:',
          error,
        );
      }
    }
  } catch (error) {
    console.error('[options-backup] Lifecycle sync failed:', error);
    await recordAutomergeFailure(
      lifecycleTrigger,
      error?.message || 'Lifecycle sync failed',
      false,
    );
  } finally {
    automergeApplyInProgress = false;
  }
}

/**
 * Execute a manual backup request.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualBackup() {
  initializeOptionsBackupService();

  // Use Automerge sync for manual backup
  try {
    automergeApplyInProgress = true;
    const syncInfo = await syncWithRemote({
      forceRestore: false,
      trigger: 'manual',
    });

    await recordAutomergeSuccess('manual', syncInfo, { markBackup: true });
    const state = await loadState();

    return {
      ok: true,
      errors: [],
      state,
    };
  } catch (error) {
    console.error('[options-backup] Manual backup failed:', error);

    await recordAutomergeFailure(
      'manual',
      error?.message || 'Manual backup failed',
      true,
    );
    return {
      ok: false,
      errors: [error?.message || 'Manual backup failed'],
      state: await loadState(),
    };
  } finally {
    automergeApplyInProgress = false;
  }
}

/**
 * Execute a manual restore request.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runManualRestore() {
  initializeOptionsBackupService();

  // Use Automerge sync with force restore
  try {
    automergeApplyInProgress = true;
    const syncInfo = await syncWithRemote({
      forceRestore: true,
      trigger: 'manual-restore',
    });

    await recordAutomergeSuccess('manual-restore', syncInfo, {
      markRestore: true,
      forceRestore: true,
    });

    try {
      await evaluateAllTabs();
    } catch (error) {
      console.warn(
        '[options-backup] Failed to re-evaluate auto reload rules after manual restore:',
        error,
      );
    }

    const state = await loadState();

    return {
      ok: true,
      errors: [],
      state,
    };
  } catch (error) {
    console.error('[options-backup] Manual restore failed:', error);

    await recordAutomergeFailure(
      'manual-restore',
      error?.message || 'Manual restore failed',
      false,
    );
    return {
      ok: false,
      errors: [error?.message || 'Manual restore failed'],
      state: await loadState(),
    };
  } finally {
    automergeApplyInProgress = false;
  }
}

/**
 * Execute a restore triggered immediately after login.
 * @returns {Promise<{ ok: boolean, errors: string[], state: BackupState }>}
 */
export async function runLoginRestore() {
  initializeOptionsBackupService();
  try {
    automergeApplyInProgress = true;
    const syncInfo = await syncWithRemote({
      forceRestore: false,
      trigger: 'login',
    });

    await recordAutomergeSuccess('login', syncInfo, { markRestore: true });

    if (syncInfo?.pulled) {
      try {
        await evaluateAllTabs();
      } catch (error) {
        console.warn(
          '[options-backup] Failed to re-evaluate auto reload rules after login restore:',
          error,
        );
      }
    }

    const state = await loadState();
    return {
      ok: true,
      errors: [],
      state,
    };
  } catch (error) {
    await recordAutomergeFailure(
      'login',
      error?.message || 'Login sync failed',
      false,
    );
    return {
      ok: false,
      errors: [error?.message || 'Login sync failed'],
      state: await loadState(),
    };
  } finally {
    automergeApplyInProgress = false;
  }
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
  suppressBackup('dark-mode-rules');
  suppressBackup('bright-mode-settings');
  suppressBackup('highlight-text-rules');
  suppressBackup('video-enhancement-rules');
  suppressBackup('block-element-rules');
  suppressBackup('custom-code-rules');
  suppressBackup('llm-prompts');
  suppressBackup('url-process-rules');
  suppressBackup('auto-google-login-rules');
  suppressBackup('pinned-shortcuts');
  suppressBackup('screenshot-settings');

  const defaultPreferences = JSON.parse(
    JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES),
  );

  await Promise.all([
    chrome.storage.sync.set({
      [ROOT_FOLDER_SETTINGS_KEY]: {
        [PROVIDER_ID]: {
          parentFolderId: DEFAULT_PARENT_FOLDER_ID,
          rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
        },
      },
      [NOTIFICATION_PREFERENCES_KEY]: defaultPreferences,
      [AUTO_RELOAD_RULES_KEY]: [],
      [DARK_MODE_RULES_KEY]: [],
      [BRIGHT_MODE_WHITELIST_KEY]: [],
      [HIGHLIGHT_TEXT_RULES_KEY]: [],
      [VIDEO_ENHANCEMENT_RULES_KEY]: [],
      [BLOCK_ELEMENT_RULES_KEY]: [],
      [LLM_PROMPTS_KEY]: [],
      [URL_PROCESS_RULES_KEY]: [],
      [AUTO_GOOGLE_LOGIN_RULES_KEY]: [],
      [SCREENSHOT_SETTINGS_KEY]: { autoSave: false },
      [PINNED_SHORTCUTS_KEY]: [],
    }),
    chrome.storage.local.set({
      [CUSTOM_CODE_RULES_KEY]: [],
    }),
  ]);

  await updateState((state) => {
    CATEGORY_IDS.forEach((categoryId) => {
      state.categories[categoryId] = createDefaultCategoryState();
    });
  });

  try {
    automergeApplyInProgress = true;
    const syncInfo = await syncWithRemote({
      forceRestore: false,
      trigger: 'reset',
    });
    await recordAutomergeSuccess('reset', syncInfo, { markBackup: true });
    const state = await loadState();
    return {
      ok: true,
      errors: [],
      state,
    };
  } catch (error) {
    await recordAutomergeFailure(
      'reset',
      error?.message || 'Reset backup failed',
      true,
    );
    return {
      ok: false,
      errors: [error?.message || 'Reset backup failed'],
      state: await loadState(),
    };
  } finally {
    automergeApplyInProgress = false;
  }
}

/**
 * Retrieve the latest backup status snapshot.
 * Since we've migrated to Automerge-based sync, clear any legacy JSON backup errors.
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
    actorId: getAutomergeActorId(),
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
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
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
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
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
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
          });
        });
      return true;
    }
    case OPTIONS_BACKUP_MESSAGES.SYNC_AFTER_LOGIN:
    case OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN: {
      void runLoginRestore()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            errors: [
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
            ],
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
            error:
              error instanceof Error
                ? error.message
                : String(error ?? 'Unknown error'),
          });
        });
      return true;
    }
    default:
      return false;
  }
}
