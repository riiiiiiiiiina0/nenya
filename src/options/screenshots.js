/* global chrome */

/**
 * @typedef {Object} ScreenshotSettings
 * @property {boolean} autoSave - Whether to automatically save screenshots to Downloads folder.
 */

const SCREENSHOT_SETTINGS_KEY = 'screenshotSettings';

/** @type {ScreenshotSettings} */
const DEFAULT_SCREENSHOT_SETTINGS = {
  autoSave: false,
};

const autoSaveToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('screenshotAutoSaveToggle')
);

/** @type {ScreenshotSettings} */
let settings = { ...DEFAULT_SCREENSHOT_SETTINGS };

/**
 * Normalize screenshot settings to ensure valid values.
 * @param {unknown} value
 * @returns {ScreenshotSettings}
 */
function normalizeSettings(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_SCREENSHOT_SETTINGS };
  }

  const raw = /** @type {Partial<ScreenshotSettings>} */ (value);
  return {
    autoSave: typeof raw.autoSave === 'boolean' ? raw.autoSave : DEFAULT_SCREENSHOT_SETTINGS.autoSave,
  };
}

/**
 * Read screenshot settings from chrome.storage.
 * @returns {Promise<ScreenshotSettings>}
 */
async function loadSettings() {
  if (!chrome?.storage?.local) {
    return { ...DEFAULT_SCREENSHOT_SETTINGS };
  }

  const result = await chrome.storage.local.get(SCREENSHOT_SETTINGS_KEY);
  const stored = result?.[SCREENSHOT_SETTINGS_KEY];
  return normalizeSettings(stored);
}

/**
 * Persist the current settings into chrome.storage.
 * @returns {Promise<void>}
 */
async function saveSettings() {
  if (!chrome?.storage?.local) {
    return;
  }

  await chrome.storage.local.set({
    [SCREENSHOT_SETTINGS_KEY]: settings
  });
}

/**
 * Apply the current settings to the UI controls.
 * @returns {void}
 */
function applySettingsToUI() {
  if (autoSaveToggle) {
    autoSaveToggle.checked = settings.autoSave;
  }
}

/**
 * Initialize listeners for the screenshot controls.
 * @returns {void}
 */
function attachEventListeners() {
  if (autoSaveToggle) {
    autoSaveToggle.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      settings.autoSave = target.checked;
      void saveSettings();
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
    if (areaName !== 'local') {
      return;
    }

    const detail = changes[SCREENSHOT_SETTINGS_KEY];
    if (!detail) {
      return;
    }

    settings = normalizeSettings(detail.newValue);
    applySettingsToUI();
  });
}

/**
 * Load settings and prepare the UI.
 * @returns {Promise<void>}
 */
async function initializeScreenshotControls() {
  if (!autoSaveToggle) {
    return;
  }

  settings = await loadSettings();
  applySettingsToUI();
}

attachEventListeners();
subscribeToStorageChanges();
void initializeScreenshotControls();

