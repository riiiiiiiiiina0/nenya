/* global chrome */

/**
 * @typedef {Object} RootFolderSettings
 * @property {string} parentFolderId
 * @property {string} rootFolderName
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
 * @typedef {Object} ExportFile
 * @property {number} version
 * @property {{
 *   provider: string,
 *   mirrorRootFolderSettings: RootFolderSettings,
 *   notificationPreferences: NotificationPreferences
 * }} data
 */

const PROVIDER_ID = 'raindrop';
const EXPORT_VERSION = 1;
const ROOT_FOLDER_SETTINGS_KEY = 'mirrorRootFolderSettings';
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

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
 * @returns {Promise<{ rootFolder: RootFolderSettings, notifications: NotificationPreferences }>}
 */
async function readCurrentOptions() {
  const [rootResp, notifResp] = await Promise.all([
    chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY),
    chrome.storage.sync.get(NOTIFICATION_PREFERENCES_KEY),
  ]);

  /** @type {Record<string, RootFolderSettings> | undefined} */
  const rootMap = /** @type {*} */ (rootResp?.[ROOT_FOLDER_SETTINGS_KEY]);
  const rootCandidate = rootMap?.[PROVIDER_ID];
  /** @type {RootFolderSettings} */
  const rootFolder = {
    parentFolderId:
      typeof rootCandidate?.parentFolderId === 'string' && rootCandidate.parentFolderId
        ? rootCandidate.parentFolderId
        : '1',
    rootFolderName:
      typeof rootCandidate?.rootFolderName === 'string' && rootCandidate.rootFolderName
        ? rootCandidate.rootFolderName
        : 'Raindrop',
  };

  const notifications = normalizePreferences(notifResp?.[NOTIFICATION_PREFERENCES_KEY]);
  return { rootFolder, notifications };
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
    const { rootFolder, notifications } = await readCurrentOptions();
    /** @type {ExportFile} */
    const payload = {
      version: EXPORT_VERSION,
      data: {
        provider: PROVIDER_ID,
        mirrorRootFolderSettings: rootFolder,
        notificationPreferences: notifications,
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
 * @param {RootFolderSettings} rootFolder
 * @param {NotificationPreferences} notifications
 * @returns {Promise<void>}
 */
async function applyImportedOptions(rootFolder, notifications) {
  // Sanitize
  const sanitizedRoot = {
    parentFolderId: typeof rootFolder?.parentFolderId === 'string' && rootFolder.parentFolderId ? rootFolder.parentFolderId : '1',
    rootFolderName: typeof rootFolder?.rootFolderName === 'string' && rootFolder.rootFolderName ? rootFolder.rootFolderName : 'Raindrop',
  };
  const sanitizedNotifications = normalizePreferences(notifications);

  // Read existing map to preserve other providers if any
  const existing = await chrome.storage.sync.get(ROOT_FOLDER_SETTINGS_KEY);
  /** @type {Record<string, RootFolderSettings>} */
  const map = /** @type {*} */ (existing?.[ROOT_FOLDER_SETTINGS_KEY]) || {};
  map[PROVIDER_ID] = sanitizedRoot;

  // Persist both keys
  await chrome.storage.sync.set({
    [ROOT_FOLDER_SETTINGS_KEY]: map,
    [NOTIFICATION_PREFERENCES_KEY]: sanitizedNotifications,
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

    const root = /** @type {RootFolderSettings} */ (data.mirrorRootFolderSettings);
    const notifications = /** @type {NotificationPreferences} */ (
      data.notificationPreferences
    );

    await applyImportedOptions(root, notifications);
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
