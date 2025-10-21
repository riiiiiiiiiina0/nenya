/* global chrome */

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

const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

/** @type {NotificationPreferences} */
const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  bookmark: {
    enabled: true,
    pullFinished: true,
    unsortedSaved: true
  }
};

const globalToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationGlobalToggle')
);
const bookmarkToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationBookmarkToggle')
);
const bookmarkPullToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationBookmarkPullToggle')
);
const bookmarkUnsortedToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationBookmarkUnsortedToggle')
);

/** @type {NotificationPreferences} */
let preferences = clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);

/**
 * Create a deep clone of the provided preferences.
 * @param {NotificationPreferences} value
 * @returns {NotificationPreferences}
 */
function clonePreferences(value) {
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
 * Normalize possibly partial preferences into a complete object.
 * @param {unknown} value
 * @returns {NotificationPreferences}
 */
function normalizePreferences(value) {
  const fallback = clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
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
 * Read notification preferences from chrome.storage.
 * @returns {Promise<NotificationPreferences>}
 */
async function loadPreferences() {
  if (!chrome?.storage?.sync) {
    return clonePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
  }

  const result = await chrome.storage.sync.get(NOTIFICATION_PREFERENCES_KEY);
  const stored = result?.[NOTIFICATION_PREFERENCES_KEY];
  return normalizePreferences(stored);
}

/**
 * Persist the current preferences into chrome.storage.
 * @returns {Promise<void>}
 */
async function savePreferences() {
  if (!chrome?.storage?.sync) {
    return;
  }

  await chrome.storage.sync.set({
    [NOTIFICATION_PREFERENCES_KEY]: preferences
  });
}

/**
 * Apply the current preferences to the UI controls.
 * @returns {void}
 */
function applyPreferencesToUI() {
  if (globalToggle) {
    globalToggle.checked = preferences.enabled;
  }
  if (bookmarkToggle) {
    bookmarkToggle.checked = preferences.bookmark.enabled;
  }
  if (bookmarkPullToggle) {
    bookmarkPullToggle.checked = preferences.bookmark.pullFinished;
  }
  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.checked = preferences.bookmark.unsortedSaved;
  }

  updateToggleDisabledState();
}

/**
 * Update the disabled state of dependent toggles.
 * @returns {void}
 */
function updateToggleDisabledState() {
  const bookmarkDisabled = !preferences.enabled;
  const childDisabled = bookmarkDisabled || !preferences.bookmark.enabled;

  if (bookmarkToggle) {
    bookmarkToggle.disabled = bookmarkDisabled;
    bookmarkToggle.setAttribute('aria-disabled', bookmarkDisabled ? 'true' : 'false');
  }
  if (bookmarkPullToggle) {
    bookmarkPullToggle.disabled = childDisabled;
    bookmarkPullToggle.setAttribute('aria-disabled', childDisabled ? 'true' : 'false');
  }
  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.disabled = childDisabled;
    bookmarkUnsortedToggle.setAttribute('aria-disabled', childDisabled ? 'true' : 'false');
  }
}

/**
 * Handle updates triggered by the global toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleGlobalToggleChange(checked) {
  preferences.enabled = checked;
  updateToggleDisabledState();
  void savePreferences();
}

/**
 * Handle updates triggered by the bookmark group toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleBookmarkToggleChange(checked) {
  preferences.bookmark.enabled = checked;
  updateToggleDisabledState();
  void savePreferences();
}

/**
 * Initialize listeners for the notification controls.
 * @returns {void}
 */
function attachEventListeners() {
  if (globalToggle) {
    globalToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleGlobalToggleChange(target.checked);
    });
  }

  if (bookmarkToggle) {
    bookmarkToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleBookmarkToggleChange(target.checked);
    });
  }

  if (bookmarkPullToggle) {
    bookmarkPullToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.bookmark.pullFinished = target.checked;
      void savePreferences();
    });
  }

  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.bookmark.unsortedSaved = target.checked;
      void savePreferences();
    });
  }
}

/**
 * Respond to storage updates from other contexts.
 * @returns {void}
 */
function subscribeToStorageChanges() {
  if (!chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    const detail = changes[NOTIFICATION_PREFERENCES_KEY];
    if (!detail) {
      return;
    }

    preferences = normalizePreferences(detail.newValue);
    applyPreferencesToUI();
  });
}

/**
 * Load preferences and prepare the UI.
 * @returns {Promise<void>}
 */
async function initializeNotificationControls() {
  if (!globalToggle || !bookmarkToggle || !bookmarkPullToggle || !bookmarkUnsortedToggle) {
    return;
  }

  preferences = await loadPreferences();
  applyPreferencesToUI();
}

attachEventListeners();
subscribeToStorageChanges();
void initializeNotificationControls();
