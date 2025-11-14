/**
 * Tab Snapshots Module
 * Captures and stores snapshots of active tabs in Chrome local storage.
 * @module tab-snapshots
 */

const SNAPSHOTS_STORAGE_KEY = 'tabSnapshots';
const MAX_SNAPSHOTS = 10;
const SNAPSHOT_WIDTH = 400;

/**
 * @typedef {Object} TabSnapshot
 * @property {number} tabId - The ID of the tab
 * @property {string} title - The title of the page
 * @property {string} favicon - The favicon URL
 * @property {string} thumbnail - Base64 encoded thumbnail image
 * @property {number} timestamp - When this snapshot was taken (milliseconds since epoch)
 */

/**
 * Resize an image to the specified width while maintaining aspect ratio.
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {number} targetWidth - Target width in pixels
 * @returns {Promise<string>} Resized image as base64 data URL
 */
async function resizeImage(dataUrl, targetWidth) {
  try {
    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create ImageBitmap (works in service workers)
    const imageBitmap = await createImageBitmap(blob);

    // Calculate target dimensions
    const aspectRatio = imageBitmap.height / imageBitmap.width;
    const targetHeight = Math.round(targetWidth * aspectRatio);

    // Create canvas and draw resized image
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    // Convert to blob
    const resizedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.8,
    });

    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(/** @type {string} */ (reader.result));
      };
      reader.onerror = () => {
        reject(new Error('Failed to read resized image'));
      };
      reader.readAsDataURL(resizedBlob);
    });
  } catch (error) {
    console.error('[tab-snapshots] Failed to resize image:', error);
    throw error;
  }
}

/**
 * Capture a screenshot of the visible tab area and resize it.
 * @param {number} windowId - The window ID containing the tab
 * @returns {Promise<string>} Base64 encoded thumbnail image
 */
async function captureTabScreenshot(windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'jpeg',
      quality: 90,
    });

    const thumbnail = await resizeImage(dataUrl, SNAPSHOT_WIDTH);
    return thumbnail;
  } catch (error) {
    console.error('[tab-snapshots] Failed to capture screenshot:', error);
    console.error('[tab-snapshots] Error details:', {
      message: error.message,
      windowId: windowId,
    });
    // Return a placeholder or empty thumbnail
    return '';
  }
}

/**
 * Create a snapshot of a tab.
 * @param {number} tabId - The ID of the tab
 * @returns {Promise<TabSnapshot|null>} The snapshot object or null if failed
 */
async function createSnapshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    // Validate tab ID
    if (typeof tab.id !== 'number') {
      return null;
    }

    // Only capture snapshots for loaded tabs
    if (tab.status !== 'complete') {
      return null;
    }

    // Skip chrome:// and other internal URLs
    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url === ''
    ) {
      return null;
    }

    // Ensure tab is active before capturing
    if (!tab.active) {
      return null;
    }

    const thumbnail = await captureTabScreenshot(tab.windowId);

    // Check if thumbnail is actually captured
    if (!thumbnail || thumbnail.length === 0) {
      console.warn(
        '[tab-snapshots] Thumbnail is empty, capture may have failed',
      );
      // Still save the snapshot without thumbnail for metadata
    }

    /** @type {TabSnapshot} */
    const snapshot = {
      tabId: tab.id,
      title: tab.title || tab.url || 'Untitled',
      favicon: tab.favIconUrl || '',
      thumbnail: thumbnail,
      timestamp: Date.now(),
    };

    return snapshot;
  } catch (error) {
    console.warn(
      '[tab-snapshots] Failed to create snapshot for tab',
      tabId,
      ':',
      error,
    );
    return null;
  }
}

/**
 * Save a snapshot to storage, maintaining only the last 10 unique snapshots by tab ID.
 * If a snapshot with the same tab ID already exists, merge them (preserve thumbnail if it exists).
 * @param {TabSnapshot} snapshot - The snapshot to save
 * @returns {Promise<void>}
 */
async function saveSnapshot(snapshot) {
  try {
    const result = await chrome.storage.local.get(SNAPSHOTS_STORAGE_KEY);
    /** @type {TabSnapshot[]} */
    let snapshots = Array.isArray(result[SNAPSHOTS_STORAGE_KEY])
      ? result[SNAPSHOTS_STORAGE_KEY]
      : [];

    // Find existing snapshot with the same tab ID
    const existingIndex = snapshots.findIndex(
      (s) => s.tabId === snapshot.tabId,
    );

    if (existingIndex >= 0) {
      // Merge with existing snapshot: preserve thumbnail if it exists and new one is empty
      const existing = snapshots[existingIndex];
      const mergedSnapshot = {
        ...snapshot,
        // Preserve existing thumbnail if new one is empty or missing
        thumbnail:
          snapshot.thumbnail && snapshot.thumbnail.length > 0
            ? snapshot.thumbnail
            : existing.thumbnail || '',
        // Use newer timestamp
        timestamp: Math.max(snapshot.timestamp, existing.timestamp),
      };
      snapshots[existingIndex] = mergedSnapshot;
      // Move to beginning (most recent)
      snapshots = [
        mergedSnapshot,
        ...snapshots.slice(0, existingIndex),
        ...snapshots.slice(existingIndex + 1),
      ];
    } else {
      // Add new snapshot at the beginning
      snapshots.unshift(snapshot);
    }

    // Keep only the last MAX_SNAPSHOTS
    snapshots = snapshots.slice(0, MAX_SNAPSHOTS);

    await chrome.storage.local.set({
      [SNAPSHOTS_STORAGE_KEY]: snapshots,
    });
  } catch (error) {
    console.error('[tab-snapshots] Failed to save snapshot:', error);
  }
}

/**
 * Save tab metadata immediately without waiting for screenshot.
 * This ensures all tabs are visible in the tab switcher even without screenshots.
 * @param {number} tabId - The ID of the tab
 * @returns {Promise<void>}
 */
async function saveTabMetadata(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    // Validate tab ID
    if (typeof tab.id !== 'number') {
      return;
    }

    // Skip chrome:// and other internal URLs
    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url === ''
    ) {
      return;
    }

    // Create metadata snapshot without screenshot
    /** @type {TabSnapshot} */
    const metadataSnapshot = {
      tabId: tab.id,
      title: tab.title || tab.url || 'Untitled',
      favicon: tab.favIconUrl || '',
      thumbnail: '', // No screenshot yet
      timestamp: Date.now(),
    };

    await saveSnapshot(metadataSnapshot);
  } catch (error) {
    // Tab might have been closed already, ignore error
  }
}

/**
 * Handle tab activation - update screenshot when user switches to a different tab.
 * The metadata should already be saved, so we just update the screenshot.
 * @param {Object} activeInfo - Information about the activated tab
 * @param {number} activeInfo.tabId - The tab ID that was activated
 * @returns {Promise<void>}
 */
async function handleTabActivated(activeInfo) {
  try {
    // Add delay to ensure:
    // 1. Tab switcher (if used) has been removed from DOM
    // 2. Tab is fully rendered and visible
    // 3. Any UI animations have completed
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Update screenshot (metadata is already saved)
    const snapshot = await createSnapshot(activeInfo.tabId);
    if (snapshot) {
      await saveSnapshot(snapshot);
    }
  } catch (error) {
    console.warn('[tab-snapshots] Failed to handle tab activation:', error);
  }
}

/**
 * Handle tab update - save metadata immediately when page finishes loading.
 * If the tab is active, also update the screenshot.
 * @param {number} tabId - The ID of the updated tab
 * @param {Object} changeInfo - Information about what changed
 * @param {string} [changeInfo.status] - The loading status of the tab
 * @param {Object} tab - The complete tab object
 * @param {boolean} [tab.active] - Whether the tab is active
 * @returns {Promise<void>}
 */
async function handleTabUpdated(tabId, changeInfo, tab) {
  // Save metadata immediately when page finishes loading
  if (changeInfo.status === 'complete') {
    void saveTabMetadata(tabId);

    // If tab is active, also update screenshot after a delay
    if (tab.active) {
      try {
        // Add delay to ensure:
        // 1. Page is fully rendered (DOM ready + initial paint)
        // 2. Dynamic content has loaded
        // 3. CSS animations/transitions have completed
        // 4. Lazy-loaded images are visible
        await new Promise((resolve) => setTimeout(resolve, 500));

        const snapshot = await createSnapshot(tabId);
        if (snapshot) {
          await saveSnapshot(snapshot);
        }
      } catch (error) {
        console.warn('[tab-snapshots] Failed to handle tab update:', error);
      }
    }
  } else if (changeInfo.title || changeInfo.favIconUrl) {
    // Update metadata immediately when title or favicon changes
    void saveTabMetadata(tabId);
  }
}

/**
 * Handle tab removal - remove snapshot when tab is closed.
 * @param {number} tabId - The ID of the removed tab
 * @returns {Promise<void>}
 */
async function handleTabRemoved(tabId) {
  try {
    const result = await chrome.storage.local.get(SNAPSHOTS_STORAGE_KEY);
    /** @type {TabSnapshot[]} */
    let snapshots = Array.isArray(result[SNAPSHOTS_STORAGE_KEY])
      ? result[SNAPSHOTS_STORAGE_KEY]
      : [];

    // Remove snapshot with the matching tab ID
    const originalLength = snapshots.length;
    snapshots = snapshots.filter((s) => s.tabId !== tabId);

    // Only update storage if something was removed
    if (snapshots.length < originalLength) {
      await chrome.storage.local.set({
        [SNAPSHOTS_STORAGE_KEY]: snapshots,
      });
    }
  } catch (error) {
    console.warn('[tab-snapshots] Failed to handle tab removal:', error);
  }
}

/**
 * Handle tab creation - save metadata immediately when a new tab is created.
 * @param {chrome.tabs.Tab} tab - The newly created tab
 * @returns {Promise<void>}
 */
async function handleTabCreated(tab) {
  // Save metadata immediately when tab is created
  if (tab.id && typeof tab.id === 'number') {
    void saveTabMetadata(tab.id);
  }
}

/**
 * Initialize the tab snapshots feature by setting up event listeners.
 * @returns {void}
 */
export function initializeTabSnapshots() {
  // Save metadata immediately when tabs are created
  chrome.tabs.onCreated.addListener((tab) => {
    void handleTabCreated(tab);
  });

  // Update metadata when tabs are activated (also update screenshot)
  chrome.tabs.onActivated.addListener((activeInfo) => {
    void handleTabActivated(activeInfo);
  });

  // Update metadata when tabs are updated (also update screenshot if active)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void handleTabUpdated(tabId, changeInfo, tab);
  });

  // Remove metadata when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    void handleTabRemoved(tabId);
  });
}

/**
 * Get all stored snapshots.
 * @returns {Promise<TabSnapshot[]>} Array of snapshots sorted by timestamp descending
 */
export async function getSnapshots() {
  try {
    const result = await chrome.storage.local.get(SNAPSHOTS_STORAGE_KEY);
    return Array.isArray(result[SNAPSHOTS_STORAGE_KEY])
      ? result[SNAPSHOTS_STORAGE_KEY]
      : [];
  } catch (error) {
    console.error('[tab-snapshots] Failed to get snapshots:', error);
    return [];
  }
}

/**
 * Clear all stored snapshots.
 * @returns {Promise<void>}
 */
export async function clearSnapshots() {
  try {
    await chrome.storage.local.remove(SNAPSHOTS_STORAGE_KEY);
  } catch (error) {
    console.error('[tab-snapshots] Failed to clear snapshots:', error);
  }
}
