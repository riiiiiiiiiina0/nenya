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
 * @typedef {Object} SaveUnsortedEntry
 * @property {string} url
 * @property {string} [title]
 */

/**
 * @typedef {Object} SaveUnsortedResult
 * @property {boolean} ok
 * @property {number} created
 * @property {number} updated
 * @property {number} skipped
 * @property {number} failed
 * @property {number} total
 * @property {string[]} errors
 * @property {string} [error]
 */

/**
 * @typedef {Object} MirrorContext
 * @property {string} rootFolderId
 * @property {string} unsortedFolderId
 * @property {Map<number, string>} collectionFolderMap
 * @property {BookmarkNodeIndex} index
 */

/**
 * @typedef {Object} BadgeAnimationHandle
 * @property {() => void} stop
 * @property {number} token
 */

export const MIRROR_ALARM_NAME = 'nenya-raindrop-mirror-pull';
export const MIRROR_PULL_INTERVAL_MINUTES = 10;

// Export functions needed by projects.js
export {
  concludeActionBadge,
  setActionBadge,
  raindropRequest,
  loadValidProviderTokens,
  normalizeFolderTitle,
  normalizeBookmarkTitle,
  normalizeHttpUrl,
  buildRaindropCollectionUrl,
  fetchRaindropItems,
  isPromiseLike,
};

import { processUrl } from '../shared/urlProcessor.js';
import { convertSplitUrlForSave, convertSplitUrlForRestore } from '../shared/splitUrl.js';

const PROVIDER_ID = 'raindrop';
const STORAGE_KEY_TOKENS = 'cloudAuthTokens';
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const LOCAL_KEY_OLDEST_ITEM = 'OLDEST_RAINDROP_ITEM';
const LOCAL_KEY_OLDEST_DELETED = 'OLDEST_DELETED_RAINDROP_ITEM';
const ITEM_BOOKMARK_MAP_KEY = 'raindropItemBookmarkMap';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';
const UNSORTED_TITLE = 'Unsorted';
const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
const RAINDROP_UNSORTED_URL = 'https://app.raindrop.io/my/-1';
const RAINDROP_COLLECTION_URL_BASE = 'https://app.raindrop.io/my/';
const BOOKMARK_MANAGER_URL_BASE = 'chrome://bookmarks/?id=';
const NOTIFICATION_ICON_PATH = 'assets/icons/icon-128x128.png';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const FETCH_PAGE_SIZE = 100;
const DEFAULT_BADGE_ANIMATION_DELAY = 300;

const ANIMATION_DOWN_SEQUENCE = ['🔽', '⏬'];
const ANIMATION_UP_SEQUENCE = ['🔼', '⏫'];

let syncInProgress = false;
/** @type {BadgeAnimationHandle | null} */
let currentBadgeAnimationHandle = null;
let badgeAnimationSequence = 0;
let lastStartedBadgeToken = 0;
/** @type {Map<string, string>} */
const notificationLinks = new Map();
/** @type {NotificationPreferences} */
let notificationPreferencesCache = createDefaultNotificationPreferences();
let notificationPreferencesLoaded = false;
/** @type {Promise<NotificationPreferences> | null} */
let notificationPreferencesPromise = null;
/** @type {Record<string, string> | null} */
let itemBookmarkMapCache = null;
/** @type {Promise<Record<string, string>> | null} */
let itemBookmarkMapPromise = null;

if (chrome && chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const targetUrl = notificationLinks.get(notificationId);
    if (!targetUrl) {
      return;
    }

    notificationLinks.delete(notificationId);

    if (!chrome.tabs || typeof chrome.tabs.create !== 'function') {
      return;
    }

    try {
      // Convert nenya.local split URLs back to extension format
      const restoredUrl = convertSplitUrlForRestore(targetUrl);
      const maybePromise = chrome.tabs.create({ url: restoredUrl });
      if (isPromiseLike(maybePromise)) {
        void maybePromise.catch((error) => {
          console.warn(
            '[notifications] Failed to open tab for notification click:',
            error,
          );
        });
      }
    } catch (error) {
      console.warn(
        '[notifications] Failed to open tab for notification click:',
        error,
      );
    }
  });

  chrome.notifications.onClosed.addListener((notificationId) => {
    notificationLinks.delete(notificationId);
  });
}

/**
 * Update the extension action badge text.
 * @param {string} text
 * @returns {void}
 */
function setActionBadgeText(text) {
  if (!chrome?.action) {
    return;
  }

  const badgeText = typeof text === 'string' ? text : '';

  try {
    const maybePromise = chrome.action.setBadgeText({ text: badgeText });
    if (maybePromise && typeof maybePromise.then === 'function') {
      void maybePromise.catch((error) => {
        console.warn('[badge] Failed to set badge text:', error);
      });
    }
  } catch (error) {
    console.warn('[badge] Failed to set badge text:', error);
  }
}

/**
 * Set the extension action badge text and color.
 * @param {string} text
 * @param {string} color
 * @param {number} [clearDelayMs=0]
 * @returns {void}
 */
function setActionBadge(text, color, clearDelayMs = 0) {
  if (!chrome?.action) {
    return;
  }

  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });

  if (clearDelayMs > 0) {
    setTimeout(() => {
      chrome.action.setBadgeBackgroundColor({ color: '' });
      chrome.action.setBadgeText({ text: '' });
    }, clearDelayMs);
  }
}

/**
 * Animate the extension action badge with emoji frames.
 * @param {string[]} emojis
 * @param {number} [delayMs=DEFAULT_BADGE_ANIMATION_DELAY]
 * @returns {BadgeAnimationHandle}
 */
export function animateActionBadge(
  emojis,
  delayMs = DEFAULT_BADGE_ANIMATION_DELAY,
) {
  badgeAnimationSequence += 1;
  const token = badgeAnimationSequence;

  if (currentBadgeAnimationHandle) {
    currentBadgeAnimationHandle.stop();
    currentBadgeAnimationHandle = null;
  }

  lastStartedBadgeToken = token;

  /** @type {number | null} */
  let intervalId = null;

  /** @type {BadgeAnimationHandle} */
  const handle = {
    token,
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (
        currentBadgeAnimationHandle &&
        currentBadgeAnimationHandle.token === token
      ) {
        currentBadgeAnimationHandle = null;
      }
      setActionBadgeText('');
    },
  };

  if (!chrome?.action || !Array.isArray(emojis)) {
    return handle;
  }

  const frames = emojis
    .map((emoji) => {
      if (typeof emoji !== 'string') {
        return '';
      }
      const trimmed = emoji.trim();
      return trimmed;
    })
    .filter((emoji) => emoji.length > 0);

  if (frames.length === 0) {
    return handle;
  }

  const computedDelay = Number(delayMs);
  const frameDelay =
    Number.isFinite(computedDelay) && computedDelay > 0
      ? computedDelay
      : DEFAULT_BADGE_ANIMATION_DELAY;

  let frameIndex = 0;

  const tick = () => {
    const nextText = frames[frameIndex];
    frameIndex = (frameIndex + 1) % frames.length;
    setActionBadgeText(nextText);
  };

  tick();
  intervalId = setInterval(tick, frameDelay);
  currentBadgeAnimationHandle = handle;

  return handle;
}

/**
 * Stop a badge animation and optionally show a final emoji if this is the latest started animation.
 * @param {BadgeAnimationHandle} handle
 * @param {string} finalEmoji
 * @returns {void}
 */
function concludeActionBadge(handle, finalEmoji) {
  if (!handle) {
    return;
  }

  badgeAnimationSequence += 1;
  const clearToken = badgeAnimationSequence;

  const isCurrent = Boolean(
    currentBadgeAnimationHandle &&
      currentBadgeAnimationHandle.token === handle.token,
  );
  const isLatestStart = handle.token === lastStartedBadgeToken;
  if (isCurrent) {
    handle.stop();
  }
  if (!isLatestStart) {
    return;
  }

  setActionBadgeText(finalEmoji);

  setTimeout(() => {
    if (badgeAnimationSequence !== clearToken) {
      return;
    }
    setActionBadgeText('');
  }, 2000);
}

/**
 * Create the default notification preferences object.
 * @returns {NotificationPreferences}
 */
function createDefaultNotificationPreferences() {
  return {
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
}

/**
 * Clone notification preferences to avoid shared references.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function cloneNotificationPreferences(value) {
  return {
    enabled: Boolean(value.enabled),
    bookmark: {
      enabled: Boolean(value.bookmark.enabled),
      pullFinished: Boolean(value.bookmark.pullFinished),
      unsortedSaved: Boolean(value.bookmark.unsortedSaved),
    },
    project: {
      enabled: Boolean(value.project?.enabled),
      saveProject: Boolean(value.project?.saveProject),
      addTabs: Boolean(value.project?.addTabs),
      replaceItems: Boolean(value.project?.replaceItems),
      deleteProject: Boolean(value.project?.deleteProject),
    },
  };
}

/**
 * Normalize stored notification preferences.
 * @param {unknown} value
 * @returns {NotificationPreferences}
 */
function normalizeNotificationPreferences(value) {
  const fallback = createDefaultNotificationPreferences();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw =
    /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings> }} */ (
      value
    );
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};

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
  };
}

/**
 * Load notification preferences from storage.
 * @returns {Promise<NotificationPreferences>}
 */
async function loadNotificationPreferences() {
  if (!chrome?.storage?.sync) {
    const defaults = createDefaultNotificationPreferences();
    updateNotificationPreferencesCache(defaults);
    return defaults;
  }

  try {
    const result = await chrome.storage.sync.get(NOTIFICATION_PREFERENCES_KEY);
    const stored = result?.[NOTIFICATION_PREFERENCES_KEY];
    const normalized = normalizeNotificationPreferences(stored);
    updateNotificationPreferencesCache(normalized);
  } catch (error) {
    console.warn(
      '[notifications] Failed to load preferences; using defaults.',
      error,
    );
    const defaults = createDefaultNotificationPreferences();
    updateNotificationPreferencesCache(defaults);
  }

  return notificationPreferencesCache;
}

/**
 * Retrieve cached notification preferences, loading them if needed.
 * @returns {Promise<NotificationPreferences>}
 */
export async function getNotificationPreferences() {
  if (notificationPreferencesLoaded) {
    return notificationPreferencesCache;
  }

  if (!notificationPreferencesPromise) {
    notificationPreferencesPromise = loadNotificationPreferences().finally(
      () => {
        notificationPreferencesPromise = null;
      },
    );
  }

  return notificationPreferencesPromise;
}

/**
 * Respond to updates from chrome.storage for notification preferences.
 * @param {NotificationPreferences} value
 * @returns {void}
 */
function updateNotificationPreferencesCache(value) {
  notificationPreferencesCache = cloneNotificationPreferences(value);
  notificationPreferencesLoaded = true;
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    const detail = changes[NOTIFICATION_PREFERENCES_KEY];
    if (!detail) {
      return;
    }

    const next = normalizeNotificationPreferences(detail.newValue);
    updateNotificationPreferencesCache(next);
  });
}

/**
 * Create a unique notification id.
 * @param {string} prefix
 * @returns {string}
 */
function createNotificationId(prefix) {
  const base =
    typeof prefix === 'string' && prefix.trim().length > 0
      ? prefix.trim()
      : 'nenya';
  const random = Math.random().toString(36).slice(2, 10);
  return base + '-' + Date.now().toString(36) + '-' + random;
}

/**
 * Resolve the notification icon URL.
 * @returns {string}
 */
function getNotificationIconUrl() {
  if (
    !chrome ||
    !chrome.runtime ||
    typeof chrome.runtime.getURL !== 'function'
  ) {
    return NOTIFICATION_ICON_PATH;
  }

  try {
    return chrome.runtime.getURL(NOTIFICATION_ICON_PATH);
  } catch (error) {
    console.warn('[notifications] Failed to resolve icon URL:', error);
    return NOTIFICATION_ICON_PATH;
  }
}

/**
 * Create a Chrome notification.
 * @param {string} prefix
 * @param {string} title
 * @param {string} message
 * @param {string} [targetUrl]
 * @param {string} [contextMessage]
 * @returns {Promise<void>}
 */
export async function pushNotification(
  prefix,
  title,
  message,
  targetUrl,
  contextMessage,
) {
  if (!chrome || !chrome.notifications) {
    return;
  }

  const safeTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'Nenya';
  const safeMessage =
    typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : '';

  if (safeMessage.length === 0) {
    return;
  }

  const notificationId = createNotificationId(prefix);
  /** @type {chrome.notifications.NotificationCreateOptions} */
  const options = {
    type: 'basic',
    iconUrl: getNotificationIconUrl(),
    title: safeTitle,
    message: safeMessage,
    priority: 0,
  };

  if (typeof contextMessage === 'string' && contextMessage.trim().length > 0) {
    options.contextMessage = contextMessage.trim();
  }

  let created = false;

  created = await new Promise((resolve) => {
    try {
      chrome.notifications.create(notificationId, options, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.warn(
            '[notifications] Failed to create notification:',
            lastError.message,
          );
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.warn('[notifications] Failed to create notification:', error);
      resolve(false);
    }
  });

  if (created && targetUrl) {
    notificationLinks.set(notificationId, targetUrl);
  }
}

/**
 * Normalize notification message text.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeNotificationMessage(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return 'Unknown error.';
  }
  if (text.length <= 180) {
    return text;
  }
  return text.slice(0, 177) + '...';
}

/**
 * Format a count with a noun.
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
function formatCountLabel(count, noun) {
  const safeCount = Number.isFinite(count) ? count : 0;
  const baseNoun = noun.trim();
  if (safeCount === 1) {
    return safeCount + ' ' + baseNoun;
  }
  if (baseNoun.endsWith('y')) {
    return safeCount + ' ' + baseNoun.slice(0, -1) + 'ies';
  }
  return safeCount + ' ' + baseNoun + 's';
}

const MIRROR_STAT_LABELS = {
  foldersCreated: ['folder created', 'folders created'],
  foldersRemoved: ['folder removed', 'folders removed'],
  foldersMoved: ['folder moved', 'folders moved'],
  bookmarksCreated: ['bookmark created', 'bookmarks created'],
  bookmarksUpdated: ['bookmark updated', 'bookmarks updated'],
  bookmarksMoved: ['bookmark moved', 'bookmarks moved'],
  bookmarksDeleted: ['bookmark deleted', 'bookmarks deleted'],
};

/**
 * Summarize mirror changes for notifications.
 * @param {MirrorStats} stats
 * @returns {{ total: number, parts: string[] }}
 */
function summarizeMirrorStats(stats) {
  let total = 0;
  const parts = [];

  for (const [key, labels] of Object.entries(MIRROR_STAT_LABELS)) {
    const value = Number(stats?.[key]) || 0;
    if (!Array.isArray(labels) || labels.length < 2) {
      continue;
    }
    total += value;
    if (value > 0) {
      parts.push(value + ' ' + (value === 1 ? labels[0] : labels[1]));
    }
  }

  return {
    total,
    parts,
  };
}

/**
 * Notify about the result of saving URLs to Unsorted.
 * @param {SaveUnsortedResult} summary
 * @returns {Promise<void>}
 */
async function notifyUnsortedSaveOutcome(summary) {
  if (!summary) {
    return;
  }

  const preferences = await getNotificationPreferences();
  if (
    !preferences.enabled ||
    !preferences.bookmark.enabled ||
    !preferences.bookmark.unsortedSaved
  ) {
    return;
  }

  if (summary.ok) {
    const createdCount = Number(summary.created || 0);
    const updatedCount = Number(summary.updated || 0);
    const savedCount = createdCount + updatedCount;
    const title = 'Saved to Unsorted';
    const message =
      'Saved ' +
      savedCount +
      ' ' +
      (savedCount === 1 ? 'URL' : 'URLs') +
      ' to Raindrop Unsorted.';
    const contextParts = [];

    if (savedCount === 0) {
      contextParts.push('All provided URLs were already saved.');
    }

    if (summary.skipped > 0) {
      contextParts.push(formatCountLabel(summary.skipped, 'duplicate'));
    }

    const contextMessage =
      contextParts.length > 0 ? contextParts.join(', ') : undefined;
    await pushNotification(
      'unsorted-success',
      title,
      message,
      RAINDROP_UNSORTED_URL,
      contextMessage,
    );
    return;
  }

  const reason =
    summary.error ||
    (Array.isArray(summary.errors) ? summary.errors[0] : '') ||
    'Unknown error.';
  await pushNotification(
    'unsorted-failure',
    'Failed to Save URLs',
    sanitizeNotificationMessage(reason),
  );
}

/**
 * Notify about a successful mirror pull.
 * @param {MirrorStats} stats
 * @param {string} rootFolderId
 * @param {string} [trigger]
 * @returns {Promise<void>}
 */
async function notifyMirrorPullSuccess(stats, rootFolderId, trigger) {
  if (!stats) {
    return;
  }

  const summary = summarizeMirrorStats(stats);
  if (trigger === 'alarm' && summary.total === 0) {
    return;
  }

  const preferences = await getNotificationPreferences();
  if (
    !preferences.enabled ||
    !preferences.bookmark.enabled ||
    !preferences.bookmark.pullFinished
  ) {
    return;
  }

  const title = 'Raindrop Sync Complete';
  const message =
    summary.total === 1
      ? 'Pulled 1 change from Raindrop.'
      : 'Pulled ' + summary.total + ' changes from Raindrop.';
  const contextMessage =
    summary.parts.length > 0
      ? summary.parts.join(', ')
      : 'No structural changes detected.';
  const targetUrl =
    typeof rootFolderId === 'string' && rootFolderId
      ? BOOKMARK_MANAGER_URL_BASE + encodeURIComponent(rootFolderId)
      : undefined;

  await pushNotification(
    'mirror-success',
    title,
    message,
    targetUrl,
    contextMessage,
  );
}

/**
 * Notify about a failed mirror pull.
 * @param {string} message
 * @returns {Promise<void>}
 */
async function notifyMirrorPullFailure(message) {
  const preferences = await getNotificationPreferences();
  if (
    !preferences.enabled ||
    !preferences.bookmark.enabled ||
    !preferences.bookmark.pullFinished
  ) {
    return;
  }

  await pushNotification(
    'mirror-failure',
    'Raindrop Sync Failed',
    sanitizeNotificationMessage(message),
  );
}

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
      error: 'Sync already in progress.',
    };
  }

  // Check if user is logged in before starting sync
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    return {
      ok: false,
      error:
        'No Raindrop connection found. Connect in Options to enable syncing.',
    };
  }

  syncInProgress = true;
  const badgeAnimation = animateActionBadge(ANIMATION_DOWN_SEQUENCE);
  let finalBadge = '❌';
  try {
    const pullResult = await performMirrorPull(trigger);
    finalBadge = '✅';
    void notifyMirrorPullSuccess(
      pullResult.stats,
      pullResult.rootFolderId,
      trigger,
    );
    return { ok: true, stats: pullResult.stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finalBadge = '❌';
    void notifyMirrorPullFailure(message);
    return { ok: false, error: message };
  } finally {
    concludeActionBadge(badgeAnimation, finalBadge);
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
      error: 'Sync already in progress.',
    };
  }

  syncInProgress = true;
  const badgeAnimation = animateActionBadge(ANIMATION_DOWN_SEQUENCE);
  let finalBadge = '❌';
  try {
    const settingsData = await loadRootFolderSettings();
    await resetMirrorState(settingsData);
    const pullResult = await performMirrorPull('reset');
    finalBadge = '✅';
    void notifyMirrorPullSuccess(
      pullResult.stats,
      pullResult.rootFolderId,
      'reset',
    );
    return { ok: true, stats: pullResult.stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finalBadge = '❌';
    void notifyMirrorPullFailure(message);
    return { ok: false, error: message };
  } finally {
    concludeActionBadge(badgeAnimation, finalBadge);
    syncInProgress = false;
  }
}

/**
 * Reset stored timestamps and remove the current mirror root folder.
 * @param {{ settings: RootFolderSettings, map: Record<string, RootFolderSettings>, didMutate: boolean }} settingsData
 * @returns {Promise<void>}
 */
export async function resetMirrorState(settingsData) {
  await chrome.storage.local.remove([
    LOCAL_KEY_OLDEST_ITEM,
    LOCAL_KEY_OLDEST_DELETED,
  ]);

  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME,
  );
  if (normalizedTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedTitle;
    settingsData.didMutate = true;
  }

  const parentExists = await bookmarkNodeExists(parentId);
  if (parentExists) {
    const existingRoot = await findChildFolderByTitle(
      parentId,
      normalizedTitle,
    );
    if (existingRoot) {
      await bookmarksRemoveTree(existingRoot.id);
    }
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }
}

/**
 * Save URLs to the Raindrop Unsorted collection and mirror them as bookmarks.
 * @param {SaveUnsortedEntry[]} entries
 * @returns {Promise<SaveUnsortedResult>}
 */
export async function saveUrlsToUnsorted(entries) {
  const badgeAnimation = animateActionBadge(ANIMATION_UP_SEQUENCE);
  /** @type {SaveUnsortedResult} */
  const summary = {
    ok: false,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };
  const finalize = () => {
    void notifyUnsortedSaveOutcome(summary);
    return summary;
  };

  try {
    if (!Array.isArray(entries)) {
      summary.error = 'No URLs provided.';
      return finalize();
    }

    /** @type {SaveUnsortedEntry[]} */
    const sanitized = [];
    const seenUrls = new Set();

    for (const entry of entries) {
      const rawUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';
      if (!rawUrl) {
        summary.skipped += 1;
        continue;
      }

      const normalizedUrl = normalizeHttpUrl(rawUrl);
      if (!normalizedUrl) {
        summary.skipped += 1;
        continue;
      }

      // Process URL according to URL processing rules
      const processedUrl = await processUrl(normalizedUrl, 'save-to-raindrop');

      // Convert split page URLs to nenya.local format for saving
      const finalUrl = convertSplitUrlForSave(processedUrl);

      if (seenUrls.has(finalUrl)) {
        summary.skipped += 1;
        continue;
      }

      seenUrls.add(finalUrl);
      sanitized.push({
        url: finalUrl,
        title: typeof entry?.title === 'string' ? entry.title.trim() : '',
      });
    }

    summary.total = sanitized.length;

    if (sanitized.length === 0) {
      summary.error = 'No valid URLs to save.';
      return finalize();
    }

    let tokens;
    try {
      tokens = await loadValidProviderTokens();
    } catch (error) {
      summary.error = error instanceof Error ? error.message : String(error);
      return finalize();
    }

    if (!tokens) {
      summary.error =
        'No Raindrop connection found. Connect in Options to enable saving.';
      return finalize();
    }

    const dedupeResult = await filterExistingRaindropEntries(tokens, sanitized);
    summary.skipped += dedupeResult.skipped;
    summary.failed += dedupeResult.failed;
    if (dedupeResult.errors.length > 0) {
      summary.errors.push(...dedupeResult.errors);
    }

    if (dedupeResult.entries.length === 0) {
      summary.ok = summary.failed === 0;
      if (!summary.ok && !summary.error && summary.errors.length > 0) {
        summary.error = summary.errors[0];
      }
      return finalize();
    }

    const folders = await ensureUnsortedBookmarkFolder();
    const children = await bookmarksGetChildren(folders.unsortedId);
    /** @type {Map<string, chrome.bookmarks.BookmarkTreeNode>} */
    const bookmarkByUrl = new Map();
    children.forEach((child) => {
      if (child.url) {
        bookmarkByUrl.set(child.url, child);
      }
    });

    for (const entry of dedupeResult.entries) {
      try {
        const response = await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            link: entry.url,
            collectionId: -1,
            pleaseParse: {},
          }),
        });

        const itemTitle =
          typeof response?.item?.title === 'string' ? response.item.title : '';
        const bookmarkTitle = normalizeBookmarkTitle(
          itemTitle || entry.title,
          entry.url,
        );

        const existing = bookmarkByUrl.get(entry.url);
        if (existing) {
          const currentTitle = normalizeBookmarkTitle(
            existing.title,
            entry.url,
          );
          if (currentTitle !== bookmarkTitle) {
            const updatedNode = await bookmarksUpdate(existing.id, {
              title: bookmarkTitle,
            });
            bookmarkByUrl.set(entry.url, updatedNode);
            summary.updated += 1;
          } else {
            summary.skipped += 1;
          }
          continue;
        }

        const createdNode = await bookmarksCreate({
          parentId: folders.unsortedId,
          title: bookmarkTitle,
          url: entry.url,
        });
        bookmarkByUrl.set(entry.url, createdNode);
        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(
          entry.url +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        );
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
 * Filter entries that already exist in Raindrop.
 * @param {StoredProviderTokens} tokens
 * @param {SaveUnsortedEntry[]} entries
 * @returns {Promise<{ entries: SaveUnsortedEntry[], skipped: number, failed: number, errors: string[] }>}
 */
async function filterExistingRaindropEntries(tokens, entries) {
  /** @type {SaveUnsortedEntry[]} */
  const filtered = [];
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const entry of entries) {
    try {
      const exists = await doesRaindropItemExist(tokens, entry.url);
      if (exists) {
        skipped += 1;
        continue;
      }
      filtered.push(entry);
    } catch (error) {
      failed += 1;
      errors.push(
        entry.url +
          ': ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  return {
    entries: filtered,
    skipped,
    failed,
    errors,
  };
}

/**
 * Determine whether a Raindrop item already exists for the provided URL.
 * @param {StoredProviderTokens} tokens
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function doesRaindropItemExist(tokens, url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) {
    return false;
  }

  const params = new URLSearchParams({
    perpage: '1',
    page: '0',
    search: 'link:"' + escapeSearchValue(normalized) + '"',
  });

  const data = await raindropRequest(
    '/raindrops/0?' + params.toString(),
    tokens,
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.some((item) => {
    const itemUrl = typeof item?.link === 'string' ? item.link : '';
    return normalizeHttpUrl(itemUrl) === normalized;
  });
}

/**
 * Check if any Raindrop item in a specific collection has the provided URL.
 * @param {StoredProviderTokens} tokens
 * @param {number} collectionId
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function doesRaindropItemExistInCollection(tokens, collectionId, url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized || !Number.isFinite(collectionId)) {
    return false;
  }

  const params = new URLSearchParams({
    perpage: '1',
    page: '0',
    search: 'link:"' + escapeSearchValue(normalized) + '"',
  });
  const path = '/raindrops/' + String(collectionId) + '?' + params.toString();
  const data = await raindropRequest(path, tokens);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.some((item) => {
    const itemUrl = typeof item?.link === 'string' ? item.link : '';
    return normalizeHttpUrl(itemUrl) === normalized;
  });
}

/**
 * Escape a string for inclusion in a Raindrop search query.
 * @param {string} value
 * @returns {string}
 */
function escapeSearchValue(value) {
  return value.replace(/(["\\])/g, '\\$1');
}

/**
 * Execute the mirror pull steps.
 * @param {string} trigger
 * @returns {Promise<{ stats: MirrorStats, rootFolderId: string }>}
 */
async function performMirrorPull(trigger) {
  console.info('[mirror] Starting Raindrop pull (trigger:', trigger + ')');

  const stats = createEmptyStats();

  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    throw new Error(
      'No Raindrop connection found. Connect in Options to enable syncing.',
    );
  }

  const remoteData = await fetchRaindropStructure(tokens);
  const settingsData = await loadRootFolderSettings();
  const mirrorContext = await ensureMirrorStructure(
    remoteData,
    settingsData,
    stats,
  );

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }

  await processDeletedItems(tokens, mirrorContext, stats);
  await processUpdatedItems(tokens, mirrorContext, stats);

  console.info('[mirror] Raindrop pull complete with stats:', stats);
  return {
    stats,
    rootFolderId: mirrorContext.rootFolderId,
  };
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
    bookmarksDeleted: 0,
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
    raindropRequest('/collections/childrens', tokens),
  ]);

  const groups = Array.isArray(userResponse?.user?.groups)
    ? userResponse.user.groups
    : [];
  const rootCollections = Array.isArray(rootResponse?.items)
    ? rootResponse.items
    : [];
  const childCollections = Array.isArray(childResponse?.items)
    ? childResponse.items
    : [];

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
    headers,
  });

  if (!response.ok) {
    throw new Error(
      'Raindrop request failed (' +
        response.status +
        '): ' +
        response.statusText,
    );
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
  const rootTitle = normalizeFolderTitle(
    settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME,
  );

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
    stats,
  );

  return {
    rootFolderId: rootNode.id,
    unsortedFolderId,
    collectionFolderMap,
    index,
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
    title,
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
      typeof value.then === 'function',
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
 * @param {string | string[]} ids
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
 */
async function bookmarksGet(ids) {
  if (!ids || (Array.isArray(ids) && ids.length === 0)) {
    return [];
  }

  // Handle single string case
  if (typeof ids === 'string') {
    try {
      const maybe = chrome.bookmarks.get(ids);
      if (isPromiseLike(maybe)) {
        return await /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
          maybe
        );
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

  // Handle array case - ensure it has at least one element
  if (Array.isArray(ids) && ids.length > 0) {
    try {
      const maybe = chrome.bookmarks.get(
        /** @type {[string, ...string[]]} */ (ids),
      );
      if (isPromiseLike(maybe)) {
        return await /** @type {Promise<chrome.bookmarks.BookmarkTreeNode[]>} */ (
          maybe
        );
      }
    } catch (error) {
      // Fall back to callback form.
    }

    return new Promise((resolve, reject) => {
      chrome.bookmarks.get(
        /** @type {[string, ...string[]]} */ (ids),
        (nodes) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve(nodes);
        },
      );
    });
  }

  return [];
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
 * @param {chrome.bookmarks.CreateDetails} details
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
 * @param {chrome.bookmarks.MoveDestination} destination
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
 * @param {any} changes
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
      depth: pathSegments.length,
    };
    folders.set(node.id, info);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(info);
    }
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
      pathSegments,
    };
    bookmarks.set(node.id, entry);
    if (!bookmarksByUrl.has(entry.url)) {
      bookmarksByUrl.set(entry.url, []);
    }
    const urlList = bookmarksByUrl.get(entry.url);
    if (urlList) {
      urlList.push(entry);
    }
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
        const currentSegments = ancestorSegments.concat([
          normalizeFolderTitle(node.title, ''),
        ]);
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
    bookmarksByUrl,
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
   * @returns {CollectionNode | undefined}
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
        children: [],
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
    const collectionIds = Array.isArray(group?.collections)
      ? group.collections
      : [];
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
  const roots = Array.isArray(remoteData.rootCollections)
    ? remoteData.rootCollections
    : [];
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
      collections: unassigned,
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
  const collectionMap = buildCollectionNodeMap(
    remoteData.rootCollections,
    remoteData.childCollections,
  );
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
      stats,
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
        stats,
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
    stats,
  );
  addOrderEntry(orderByParent, rootId, unsortedFolder.id);

  await removeUnusedFolders(rootId, index, usedFolders, stats);
  await enforceFolderOrder(orderByParent, index, stats);

  return {
    collectionFolderMap,
    unsortedFolderId: unsortedFolder.id,
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
async function ensureFolder(
  parentId,
  title,
  pathSegments,
  index,
  usedFolders,
  stats,
) {
  const siblings = index.childrenByParent.get(parentId) ?? [];
  let folderInfo = siblings.find((info) => info.title === title);

  if (!folderInfo) {
    const created = await bookmarksCreate({
      parentId,
      title,
    });
    stats.foldersCreated += 1;

    folderInfo = {
      id: created.id,
      parentId,
      title,
      pathSegments,
      depth: pathSegments.length,
    };

    index.folders.set(folderInfo.id, folderInfo);

    if (!index.childrenByParent.has(parentId)) {
      index.childrenByParent.set(parentId, []);
    }
    const siblings = index.childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(folderInfo);
    }
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
  if (list && !list.includes(childId)) {
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
  stats,
) {
  const title = normalizeFolderTitle(node.title, 'Collection ' + node.id);
  const currentSegments = parentSegments.concat([title]);

  const folder = await ensureFolder(
    parentFolderId,
    title,
    currentSegments,
    index,
    usedFolders,
    stats,
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
      stats,
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
        siblings.filter((child) => child.id !== info.id),
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
            list.filter((candidate) => candidate.id !== bookmarkId),
          );
          const updatedList = index.bookmarksByUrl.get(entry.url);
          if (updatedList && updatedList.length === 0) {
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
      .filter((entry) => entry !== undefined);
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
      const lastUpdate = parseRaindropTimestamp(
        item?.lastUpdate ?? item?.created,
      );
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
      const lastUpdate = parseRaindropTimestamp(
        item?.lastUpdate ?? item?.created,
      );
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
      const itemId = extractItemId(item);
      await upsertBookmark(
        tokens,
        itemId,
        url,
        bookmarkTitle,
        targetFolderId,
        context,
        stats,
        collectionId,
      );
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
 * Extract the Raindrop item id from an item.
 * @param {any} item
 * @returns {number | undefined}
 */
function extractItemId(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const raw = item._id ?? item.id ?? item.ID;
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
    sort: '-lastUpdate',
  });
  const data = await raindropRequest(
    '/raindrops/' + collectionId + '?' + params.toString(),
    tokens,
  );
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
    await removeMappingsByBookmarkId(entry.id);
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
 * Normalize an HTTP(S) URL for consistent comparisons.
 * @param {string} value
 * @returns {string | undefined}
 */
function normalizeHttpUrl(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch (error) {
    return undefined;
  }
}

/**
 * Build a Raindrop collection URL for the provided id.
 * @param {number} id
 * @returns {string}
 */
function buildRaindropCollectionUrl(id) {
  return RAINDROP_COLLECTION_URL_BASE + String(id);
}

/**
 * Check if a bookmark with the given URL already exists in the target folder.
 * This function queries the actual Chrome bookmarks API to prevent duplicate entries
 * that could occur due to race conditions or index synchronization issues.
 * @param {string} url
 * @param {string} targetFolderId
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | null>}
 */
async function findExistingBookmarkInFolder(url, targetFolderId) {
  try {
    const folderChildren = await bookmarksGetChildren(targetFolderId);
    return folderChildren.find((child) => child.url === url) || null;
  } catch (error) {
    console.warn(
      '[findExistingBookmarkInFolder] Failed to check existing bookmarks:',
      error,
    );
    return null;
  }
}

/**
 * Remove bookmarks in the target folder that share the same title but point to a different URL.
 * This addresses the case where a Raindrop item's URL was changed and both the old and new
 * bookmarks exist with the same title. We keep the bookmark for the new URL and delete others.
 * @param {string} title
 * @param {string} urlToKeep
 * @param {string} targetFolderId
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @returns {Promise<void>}
 */
async function removeDuplicateTitleBookmarksInFolder(
  tokens,
  collectionId,
  title,
  urlToKeep,
  targetFolderId,
  context,
  stats,
) {
  if (!title || !urlToKeep || !targetFolderId) {
    return;
  }

  let children;
  try {
    children = await bookmarksGetChildren(targetFolderId);
  } catch (error) {
    console.warn('[dedupe] Failed to read folder children for dedupe:', error);
    return;
  }

  const duplicates = children.filter((child) => {
    if (!child.url) {
      return false;
    }
    const childTitle = typeof child.title === 'string' ? child.title : '';
    return childTitle === title && child.url !== urlToKeep;
  });

  if (duplicates.length === 0) {
    return;
  }

  for (const dup of duplicates) {
    try {
      const dupUrl = dup.url || '';
      // Verify dup URL does not belong to any item in this collection
      if (
        typeof collectionId === 'number' &&
        (await doesRaindropItemExistInCollection(tokens, collectionId, dupUrl))
      ) {
        continue;
      }

      await bookmarksRemove(dup.id);
      stats.bookmarksDeleted += 1;

      // Update in-memory index maps
      context.index.bookmarks.delete(dup.id);
      if (dupUrl) {
        const list = context.index.bookmarksByUrl.get(dupUrl) || [];
        const updated = list.filter((entry) => entry.id !== dup.id);
        if (updated.length > 0) {
          context.index.bookmarksByUrl.set(dupUrl, updated);
        } else {
          context.index.bookmarksByUrl.delete(dupUrl);
        }
      }

      // Remove any stale mappings pointing to this bookmark
      await removeMappingsByBookmarkId(dup.id);
    } catch (error) {
      console.warn('[dedupe] Failed to remove duplicate bookmark:', error);
    }
  }
}

/**
 * Load the mapping of Raindrop item id -> Chrome bookmark id from local storage.
 * Cached per runtime to reduce storage calls.
 * @returns {Promise<Record<string, string>>}
 */
async function loadItemBookmarkMap() {
  if (itemBookmarkMapCache) {
    return itemBookmarkMapCache;
  }
  if (!itemBookmarkMapPromise) {
    itemBookmarkMapPromise = /** @type {Promise<Record<string, string>>} */ (
      (async () => {
        try {
          const result = await chrome.storage.local.get(ITEM_BOOKMARK_MAP_KEY);
          const raw = result?.[ITEM_BOOKMARK_MAP_KEY];
          if (raw && typeof raw === 'object') {
            itemBookmarkMapCache = { ...raw };
          } else {
            itemBookmarkMapCache = {};
          }
        } catch (error) {
          itemBookmarkMapCache = {};
        }
        return itemBookmarkMapCache;
      })()
    );
  }
  return /** @type {Promise<Record<string, string>>} */ (
    itemBookmarkMapPromise
  );
}

/**
 * Persist the current cached item->bookmark map.
 * @returns {Promise<void>}
 */
async function persistItemBookmarkMap() {
  if (!itemBookmarkMapCache) {
    await loadItemBookmarkMap();
  }
  await chrome.storage.local.set({
    [ITEM_BOOKMARK_MAP_KEY]: itemBookmarkMapCache || {},
  });
}

/**
 * Get the mapped bookmark id for a given raindrop item id.
 * @param {number | undefined} itemId
 * @returns {Promise<string | undefined>}
 */
async function getMappedBookmarkId(itemId) {
  if (!Number.isFinite(itemId)) {
    return undefined;
  }
  const map = await loadItemBookmarkMap();
  const key = String(itemId);
  const value = map[key];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Update the mapping for a raindrop item id.
 * @param {number | undefined} itemId
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
async function setMappedBookmarkId(itemId, bookmarkId) {
  if (!Number.isFinite(itemId) || !bookmarkId) {
    return;
  }
  const map = await loadItemBookmarkMap();
  map[String(itemId)] = String(bookmarkId);
  await persistItemBookmarkMap();
}

/**
 * Remove a mapping by item id if present.
 * @param {number | undefined} itemId
 * @returns {Promise<void>}
 */
async function deleteMappedBookmarkId(itemId) {
  if (!Number.isFinite(itemId)) {
    return;
  }
  const map = await loadItemBookmarkMap();
  const key = String(itemId);
  if (key in map) {
    delete map[key];
    await persistItemBookmarkMap();
  }
}

/**
 * Remove any mapping entries that point to a specific bookmark id.
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
async function removeMappingsByBookmarkId(bookmarkId) {
  if (!bookmarkId) {
    return;
  }
  const map = await loadItemBookmarkMap();
  let changed = false;
  for (const [key, value] of Object.entries(map)) {
    if (value === bookmarkId) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) {
    await persistItemBookmarkMap();
  }
}

/**
 * Create or update a bookmark for the provided Raindrop item.
 * Prefers updating the previously mapped bookmark (by item id) to the new URL to avoid duplicates.
 * Falls back to URL-based detection, then creation.
 * @param {StoredProviderTokens} tokens
 * @param {number | undefined} itemId
 * @param {string} url
 * @param {string} title
 * @param {string} targetFolderId
 * @param {MirrorContext} context
 * @param {MirrorStats} stats
 * @param {number | undefined} collectionId
 * @returns {Promise<void>}
 */
async function upsertBookmark(
  tokens,
  itemId,
  url,
  title,
  targetFolderId,
  context,
  stats,
  collectionId,
) {
  const folderInfo = context.index.folders.get(targetFolderId);
  if (!folderInfo) {
    return;
  }

  // First, if we know the Raindrop item id, try to update the previously mapped bookmark in-place.
  if (Number.isFinite(itemId)) {
    try {
      const mappedId = await getMappedBookmarkId(itemId);
      if (mappedId) {
        const nodes = await bookmarksGet(mappedId);
        const node =
          Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : undefined;
        if (node && node.id) {
          const changes = {};
          let didUpdate = false;
          const oldUrl = typeof node.url === 'string' ? node.url : '';

          if (node.title !== title) {
            /** @type {{ title?: string, url?: string }} */
            (changes).title = title;
            didUpdate = true;
          }
          if (oldUrl !== url) {
            /** @type {{ title?: string, url?: string }} */
            (changes).url = url;
            didUpdate = true;
          }

          if (didUpdate) {
            await bookmarksUpdate(node.id, changes);
            stats.bookmarksUpdated += 1;

            // Update index: remove oldUrl mapping if URL changed, and add new
            const existingEntry = context.index.bookmarks.get(node.id) || {
              id: node.id,
              parentId: node.parentId ?? targetFolderId,
              title,
              url,
              pathSegments: [...folderInfo.pathSegments],
            };

            if (oldUrl && oldUrl !== url) {
              const list = context.index.bookmarksByUrl.get(oldUrl) || [];
              const updated = list.filter((entry) => entry.id !== node.id);
              if (updated.length > 0) {
                context.index.bookmarksByUrl.set(oldUrl, updated);
              } else {
                context.index.bookmarksByUrl.delete(oldUrl);
              }
            }

            existingEntry.title = title;
            existingEntry.url = url;
            context.index.bookmarks.set(node.id, existingEntry);
            const newList = context.index.bookmarksByUrl.get(url) || [];
            const idx = newList.findIndex((entry) => entry.id === node.id);
            if (idx >= 0) {
              newList[idx] = existingEntry;
            } else {
              newList.push(existingEntry);
            }
            context.index.bookmarksByUrl.set(url, newList);
          }

          if (node.parentId !== targetFolderId) {
            await bookmarksMove(node.id, { parentId: targetFolderId });
            stats.bookmarksMoved += 1;
          }

          // Ensure mapping is set
          await setMappedBookmarkId(itemId, node.id);

          // Remove same-title duplicates that point to a different URL in this folder
          await removeDuplicateTitleBookmarksInFolder(
            tokens,
            collectionId,
            title,
            url,
            targetFolderId,
            context,
            stats,
          );
          return;
        }
        // Stale mapping
        await deleteMappedBookmarkId(itemId);
      }
    } catch (error) {
      // Ignore and fall back to URL-based logic
    }
  }

  // First, check if a bookmark with this URL already exists in the target folder
  // by querying the actual Chrome bookmarks API to prevent duplicates.
  // This addresses the issue where duplicate bookmarks could be created due to
  // race conditions or index synchronization problems.
  const existingBookmark = await findExistingBookmarkInFolder(
    url,
    targetFolderId,
  );

  if (existingBookmark) {
    // Bookmark already exists in the target folder, just update title if needed
    if (existingBookmark.title !== title) {
      await bookmarksUpdate(existingBookmark.id, { title });
      stats.bookmarksUpdated += 1;
    }

    // Update the context index
    const updatedEntry = {
      id: existingBookmark.id,
      parentId: targetFolderId,
      title,
      url,
      pathSegments: [...folderInfo.pathSegments],
    };

    context.index.bookmarks.set(existingBookmark.id, updatedEntry);
    const existingEntries = context.index.bookmarksByUrl.get(url) ?? [];
    const existingIndex = existingEntries.findIndex(
      (entry) => entry.parentId === targetFolderId,
    );

    if (existingIndex >= 0) {
      existingEntries[existingIndex] = updatedEntry;
    } else {
      existingEntries.push(updatedEntry);
    }
    context.index.bookmarksByUrl.set(url, existingEntries);

    // Record mapping for this item -> bookmark
    await setMappedBookmarkId(itemId, existingBookmark.id);

    // Remove same-title duplicates that point to a different URL in this folder
    await removeDuplicateTitleBookmarksInFolder(
      tokens,
      collectionId,
      title,
      url,
      targetFolderId,
      context,
      stats,
    );
    return;
  }

  const existingEntries = context.index.bookmarksByUrl.get(url) ?? [];
  let bookmarkEntry = existingEntries.find(
    (entry) => entry.parentId === targetFolderId,
  );

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
    await setMappedBookmarkId(itemId, bookmarkEntry.id);
    // Remove same-title duplicates that point to a different URL in this folder
    await removeDuplicateTitleBookmarksInFolder(
      tokens,
      collectionId,
      title,
      url,
      targetFolderId,
      context,
      stats,
    );
    return;
  }

  const created = await bookmarksCreate({
    parentId: targetFolderId,
    title,
    url,
  });

  stats.bookmarksCreated += 1;

  const newEntry = {
    id: created.id,
    parentId: targetFolderId,
    title,
    url,
    pathSegments: [...folderInfo.pathSegments],
  };

  context.index.bookmarks.set(newEntry.id, newEntry);
  if (!context.index.bookmarksByUrl.has(url)) {
    context.index.bookmarksByUrl.set(url, []);
  }
  const urlList = context.index.bookmarksByUrl.get(url);
  if (urlList) {
    urlList.push(newEntry);
  }

  await setMappedBookmarkId(itemId, newEntry.id);
  // Remove same-title duplicates that point to a different URL in this folder
  await removeDuplicateTitleBookmarksInFolder(
    tokens,
    collectionId,
    title,
    url,
    targetFolderId,
    context,
    stats,
  );
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
    throw new Error(
      'Raindrop credentials expired. Reconnect in Options to continue syncing.',
    );
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt,
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
      rootFolderName: DEFAULT_ROOT_FOLDER_NAME,
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
    [ROOT_FOLDER_SETTINGS_KEY]: data.map,
  });
}

/**
 * Ensure the mirror root and Unsorted bookmark folders exist.
 * @returns {Promise<{ rootId: string, unsortedId: string }>}
 */
async function ensureUnsortedBookmarkFolder() {
  const settingsData = await loadRootFolderSettings();
  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedRootTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME,
  );

  if (normalizedRootTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedRootTitle;
    settingsData.didMutate = true;
  }

  let rootFolder = await findChildFolderByTitle(parentId, normalizedRootTitle);
  if (!rootFolder) {
    rootFolder = await bookmarksCreate({
      parentId,
      title: normalizedRootTitle,
    });
  }

  let unsortedFolder = await findChildFolderByTitle(
    rootFolder.id,
    UNSORTED_TITLE,
  );
  if (!unsortedFolder) {
    unsortedFolder = await bookmarksCreate({
      parentId: rootFolder.id,
      title: UNSORTED_TITLE,
    });
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }

  return {
    rootId: rootFolder.id,
    unsortedId: unsortedFolder.id,
  };
}

/**
 * @typedef {Object} CollectionNode
 * @property {number} id
 * @property {string} title
 * @property {number} sort
 * @property {number | null} parentId
 * @property {CollectionNode[]} children
 */
