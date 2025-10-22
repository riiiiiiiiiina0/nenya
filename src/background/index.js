import {
  MIRROR_ALARM_NAME,
  MIRROR_PULL_INTERVAL_MINUTES,
  resetAndPull,
  runMirrorPull,
  saveUrlsToUnsorted,
  saveTabsAsProject,
  listSavedProjects,
  addTabsToProject,
} from './mirror.js';

const MANUAL_PULL_MESSAGE = 'mirror:pull';
const RESET_PULL_MESSAGE = 'mirror:resetPull';
const SAVE_UNSORTED_MESSAGE = 'mirror:saveToUnsorted';
const SAVE_PROJECT_MESSAGE = 'mirror:saveProject';
const LIST_PROJECTS_MESSAGE = 'mirror:listProjects';
const GET_CACHED_PROJECTS_MESSAGE = 'mirror:getCachedProjects';
const ADD_PROJECT_TABS_MESSAGE = 'mirror:addTabsToProject';
const CONTEXT_MENU_SAVE_PAGE_ID = 'nenya-save-unsorted-page';
const CONTEXT_MENU_SAVE_LINK_ID = 'nenya-save-unsorted-link';

// Storage keys for caching
const CACHED_PROJECTS_KEY = 'cachedProjects';
const CACHED_PROJECTS_TIMESTAMP_KEY = 'cachedProjectsTimestamp';

/**
 * Cache the projects list to local storage.
 * @param {any[]} projects
 * @returns {Promise<void>}
 */
async function cacheProjectsList(projects) {
  try {
    const timestamp = Date.now();
    await chrome.storage.local.set({
      [CACHED_PROJECTS_KEY]: projects,
      [CACHED_PROJECTS_TIMESTAMP_KEY]: timestamp,
    });
  } catch (error) {
    console.warn('[background] Failed to cache projects list:', error);
  }
}

/**
 * Get cached projects from local storage.
 * @returns {Promise<{ ok: boolean, projects?: any[], error?: string, cachedAt?: number }>}
 */
async function getCachedProjects() {
  try {
    const result = await chrome.storage.local.get([
      CACHED_PROJECTS_KEY,
      CACHED_PROJECTS_TIMESTAMP_KEY,
    ]);
    const projects = result[CACHED_PROJECTS_KEY];
    const timestamp = result[CACHED_PROJECTS_TIMESTAMP_KEY];

    if (!Array.isArray(projects)) {
      return { ok: false, error: 'No cached projects found' };
    }

    return {
      ok: true,
      projects,
      cachedAt: timestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/**
 * Ensure the repeating alarm is scheduled.
 * @returns {Promise<void>}
 */
async function scheduleMirrorAlarm() {
  chrome.alarms.create(MIRROR_ALARM_NAME, {
    periodInMinutes: MIRROR_PULL_INTERVAL_MINUTES,
  });
}

/**
 * Handle one-time initialization tasks.
 * @param {string} trigger
 * @returns {void}
 */
function handleLifecycleEvent(trigger) {
  setupContextMenus();
  void scheduleMirrorAlarm();
  void runMirrorPull(trigger).catch((error) => {
    console.warn(
      '[mirror] Initial pull skipped:',
      error instanceof Error ? error.message : error,
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  handleLifecycleEvent('install');
});

chrome.runtime.onStartup.addListener(() => {
  handleLifecycleEvent('startup');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== MIRROR_ALARM_NAME) {
    return;
  }

  void runMirrorPull('alarm').catch((error) => {
    console.error('[mirror] Scheduled pull failed:', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === SAVE_UNSORTED_MESSAGE) {
    const entries = Array.isArray(message.entries) ? message.entries : [];
    saveUrlsToUnsorted(entries)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === SAVE_PROJECT_MESSAGE) {
    const projectName =
      typeof message.projectName === 'string' ? message.projectName : '';
    const tabs = Array.isArray(message.tabs) ? message.tabs : [];
    saveTabsAsProject(projectName, tabs)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === ADD_PROJECT_TABS_MESSAGE) {
    const projectId = Number(message.projectId);
    const tabs = Array.isArray(message.tabs) ? message.tabs : [];
    addTabsToProject(projectId, tabs)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === LIST_PROJECTS_MESSAGE) {
    listSavedProjects()
      .then((result) => {
        // Cache the projects list if successful
        if (result && result.ok && Array.isArray(result.projects)) {
          void cacheProjectsList(result.projects);
        }
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === GET_CACHED_PROJECTS_MESSAGE) {
    getCachedProjects()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === MANUAL_PULL_MESSAGE) {
    runMirrorPull('manual')
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === RESET_PULL_MESSAGE) {
    resetAndPull()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  return false;
});

/**
 * Ensure extension context menu entries exist.
 * @returns {void}
 */
function setupContextMenus() {
  if (!chrome.contextMenus) {
    return;
  }

  chrome.contextMenus.removeAll(() => {
    const error = chrome.runtime.lastError;
    if (error) {
      console.warn(
        '[contextMenu] Failed to clear existing items:',
        error.message,
      );
    }

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_SAVE_PAGE_ID,
        title: 'Save to Raindrop Unsorted',
        contexts: ['page'],
      },
      () => {
        const createError = chrome.runtime.lastError;
        if (createError) {
          console.warn(
            '[contextMenu] Failed to register page item:',
            createError.message,
          );
        }
      },
    );

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_SAVE_LINK_ID,
        title: 'Save link to Raindrop Unsorted',
        contexts: ['link'],
      },
      () => {
        const createError = chrome.runtime.lastError;
        if (createError) {
          console.warn(
            '[contextMenu] Failed to register link item:',
            createError.message,
          );
        }
      },
    );
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_SAVE_PAGE_ID) {
      const url = typeof info.pageUrl === 'string' ? info.pageUrl : '';
      if (!url) {
        return;
      }
      const title = typeof tab?.title === 'string' ? tab.title : '';
      void saveUrlsToUnsorted([{ url, title }]).catch((error) => {
        console.error('[contextMenu] Failed to save page:', error);
      });
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_SAVE_LINK_ID) {
      const url = typeof info.linkUrl === 'string' ? info.linkUrl : '';
      if (!url) {
        return;
      }
      const selection =
        typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
      const title =
        selection || (typeof tab?.title === 'string' ? tab.title : '');
      void saveUrlsToUnsorted([{ url, title }]).catch((error) => {
        console.error('[contextMenu] Failed to save link:', error);
      });
    }
  });
}
