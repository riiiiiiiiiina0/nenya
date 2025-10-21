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
 * @typedef {Object} NotificationPreferences
 * @property {boolean} enabled
 * @property {NotificationBookmarkSettings} bookmark
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

const PROVIDER_ID = 'raindrop';
const STORAGE_KEY_TOKENS = 'cloudAuthTokens';
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const LOCAL_KEY_OLDEST_ITEM = 'OLDEST_RAINDROP_ITEM';
const LOCAL_KEY_OLDEST_DELETED = 'OLDEST_DELETED_RAINDROP_ITEM';
const DEFAULT_PARENT_FOLDER_ID = '1';
const DEFAULT_ROOT_FOLDER_NAME = 'Raindrop';
const UNSORTED_TITLE = 'Unsorted';
const SAVED_PROJECTS_GROUP_TITLE = 'Saved projects';
const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1';
const RAINDROP_UNSORTED_URL = 'https://app.raindrop.io/my/-1';
const BOOKMARK_MANAGER_URL_BASE = 'chrome://bookmarks/?id=';
const NOTIFICATION_ICON_PATH = 'assets/icons/icon-128x128.png';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';
const FETCH_PAGE_SIZE = 100;
const DEFAULT_BADGE_ANIMATION_DELAY = 300;

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
      const maybePromise = chrome.tabs.create({ url: targetUrl });
      if (isPromiseLike(maybePromise)) {
        void maybePromise.catch((error) => {
          console.warn('[notifications] Failed to open tab for notification click:', error);
        });
      }
    } catch (error) {
      console.warn('[notifications] Failed to open tab for notification click:', error);
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
 * Animate the extension action badge with emoji frames.
 * @param {string[]} emojis
 * @param {number} [delayMs=DEFAULT_BADGE_ANIMATION_DELAY]
 * @returns {BadgeAnimationHandle}
 */
export function animateActionBadge(emojis, delayMs = DEFAULT_BADGE_ANIMATION_DELAY) {
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
      if (currentBadgeAnimationHandle && currentBadgeAnimationHandle.token === token) {
        currentBadgeAnimationHandle = null;
      }
      setActionBadgeText('');
    }
  };

  if (!chrome?.action || !Array.isArray(emojis)) {
    return handle;
  }

  const frames = emojis.map((emoji) => {
    if (typeof emoji !== 'string') {
      return '';
    }
    const trimmed = emoji.trim();
    return trimmed;
  }).filter((emoji) => emoji.length > 0);

  if (frames.length === 0) {
    return handle;
  }

  const computedDelay = Number(delayMs);
  const frameDelay = Number.isFinite(computedDelay) && computedDelay > 0
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
    currentBadgeAnimationHandle.token === handle.token
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
      unsortedSaved: true
    }
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
      unsortedSaved: Boolean(value.bookmark.unsortedSaved)
    }
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

  const raw = /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings> }} */ (value);
  const bookmark = raw.bookmark ?? {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    bookmark: {
      enabled: typeof bookmark.enabled === 'boolean' ? bookmark.enabled : fallback.bookmark.enabled,
      pullFinished: typeof bookmark.pullFinished === 'boolean'
        ? bookmark.pullFinished
        : fallback.bookmark.pullFinished,
      unsortedSaved: typeof bookmark.unsortedSaved === 'boolean'
        ? bookmark.unsortedSaved
        : fallback.bookmark.unsortedSaved
    }
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
    console.warn('[notifications] Failed to load preferences; using defaults.', error);
    const defaults = createDefaultNotificationPreferences();
    updateNotificationPreferencesCache(defaults);
  }

  return notificationPreferencesCache;
}

/**
 * Retrieve cached notification preferences, loading them if needed.
 * @returns {Promise<NotificationPreferences>}
 */
async function getNotificationPreferences() {
  if (notificationPreferencesLoaded) {
    return notificationPreferencesCache;
  }

  if (!notificationPreferencesPromise) {
    notificationPreferencesPromise = loadNotificationPreferences().finally(() => {
      notificationPreferencesPromise = null;
    });
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
  const base = typeof prefix === 'string' && prefix.trim().length > 0
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
  if (!chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
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
async function pushNotification(prefix, title, message, targetUrl, contextMessage) {
  if (!chrome || !chrome.notifications) {
    return;
  }

  const safeTitle = typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : 'Nenya';
  const safeMessage = typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : '';

  if (safeMessage.length === 0) {
    return;
  }

  const notificationId = createNotificationId(prefix);
  /** @type {chrome.notifications.NotificationOptions} */
  const options = {
    type: 'basic',
    iconUrl: getNotificationIconUrl(),
    title: safeTitle,
    message: safeMessage,
    priority: 0
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
          console.warn('[notifications] Failed to create notification:', lastError.message);
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
  bookmarksDeleted: ['bookmark deleted', 'bookmarks deleted']
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
    parts
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
  if (!preferences.enabled || !preferences.bookmark.enabled || !preferences.bookmark.unsortedSaved) {
    return;
  }

  if (summary.ok) {
    const createdCount = Number(summary.created || 0);
    const updatedCount = Number(summary.updated || 0);
    const savedCount = createdCount + updatedCount;
    const title = 'Saved to Unsorted';
    const message = 'Saved ' + savedCount + ' ' + (savedCount === 1 ? 'URL' : 'URLs') + ' to Raindrop Unsorted.';
    const contextParts = [];

    if (savedCount === 0) {
      contextParts.push('All provided URLs were already saved.');
    }

    if (summary.skipped > 0) {
      contextParts.push(formatCountLabel(summary.skipped, 'duplicate'));
    }

    const contextMessage = contextParts.length > 0 ? contextParts.join(', ') : undefined;
    await pushNotification('unsorted-success', title, message, RAINDROP_UNSORTED_URL, contextMessage);
    return;
  }

  const reason = summary.error || (Array.isArray(summary.errors) ? summary.errors[0] : '') || 'Unknown error.';
  await pushNotification(
    'unsorted-failure',
    'Failed to Save URLs',
    sanitizeNotificationMessage(reason)
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
  if (!preferences.enabled || !preferences.bookmark.enabled || !preferences.bookmark.pullFinished) {
    return;
  }

  const title = 'Raindrop Sync Complete';
  const message = summary.total === 1
    ? 'Pulled 1 change from Raindrop.'
    : 'Pulled ' + summary.total + ' changes from Raindrop.';
  const contextMessage = summary.parts.length > 0
    ? summary.parts.join(', ')
    : 'No structural changes detected.';
  const targetUrl = typeof rootFolderId === 'string' && rootFolderId
    ? BOOKMARK_MANAGER_URL_BASE + encodeURIComponent(rootFolderId)
    : undefined;

  await pushNotification('mirror-success', title, message, targetUrl, contextMessage);
}

/**
 * Notify about a failed mirror pull.
 * @param {string} message
 * @returns {Promise<void>}
 */
async function notifyMirrorPullFailure(message) {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled || !preferences.bookmark.enabled || !preferences.bookmark.pullFinished) {
    return;
  }

  await pushNotification(
    'mirror-failure',
    'Raindrop Sync Failed',
    sanitizeNotificationMessage(message)
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
      error: 'Sync already in progress.'
    };
  }

  syncInProgress = true;
  const badgeAnimation = animateActionBadge(['⬇️', '🔽']);
  let finalBadge = '❌';
  try {
    const pullResult = await performMirrorPull(trigger);
    finalBadge = '✅';
    void notifyMirrorPullSuccess(pullResult.stats, pullResult.rootFolderId, trigger);
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
      error: 'Sync already in progress.'
    };
  }

  syncInProgress = true;
  const badgeAnimation = animateActionBadge(['⬇️', '🔽']);
  let finalBadge = '❌';
  try {
    const settingsData = await loadRootFolderSettings();
    await resetMirrorState(settingsData);
    const pullResult = await performMirrorPull('reset');
    finalBadge = '✅';
    void notifyMirrorPullSuccess(pullResult.stats, pullResult.rootFolderId, 'reset');
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
 * Save URLs to the Raindrop Unsorted collection and mirror them as bookmarks.
 * @param {SaveUnsortedEntry[]} entries
 * @returns {Promise<SaveUnsortedResult>}
 */
export async function saveUrlsToUnsorted(entries) {
  const badgeAnimation = animateActionBadge(['⬆️', '🔼']);
  /** @type {SaveUnsortedResult} */
  const summary = {
    ok: false,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: []
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

      if (seenUrls.has(normalizedUrl)) {
        summary.skipped += 1;
        continue;
      }

      seenUrls.add(normalizedUrl);
      sanitized.push({
        url: normalizedUrl,
        title: typeof entry?.title === 'string' ? entry.title.trim() : ''
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
      summary.error = 'No Raindrop connection found. Connect in Options to enable saving.';
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            link: entry.url,
            collectionId: -1,
            pleaseParse: {}
          })
        });

        const itemTitle = typeof response?.item?.title === 'string' ? response.item.title : '';
        const bookmarkTitle = normalizeBookmarkTitle(itemTitle || entry.title, entry.url);

        const existing = bookmarkByUrl.get(entry.url);
        if (existing) {
          const currentTitle = normalizeBookmarkTitle(existing.title, entry.url);
          if (currentTitle !== bookmarkTitle) {
            const updatedNode = await bookmarksUpdate(existing.id, { title: bookmarkTitle });
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
          url: entry.url
        });
        bookmarkByUrl.set(entry.url, createdNode);
        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(entry.url + ': ' + (error instanceof Error ? error.message : String(error)));
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
    errors: []
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
      summary.error = 'No Raindrop connection found. Connect in Options to enable saving.';
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

    await assignCollectionToGroup(tokens, ensureResult.groups, ensureResult.index, collection.id);

    for (const tab of resolved.tabs) {
      const itemPayload = buildProjectItemPayload(tab, groupContext, collection.id);
      try {
        await raindropRequest('/raindrop', tokens, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(itemPayload)
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
      errors.push(entry.url + ': ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  return {
    entries: filtered,
    skipped,
    failed,
    errors
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
    search: 'link:"' + escapeSearchValue(normalized) + '"'
  });

  const data = await raindropRequest('/raindrops/0?' + params.toString(), tokens);
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
  return {
    stats,
    rootFolderId: mirrorContext.rootFolderId
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
      windowId: Number.isFinite(entry?.windowId) ? Number(entry.windowId) : defaultWindowId,
      index: Number.isFinite(entry?.index) ? Number(entry.index) : -1,
      groupId: Number.isFinite(entry?.groupId) ? Number(entry.groupId) : noneGroupId,
      pinned: Boolean(entry?.pinned),
      url: normalizedUrl,
      title: typeof entry?.title === 'string' ? entry.title : ''
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
        title: descriptor.title
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

      const title = typeof tab?.title === 'string' ? tab.title : descriptor.title;
      results.push({
        id: descriptor.id,
        windowId: Number.isFinite(tab?.windowId) ? Number(tab.windowId) : descriptor.windowId,
        index: Number.isFinite(tab?.index) ? Number(tab.index) : descriptor.index,
        groupId: Number.isFinite(tab?.groupId) ? Number(tab.groupId) : descriptor.groupId,
        pinned: Boolean(tab?.pinned ?? descriptor.pinned),
        url: normalizedUrl,
        title: typeof title === 'string' ? title : ''
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
    tabIndexById: new Map()
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
      const groupColor = typeof group?.color === 'string' && group.color ? group.color : 'grey';
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
          .reduce((min, tab) => Math.min(min, Number(tab.index)), Number.POSITIVE_INFINITY);
        groupIndex = Number.isFinite(localFallback) ? localFallback : 0;
      }

      context.groupInfo.set(groupId, {
        name: groupTitle,
        color: groupColor,
        index: Number.isFinite(groupIndex) ? Number(groupIndex) : 0,
        windowId: Number(group?.windowId ?? chrome.windows?.WINDOW_ID_NONE ?? -1)
      });
    } catch (error) {
      // Ignore failures and fall back to basic index tracking.
    }
  }

  tabs.forEach((tab) => {
    if (!context.tabIndexById.has(tab.id)) {
      context.tabIndexById.set(tab.id, Number.isFinite(tab.index) ? Number(tab.index) : 0);
    }
  });

  return context;
}

/**
 * Ensure the Saved projects group exists and return its index.
 * @param {StoredProviderTokens} tokens
 * @returns {Promise<{ groups: any[], index: number }>}
 */
async function ensureSavedProjectsGroup(tokens) {
  const userData = await raindropRequest('/user', tokens);
  const groups = Array.isArray(userData?.user?.groups) ? [...userData.user.groups] : [];

  const matchIndex = groups.findIndex((group) => {
    const title = typeof group?.title === 'string' ? group.title : '';
    return title.trim().toLowerCase() === SAVED_PROJECTS_GROUP_TITLE.toLowerCase();
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
    collections: []
  };

  groups.push(newGroup);
  const updatedGroups = await updateUserGroups(tokens, groups);

  const updatedIndex = updatedGroups.findIndex((group) => {
    const title = typeof group?.title === 'string' ? group.title : '';
    return title.trim().toLowerCase() === SAVED_PROJECTS_GROUP_TITLE.toLowerCase();
  });

  return {
    groups: updatedGroups,
    index: updatedIndex >= 0 ? updatedIndex : updatedGroups.length - 1
  };
}

/**
 * Create a new Raindrop collection for the project.
 * @param {StoredProviderTokens} tokens
 * @param {string} projectName
 * @returns {Promise<{ id: number, title: string }>}
 */
async function createProjectCollection(tokens, projectName) {
  const payload = {
    title: projectName,
    view: 'list',
    public: false,
    sort: Date.now()
  };

  const response = await raindropRequest('/collection', tokens, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const item = response?.item;
  const id = Number(item?._id ?? item?.id);
  if (!Number.isFinite(id)) {
    throw new Error('Failed to create Raindrop collection for project.');
  }

  const title = normalizeFolderTitle(item?.title, projectName);
  return {
    id,
    title
  };
}

/**
 * Ensure the new collection is listed under the Saved projects group.
 * @param {StoredProviderTokens} tokens
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
    const collections = Array.isArray(group?.collections) ? [...group.collections] : [];
    const filtered = collections.filter((value) => Number(value) !== normalizedId);
    filtered.unshift(normalizedId);
    clone.collections = filtered;
    return clone;
  });

  const originalCollections = Array.isArray(groups[index]?.collections) ? groups[index].collections : [];
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
  const tabIndex = Number.isFinite(relativeIndex) ? Number(relativeIndex) : Number(tab.index);
  const metadata = {
    tab: {
      index: Number.isFinite(tabIndex) ? tabIndex : 0,
      pinned: Boolean(tab.pinned)
    }
  };

  const groupInfo = context.groupInfo.get(tab.groupId);
  if (groupInfo) {
    metadata.group = {
      name: groupInfo.name,
      color: groupInfo.color,
      index: groupInfo.index
    };
  }

  return {
    link: tab.url,
    title: normalizeBookmarkTitle(tab.title, tab.url),
    collectionId,
    pleaseParse: {},
    excerpt: JSON.stringify(metadata)
  };
}

/**
 * Update the user's Raindrop groups ordering.
 * @param {StoredProviderTokens} tokens
 * @param {any[]} groups
 * @returns {Promise<any[]>}
 */
async function updateUserGroups(tokens, groups) {
  const response = await raindropRequest('/user', tokens, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ groups })
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
 * Ensure the mirror root and Unsorted bookmark folders exist.
 * @returns {Promise<{ rootId: string, unsortedId: string }>}
 */
async function ensureUnsortedBookmarkFolder() {
  const settingsData = await loadRootFolderSettings();
  const parentId = await ensureParentFolderAvailable(settingsData);
  const normalizedRootTitle = normalizeFolderTitle(
    settingsData.settings.rootFolderName,
    DEFAULT_ROOT_FOLDER_NAME
  );

  if (normalizedRootTitle !== settingsData.settings.rootFolderName) {
    settingsData.settings.rootFolderName = normalizedRootTitle;
    settingsData.didMutate = true;
  }

  let rootFolder = await findChildFolderByTitle(parentId, normalizedRootTitle);
  if (!rootFolder) {
    rootFolder = await bookmarksCreate({
      parentId,
      title: normalizedRootTitle
    });
  }

  let unsortedFolder = await findChildFolderByTitle(rootFolder.id, UNSORTED_TITLE);
  if (!unsortedFolder) {
    unsortedFolder = await bookmarksCreate({
      parentId: rootFolder.id,
      title: UNSORTED_TITLE
    });
  }

  if (settingsData.didMutate) {
    await persistRootFolderSettings(settingsData);
  }

  return {
    rootId: rootFolder.id,
    unsortedId: unsortedFolder.id
  };
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
