/* global chrome */

import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import { getWhitelistPatterns, getBlacklistPatterns, setPatterns, isValidUrlPattern } from './brightMode.js';
import { loadRules as loadHighlightTextRules } from './highlightText.js';

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
 * @typedef {RootFolderBackupSettings} RootFolderImportSettings
 */

/**
 * @typedef {Object} AutoReloadRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSeconds
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
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
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
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
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} ignoreCase
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ExportPayload
 * @property {string} provider
 * @property {RootFolderBackupSettings} mirrorRootFolderSettings
 * @property {NotificationPreferences} notificationPreferences
 * @property {AutoReloadRuleSettings[]} autoReloadRules
 * @property {BrightModeSettings} brightModeSettings
 * @property {HighlightTextRuleSettings[]} highlightTextRules
 */

/**
 * @typedef {Object} ExportFile
 * @property {number} version
 * @property {ExportPayload} data
 */

const PROVIDER_ID = 'raindrop';
const EXPORT_VERSION = 5;
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const BRIGHT_MODE_WHITELIST_KEY = 'brightModeWhitelist';
const BRIGHT_MODE_BLACKLIST_KEY = 'brightModeBlacklist';
const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const MIN_RULE_INTERVAL_SECONDS = 5;
const DEFAULT_PARENT_PATH = '/Bookmarks Bar';

const importButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsImportButton')
);
const exportButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('optionsExportButton')
);
const fileInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('optionsImportFileInput')
);

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

/**
 * Show a toast via Toastify when available.
 * @param {string} message
 * @param {ToastVariant} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  const background = TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;
  if (typeof windowWithToastify.Toastify === 'function') {
    windowWithToastify.Toastify({
      text: message,
      duration: 4000,
      gravity: 'top',
      position: 'right',
      close: true,
      style: { background },
    }).showToast();
    return;
  }
  // Fallback
  try {
    // eslint-disable-next-line no-alert
    alert(message);
  } catch (_) {
    // ignore
  }
}

/**
 * Deep clone helper for preferences.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function clonePreferences(value) {
  return {
    enabled: Boolean(value?.enabled),
    bookmark: {
      enabled: Boolean(value?.bookmark?.enabled),
      pullFinished: Boolean(value?.bookmark?.pullFinished),
      unsortedSaved: Boolean(value?.bookmark?.unsortedSaved),
    },
    project: {
      enabled: Boolean(value?.project?.enabled),
      saveProject: Boolean(value?.project?.saveProject),
      addTabs: Boolean(value?.project?.addTabs),
      replaceItems: Boolean(value?.project?.replaceItems),
      deleteProject: Boolean(value?.project?.deleteProject),
    },
  };
}

/**
 * Generate a stable identifier for auto reload rules lacking one.
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
 * Sort rules in a stable order for exports.
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
 * Normalize auto reload rules read from storage or input.
 * @param {unknown} value
 * @returns {AutoReloadRuleSettings[]}
 */
function normalizeAutoReloadRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {AutoReloadRuleSettings[]} */
  const sanitized = [];

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
      // Throws if invalid
      // eslint-disable-next-line no-new
      new URLPattern(pattern);
    } catch (error) {
      console.warn('[importExport:autoReload] Ignoring invalid pattern:', pattern, error);
      return;
    }

    const intervalCandidate = Math.floor(Number(raw.intervalSeconds));
    const intervalSeconds =
      Number.isFinite(intervalCandidate) && intervalCandidate > 0
        ? Math.max(MIN_RULE_INTERVAL_SECONDS, intervalCandidate)
        : MIN_RULE_INTERVAL_SECONDS;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {AutoReloadRuleSettings} */
    const normalized = {
      id,
      pattern,
      intervalSeconds,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sortAutoReloadRules(sanitized);
}

/**
 * Normalize bright mode patterns from storage or input.
 * @param {unknown} value
 * @returns {BrightModePatternSettings[]}
 */
function normalizeBrightModePatterns(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {BrightModePatternSettings[]} */
  const sanitized = [];

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

    if (!isValidUrlPattern(pattern)) {
      console.warn('[importExport:brightMode] Ignoring invalid pattern:', pattern);
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {BrightModePatternSettings} */
    const normalized = {
      id,
      pattern,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Normalize highlight text rules from storage or input.
 * @param {unknown} value
 * @returns {HighlightTextRuleSettings[]}
 */
function normalizeHighlightTextRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {HighlightTextRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw = /** @type {{ id?: unknown, pattern?: unknown, type?: unknown, value?: unknown, textColor?: unknown, backgroundColor?: unknown, bold?: unknown, italic?: unknown, underline?: unknown, ignoreCase?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
    const pattern =
      typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn('[importExport:highlightText] Ignoring invalid pattern:', pattern);
      return;
    }

    const type = raw.type;
    if (typeof type !== 'string' || !['whole-phrase', 'comma-separated', 'regex'].includes(type)) {
      console.warn('[importExport:highlightText] Ignoring invalid type:', type);
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
        console.warn('[importExport:highlightText] Ignoring invalid regex:', valueText, error);
        return;
      }
    }

    const textColor = typeof raw.textColor === 'string' ? raw.textColor : '#000000';
    const backgroundColor = typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#ffff00';
    const bold = typeof raw.bold === 'boolean' ? raw.bold : false;
    const italic = typeof raw.italic === 'boolean' ? raw.italic : false;
    const underline = typeof raw.underline === 'boolean' ? raw.underline : false;
    const ignoreCase = typeof raw.ignoreCase === 'boolean' ? raw.ignoreCase : false;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {HighlightTextRuleSettings} */
    const normalized = {
      id,
      pattern,
      type: /** @type {'whole-phrase' | 'comma-separated' | 'regex'} */ (type),
      value: valueText,
      textColor,
      backgroundColor,
      bold,
      italic,
      underline,
      ignoreCase,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Normalize possibly partial preferences.
 * @param {unknown} value
 * @returns {NotificationPreferences}
 */
function normalizePreferences(value) {
  const fallback = clonePreferences({
    enabled: true,
    bookmark: { enabled: true, pullFinished: true, unsortedSaved: true },
    project: {
      enabled: true,
      saveProject: true,
      addTabs: true,
      replaceItems: true,
      deleteProject: true,
    },
  });
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const raw = /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings> }} */ (value);
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled: typeof bookmark.enabled === 'boolean' ? bookmark.enabled : fallback.bookmark.enabled,
      pullFinished: typeof bookmark.pullFinished === 'boolean' ? bookmark.pullFinished : fallback.bookmark.pullFinished,
      unsortedSaved: typeof bookmark.unsortedSaved === 'boolean' ? bookmark.unsortedSaved : fallback.bookmark.unsortedSaved,
    },
    project: {
      enabled: typeof project.enabled === 'boolean' ? project.enabled : fallback.project.enabled,
      saveProject: typeof project.saveProject === 'boolean' ? project.saveProject : fallback.project.saveProject,
      addTabs: typeof project.addTabs === 'boolean' ? project.addTabs : fallback.project.addTabs,
      replaceItems: typeof project.replaceItems === 'boolean' ? project.replaceItems : fallback.project.replaceItems,
      deleteProject: typeof project.deleteProject === 'boolean' ? project.deleteProject : fallback.project.deleteProject,
    },
  };
}

/**
 * Read current settings used by Options backup.
 * @returns {Promise<{ rootFolder: RootFolderBackupSettings, notifications: NotificationPreferences, autoReloadRules: AutoReloadRuleSettings[], brightModeSettings: BrightModeSettings, highlightTextRules: HighlightTextRuleSettings[] }>}
 */
async function readCurrentOptions() {
  const [rootResp, notifResp, reloadResp, whitelistPatterns, blacklistPatterns, highlightTextRules] = await Promise.all([
    chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY),
    chrome.storage.sync.get(NOTIFICATION_PREFERENCES_KEY),
    chrome.storage.sync.get(AUTO_RELOAD_RULES_KEY),
    getWhitelistPatterns(),
    getBlacklistPatterns(),
    loadHighlightTextRules(),
  ]);

  /** @type {Record<string, RootFolderSettings> | undefined} */
  const rootMap = /** @type {*} */ (rootResp?.[ROOT_FOLDER_SETTINGS_KEY]);
  const rootCandidate = rootMap?.[PROVIDER_ID];
  const parentFolderId =
    typeof rootCandidate?.parentFolderId === 'string' && rootCandidate.parentFolderId
      ? rootCandidate.parentFolderId
      : '1';
  const rootFolderName =
    typeof rootCandidate?.rootFolderName === 'string' && rootCandidate.rootFolderName
      ? rootCandidate.rootFolderName
      : 'Raindrop';

  let parentFolderPath = '';
  try {
    parentFolderPath = await getBookmarkFolderPath(parentFolderId);
  } catch (error) {
    console.warn(
      '[importExport] Failed to resolve parent folder path for export:',
      error,
    );
  }
  if (!parentFolderPath) {
    parentFolderPath = DEFAULT_PARENT_PATH;
  }

  /** @type {RootFolderBackupSettings} */
  const rootFolder = {
    parentFolderId,
    parentFolderPath,
    rootFolderName,
  };

  const notifications = normalizePreferences(
    notifResp?.[NOTIFICATION_PREFERENCES_KEY],
  );
  const autoReloadRules = normalizeAutoReloadRules(
    reloadResp?.[AUTO_RELOAD_RULES_KEY],
  );
  
  const brightModeSettings = {
    whitelist: whitelistPatterns,
    blacklist: blacklistPatterns,
  };
  
  return { rootFolder, notifications, autoReloadRules, brightModeSettings, highlightTextRules };
}

/**
 * Trigger a download of the given data as a JSON file.
 * @param {any} data
 * @param {string} filename
 */
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Export current options to a JSON file.
 * @returns {Promise<void>}
 */
async function handleExportClick() {
  try {
    const { rootFolder, notifications, autoReloadRules, brightModeSettings, highlightTextRules } = await readCurrentOptions();
    /** @type {ExportFile} */
    const payload = {
      version: EXPORT_VERSION,
      data: {
        provider: PROVIDER_ID,
        mirrorRootFolderSettings: rootFolder,
        notificationPreferences: notifications,
        autoReloadRules,
        brightModeSettings,
        highlightTextRules,
      },
    };
    const now = new Date();
    const YYYY = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const filename = 'nenya-options-' + YYYY + MM + DD + '-' + HH + mm + '.json';
    downloadJson(payload, filename);
    showToast('Exported options to ' + filename, 'success');
  } catch (error) {
    console.warn('[importExport] Export failed:', error);
    showToast('Failed to export options.', 'error');
  }
}

/**
 * Apply imported settings to storage.
 * @param {RootFolderImportSettings} rootFolder
 * @param {NotificationPreferences} notifications
 * @param {AutoReloadRuleSettings[]} autoReloadRules
 * @param {BrightModeSettings} brightModeSettings
 * @param {HighlightTextRuleSettings[]} highlightTextRules
 * @returns {Promise<void>}
 */
async function applyImportedOptions(rootFolder, notifications, autoReloadRules, brightModeSettings, highlightTextRules) {
  let parentFolderId = '';
  const desiredPath =
    typeof rootFolder?.parentFolderPath === 'string'
      ? rootFolder.parentFolderPath.trim()
      : '';

  if (desiredPath) {
    try {
      const ensuredId = await ensureBookmarkFolderPath(desiredPath);
      if (ensuredId) {
        parentFolderId = ensuredId;
      }
    } catch (error) {
      console.warn(
        '[importExport] Failed to ensure parent folder path during import:',
        error,
      );
    }
  }

  if (!parentFolderId) {
    parentFolderId =
      typeof rootFolder?.parentFolderId === 'string' &&
      rootFolder.parentFolderId
        ? rootFolder.parentFolderId
        : '';
  }

  if (!parentFolderId) {
    parentFolderId = '1';
  }

  // Sanitize
  const sanitizedRoot = {
    parentFolderId,
    rootFolderName: typeof rootFolder?.rootFolderName === 'string' && rootFolder.rootFolderName ? rootFolder.rootFolderName : 'Raindrop',
  };
  const sanitizedNotifications = normalizePreferences(notifications);
  const sanitizedRules = normalizeAutoReloadRules(autoReloadRules);
  const sanitizedHighlightTextRules = normalizeHighlightTextRules(highlightTextRules || []);
  
  // Handle bright mode settings - support both old and new format
  let sanitizedWhitelist = [];
  let sanitizedBlacklist = [];
  
  if (brightModeSettings && typeof brightModeSettings === 'object') {
    // New format: { whitelist: [...], blacklist: [...] }
    sanitizedWhitelist = normalizeBrightModePatterns(brightModeSettings.whitelist || []);
    sanitizedBlacklist = normalizeBrightModePatterns(brightModeSettings.blacklist || []);
  } else {
    // Fallback for old format or missing data
    sanitizedWhitelist = [];
    sanitizedBlacklist = [];
  }

  // Read existing map to preserve other providers if any
  const existing = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings>} */
  const map = /** @type {*} */ (existing?.[ROOT_FOLDER_SETTINGS_KEY]) || {};
  map[PROVIDER_ID] = sanitizedRoot;

  // Persist all keys
  await chrome.storage.sync.set({
    [ROOT_FOLDER_SETTINGS_KEY]: map,
    [NOTIFICATION_PREFERENCES_KEY]: sanitizedNotifications,
    [AUTO_RELOAD_RULES_KEY]: sanitizedRules,
    [BRIGHT_MODE_WHITELIST_KEY]: sanitizedWhitelist,
    [BRIGHT_MODE_BLACKLIST_KEY]: sanitizedBlacklist,
    [HIGHLIGHT_TEXT_RULES_KEY]: sanitizedHighlightTextRules,
  });
}

/**
 * Handle selected import file.
 * @returns {Promise<void>}
 */
async function handleFileChosen() {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return;
  }
  const file = fileInput.files[0];
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid file.');
    }

    /** @type {any} */
    const data = parsed.data ?? parsed;
    const provider = typeof data?.provider === 'string' ? data.provider : PROVIDER_ID;
    if (provider !== PROVIDER_ID) {
      throw new Error('Unsupported provider in file.');
    }

    const root = /** @type {RootFolderImportSettings} */ (
      data.mirrorRootFolderSettings
    );
    const notifications = /** @type {NotificationPreferences} */ (
      data.notificationPreferences
    );
    const autoReloadRules = /** @type {AutoReloadRuleSettings[]} */ (
      data.autoReloadRules
    );
    const highlightTextRules = /** @type {HighlightTextRuleSettings[]} */ (
      data.highlightTextRules || []
    );
    
    // Handle bright mode settings - support both old and new format
    let brightModeSettings = data.brightModeSettings;
    if (!brightModeSettings && (data.brightModeWhitelist || data.brightModeBlacklist)) {
      // Convert old format to new format
      brightModeSettings = {
        whitelist: data.brightModeWhitelist || [],
        blacklist: data.brightModeBlacklist || [],
      };
    }
    brightModeSettings = brightModeSettings || { whitelist: [], blacklist: [] };

    await applyImportedOptions(root, notifications, autoReloadRules, brightModeSettings, highlightTextRules);
    showToast('Options imported successfully.', 'success');
  } catch (error) {
    console.warn('[importExport] Import failed:', error);
    showToast('Failed to import options. Please select a valid export file.', 'error');
  } finally {
    // Reset input to allow re-selecting the same file
    fileInput.value = '';
  }
}

/**
 * Initialize listeners for import/export controls.
 * @returns {void}
 */
function initImportExport() {
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      void handleExportClick();
    });
  }
  if (importButton && fileInput) {
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      void handleFileChosen();
    });
  }
}

initImportExport();
