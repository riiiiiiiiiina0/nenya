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
  handleClipboardCommand,
} from './clipboard.js';
import { initializeTabSnapshots } from './tab-snapshots.js';
import {
  LLM_PROVIDER_META,
  isLLMPage,
  getLLMProviderFromURL,
} from '../shared/llmProviders.js';

const MANUAL_PULL_MESSAGE = 'mirror:pull';
const RESET_PULL_MESSAGE = 'mirror:resetPull';
const SAVE_UNSORTED_MESSAGE = 'mirror:saveToUnsorted';
const CONTEXT_MENU_SAVE_PAGE_ID = 'nenya-save-unsorted-page';
const CONTEXT_MENU_SAVE_LINK_ID = 'nenya-save-unsorted-link';
const CONTEXT_MENU_SPLIT_TABS_ID = 'nenya-split-tabs';
const CONTEXT_MENU_UNSPLIT_TABS_ID = 'nenya-unsplit-tabs';
const GET_CURRENT_TAB_ID_MESSAGE = 'getCurrentTabId';
const GET_AUTO_RELOAD_STATUS_MESSAGE = 'autoReload:getStatus';
const AUTO_RELOAD_RE_EVALUATE_MESSAGE = 'autoReload:reEvaluate';
const COLLECT_PAGE_CONTENT_MESSAGE = 'collect-page-content-as-markdown';
const COLLECT_AND_SEND_TO_LLM_MESSAGE = 'collect-and-send-to-llm';

// ============================================================================
// KEYBOARD SHORTCUTS (COMMANDS)
// Set up command listeners as early as possible to ensure they're ready
// when the service worker wakes up from a keyboard shortcut
// ============================================================================

/**
 * Handle keyboard shortcuts (commands).
 * This listener is set up early to ensure it's ready when the service worker
 * wakes up from a keyboard shortcut press.
 * @param {string} command
 * @returns {void}
 */
chrome.commands.onCommand.addListener((command) => {
  console.log('[commands] Received command:', command);

  if (
    command === 'tabs-activate-left-tab' ||
    command === 'tabs-activate-right-tab'
  ) {
    void (async () => {
      try {
        const window = await chrome.windows.getCurrent({ populate: true });
        if (!window.tabs) {
          return;
        }
        const activeTabIndex = window.tabs.findIndex((tab) => tab.active);
        if (activeTabIndex === -1) {
          return;
        }

        let newIndex;
        if (command === 'tabs-activate-left-tab') {
          newIndex =
            (activeTabIndex - 1 + window.tabs.length) % window.tabs.length;
        } else {
          // 'tabs-activate-right-tab'
          newIndex = (activeTabIndex + 1) % window.tabs.length;
        }

        const newTab = window.tabs[newIndex];
        if (newTab && newTab.id) {
          await chrome.tabs.update(newTab.id, { active: true });
        }
      } catch (error) {
        console.warn('[commands] Tab activation failed:', error);
      }
    })();
    return;
  }
  if (command === 'bookmarks-pull-raindrop') {
    void runMirrorPull('manual').catch((error) => {
      console.warn('[commands] Pull failed:', error);
    });
    return;
  }

  if (command === 'bookmarks-save-to-unsorted') {
    void (async () => {
      try {
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }
        const seen = new Set();
        /** @type {{ url: string, title?: string }[]} */
        const entries = [];
        tabs.forEach((tab) => {
          const normalized = normalizeHttpUrl(
            typeof tab.url === 'string' ? tab.url : '',
          );
          if (!normalized || seen.has(normalized)) {
            return;
          }
          seen.add(normalized);
          entries.push({
            url: normalized,
            title: typeof tab.title === 'string' ? tab.title : '',
          });
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

  if (command === 'bookmarks-save-project') {
    void (async () => {
      try {
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }
        const descriptors = [];
        const seen = new Set();
        tabs.forEach((tab) => {
          if (!tab || typeof tab.id !== 'number') {
            return;
          }
          const normalized = normalizeHttpUrl(
            typeof tab.url === 'string' ? tab.url : '',
          );
          if (!normalized || seen.has(normalized)) {
            return;
          }
          seen.add(normalized);
          descriptors.push({
            id: tab.id,
            windowId:
              typeof tab.windowId === 'number'
                ? tab.windowId
                : chrome.windows?.WINDOW_ID_NONE ?? -1,
            index: typeof tab.index === 'number' ? tab.index : -1,
            groupId:
              typeof tab.groupId === 'number'
                ? tab.groupId
                : chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
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
          const activeTabs = await chrome.tabs.query({
            currentWindow: true,
            active: true,
          });
          const active = activeTabs && activeTabs[0];
          if (active && typeof active.id === 'number') {
            const results = await chrome.scripting.executeScript({
              target: { tabId: active.id },
              func: () => {
                const base =
                  document.title ||
                  (typeof location?.href === 'string'
                    ? (() => {
                        try {
                          return new URL(location.href).hostname;
                        } catch {
                          return 'project';
                        }
                      })()
                    : 'project');
                const input = window.prompt('Project name', base);
                return input && input.trim() ? input.trim() : null;
              },
              world: 'ISOLATED',
            });
            const value =
              Array.isArray(results) && results[0] ? results[0].result : null;
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

  if (command === 'bookmarks-rename-tab') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
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
              const input = window.prompt(
                'Enter custom title for this tab:',
                current,
              );
              return input && input.trim() ? input.trim() : null;
            },
            world: 'ISOLATED',
          });
          newTitle =
            Array.isArray(results) && results[0] ? results[0].result : null;
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
          await chrome.tabs.sendMessage(active.id, {
            type: 'renameTab',
            title: newTitle,
          });
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
    return;
  }

  if (command === 'pip-quit') {
    void (async () => {
      try {
        const { pipTabId } = await chrome.storage.local.get('pipTabId');
        if (pipTabId) {
          await chrome.scripting.executeScript({
            target: { tabId: pipTabId },
            func: () => {
              if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
              }
            },
          });
          await chrome.storage.local.remove('pipTabId');
        }
      } catch (error) {
        console.warn('[commands] Quit PiP failed:', error);
      }
    })();
    return;
  }

  // Handle clipboard commands
  if (
    command === 'copy-title-url' ||
    command === 'copy-title-dash-url' ||
    command === 'copy-markdown-link' ||
    command === 'copy-screenshot'
  ) {
    void handleClipboardCommand(command).catch((error) => {
      console.warn('[commands] Clipboard command failed:', error);
    });
    return;
  }

  if (command === 'split-screen-toggle') {
    void (async () => {
      try {
        const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');

        // Get all highlighted tabs
        const highlightedTabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });

        // Check if any highlighted tab is a split.html page
        const existingSplitTab = highlightedTabs.find(
          (tab) => tab.url && tab.url.startsWith(splitBaseUrl),
        );

        if (existingSplitTab && highlightedTabs.length > 1) {
          // If there are multiple highlighted tabs and one is split.html, activate it
          if (existingSplitTab.id) {
            await chrome.tabs.update(existingSplitTab.id, { active: true });
          }
          return;
        }

        // Get current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab) {
          return;
        }

        const isSplitPage =
          currentTab.url && currentTab.url.startsWith(splitBaseUrl);

        if (isSplitPage) {
          // Current tab is split.html - unsplit it
          await handleUnsplitTabsContextMenu(currentTab);
        } else {
          // Current tab is NOT split.html - create split page
          await handleSplitTabsContextMenu(currentTab);
        }
      } catch (error) {
        console.warn('[commands] Toggle split screen failed:', error);
      }
    })();
    return;
  }

  if (command === 'block-element-picker') {
    void (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab || !currentTab.id) {
          console.warn('[commands] No active tab found for element picker');
          return;
        }

        // Launch the element picker
        await launchElementPicker(currentTab.id);
      } catch (error) {
        console.warn('[commands] Element picker failed:', error);
      }
    })();
    return;
  }

  if (command === 'tab-switcher') {
    void (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab || !currentTab.id) {
          console.warn('[commands] No active tab found for tab switcher');
          return;
        }

        // Send message to content script to toggle tab switcher
        await chrome.tabs.sendMessage(currentTab.id, {
          type: 'tab-switcher:toggle',
        });
      } catch (error) {
        console.warn('[commands] Tab switcher failed:', error);
      }
    })();
    return;
  }

  if (command === 'llm-chat-with-llm') {
    void (async () => {
      try {
        // Set a flag in storage to indicate we should navigate to chat page
        await chrome.storage.local.set({ openChatPage: true });

        // Open the extension popup (this will trigger the popup to open)
        // The popup will check the flag and navigate to chat.html
        await chrome.action.openPopup();
      } catch (error) {
        console.warn('[commands] Chat with LLM failed:', error);
      }
    })();
    return;
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Set up header removal rules for iframe functionality
 * @returns {Promise<void>}
 */
async function setupHeaderRemovalRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          condition: {
            urlFilter: '*',
            resourceTypes: ['sub_frame', 'main_frame'],
          },
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              { header: 'X-Frame-Options', operation: 'remove' },
              { header: 'Frame-Options', operation: 'remove' },
              { header: 'Content-Security-Policy', operation: 'remove' },
              {
                header: 'Content-Security-Policy-Report-Only',
                operation: 'remove',
              },
            ],
          },
        },
      ],
    });
    console.log('Header removal rules installed successfully');
  } catch (error) {
    console.error('Failed to install header removal rules:', error);
  }
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
  void setupHeaderRemovalRules();
  initializeOptionsBackupService();
  initializeTabSnapshots();
  void handleOptionsBackupLifecycle(trigger)
    .then(async () => {
      // Re-evaluate auto reload rules after options backup restore completes
      try {
        await evaluateAllTabs();
      } catch (error) {
        console.warn(
          '[background] Failed to re-evaluate auto reload rules after options backup:',
          error,
        );
      }
    })
    .catch((error) => {
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

// Ensure backup service is initialized immediately when service worker starts
initializeOptionsBackupService();

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
    console.warn(
      '[background] Failed to clean up custom title for tab:',
      tabId,
      error,
    );
  });
});

chrome.tabs.onHighlighted.addListener(() => {
  void updateClipboardContextMenuVisibility();
});

// Update context menu visibility when tabs change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab) {
      void updateContextMenuVisibility(tab);
    }
  } catch (error) {
    console.warn('Failed to get tab for context menu update:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab) {
    void updateContextMenuVisibility(tab);
  }
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

// ============================================================================
// PAGE CONTENT COLLECTION
// ============================================================================

/**
 * Check if URL is a YouTube video page.
 * @param {string} url
 * @returns {boolean}
 */
function isYouTubeVideoPage(url) {
  return /^https?:\/\/(?:www\.)?youtube\.com\/watch/.test(url);
}

/**
 * Check if URL is a Notion page.
 * @param {string} url
 * @returns {boolean}
 */
function isNotionPage(url) {
  return /^https?:\/\/(?:www\.)?notion\.so\//.test(url);
}

/**
 * Inject content scripts to extract page content as markdown.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function injectContentScripts(tabId) {
  try {
    // Get the tab to check its URL
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab.url || '';

    let contentScriptFile = 'src/contentScript/getContent-general.js';

    // Determine which content extraction script to use
    if (isYouTubeVideoPage(tabUrl)) {
      console.log(
        '[background] Detected YouTube video page, using YouTube extractor',
      );
      contentScriptFile = 'src/contentScript/getContent-youtube.js';
    } else if (isNotionPage(tabUrl)) {
      console.log('[background] Detected Notion page, using Notion extractor');
      contentScriptFile = 'src/contentScript/getContent-notion.js';
    }

    // For YouTube and Notion, we don't need Readability and Turndown
    if (isYouTubeVideoPage(tabUrl) || isNotionPage(tabUrl)) {
      // Just inject the specific content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [contentScriptFile],
      });
    } else {
      // For general pages, inject libraries first
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/libs/readability.min.js',
          'src/libs/turndown.7.2.0.js',
          'src/libs/turndown-plugin-gfm.1.0.2.js',
        ],
      });

      // Then inject content extraction script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [contentScriptFile],
      });
    }

    // Finally inject collector script (for all page types)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript/pageContentCollector.js'],
    });

    return true;
  } catch (error) {
    console.error('[background] Failed to inject content scripts:', error);
    return false;
  }
}

/**
 * Collect page content from a single tab.
 * @param {number} tabId
 * @param {number} timeout
 * @returns {Promise<{tabId: number, title: string, url: string, content: string} | null>}
 */
async function collectPageContent(tabId, timeout = 10000) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }

    // Set up message listener for content
    const onMessage = (message, sender) => {
      if (sender?.tab?.id !== tabId) return;
      if (!message || message.type !== 'page-content-collected') return;

      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(onMessage);

      resolve({
        tabId,
        title: message.title || '',
        url: message.url || '',
        content: message.content || '',
      });
    };

    chrome.runtime.onMessage.addListener(onMessage);

    // Fallback timeout
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(null);
    }, timeout);

    // Start extraction chain
    void injectContentScripts(tabId);
  });
}

/**
 * Collect page content from multiple tabs sequentially.
 * @param {number[]} tabIds
 * @returns {Promise<Array<{tabId: number, title: string, url: string, content: string}>>}
 */
async function collectPageContentFromTabs(tabIds) {
  const results = [];

  for (const tabId of tabIds) {
    if (typeof tabId !== 'number') continue;

    try {
      const content = await collectPageContent(tabId);
      if (content) {
        results.push(content);
      } else {
        // Add empty result if collection failed
        results.push({
          tabId,
          title: '',
          url: '',
          content: '(failed to collect content)',
        });
      }
    } catch (error) {
      console.error(
        `[background] Error collecting content from tab ${tabId}:`,
        error,
      );
      results.push({
        tabId,
        title: '',
        url: '',
        content: `(error: ${error.message})`,
      });
    }
  }

  return results;
}

// ============================================================================
// LLM TAB MANAGEMENT
// ============================================================================

/** @type {number[]} */
let llmTabIds = [];

/** @type {Array<{tabId: number, title: string, url: string, content: string}>} */
let collectedContents = [];

/** @type {string | null} */
let selectedPromptContent = null;

/** @type {Array<{name: string, type: string, dataUrl: string}>} */
let selectedLocalFiles = [];

/**
 * Inject the LLM page injector content script
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function injectLLMPageInjector(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript/llmPageInjector.js'],
    });
    return true;
  } catch (error) {
    console.error('[background] Failed to inject LLM page injector:', error);
    return false;
  }
}

/**
 * Wait for a tab to be ready (complete loading)
 * @param {number} tabId
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function waitForTabReady(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          resolve(true);
          return;
        }
      } catch (error) {
        resolve(false);
        return;
      }
    };

    // Check immediately
    void checkTab();

    // Listen for tab updates
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        resolve(true);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Timeout
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeout);
  });
}

/**
 * Open or reuse LLM tabs and inject content
 * @param {chrome.tabs.Tab} currentTab
 * @param {string[]} selectedLLMProviders
 * @param {Array<{tabId: number, title: string, url: string, content: string}>} contents
 * @returns {Promise<void>}
 */
async function openOrReuseLLMTabs(currentTab, selectedLLMProviders, contents) {
  llmTabIds = [];
  const providersToOpen = [...selectedLLMProviders];
  let firstTabToActivateId = null;

  // Check if current tab can be reused
  if (currentTab && currentTab.url && isLLMPage(currentTab.url)) {
    for (const providerId of selectedLLMProviders) {
      const meta = LLM_PROVIDER_META[providerId];
      if (meta && currentTab.url.startsWith(meta.url)) {
        console.log('[background] Reusing current tab for', providerId);

        // Found a match, reuse this tab
        const index = providersToOpen.indexOf(providerId);
        if (index > -1) {
          providersToOpen.splice(index, 1);
        }

        // Inject into current tab
        if (currentTab.id) {
          const ok = await injectLLMPageInjector(currentTab.id);
          if (ok) {
            llmTabIds.push(currentTab.id);
            firstTabToActivateId = currentTab.id;

            await waitForTabReady(currentTab.id);
            await chrome.tabs.sendMessage(currentTab.id, {
              type: 'inject-llm-data',
              tabs: contents,
              promptContent: selectedPromptContent,
              files: selectedLocalFiles,
              sendButtonSelector: meta.sendButtonSelector || null,
            });
          }
        }
        break;
      }
    }
  }

  // Create new tabs for remaining providers
  const tabCreationPromises = providersToOpen.map((providerId) => {
    const meta = LLM_PROVIDER_META[providerId];
    if (!meta) return Promise.resolve(null);

    console.log('[background] Creating new tab for', providerId);

    return chrome.tabs.create({
      url: meta.url,
      active: false,
    });
  });

  const createdTabs = await Promise.all(tabCreationPromises);

  // Inject into new tabs
  for (let i = 0; i < createdTabs.length; i++) {
    const newTab = createdTabs[i];
    const providerId = providersToOpen[i];

    if (newTab && newTab.id) {
      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) continue;

      const ok = await injectLLMPageInjector(newTab.id);
      if (ok) {
        llmTabIds.push(newTab.id);
        if (!firstTabToActivateId) {
          firstTabToActivateId = newTab.id;
        }

        await waitForTabReady(newTab.id);

        console.log('[background] Sending data to new tab', newTab.id);
        await chrome.tabs.sendMessage(newTab.id, {
          type: 'inject-llm-data',
          tabs: contents,
          promptContent: selectedPromptContent,
          files: selectedLocalFiles,
          sendButtonSelector: meta.sendButtonSelector || null,
        });
      }
    }
  }

  // Activate first tab
  if (firstTabToActivateId) {
    await chrome.tabs.update(firstTabToActivateId, { active: true });
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

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
    void evaluateAllTabs()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.warn(
          '[background] Failed to re-evaluate auto reload rules:',
          error,
        );
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === GET_CURRENT_TAB_ID_MESSAGE) {
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
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

  if (message.type === 'launchElementPicker') {
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;
    if (tabId === null) {
      sendResponse({ success: false, error: 'Invalid tab ID' });
      return false;
    }
    void launchElementPicker(tabId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[background] Failed to launch element picker:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'blockElement:addSelector') {
    console.log(
      '[background] Received blockElement:addSelector message:',
      message,
    );
    const selector =
      typeof message.selector === 'string' ? message.selector : '';
    const url = typeof message.url === 'string' ? message.url : '';

    if (!selector || !url) {
      console.log('[background] Invalid selector or URL:', { selector, url });
      sendResponse({ success: false, error: 'Invalid selector or URL' });
      return false;
    }

    void (async () => {
      try {
        // Extract URL pattern from the URL
        const urlObj = new URL(url);
        const urlPattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
        console.log('[background] Generated URL pattern:', urlPattern);

        // Load existing rules
        const STORAGE_KEY = 'blockElementRules';
        const stored = await chrome.storage.sync.get(STORAGE_KEY);
        const rules = Array.isArray(stored?.[STORAGE_KEY])
          ? stored[STORAGE_KEY]
          : [];
        console.log('[background] Loaded existing rules:', rules.length);

        // Find existing rule for this URL pattern or create new one
        let rule = rules.find((r) => r.urlPattern === urlPattern);
        const now = new Date().toISOString();

        if (rule) {
          // Add selector if not already present
          if (!rule.selectors.includes(selector)) {
            rule.selectors.push(selector);
            rule.updatedAt = now;
            console.log('[background] Added selector to existing rule:', rule);
          } else {
            console.log('[background] Selector already exists in rule');
          }
        } else {
          // Create new rule
          const generateRuleId = () => {
            if (typeof crypto?.randomUUID === 'function') {
              return crypto.randomUUID();
            }
            const random = Math.random().toString(36).slice(2);
            return 'rule-' + Date.now().toString(36) + '-' + random;
          };

          rule = {
            id: generateRuleId(),
            urlPattern,
            selectors: [selector],
            createdAt: now,
            updatedAt: now,
          };
          rules.push(rule);
          console.log('[background] Created new rule:', rule);
        }

        // Save rules
        console.log('[background] Saving rules to storage:', rules);
        await chrome.storage.sync.set({
          [STORAGE_KEY]: rules,
        });
        console.log('[background] Successfully saved rules to storage');

        sendResponse({ success: true, rule });
      } catch (error) {
        console.error('[background] Failed to save blocking rule:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'inject-iframe-monitor') {
    // Handle iframe monitoring script injection for cross-origin frames
    return handleIframeMonitorInjection(message, sender, sendResponse);
  }

  if (message.action === 'unsplit-tabs') {
    // Handle keyboard shortcut for unsplitting
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        void handleUnsplitTabsContextMenu(tabs[0]);
      }
    });
    return true;
  }

  if (message.type === COLLECT_PAGE_CONTENT_MESSAGE) {
    void (async () => {
      try {
        // Get tabs to collect content from
        let tabIds = Array.isArray(message.tabIds) ? message.tabIds : [];
        if (tabIds.length === 0) {
          // Get highlighted tabs or active tab
          const highlightedTabs = await chrome.tabs.query({
            currentWindow: true,
            highlighted: true,
          });
          if (highlightedTabs && highlightedTabs.length > 0) {
            tabIds = highlightedTabs
              .map((t) => t.id)
              .filter((id) => typeof id === 'number');
          } else {
            const activeTabs = await chrome.tabs.query({
              currentWindow: true,
              active: true,
            });
            if (
              activeTabs &&
              activeTabs[0] &&
              typeof activeTabs[0].id === 'number'
            ) {
              tabIds = [activeTabs[0].id];
            }
          }
        }

        // Collect content from each tab
        const contents = await collectPageContentFromTabs(tabIds);

        // Log the results
        console.log('========================================');
        console.log('📝 Page Content Collection Results');
        console.log('========================================');
        contents.forEach((content, index) => {
          console.log(`\n--- Page ${index + 1} of ${contents.length} ---`);
          console.log('Title:', content.title || '(no title)');
          console.log('URL:', content.url || '(no url)');
          console.log('\nMarkdown Content:');
          console.log(content.content || '(no content)');
          console.log('---\n');
        });
        console.log('========================================');

        sendResponse({ success: true, contents });
      } catch (error) {
        console.error('[background] Error collecting page content:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === COLLECT_AND_SEND_TO_LLM_MESSAGE) {
    void (async () => {
      try {
        // Get tabs to collect content from
        let tabIds = Array.isArray(message.tabIds) ? message.tabIds : [];
        const llmProviders = Array.isArray(message.llmProviders)
          ? message.llmProviders
          : [];
        const promptContent =
          typeof message.promptContent === 'string'
            ? message.promptContent
            : '';

        if (tabIds.length === 0) {
          // Get highlighted tabs or active tab
          const highlightedTabs = await chrome.tabs.query({
            currentWindow: true,
            highlighted: true,
          });

          // Filter out LLM pages from highlighted tabs
          const filteredHighlighted = highlightedTabs.filter(
            (tab) => !isLLMPage(tab.url || ''),
          );

          if (filteredHighlighted.length > 0) {
            tabIds = filteredHighlighted
              .map((t) => t.id)
              .filter((id) => typeof id === 'number');
          } else {
            const activeTabs = await chrome.tabs.query({
              currentWindow: true,
              active: true,
            });
            const activeTab = activeTabs && activeTabs[0];
            if (
              activeTab &&
              typeof activeTab.id === 'number' &&
              !isLLMPage(activeTab.url || '')
            ) {
              tabIds = [activeTab.id];
            }
          }
        }

        if (tabIds.length === 0) {
          sendResponse({
            success: false,
            error: 'No valid tabs to collect content from',
          });
          return;
        }

        if (llmProviders.length === 0) {
          sendResponse({
            success: false,
            error: 'No LLM providers selected',
          });
          return;
        }

        // Collect content from each tab
        collectedContents = await collectPageContentFromTabs(tabIds);
        selectedPromptContent = promptContent;
        selectedLocalFiles = [];

        // Get current tab to check if it's an LLM page
        const currentTabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentTab = currentTabs[0];

        // Capture screenshot if only current tab is selected and it's not an LLM page
        if (
          tabIds.length === 1 &&
          currentTab &&
          tabIds[0] === currentTab.id &&
          !isLLMPage(currentTab.url || '')
        ) {
          try {
            const dataUrl = await chrome.tabs.captureVisibleTab(
              currentTab.windowId,
              { format: 'jpeg', quality: 80 },
            );
            if (dataUrl) {
              selectedLocalFiles.unshift({
                name: 'screenshot.jpg',
                type: 'image/jpeg',
                dataUrl,
              });
            }
          } catch (error) {
            console.warn('[background] Failed to capture screenshot:', error);
          }
        }

        // Open/reuse LLM tabs and inject content
        await openOrReuseLLMTabs(currentTab, llmProviders, collectedContents);

        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Error in collect-and-send-to-llm:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
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

  if (message.type === 'tab-switcher:activate') {
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;
    if (tabId === null) {
      sendResponse({ success: false, error: 'Invalid tab ID' });
      return false;
    }
    void chrome.tabs
      .update(tabId, { active: true })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[tab-switcher] Failed to activate tab:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'tab-switcher:cleanup') {
    const invalidTabIds = Array.isArray(message.invalidTabIds)
      ? message.invalidTabIds
      : [];
    if (invalidTabIds.length === 0) {
      sendResponse({ success: true });
      return false;
    }

    void (async () => {
      try {
        const result = await chrome.storage.local.get('tabSnapshots');
        let snapshots = Array.isArray(result.tabSnapshots)
          ? result.tabSnapshots
          : [];

        const beforeCount = snapshots.length;
        snapshots = snapshots.filter(
          (snapshot) => !invalidTabIds.includes(snapshot.tabId),
        );
        const afterCount = snapshots.length;

        await chrome.storage.local.set({ tabSnapshots: snapshots });

        console.log(
          '[tab-switcher] Cleaned up',
          beforeCount - afterCount,
          'invalid snapshots',
        );
        sendResponse({ success: true, removed: beforeCount - afterCount });
      } catch (error) {
        console.error('[tab-switcher] Failed to cleanup snapshots:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'tab-switcher:getCurrentWindowId') {
    if (sender.tab && typeof sender.tab.windowId === 'number') {
      sendResponse({ success: true, windowId: sender.tab.windowId });
    } else {
      console.error('[tab-switcher] No window ID available from sender');
      sendResponse({ success: false, windowId: -1 });
    }
    return false;
  }

  if (message.type === 'tab-switcher:getTabInfo') {
    const tabId = typeof message.tabId === 'number' ? message.tabId : null;
    if (tabId === null) {
      sendResponse({ success: false, exists: false, windowId: null });
      return false;
    }

    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        sendResponse({
          success: true,
          exists: true,
          windowId: tab.windowId,
        });
      })
      .catch(() => {
        // Tab doesn't exist
        sendResponse({
          success: true,
          exists: false,
          windowId: null,
        });
      });
    return true;
  }

  // Batch version: get info for multiple tabs at once (performance optimization)
  if (message.type === 'tab-switcher:getTabsInfo') {
    const tabIds = Array.isArray(message.tabIds) ? message.tabIds : [];
    if (tabIds.length === 0) {
      sendResponse({ success: true, results: [] });
      return false;
    }

    // Fetch all tab info in parallel
    void Promise.all(
      tabIds.map((tabId) =>
        chrome.tabs
          .get(tabId)
          .then((tab) => ({
            tabId: tabId,
            exists: true,
            windowId: tab.windowId,
          }))
          .catch(() => ({
            tabId: tabId,
            exists: false,
            windowId: null,
          })),
      ),
    ).then((results) => {
      sendResponse({ success: true, results: results });
    });
    return true;
  }

  return false;
});

/**
 * Launch the element picker in the specified tab.
 * @param {number} tabId - The tab ID to inject the picker into
 * @returns {Promise<void>}
 */
async function launchElementPicker(tabId) {
  try {
    // Inject the element picker content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/src/contentScript/epicker.js'],
    });
  } catch (error) {
    console.error('[background] Failed to inject element picker:', error);
    throw error;
  }
}

/**
 * Handle iframe monitor injection request from split page
 * @param {object} message - The message object
 * @param {chrome.runtime.MessageSender} sender - The message sender
 * @param {Function} sendResponse - Response callback
 * @returns {boolean} True to indicate async response
 */
function handleIframeMonitorInjection(message, sender, sendResponse) {
  const { frameName, url } = message;

  if (!sender.tab || !sender.tab.id) {
    sendResponse({ success: false, error: 'No tab ID' });
    return false;
  }

  const tabId = sender.tab.id;

  // Find the frame by matching the URL
  // We'll inject the script into all frames and let it filter by name
  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: (targetFrameName) => {
        // Only run in the target iframe
        if (window.name !== targetFrameName) {
          return;
        }

        // This is the monitoring script (inline version)
        (function () {
          'use strict';

          // Prevent double-injection
          if (window['__nenyaIframeMonitorInstalled']) {
            return;
          }
          window['__nenyaIframeMonitorInstalled'] = true;

          let lastUrl = window.location.href;
          let lastTitle = '';

          function sendUpdate() {
            const currentUrl = window.location.href;
            // Get title, but prefer a non-empty title over falling back to URL
            let currentTitle = document.title;
            if (!currentTitle || currentTitle.trim() === '') {
              // If title is empty, try to extract from meta tags
              const ogTitle = document.querySelector(
                'meta[property="og:title"]',
              );
              if (ogTitle && ogTitle instanceof HTMLMetaElement) {
                currentTitle = ogTitle.content;
              } else {
                // Only use URL as last resort
                currentTitle = currentUrl;
              }
            }

            if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
              lastUrl = currentUrl;
              lastTitle = currentTitle;
              console.log('sendUpdate', currentUrl, currentTitle);

              window.parent.postMessage(
                {
                  type: 'iframe-update',
                  url: currentUrl,
                  title: currentTitle,
                  frameName: window.name,
                },
                '*',
              );
            }
          }

          function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
              const later = () => {
                clearTimeout(timeout);
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          }

          const debouncedUpdate = debounce(sendUpdate, 100);

          // Monitor page load
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', sendUpdate);
          } else {
            sendUpdate();
          }

          window.addEventListener('load', sendUpdate);

          // Monitor SPA navigation
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;

          history.pushState = function (...args) {
            originalPushState.apply(this, args);
            sendUpdate();
          };

          history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            sendUpdate();
          };

          window.addEventListener('popstate', sendUpdate);
          window.addEventListener('hashchange', sendUpdate);

          // Monitor DOM mutations for title changes
          const titleObserver = new MutationObserver(() => {
            const newTitle = document.title;
            if (newTitle !== lastTitle) {
              debouncedUpdate();
            }
          });

          titleObserver.observe(document.documentElement, {
            childList: true,
            characterData: true,
            subtree: true,
          });

          // Send initial update with retries to catch the title as it loads
          let retryCount = 0;
          const maxRetries = 5;
          const retryDelays = [50, 200, 500, 1000, 2000];

          function sendInitialUpdate() {
            const hadTitle = document.title && document.title.trim() !== '';
            sendUpdate();

            // If we still don't have a title and haven't exhausted retries, try again
            if (!hadTitle && retryCount < maxRetries) {
              setTimeout(sendInitialUpdate, retryDelays[retryCount]);
              retryCount++;
            }
          }

          // Start initial update sequence
          setTimeout(sendInitialUpdate, 50);
        })();
      },
      args: [frameName],
    })
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      console.error('Failed to inject iframe monitor:', error);
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate we'll respond asynchronously
  return true;
}

/**
 * Handle split tabs context menu click
 * @param {chrome.tabs.Tab} tab - The current tab
 * @returns {Promise<void>}
 */
async function handleSplitTabsContextMenu(tab) {
  try {
    // Get highlighted tabs first, fallback to current tab
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    // Filter to http/https tabs, sort by tab index, take first 4
    const httpTabs = tabs
      .filter(
        (t) =>
          typeof t.url === 'string' &&
          (t.url.startsWith('http://') || t.url.startsWith('https://')),
      )
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .slice(0, 4);

    if (httpTabs.length < 1) {
      console.log('No HTTP(S) tabs found to split');
      return;
    }

    const state = {
      urls: httpTabs.map((t) => String(t.url)),
    };

    const splitUrl = `${chrome.runtime.getURL(
      'src/split/split.html',
    )}?state=${encodeURIComponent(JSON.stringify(state))}`;

    // Create new tab with split page
    const newTab = await chrome.tabs.create({
      url: splitUrl,
      windowId: tab.windowId,
    });

    // Close the original tab(s) after creating split page
    const tabIdsToClose = httpTabs
      .map((t) => t.id)
      .filter((id) => typeof id === 'number');

    if (tabIdsToClose.length > 0) {
      await chrome.tabs.remove(tabIdsToClose);
    }
  } catch (error) {
    console.error('Failed to split tabs:', error);
  }
}

/**
 * Handle unsplit tabs context menu click
 * @param {chrome.tabs.Tab} tab - The current tab (should be split page)
 * @returns {Promise<void>}
 */
async function handleUnsplitTabsContextMenu(tab) {
  try {
    if (!tab || typeof tab.id !== 'number') {
      console.log('No valid tab for unsplitting');
      return;
    }

    // Request the current URLs from the split page
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'get-current-urls',
    });

    const urls = (
      response && Array.isArray(response.urls) ? response.urls : []
    ).filter((url) => typeof url === 'string' && url.length > 0);

    if (urls.length === 0) {
      console.log('No URLs received from split page, closing split tab');
      await chrome.tabs.remove(tab.id);
      return;
    }

    // Create new tabs for each URL
    const newTabs = await Promise.all(
      urls.map((url) =>
        chrome.tabs.create({
          url: url,
          windowId: tab.windowId,
        }),
      ),
    );

    // Close the split page tab
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.error('Failed to unsplit tabs:', error);
  }
}

/**
 * Update context menu visibility based on current tab
 * @param {chrome.tabs.Tab} tab - The current tab
 * @returns {Promise<void>}
 */
async function updateContextMenuVisibility(tab) {
  if (!chrome.contextMenus) return;

  const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
  const isSplitPage = tab && tab.url && tab.url.startsWith(splitBaseUrl);

  try {
    await chrome.contextMenus.update(CONTEXT_MENU_SPLIT_TABS_ID, {
      visible: Boolean(!isSplitPage),
    });
    await chrome.contextMenus.update(CONTEXT_MENU_UNSPLIT_TABS_ID, {
      visible: Boolean(isSplitPage),
    });
  } catch (error) {
    console.warn('Failed to update context menu visibility:', error);
  }
}

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
        contexts: ['page', 'frame', 'selection', 'editable', 'image'],
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

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_SPLIT_TABS_ID,
        title: 'Split tabs',
        contexts: ['page'],
      },
      () => {
        const createError = chrome.runtime.lastError;
        if (createError) {
          console.warn(
            '[contextMenu] Failed to register split tabs item:',
            createError.message,
          );
        }
      },
    );

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_UNSPLIT_TABS_ID,
        title: 'Unsplit tabs',
        contexts: ['page'],
        visible: false, // Initially hidden, will be shown on split pages
      },
      () => {
        const createError = chrome.runtime.lastError;
        if (createError) {
          console.warn(
            '[contextMenu] Failed to register unsplit tabs item:',
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

    if (info.menuItemId === CONTEXT_MENU_SPLIT_TABS_ID) {
      if (tab) {
        void handleSplitTabsContextMenu(tab);
      }
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_UNSPLIT_TABS_ID) {
      if (tab) {
        void handleUnsplitTabsContextMenu(tab);
      }
      return;
    }

    // Handle clipboard context menu clicks
    if (tab) {
      void handleClipboardContextMenuClick(info, tab);
    }
  });
}
