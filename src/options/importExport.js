/* global chrome */

import {
  getBookmarkFolderPath,
  ensureBookmarkFolderPath,
} from '../shared/bookmarkFolders.js';
import {
  getWhitelistPatterns,
  setPatterns,
  isValidUrlPattern,
} from './brightMode.js';
import { loadRules as loadHighlightTextRules } from './highlightText.js';
import { loadRules as loadVideoEnhancementRules } from './videoEnhancements.js';
import { loadLLMPrompts } from './llmPrompts.js';
import { loadRules as loadUrlProcessRules } from './urlProcessRules.js';
import { loadRules as loadAutoGoogleLoginRules } from './autoGoogleLogin.js';

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
 * @typedef {Object} BrightModePatternSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
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
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} VideoEnhancementRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {'url-pattern' | 'wildcard'} patternType
 * @property {{ autoFullscreen: boolean }} enhancements
 * @property {boolean} [disabled]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} BlockElementRuleSettings
 * @property {string} id
 * @property {string} urlPattern
 * @property {string[]} selectors
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} CustomCodeRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} LLMPromptSettings
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {'add' | 'replace' | 'remove'} ProcessorType
 */

/**
 * @typedef {'copy-to-clipboard' | 'save-to-raindrop'} ApplyWhenOption
 */

/**
 * @typedef {Object} UrlProcessor
 * @property {string} id
 * @property {ProcessorType} type
 * @property {string} name - Parameter name (string or regex pattern)
 * @property {string} [value] - Value for add/replace processors
 */

/**
 * @typedef {Object} UrlProcessRuleSettings
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {UrlProcessor[]} processors
 * @property {ApplyWhenOption[]} applyWhen - When to apply this rule
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} AutoGoogleLoginRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {string} [email]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ScreenshotSettings
 * @property {boolean} autoSave
 */

/**
 * @typedef {Object} ExportPayload
 * @property {string} provider
 * @property {RootFolderBackupSettings} mirrorRootFolderSettings
 * @property {NotificationPreferences} notificationPreferences
 * @property {AutoReloadRuleSettings[]} autoReloadRules
 * @property {BrightModeSettings} brightModeSettings
 * @property {HighlightTextRuleSettings[]} highlightTextRules
 * @property {VideoEnhancementRuleSettings[]} videoEnhancementRules
 * @property {BlockElementRuleSettings[]} blockElementRules
 * @property {CustomCodeRuleSettings[]} customCodeRules
 * @property {LLMPromptSettings[]} llmPrompts
 * @property {UrlProcessRuleSettings[]} urlProcessRules
 * @property {AutoGoogleLoginRuleSettings[]} autoGoogleLoginRules
 * @property {ScreenshotSettings} screenshotSettings
 * @property {string[]} pinnedShortcuts
 */

/**
 * @typedef {Object} ExportFile
 * @property {number} version
 * @property {ExportPayload} data
 */

const PROVIDER_ID = 'raindrop';
const EXPORT_VERSION = 11;
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
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
  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;
  if (typeof windowWithToastify.Toastify === 'function') {
    windowWithToastify
      .Toastify({
        text: message,
        duration: 4000,
        gravity: 'top',
        position: 'right',
        close: true,
        style: { background },
      })
      .showToast();
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
    clipboard: {
      enabled: Boolean(value?.clipboard?.enabled),
      copySuccess: Boolean(value?.clipboard?.copySuccess),
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
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    try {
      // Throws if invalid
      // eslint-disable-next-line no-new
      new URLPattern(pattern);
    } catch (error) {
      console.warn(
        '[importExport:autoReload] Ignoring invalid pattern:',
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
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:brightMode] Ignoring invalid pattern:',
        pattern,
      );
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
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, type?: unknown, value?: unknown, textColor?: unknown, backgroundColor?: unknown, bold?: unknown, italic?: unknown, underline?: unknown, ignoreCase?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:highlightText] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const type = raw.type;
    if (
      typeof type !== 'string' ||
      !['whole-phrase', 'comma-separated', 'regex'].includes(type)
    ) {
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
        console.warn(
          '[importExport:highlightText] Ignoring invalid regex:',
          valueText,
          error,
        );
        return;
      }
    }

    const textColor =
      typeof raw.textColor === 'string' ? raw.textColor : '#000000';
    const backgroundColor =
      typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#ffff00';
    const bold = typeof raw.bold === 'boolean' ? raw.bold : false;
    const italic = typeof raw.italic === 'boolean' ? raw.italic : false;
    const underline =
      typeof raw.underline === 'boolean' ? raw.underline : false;
    const ignoreCase =
      typeof raw.ignoreCase === 'boolean' ? raw.ignoreCase : false;

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
 * Validate wildcard patterns used by video enhancements.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidEnhancementWildcardPattern(pattern) {
  const value = pattern.trim();
  if (!value) {
    return false;
  }
  return !/\s/.test(value);
}

/**
 * Normalize video enhancement rules from storage or input.
 * @param {unknown} value
 * @returns {VideoEnhancementRuleSettings[]}
 */
function normalizeVideoEnhancementRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {VideoEnhancementRuleSettings[]} */
  const sanitized = [];

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

    /** @type {'url-pattern' | 'wildcard'} */
    const patternType =
      raw.patternType === 'wildcard' ? 'wildcard' : 'url-pattern';

    if (
      (patternType === 'url-pattern' && !isValidUrlPattern(pattern)) ||
      (patternType === 'wildcard' && !isValidEnhancementWildcardPattern(pattern))
    ) {
      console.warn(
        '[importExport:videoEnhancements] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const autoFullscreen =
      typeof raw.enhancements?.autoFullscreen === 'boolean'
        ? raw.enhancements.autoFullscreen
        : false;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {VideoEnhancementRuleSettings} */
    const normalized = {
      id,
      pattern,
      patternType,
      enhancements: {
        autoFullscreen,
      },
      disabled: Boolean(raw.disabled),
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    if (aTime === bTime) {
      return a.pattern.localeCompare(b.pattern);
    }
    return bTime - aTime;
  });
}

/**
 * Normalize block element rules from storage or input.
 * @param {unknown} value
 * @returns {BlockElementRuleSettings[]}
 */
function normalizeBlockElementRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {BlockElementRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, urlPattern?: unknown, selectors?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const urlPattern =
      typeof raw.urlPattern === 'string' ? raw.urlPattern.trim() : '';
    if (!urlPattern) {
      return;
    }

    if (!isValidUrlPattern(urlPattern)) {
      console.warn(
        '[importExport:blockElements] Ignoring invalid pattern:',
        urlPattern,
      );
      return;
    }

    const selectors = Array.isArray(raw.selectors)
      ? raw.selectors.filter((s) => typeof s === 'string' && s.trim())
      : [];

    if (selectors.length === 0) {
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {BlockElementRuleSettings} */
    const normalized = {
      id,
      urlPattern,
      selectors,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.urlPattern.localeCompare(b.urlPattern));
}

/**
 * Normalize custom code rules from storage or input.
 * @param {unknown} value
 * @returns {CustomCodeRuleSettings[]}
 */
function normalizeCustomCodeRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {CustomCodeRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, css?: unknown, js?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:customCode] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const css = typeof raw.css === 'string' ? raw.css : '';
    const js = typeof raw.js === 'string' ? raw.js : '';

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {CustomCodeRuleSettings} */
    const normalized = {
      id,
      pattern,
      css,
      js,
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
 * Normalize LLM prompts from storage or input.
 * @param {unknown} value
 * @returns {LLMPromptSettings[]}
 */
function normalizeLLMPrompts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {LLMPromptSettings[]} */
  const sanitized = [];

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

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {LLMPromptSettings} */
    const normalized = {
      id,
      name,
      prompt,
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize URL process rules from storage or input.
 * @param {unknown} value
 * @returns {UrlProcessRuleSettings[]}
 */
function normalizeUrlProcessRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {UrlProcessRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, processors?: unknown, applyWhen?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return;
    }

    const urlPatterns = Array.isArray(raw.urlPatterns)
      ? raw.urlPatterns
          .map((p) => (typeof p === 'string' ? p.trim() : ''))
          .filter((p) => p && isValidUrlPattern(p))
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

            /** @type {UrlProcessor} */
            const processor = {
              id: procId,
              type: /** @type {'add' | 'replace' | 'remove'} */ (type),
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
          ['copy-to-clipboard', 'save-to-raindrop'].includes(aw),
        )
      : [];
    if (applyWhen.length === 0) {
      return;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {UrlProcessRuleSettings} */
    const normalized = {
      id,
      name,
      urlPatterns,
      processors,
      applyWhen: /** @type {ApplyWhenOption[]} */ (applyWhen),
    };

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize auto Google login rules from storage or input.
 * @param {unknown} value
 * @returns {AutoGoogleLoginRuleSettings[]}
 */
function normalizeAutoGoogleLoginRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {AutoGoogleLoginRuleSettings[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, email?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    if (!isValidUrlPattern(pattern)) {
      console.warn(
        '[importExport:autoGoogleLogin] Ignoring invalid pattern:',
        pattern,
      );
      return;
    }

    const email = typeof raw.email === 'string' ? raw.email.trim() : undefined;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.warn(
          '[importExport:autoGoogleLogin] Ignoring invalid email:',
          email,
        );
        return;
      }
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    /** @type {AutoGoogleLoginRuleSettings} */
    const normalized = {
      id,
      pattern,
    };

    if (email) {
      normalized.email = email;
    }

    if (typeof raw.createdAt === 'string') {
      normalized.createdAt = raw.createdAt;
    }
    if (typeof raw.updatedAt === 'string') {
      normalized.updatedAt = raw.updatedAt;
    }

    sanitized.push(normalized);
  });

  return sanitized.sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    const emailA = a.email || '';
    const emailB = b.email || '';
    return emailA.localeCompare(emailB);
  });
}

/**
 * Normalize pinned shortcuts array.
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizePinnedShortcuts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  // Valid shortcut IDs (excluding openOptions which is always shown)
  const validIds = [
    'getMarkdown',
    'pull',
    'saveUnsorted',
    'importCustomCode',
    'customFilter',
    'splitPage',
    'autoReload',
    'brightMode',
    'highlightText',
    'customCode',
  ];

  return value
    .filter((id) => typeof id === 'string' && validIds.includes(id))
    .slice(0, 6); // Limit to max 6 shortcuts
}

/**
 * Normalize screenshot settings.
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
    clipboard: {
      enabled: true,
      copySuccess: true,
    },
  });
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
 * Read current settings used by Options backup.
 * @returns {Promise<{ rootFolder: RootFolderBackupSettings, notifications: NotificationPreferences, autoReloadRules: AutoReloadRuleSettings[], brightModeSettings: BrightModeSettings, highlightTextRules: HighlightTextRuleSettings[], videoEnhancementRules: VideoEnhancementRuleSettings[], blockElementRules: BlockElementRuleSettings[], customCodeRules: CustomCodeRuleSettings[], llmPrompts: LLMPromptSettings[], urlProcessRules: UrlProcessRuleSettings[], autoGoogleLoginRules: AutoGoogleLoginRuleSettings[], screenshotSettings: ScreenshotSettings, pinnedShortcuts: string[] }>}
 */
async function readCurrentOptions() {
  const [
    rootResp,
    notifResp,
    reloadResp,
    whitelistPatterns,
    highlightTextRules,
    videoEnhancementRules,
    blockElementResp,
    customCodeResp,
    llmPromptsResp,
    urlProcessRulesResp,
    autoGoogleLoginRulesResp,
    pinnedShortcutsResp,
  ] = await Promise.all([
    chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY),
    chrome.storage.sync.get(NOTIFICATION_PREFERENCES_KEY),
    chrome.storage.sync.get(AUTO_RELOAD_RULES_KEY),
    getWhitelistPatterns(),
    loadHighlightTextRules(),
    loadVideoEnhancementRules(),
    chrome.storage.sync.get(BLOCK_ELEMENT_RULES_KEY),
    chrome.storage.local.get(CUSTOM_CODE_RULES_KEY),
    loadLLMPrompts(),
    loadUrlProcessRules(),
    loadAutoGoogleLoginRules(),
    chrome.storage.sync.get(PINNED_SHORTCUTS_KEY),
  ]);

  /** @type {Record<string, RootFolderSettings> | undefined} */
  const rootMap = /** @type {*} */ (rootResp?.[ROOT_FOLDER_SETTINGS_KEY]);
  const rootCandidate = rootMap?.[PROVIDER_ID];
  const parentFolderId =
    typeof rootCandidate?.parentFolderId === 'string' &&
    rootCandidate.parentFolderId
      ? rootCandidate.parentFolderId
      : '1';
  const rootFolderName =
    typeof rootCandidate?.rootFolderName === 'string' &&
    rootCandidate.rootFolderName
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
  };

  const blockElementRules = normalizeBlockElementRules(
    blockElementResp?.[BLOCK_ELEMENT_RULES_KEY],
  );

  const customCodeRules = normalizeCustomCodeRules(
    customCodeResp?.[CUSTOM_CODE_RULES_KEY],
  );

  const llmPrompts = normalizeLLMPrompts(llmPromptsResp);

  const urlProcessRules = normalizeUrlProcessRules(urlProcessRulesResp);

  const autoGoogleLoginRules = normalizeAutoGoogleLoginRules(
    autoGoogleLoginRulesResp,
  );

  const pinnedShortcuts = normalizePinnedShortcuts(
    pinnedShortcutsResp?.[PINNED_SHORTCUTS_KEY],
  );

  const screenshotSettingsResp = await chrome.storage.sync.get(
    SCREENSHOT_SETTINGS_KEY,
  );
  const screenshotSettings = normalizeScreenshotSettings(
    screenshotSettingsResp?.[SCREENSHOT_SETTINGS_KEY],
  );

  return {
    rootFolder,
    notifications,
    autoReloadRules,
    brightModeSettings,
    highlightTextRules,
    videoEnhancementRules,
    blockElementRules,
    customCodeRules,
    llmPrompts,
    urlProcessRules,
    autoGoogleLoginRules,
    screenshotSettings,
    pinnedShortcuts,
  };
}

/**
 * Trigger a download of the given data as a JSON file.
 * @param {any} data
 * @param {string} filename
 */
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
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
    const {
      rootFolder,
      notifications,
      autoReloadRules,
      brightModeSettings,
      highlightTextRules,
      videoEnhancementRules,
      blockElementRules,
      customCodeRules,
      llmPrompts,
      urlProcessRules,
      autoGoogleLoginRules,
      screenshotSettings,
      pinnedShortcuts,
    } = await readCurrentOptions();
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
        videoEnhancementRules,
        blockElementRules,
        customCodeRules,
        llmPrompts,
        urlProcessRules,
        autoGoogleLoginRules,
        screenshotSettings,
        pinnedShortcuts,
      },
    };
    const now = new Date();
    const YYYY = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const filename =
      'nenya-options-' + YYYY + MM + DD + '-' + HH + mm + '.json';
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
 * @param {VideoEnhancementRuleSettings[]} videoEnhancementRules
 * @param {BlockElementRuleSettings[]} blockElementRules
 * @param {CustomCodeRuleSettings[]} customCodeRules
 * @param {LLMPromptSettings[]} llmPrompts
 * @param {UrlProcessRuleSettings[]} urlProcessRules
 * @param {AutoGoogleLoginRuleSettings[]} autoGoogleLoginRules
 * @param {ScreenshotSettings} screenshotSettings
 * @param {string[]} pinnedShortcuts
 * @returns {Promise<void>}
 */
async function applyImportedOptions(
  rootFolder,
  notifications,
  autoReloadRules,
  brightModeSettings,
  highlightTextRules,
  videoEnhancementRules,
  blockElementRules,
  customCodeRules,
  llmPrompts,
  urlProcessRules,
  autoGoogleLoginRules,
  screenshotSettings,
  pinnedShortcuts,
) {
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
    rootFolderName:
      typeof rootFolder?.rootFolderName === 'string' &&
      rootFolder.rootFolderName
        ? rootFolder.rootFolderName
        : 'Raindrop',
  };
  const sanitizedNotifications = normalizePreferences(notifications);
  const sanitizedRules = normalizeAutoReloadRules(autoReloadRules);
  const sanitizedHighlightTextRules = normalizeHighlightTextRules(
    highlightTextRules || [],
  );
  const sanitizedVideoEnhancementRules = normalizeVideoEnhancementRules(
    videoEnhancementRules || [],
  );
  const sanitizedBlockElementRules = normalizeBlockElementRules(
    blockElementRules || [],
  );

  const sanitizedCustomCodeRules = normalizeCustomCodeRules(
    customCodeRules || [],
  );

  const sanitizedLLMPrompts = normalizeLLMPrompts(llmPrompts || []);

  const sanitizedUrlProcessRules = normalizeUrlProcessRules(
    urlProcessRules || [],
  );

  const sanitizedAutoGoogleLoginRules = normalizeAutoGoogleLoginRules(
    autoGoogleLoginRules || [],
  );

  const sanitizedScreenshotSettings = normalizeScreenshotSettings(
    screenshotSettings || { autoSave: false },
  );

  const sanitizedPinnedShortcuts = normalizePinnedShortcuts(
    pinnedShortcuts || [],
  );

  // Handle bright mode settings - support both old and new format
  let sanitizedWhitelist = [];

  if (brightModeSettings && typeof brightModeSettings === 'object') {
    // New format: { whitelist: [...] }
    sanitizedWhitelist = normalizeBrightModePatterns(
      brightModeSettings.whitelist || [],
    );
  } else {
    // Fallback for old format or missing data
    sanitizedWhitelist = [];
  }

  // Read existing map to preserve other providers if any
  const existing = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings>} */
  const map = /** @type {*} */ (existing?.[ROOT_FOLDER_SETTINGS_KEY]) || {};
  map[PROVIDER_ID] = sanitizedRoot;

  // Persist all keys (custom code rules go to local storage due to size)
  await Promise.all([
    chrome.storage.sync.set({
      [ROOT_FOLDER_SETTINGS_KEY]: map,
      [NOTIFICATION_PREFERENCES_KEY]: sanitizedNotifications,
      [AUTO_RELOAD_RULES_KEY]: sanitizedRules,
      [BRIGHT_MODE_WHITELIST_KEY]: sanitizedWhitelist,
      [HIGHLIGHT_TEXT_RULES_KEY]: sanitizedHighlightTextRules,
      [VIDEO_ENHANCEMENT_RULES_KEY]: sanitizedVideoEnhancementRules,
      [BLOCK_ELEMENT_RULES_KEY]: sanitizedBlockElementRules,
      [LLM_PROMPTS_KEY]: sanitizedLLMPrompts,
      [URL_PROCESS_RULES_KEY]: sanitizedUrlProcessRules,
      [AUTO_GOOGLE_LOGIN_RULES_KEY]: sanitizedAutoGoogleLoginRules,
      [SCREENSHOT_SETTINGS_KEY]: sanitizedScreenshotSettings,
      [PINNED_SHORTCUTS_KEY]: sanitizedPinnedShortcuts,
    }),
    chrome.storage.local.set({
      [CUSTOM_CODE_RULES_KEY]: sanitizedCustomCodeRules,
    }),
  ]);
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
    const provider =
      typeof data?.provider === 'string' ? data.provider : PROVIDER_ID;
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
    const videoEnhancementRules =
      /** @type {VideoEnhancementRuleSettings[]} */ (
        data.videoEnhancementRules || []
      );
    const blockElementRules = /** @type {BlockElementRuleSettings[]} */ (
      data.blockElementRules || []
    );
    const customCodeRules = /** @type {CustomCodeRuleSettings[]} */ (
      data.customCodeRules || []
    );
    const llmPrompts = /** @type {LLMPromptSettings[]} */ (
      data.llmPrompts || []
    );
    const urlProcessRules = /** @type {UrlProcessRuleSettings[]} */ (
      data.urlProcessRules || []
    );
    const autoGoogleLoginRules = /** @type {AutoGoogleLoginRuleSettings[]} */ (
      data.autoGoogleLoginRules || []
    );
    const screenshotSettings = /** @type {ScreenshotSettings} */ (
      data.screenshotSettings || { autoSave: false }
    );
    const pinnedShortcuts = /** @type {string[]} */ (
      data.pinnedShortcuts || []
    );

    // Handle bright mode settings - support both old and new format
    let brightModeSettings = data.brightModeSettings;
    if (
      !brightModeSettings &&
      (data.brightModeWhitelist || data.brightModeBlacklist)
    ) {
      // Convert old format to new format (ignore blacklist)
      brightModeSettings = {
        whitelist: data.brightModeWhitelist || [],
      };
    }
    brightModeSettings = brightModeSettings || { whitelist: [] };

    await applyImportedOptions(
      root,
      notifications,
      autoReloadRules,
      brightModeSettings,
      highlightTextRules,
      videoEnhancementRules,
      blockElementRules,
      customCodeRules,
      llmPrompts,
      urlProcessRules,
      autoGoogleLoginRules,
      screenshotSettings,
      pinnedShortcuts,
    );
    showToast('Options imported successfully.', 'success');
  } catch (error) {
    console.warn('[importExport] Import failed:', error);
    showToast(
      'Failed to import options. Please select a valid export file.',
      'error',
    );
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
