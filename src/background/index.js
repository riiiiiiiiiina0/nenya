import {
  MIRROR_ALARM_NAME,
  MIRROR_PULL_INTERVAL_MINUTES,
  resetAndPull,
  runMirrorPull,
  saveUrlsToUnsorted,
  normalizeHttpUrl,
} from './mirror.js';
import {
  SAVE_PROJECT_MESSAGE,
  LIST_PROJECTS_MESSAGE,
  GET_CACHED_PROJECTS_MESSAGE,
  ADD_PROJECT_TABS_MESSAGE,
  REPLACE_PROJECT_ITEMS_MESSAGE,
  DELETE_PROJECT_MESSAGE,
  RESTORE_PROJECT_TABS_MESSAGE,
  handleSaveProjectMessage,
  handleListProjectsMessage,
  handleGetCachedProjectsMessage,
  handleAddTabsToProjectMessage,
  handleReplaceProjectItemsMessage,
  handleDeleteProjectMessage,
  handleRestoreProjectTabsMessage,
} from './projects.js';
import {
  initializeOptionsBackupService,
  handleOptionsBackupLifecycle,
  handleOptionsBackupMessage,
} from './options-backup.js';
import {
  initializeAutoReloadFeature,
  handleAutoReloadAlarm,
  getActiveAutoReloadStatus,
  evaluateAllTabs,
} from './auto-reload.js';
import { saveTabsAsProject } from './projects.js';
import {
  setupClipboardContextMenus,
  handleClipboardContextMenuClick,
  updateClipboardContextMenuVisibility,
} from './clipboard.js';

const MANUAL_PULL_MESSAGE = 'mirror:pull';
const RESET_PULL_MESSAGE = 'mirror:resetPull';
const SAVE_UNSORTED_MESSAGE = 'mirror:saveToUnsorted';
const CONTEXT_MENU_SAVE_PAGE_ID = 'nenya-save-unsorted-page';
const CONTEXT_MENU_SAVE_LINK_ID = 'nenya-save-unsorted-link';
const GET_CURRENT_TAB_ID_MESSAGE = 'getCurrentTabId';
const GET_AUTO_RELOAD_STATUS_MESSAGE = 'autoReload:getStatus';
const AUTO_RELOAD_RE_EVALUATE_MESSAGE = 'autoReload:reEvaluate';

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
  setupClipboardContextMenus();
  void scheduleMirrorAlarm();
  initializeOptionsBackupService();
  void handleOptionsBackupLifecycle(trigger).then(async () => {
    // Re-evaluate auto reload rules after options backup restore completes
    try {
      await evaluateAllTabs();
    } catch (error) {
      console.warn('[background] Failed to re-evaluate auto reload rules after options backup:', error);
    }
  }).catch((error) => {
    console.warn(
      '[options-backup] Lifecycle restore skipped:',
      error instanceof Error ? error.message : error,
    );
  });
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

/**
 * Handle keyboard shortcuts (commands).
 * @param {string} command
 * @returns {void}
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'pull-raindrop') {
    void runMirrorPull('manual').catch((error) => {
      console.warn('[commands] Pull failed:', error);
    });
    return;
  }

  if (command === 'save-to-unsorted') {
    void (async () => {
      try {
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }
        const seen = new Set();
        /** @type {{ url: string, title?: string }[]} */
        const entries = [];
        tabs.forEach((tab) => {
          const normalized = normalizeHttpUrl(typeof tab.url === 'string' ? tab.url : '');
          if (!normalized || seen.has(normalized)) {
            return;
          }
          seen.add(normalized);
          entries.push({ url: normalized, title: typeof tab.title === 'string' ? tab.title : '' });
        });
        if (entries.length > 0) {
          await saveUrlsToUnsorted(entries);
        }
      } catch (error) {
        console.warn('[commands] Save to Unsorted failed:', error);
      }
    })();
    return;
  }

  if (command === 'save-project') {
    void (async () => {
      try {
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }
        const descriptors = [];
        const seen = new Set();
        tabs.forEach((tab) => {
          if (!tab || typeof tab.id !== 'number') {
            return;
          }
          const normalized = normalizeHttpUrl(typeof tab.url === 'string' ? tab.url : '');
          if (!normalized || seen.has(normalized)) {
            return;
          }
          seen.add(normalized);
          descriptors.push({
            id: tab.id,
            windowId: typeof tab.windowId === 'number' ? tab.windowId : (chrome.windows?.WINDOW_ID_NONE ?? -1),
            index: typeof tab.index === 'number' ? tab.index : -1,
            groupId: typeof tab.groupId === 'number' ? tab.groupId : (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1),
            pinned: Boolean(tab.pinned),
            url: normalized,
            title: typeof tab.title === 'string' ? tab.title : '',
          });
        });
        if (descriptors.length === 0) {
          return;
        }

        // Prompt user for project name in the active tab
        let projectName = '';
        try {
          const activeTabs = await chrome.tabs.query({ currentWindow: true, active: true });
          const active = activeTabs && activeTabs[0];
          if (active && typeof active.id === 'number') {
            const results = await chrome.scripting.executeScript({
              target: { tabId: active.id },
              func: () => {
                const base = document.title || (typeof location?.href === 'string' ? (() => { try { return new URL(location.href).hostname; } catch { return 'project'; } })() : 'project');
                const input = window.prompt('Project name', base);
                return input && input.trim() ? input.trim() : null;
              },
              world: 'ISOLATED',
            });
            const value = Array.isArray(results) && results[0] ? results[0].result : null;
            if (!value) {
              return;
            }
            projectName = String(value);
          }
        } catch (e) {
          // Fallback: derive a name if prompt was not possible
          const first = tabs[0];
          if (first && typeof first.title === 'string' && first.title.trim()) {
            projectName = first.title.trim();
          } else if (first && typeof first.url === 'string') {
            try {
              projectName = new URL(first.url).hostname;
            } catch {
              projectName = 'project';
            }
          } else {
            projectName = 'project';
          }
        }

        if (!projectName) {
          return;
        }

        await saveTabsAsProject(projectName, descriptors);
      } catch (error) {
        console.warn('[commands] Save project failed:', error);
      }
    })();
    return;
  }

  if (command === 'rename-tab') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        const active = tabs && tabs[0];
        if (!active || typeof active.id !== 'number') {
          return;
        }

        // Attempt to prompt in-page for a title
        let newTitle = null;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: active.id },
            func: () => {
              const current = document.title || '';
              const input = window.prompt('Enter custom title for this tab:', current);
              return input && input.trim() ? input.trim() : null;
            },
            world: 'ISOLATED',
          });
          newTitle = Array.isArray(results) && results[0] ? results[0].result : null;
        } catch (e) {
          newTitle = null;
        }

        if (!newTitle) {
          return;
        }

        // Persist the title
        try {
          await chrome.storage.local.set({
            ['customTitle_' + active.id]: {
              tabId: active.id,
              url: active.url,
              title: newTitle,
              updatedAt: Date.now(),
            },
          });
        } catch (e) {
          // ignore storage errors
        }

        // Apply via content script if available
        try {
          await chrome.tabs.sendMessage(active.id, { type: 'renameTab', title: newTitle });
        } catch (e) {
          // Fallback: apply directly in the page
          try {
            await chrome.scripting.executeScript({
              target: { tabId: active.id },
              func: (title) => {
                try {
                  document.title = title;
                } catch {}
                const el = document.querySelector('title');
                if (el) {
                  el.textContent = title;
                } else {
                  const t = document.createElement('title');
                  t.textContent = title;
                  (document.head || document.documentElement).appendChild(t);
                }
              },
              args: [newTitle],
              world: 'ISOLATED',
            });
          } catch (err) {
            // ignore
          }
        }
      } catch (error) {
        console.warn('[commands] Rename tab failed:', error);
      }
    })();
  }
});

void initializeAutoReloadFeature().catch((error) => {
  console.error('[auto-reload] Initialization failed:', error);
});

/**
 * Handle tab removal to clean up custom title records.
 * @param {number} tabId - The ID of the tab that was removed.
 * @param {Object} removeInfo - Information about the tab removal.
 * @returns {void}
 */
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Clean up custom title record for the closed tab
  void chrome.storage.local.remove([`customTitle_${tabId}`]).catch((error) => {
    console.warn('[background] Failed to clean up custom title for tab:', tabId, error);
  });
});

chrome.tabs.onHighlighted.addListener(() => {
  void updateClipboardContextMenuVisibility();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void (async () => {
    const handled = await handleAutoReloadAlarm(alarm);
    if (handled) {
      return;
    }

    if (alarm.name !== MIRROR_ALARM_NAME) {
      return;
    }

    try {
      await runMirrorPull('alarm');
    } catch (error) {
      console.error('[mirror] Scheduled pull failed:', error);
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (handleOptionsBackupMessage(message, sendResponse)) {
    return true;
  }

  if (message.type === GET_AUTO_RELOAD_STATUS_MESSAGE) {
    const status = getActiveAutoReloadStatus();
    sendResponse({ status });
    return true;
  }

  if (message.type === AUTO_RELOAD_RE_EVALUATE_MESSAGE) {
    void evaluateAllTabs().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.warn('[background] Failed to re-evaluate auto reload rules:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === GET_CURRENT_TAB_ID_MESSAGE) {
    // Return the tab ID of the sender (content script)
    if (sender && sender.tab && typeof sender.tab.id === 'number') {
      sendResponse({ tabId: sender.tab.id });
    } else {
      sendResponse({ error: 'No valid tab ID found' });
    }
    return true;
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
    return handleSaveProjectMessage(message, sendResponse);
  }

  if (message.type === ADD_PROJECT_TABS_MESSAGE) {
    return handleAddTabsToProjectMessage(message, sendResponse);
  }

  if (message.type === REPLACE_PROJECT_ITEMS_MESSAGE) {
    return handleReplaceProjectItemsMessage(message, sendResponse);
  }

  if (message.type === LIST_PROJECTS_MESSAGE) {
    return handleListProjectsMessage(message, sendResponse);
  }

  if (message.type === GET_CACHED_PROJECTS_MESSAGE) {
    return handleGetCachedProjectsMessage(message, sendResponse);
  }

  if (message.type === DELETE_PROJECT_MESSAGE) {
    return handleDeleteProjectMessage(message, sendResponse);
  }

  if (message.type === RESTORE_PROJECT_TABS_MESSAGE) {
    return handleRestoreProjectTabsMessage(message, sendResponse);
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
        contexts: [
          'page',
          'frame',
          'selection',
          'editable',
          'image',
        ],
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
      return;
    }

    // Handle clipboard context menu clicks
    if (tab) {
      void handleClipboardContextMenuClick(info, tab);
    }
  });
}
