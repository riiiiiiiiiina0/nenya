/* global chrome */

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

const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

/** @type {NotificationPreferences} */
const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: true,
  bookmark: {
    enabled: true,
    pullFinished: true,
    unsortedSaved: true
  },
  project: {
    enabled: true,
    saveProject: true,
    addTabs: true,
    replaceItems: true,
    deleteProject: true
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
const projectToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationProjectToggle')
);
const projectSaveToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationProjectSaveToggle')
);
const projectAddToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationProjectAddToggle')
);
const projectReplaceToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationProjectReplaceToggle')
);
const projectDeleteToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('notificationProjectDeleteToggle')
);

// Section elements for showing/hiding based on login status
const bookmarkManagementSection = /** @type {HTMLElement | null} */ (
  document.querySelector('[aria-labelledby="notifications-bookmark-heading"]')
);
const projectManagementSection = /** @type {HTMLElement | null} */ (
  document.querySelector('[aria-labelledby="notifications-project-heading"]')
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
    },
    project: {
      enabled: Boolean(value.project?.enabled),
      saveProject: Boolean(value.project?.saveProject),
      addTabs: Boolean(value.project?.addTabs),
      replaceItems: Boolean(value.project?.replaceItems),
      deleteProject: Boolean(value.project?.deleteProject)
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

  const raw = /** @type {{ enabled?: unknown, bookmark?: Partial<NotificationBookmarkSettings>, project?: Partial<NotificationProjectSettings> }} */ (value);
  const bookmark = raw.bookmark ?? {};
  const project = raw.project ?? {};

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
    },
    project: {
      enabled: typeof project.enabled === 'boolean' ? project.enabled : fallback.project.enabled,
      saveProject: typeof project.saveProject === 'boolean'
        ? project.saveProject
        : fallback.project.saveProject,
      addTabs: typeof project.addTabs === 'boolean'
        ? project.addTabs
        : fallback.project.addTabs,
      replaceItems: typeof project.replaceItems === 'boolean'
        ? project.replaceItems
        : fallback.project.replaceItems,
      deleteProject: typeof project.deleteProject === 'boolean'
        ? project.deleteProject
        : fallback.project.deleteProject
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
  if (projectToggle) {
    projectToggle.checked = preferences.project.enabled;
  }
  if (projectSaveToggle) {
    projectSaveToggle.checked = preferences.project.saveProject;
  }
  if (projectAddToggle) {
    projectAddToggle.checked = preferences.project.addTabs;
  }
  if (projectReplaceToggle) {
    projectReplaceToggle.checked = preferences.project.replaceItems;
  }
  if (projectDeleteToggle) {
    projectDeleteToggle.checked = preferences.project.deleteProject;
  }

  updateToggleDisabledState();
}

/**
 * Update the disabled state of dependent toggles.
 * @returns {void}
 */
function updateToggleDisabledState() {
  const bookmarkDisabled = !preferences.enabled;
  const bookmarkChildDisabled = bookmarkDisabled || !preferences.bookmark.enabled;
  const projectDisabled = !preferences.enabled;
  const projectChildDisabled = projectDisabled || !preferences.project.enabled;

  if (bookmarkToggle) {
    bookmarkToggle.disabled = bookmarkDisabled;
    bookmarkToggle.setAttribute('aria-disabled', bookmarkDisabled ? 'true' : 'false');
  }
  if (bookmarkPullToggle) {
    bookmarkPullToggle.disabled = bookmarkChildDisabled;
    bookmarkPullToggle.setAttribute('aria-disabled', bookmarkChildDisabled ? 'true' : 'false');
  }
  if (bookmarkUnsortedToggle) {
    bookmarkUnsortedToggle.disabled = bookmarkChildDisabled;
    bookmarkUnsortedToggle.setAttribute('aria-disabled', bookmarkChildDisabled ? 'true' : 'false');
  }
  if (projectToggle) {
    projectToggle.disabled = projectDisabled;
    projectToggle.setAttribute('aria-disabled', projectDisabled ? 'true' : 'false');
  }
  if (projectSaveToggle) {
    projectSaveToggle.disabled = projectChildDisabled;
    projectSaveToggle.setAttribute('aria-disabled', projectChildDisabled ? 'true' : 'false');
  }
  if (projectAddToggle) {
    projectAddToggle.disabled = projectChildDisabled;
    projectAddToggle.setAttribute('aria-disabled', projectChildDisabled ? 'true' : 'false');
  }
  if (projectReplaceToggle) {
    projectReplaceToggle.disabled = projectChildDisabled;
    projectReplaceToggle.setAttribute('aria-disabled', projectChildDisabled ? 'true' : 'false');
  }
  if (projectDeleteToggle) {
    projectDeleteToggle.disabled = projectChildDisabled;
    projectDeleteToggle.setAttribute('aria-disabled', projectChildDisabled ? 'true' : 'false');
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
 * Handle updates triggered by the project group toggle.
 * @param {boolean} checked
 * @returns {void}
 */
function handleProjectToggleChange(checked) {
  preferences.project.enabled = checked;
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

  if (projectToggle) {
    projectToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      handleProjectToggleChange(target.checked);
    });
  }

  if (projectSaveToggle) {
    projectSaveToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.project.saveProject = target.checked;
      void savePreferences();
    });
  }

  if (projectAddToggle) {
    projectAddToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.project.addTabs = target.checked;
      void savePreferences();
    });
  }

  if (projectReplaceToggle) {
    projectReplaceToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.project.replaceItems = target.checked;
      void savePreferences();
    });
  }

  if (projectDeleteToggle) {
    projectDeleteToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      preferences.project.deleteProject = target.checked;
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
  if (!globalToggle || !bookmarkToggle || !bookmarkPullToggle || !bookmarkUnsortedToggle || 
      !projectToggle || !projectSaveToggle || !projectAddToggle || !projectReplaceToggle || !projectDeleteToggle) {
    return;
  }

  preferences = await loadPreferences();
  applyPreferencesToUI();
}

/**
 * Show or hide the bookmark and project management sections based on login status.
 * @param {boolean} isLoggedIn - Whether the user is logged in
 * @returns {void}
 */
export function updateNotificationSectionsVisibility(isLoggedIn) {
  if (bookmarkManagementSection) {
    bookmarkManagementSection.hidden = !isLoggedIn;
  }
  if (projectManagementSection) {
    projectManagementSection.hidden = !isLoggedIn;
  }
}

// Reflect imported/restored preference changes live in the controls
if (chrome?.storage?.onChanged) {
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

attachEventListeners();
subscribeToStorageChanges();
void initializeNotificationControls();
