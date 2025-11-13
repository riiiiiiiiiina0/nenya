import {
  MIRROR_ALARM_NAME,
  MIRROR_PULL_INTERVAL_MINUTES,
  resetAndPull,
  runMirrorPull,
  saveUrlsToUnsorted,
  normalizeHttpUrl,
  pushNotification,
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
import { processUrl } from '../shared/urlProcessor.js';
import {
  convertSplitUrlForSave,
  convertSplitUrlForRestore,
} from '../shared/splitUrl.js';

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
const OPEN_LLM_TABS_MESSAGE = 'open-llm-tabs';
const CLOSE_LLM_TABS_MESSAGE = 'close-llm-tabs';
const SWITCH_LLM_PROVIDER_MESSAGE = 'switch-llm-provider';

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
          const rawUrl = typeof tab.url === 'string' ? tab.url : '';
          // Convert split page URLs to nenya.local format before normalization
          const convertedUrl = convertSplitUrlForSave(rawUrl);
          const normalized = normalizeHttpUrl(convertedUrl);
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
          const rawUrl = typeof tab.url === 'string' ? tab.url : '';
          // Convert split page URLs to nenya.local format before normalization
          const convertedUrl = convertSplitUrlForSave(rawUrl);
          const normalized = normalizeHttpUrl(convertedUrl);
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
    command === 'copy-title' ||
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

  if (command === 'bookmarks-rename-tab') {
    void (async () => {
      try {
        // Set a flag in storage to indicate we should show rename prompt
        await chrome.storage.local.set({ openRenamePrompt: true });

        // Open the extension popup (this will trigger the popup to open)
        // The popup will check the flag and show the rename prompt
        await chrome.action.openPopup();
      } catch (error) {
        console.warn('[commands] Rename tab failed:', error);
      }
    })();
    return;
  }

  if (command === 'llm-download-markdown') {
    void (async () => {
      try {
        // Get highlighted tabs or active tab
        /** @type {chrome.tabs.Tab[]} */
        let tabs = await chrome.tabs.query({
          currentWindow: true,
          highlighted: true,
        });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        }

        // Filter to only include tabs with http/https URLs
        const filteredTabs = (tabs || []).filter((tab) => {
          const url = tab.url || '';
          return url.startsWith('http://') || url.startsWith('https://');
        });

        if (filteredTabs.length === 0) {
          console.warn('[commands] No valid tabs available for download');
          return;
        }

        // Get tab IDs
        const tabIds = filteredTabs
          .map((t) => t.id)
          .filter((id) => typeof id === 'number');

        // Collect content from tabs
        const contents = await collectPageContentFromTabs(tabIds);

        if (contents.length === 0) {
          console.warn('[commands] No content collected from tabs');
          return;
        }

        // Build the markdown content
        let markdownContent = '';

        // Add page contents
        contents.forEach((content, index) => {
          markdownContent += `## Page ${index + 1}: ${content.title}\n\n`;
          markdownContent += `**URL:** ${content.url}\n\n`;
          markdownContent += content.content;
          markdownContent += '\n\n---\n\n';
        });

        // Get active tab to inject download script
        const activeTabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const activeTab = activeTabs && activeTabs[0];

        if (!activeTab || typeof activeTab.id !== 'number') {
          console.warn('[commands] No active tab found for download');
          return;
        }

        // Generate filename with timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `page-content-${timestamp}.md`;

        // Inject script to trigger download in the active tab
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (markdown, fileName) => {
            // Create a blob and download it
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // Clean up
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
          args: [markdownContent, filename],
        });

        console.log('[commands] Markdown download triggered');
      } catch (error) {
        console.warn('[commands] Download markdown failed:', error);
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

chrome.runtime.onInstalled.addListener(async (details) => {
  handleLifecycleEvent('install');
  // Deduplicate custom titles on install/update
  void deduplicateCustomTitlesByUrl();
  
  // Clear the session flag so split pages can be restored after reload/update
  try {
    await chrome.storage.session.remove('splitPagesRestored');
    console.log('[background] Cleared split pages restored flag for reload/update');
  } catch (error) {
    console.warn('[background] Failed to clear session storage:', error);
  }
  
  if (details.reason === 'install' || details.reason === 'update') {
    // Inject content scripts into existing tabs instead of reloading them
    // This preserves user state (scroll position, form data, etc.)
    const windows = await chrome.windows.getAll({ populate: true });
    
    // Content scripts to inject (matching manifest.json structure)
    // Note: iframe-monitor.js runs in all_frames and is skipped here;
    // it will be injected automatically for new tabs/iframes
    const contentScripts = [
      // document_start scripts
      ['src/contentScript/bright-mode.js', 'src/contentScript/block-elements.js', 'src/contentScript/custom-js-css.js', 'src/contentScript/custom-title.js'],
      // document_idle scripts
      ['src/contentScript/video-controller.js', 'src/contentScript/highlight-text.js'],
    ];
    
    // CSS to inject (for video-controller)
    const cssFiles = ['src/contentScript/video-controller.css'];

    for (const window of windows) {
      if (!window.tabs) {
        continue;
      }
      for (const tab of window.tabs) {
        if (
          tab.id &&
          tab.url &&
          (tab.url.startsWith('http:') || tab.url.startsWith('https:'))
        ) {
          try {
            // Inject CSS files
            for (const cssFile of cssFiles) {
              try {
                await chrome.scripting.insertCSS({
                  target: { tabId: tab.id },
                  files: [cssFile],
                });
              } catch (error) {
                console.warn(`[background] Failed to inject CSS ${cssFile} into tab ${tab.id}:`, error);
              }
            }

            // Inject JavaScript files (scripts handle their own initialization)
            for (const scriptFiles of contentScripts) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: scriptFiles,
                });
              } catch (error) {
                console.warn(`[background] Failed to inject scripts into tab ${tab.id}:`, error);
              }
            }
          } catch (error) {
            console.warn(`[background] Failed to inject content scripts into tab ${tab.id}:`, error);
            // Fallback: reload the tab if injection fails (e.g., for restricted pages)
            try {
              await chrome.tabs.reload(tab.id, { bypassCache: true });
            } catch (reloadError) {
              console.warn(`[background] Failed to reload tab ${tab.id}:`, reloadError);
            }
          }
        }
      }
    }
  }
});

// Flag to prevent concurrent restoration
let isRestoringSplitPages = false;

/**
 * Restore split pages from storage
 * Called on startup, extension reload, and when service worker initializes
 * Includes deduplication logic to prevent opening duplicate tabs
 * Preserves tab group membership and avoids auto-activation
 */
async function restoreSplitPages() {
  // Prevent concurrent restoration
  if (isRestoringSplitPages) {
    console.log('[background] Split page restoration already in progress, skipping');
    return;
  }

  // Check if we've already restored split pages this session
  // This prevents restoring when service worker wakes up from inactive state
  try {
    const sessionResult = await chrome.storage.session.get(['splitPagesRestored']);
    if (sessionResult.splitPagesRestored) {
      console.log('[background] Split pages already restored this session, skipping');
      return;
    }
  } catch (error) {
    // chrome.storage.session might not be available in all Chrome versions
    console.warn('[background] Failed to check session storage:', error);
  }

  isRestoringSplitPages = true;

  try {
    const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
    const result = await chrome.storage.local.get(['splitPageUrls']);
    const savedEntries = Array.isArray(result.splitPageUrls)
      ? result.splitPageUrls
      : [];

    if (savedEntries.length === 0) {
      return;
    }

    // Normalize entries (handle both old string format and new object format)
    const normalizedEntries = savedEntries.map((entry) => {
      if (typeof entry === 'string') {
        return { url: entry, groupId: chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1 };
      }
      return entry;
    });

    // Step 1: De-duplicate URLs from storage first
    const seen = new Set();
    const uniqueEntries = [];
    for (const entry of normalizedEntries) {
      if (!seen.has(entry.url)) {
        seen.add(entry.url);
        uniqueEntries.push(entry);
      }
    }

    if (uniqueEntries.length !== savedEntries.length) {
      console.log(
        `[background] De-duplicated ${savedEntries.length - uniqueEntries.length} duplicate URL(s) from storage`,
      );
      // Update storage with de-duplicated entries
      await chrome.storage.local.set({ splitPageUrls: uniqueEntries });
    }

    // Step 2: Check if there is already a tab with the same URL (any tab, not just split pages)
    const allTabs = await chrome.tabs.query({});
    const existingUrls = new Set(
      allTabs
        .filter(
          (tab) =>
            tab.url &&
            typeof tab.url === 'string',
        )
        .map((tab) => String(tab.url)),
    );

    // Open split pages that aren't already open
    const entriesToOpen = uniqueEntries.filter((entry) => !existingUrls.has(entry.url));
    
    if (entriesToOpen.length === 0) {
      console.log('[background] All split pages are already open, skipping restoration');
      return;
    }

    console.log(`[background] Restoring ${entriesToOpen.length} split page(s)`);

    for (const entry of entriesToOpen) {
      try {
        // Double-check the tab wasn't opened between the query and now
        const currentTabs = await chrome.tabs.query({ url: entry.url });
        if (currentTabs.length > 0) {
          console.log('[background] Split page already exists, skipping:', entry.url);
          continue;
        }

        // Prepare tab creation options
        const createOptions = { 
          url: entry.url,
          active: false  // Don't auto-activate restored split pages
        };

        // Add groupId if the tab belonged to a group (not the default "no group" value)
        const noGroupId = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
        if (entry.groupId && entry.groupId !== noGroupId) {
          createOptions.groupId = entry.groupId;
        }

        await chrome.tabs.create(createOptions);
        console.log('[background] Restored split page:', entry.url, 'groupId:', entry.groupId);
      } catch (error) {
        console.warn(
          '[background] Failed to restore split page:',
          entry.url,
          error,
        );
      }
    }

    // Mark that we've restored split pages this session
    try {
      await chrome.storage.session.set({ splitPagesRestored: true });
      console.log('[background] Marked split pages as restored for this session');
    } catch (error) {
      console.warn('[background] Failed to set session storage:', error);
    }
  } catch (error) {
    console.warn('[background] Failed to restore split pages:', error);
  } finally {
    // Reset flag after a short delay to allow for any concurrent calls to complete
    setTimeout(() => {
      isRestoringSplitPages = false;
    }, 1000);
  }
}

chrome.runtime.onStartup.addListener(() => {
  handleLifecycleEvent('startup');
  // Deduplicate custom titles by URL first
  void (async () => {
    await deduplicateCustomTitlesByUrl();
    // Then restore custom titles for all existing tabs on startup
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (
          tab.id &&
          tab.url &&
          typeof tab.url === 'string' &&
          (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
        ) {
          void restoreCustomTitleByUrl(tab.id, tab.url);
        }
      }
    } catch (error) {
      console.warn('[background] Failed to restore custom titles on startup:', error);
    }

    // Restore split pages from storage
    await restoreSplitPages();
  })();
});

// Ensure backup service is initialized immediately when service worker starts
initializeOptionsBackupService();

void initializeAutoReloadFeature().catch((error) => {
  console.error('[auto-reload] Initialization failed:', error);
});

// Restore split pages when service worker initializes (handles extension reload)
// Use a small delay to ensure all initialization is complete
void (async () => {
  // Wait a bit for the service worker to fully initialize
  await new Promise((resolve) => setTimeout(resolve, 100));
  await restoreSplitPages();
})();

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

/**
 * Deduplicate custom title records by URL, keeping only the latest one for each URL
 * @returns {Promise<void>}
 */
async function deduplicateCustomTitlesByUrl() {
  try {
    // Get all custom title records
    const allStorage = await chrome.storage.local.get(null);
    const customTitleKeys = Object.keys(allStorage).filter((key) =>
      key.startsWith('customTitle_'),
    );

    // Group records by URL
    /** @type {Map<string, Array<{key: string, data: any}>>} */
    const urlGroups = new Map();

    for (const storageKey of customTitleKeys) {
      const data = allStorage[storageKey];
      if (
        !data ||
        typeof data !== 'object' ||
        typeof data.title !== 'string' ||
        typeof data.url !== 'string'
      ) {
        continue;
      }

      if (!urlGroups.has(data.url)) {
        urlGroups.set(data.url, []);
      }
      const urlGroup = urlGroups.get(data.url);
      if (urlGroup) {
        urlGroup.push({ key: storageKey, data });
      }
    }

    // For each URL group, keep only the latest one
    const keysToRemove = [];
    for (const [url, records] of urlGroups.entries()) {
      if (records.length <= 1) {
        // No duplicates for this URL
        continue;
      }

      // Sort by updatedAt (latest first), fallback to keeping first if no timestamp
      records.sort((a, b) => {
        const aTime = a.data.updatedAt || 0;
        const bTime = b.data.updatedAt || 0;
        return bTime - aTime;
      });

      // Keep the first (latest) record, mark others for removal
      for (let i = 1; i < records.length; i++) {
        keysToRemove.push(records[i].key);
      }

      console.log(
        `[background] Deduplicating custom titles for URL: ${url}, keeping latest (${records[0].key}), removing ${records.length - 1} duplicate(s)`,
      );
    }

    // Remove duplicate records
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(
        `[background] Removed ${keysToRemove.length} duplicate custom title record(s)`,
      );
    }
  } catch (error) {
    console.warn('[background] Failed to deduplicate custom titles:', error);
  }
}

/**
 * Restore custom title for a tab by URL match if tab ID changed
 * @param {number} tabId - The current tab ID
 * @param {string} tabUrl - The current tab URL
 * @returns {Promise<void>}
 */
async function restoreCustomTitleByUrl(tabId, tabUrl) {
  if (!tabUrl || typeof tabUrl !== 'string') {
    return;
  }

  try {
    // Get all custom title records
    const allStorage = await chrome.storage.local.get(null);
    const customTitleKeys = Object.keys(allStorage).filter((key) =>
      key.startsWith('customTitle_'),
    );

    // Find matching record by URL
    for (const storageKey of customTitleKeys) {
      const data = allStorage[storageKey];
      if (
        !data ||
        typeof data !== 'object' ||
        typeof data.title !== 'string' ||
        typeof data.url !== 'string'
      ) {
        continue;
      }

      // Check if URLs match
      if (data.url === tabUrl) {
        // If tabId doesn't match, update the record
        if (data.tabId !== tabId) {
          console.log(
            '[background] Restoring custom title by URL match:',
            tabUrl,
            'old tabId:',
            data.tabId,
            'new tabId:',
            tabId,
          );

          // Create new record with new tabId and update timestamp
          const newStorageKey = `customTitle_${tabId}`;
          await chrome.storage.local.set({
            [newStorageKey]: {
              tabId: tabId,
              url: tabUrl,
              title: data.title,
              updatedAt: Date.now(), // Update timestamp to mark as latest
            },
          });

          // Remove old record if it exists and is different from new key
          if (storageKey !== newStorageKey) {
            await chrome.storage.local.remove(storageKey);
          }

          // Apply custom title to the tab
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: (title) => {
                document.title = title;
                const titleElement = document.querySelector('title');
                if (titleElement) {
                  titleElement.textContent = title;
                }
              },
              args: [data.title],
            });
          } catch (scriptError) {
            console.warn(
              '[background] Failed to apply custom title to tab:',
              scriptError,
            );
          }
        }
        break; // Found match, no need to continue
      }
    }
  } catch (error) {
    console.warn('[background] Failed to restore custom title by URL:', error);
  }
}

// Clean up custom title records when tabs close
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const storageKey = `customTitle_${tabId}`;
    await chrome.storage.local.remove(storageKey);
    console.log('[background] Cleaned up custom title for closed tab:', tabId);
  } catch (error) {
    console.warn('[background] Failed to clean up custom title:', error);
  }

  // Remove split page URL from storage if this was a split page tab
  // Since the tab is already removed when onRemoved fires, we check all open tabs
  // and remove any URLs from storage that are no longer open
  // Use a delay to avoid race conditions during extension reload
  void (async () => {
    try {
      // Wait a bit to allow restoration to complete if extension just reloaded
      await new Promise((resolve) => setTimeout(resolve, 500));

      const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
      const result = await chrome.storage.local.get(['splitPageUrls']);
      const savedEntries = Array.isArray(result.splitPageUrls)
        ? result.splitPageUrls
        : [];

      if (savedEntries.length === 0) {
        return;
      }

      // Check all open tabs to see which split URLs are still open
      const allTabs = await chrome.tabs.query({});
      const openSplitUrls = new Set(
        allTabs
          .filter(
            (tab) =>
              tab.url &&
              typeof tab.url === 'string' &&
              tab.url.startsWith(splitBaseUrl),
          )
          .map((tab) => String(tab.url)),
      );

      // Remove entries for URLs that are no longer open
      // Handle both old string format and new object format
      const updatedEntries = savedEntries.filter((entry) => {
        const url = typeof entry === 'string' ? entry : entry.url;
        return openSplitUrls.has(url);
      });

      if (updatedEntries.length !== savedEntries.length) {
        await chrome.storage.local.set({ splitPageUrls: updatedEntries });
        console.log(
          '[background] Cleaned up closed split page URLs from storage',
        );
      }
    } catch (error) {
      console.warn('[background] Failed to clean up split page URL:', error);
    }
  })();
});

// Intercept navigation to nenya.local split URLs early
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (
      details.frameId === 0 && // Only main frame
      details.url &&
      details.url.startsWith('https://nenya.local/split')
    ) {
      const restoredUrl = convertSplitUrlForRestore(details.url);
      if (restoredUrl !== details.url) {
        try {
          await chrome.tabs.update(details.tabId, { url: restoredUrl });
        } catch (error) {
          console.warn(
            '[background] Failed to redirect nenya.local URL:',
            error,
          );
        }
      }
    }
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Intercept nenya.local split URLs and convert them to extension URLs
  // Check both changeInfo.url (when URL changes) and tab.url (current URL)
  const urlToCheck = changeInfo.url || (tab ? tab.url : null);
  if (
    urlToCheck &&
    typeof urlToCheck === 'string' &&
    urlToCheck.startsWith('https://nenya.local/split')
  ) {
    const restoredUrl = convertSplitUrlForRestore(urlToCheck);
    if (restoredUrl !== urlToCheck) {
      try {
        await chrome.tabs.update(tabId, { url: restoredUrl });
        return; // Don't process further if we redirected
      } catch (error) {
        console.warn('[background] Failed to redirect nenya.local URL:', error);
      }
    }
  }

  if (changeInfo.status === 'complete' && tab) {
    void updateContextMenuVisibility(tab);
    // Restore custom title by URL match if tab was reloaded
    if (tab.url && typeof tab.url === 'string') {
      void restoreCustomTitleByUrl(tabId, tab.url);
    }
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
 * Map of session IDs to their opened LLM tabs
 * @type {Map<string, Map<string, number>>}
 */
const sessionToLLMTabs = new Map();

/**
 * Map of chat page tab IDs to session IDs (for cleanup when tab is closed)
 * @type {Map<number, string>}
 */
const tabIdToSessionId = new Map();

/**
 * Track which sessions have sent content to LLM tabs (should not auto-close)
 * @type {Set<string>}
 */
const sessionsWithSentContent = new Set();

/**
 * Track when chat pages are closed to cleanup their LLM tabs
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  const sessionId = tabIdToSessionId.get(tabId);
  if (sessionId) {
    // Chat page tab was closed, cleanup its LLM tabs only if content wasn't sent
    if (!sessionsWithSentContent.has(sessionId)) {
      const llmTabs = sessionToLLMTabs.get(sessionId);
      if (llmTabs) {
        for (const llmTabId of llmTabs.values()) {
          chrome.tabs.remove(llmTabId).catch(() => {
            // Tab might already be closed
          });
        }
      }
      sessionToLLMTabs.delete(sessionId);
    } else {
      // Clean up the sent content flag as it's no longer needed
      sessionsWithSentContent.delete(sessionId);
    }
    tabIdToSessionId.delete(tabId);
  }
});

/**
 * Handle port connections from chat pages to detect when they close
 */
chrome.runtime.onConnect.addListener((port) => {
  // Check if this is a chat page connection
  if (port.name && port.name.startsWith('chat-')) {
    const sessionId = port.name.substring(5); // Remove 'chat-' prefix
    console.log('[background] Chat page connected:', sessionId);

    port.onDisconnect.addListener(() => {
      console.log('[background] Chat page disconnected:', sessionId);
      console.log('[background] Sessions with sent content:', Array.from(sessionsWithSentContent));
      console.log('[background] Has sent content?:', sessionsWithSentContent.has(sessionId));
      
      // Only clean up LLM tabs if content hasn't been sent yet
      // If content was sent, keep the LLM tabs open for the user to continue
      if (!sessionsWithSentContent.has(sessionId)) {
        const llmTabs = sessionToLLMTabs.get(sessionId);
        if (llmTabs) {
          console.log('[background] Cleaning up unused LLM tabs for session:', sessionId);
          for (const llmTabId of llmTabs.values()) {
            chrome.tabs.remove(llmTabId).catch(() => {
              // Tab might already be closed
            });
          }
          sessionToLLMTabs.delete(sessionId);
        }
      } else {
        console.log('[background] Content was sent, keeping LLM tabs open for session:', sessionId);
        // Clean up the sent content flag as it's no longer needed
        sessionsWithSentContent.delete(sessionId);
      }

      // Clean up tab ID mapping
      for (const [tabId, sid] of tabIdToSessionId.entries()) {
        if (sid === sessionId) {
          tabIdToSessionId.delete(tabId);
        }
      }
    });
  }
});

/**
 * Inject the LLM page injector content script and wait for tab to be ready
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function injectLLMPageInjector(tabId) {
  try {
    // Wait for tab to be ready first
    await waitForTabReady(tabId);

    // Inject the script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript/llmPageInjector.js'],
    });

    console.log(
      '[background] LLM page injector injected successfully for tab',
      tabId,
    );
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
 * Open LLM provider tabs for the chat page (positioned right next to current tab)
 * @param {string} sessionId - The session ID for this chat session
 * @param {number | null} chatPageTabId - The tab ID of the chat page (if opened as tab)
 * @param {string[]} providers - Array of provider IDs to open
 * @param {number} currentTabIndex - The index of the current active tab
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function openLLMTabs(sessionId, chatPageTabId, providers, currentTabIndex) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    if (!sessionToLLMTabs.has(sessionId)) {
      sessionToLLMTabs.set(sessionId, new Map());
    }

    // Track tab ID to session ID mapping for cleanup
    if (chatPageTabId !== null && typeof chatPageTabId === 'number') {
      tabIdToSessionId.set(chatPageTabId, sessionId);
    }

    const llmTabsMap = sessionToLLMTabs.get(sessionId);
    if (!llmTabsMap) {
      return { success: false, error: 'Failed to create LLM tabs map' };
    }

    const insertIndex = currentTabIndex + 1;

    // Open tabs for each provider
    for (let i = 0; i < providers.length; i++) {
      const providerId = providers[i];
      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) continue;

      // Check if we already have a tab for this provider
      if (llmTabsMap.has(providerId)) {
        continue;
      }

      // Create new tab positioned right next to current tab
      const newTab = await chrome.tabs.create({
        url: meta.url,
        active: false,
        index: insertIndex + i,
      });

      if (newTab.id) {
        llmTabsMap.set(providerId, newTab.id);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to open LLM tabs:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Close LLM tabs associated with a chat session
 * @param {string} sessionId - The session ID for this chat session
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function closeLLMTabs(sessionId) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (llmTabs) {
      for (const llmTabId of llmTabs.values()) {
        await chrome.tabs.remove(llmTabId).catch(() => {
          // Tab might already be closed
        });
      }
      sessionToLLMTabs.delete(sessionId);

      // Clean up tab ID mapping
      for (const [tabId, sid] of tabIdToSessionId.entries()) {
        if (sid === sessionId) {
          tabIdToSessionId.delete(tabId);
        }
      }
    }

    // Clean up sent content flag
    sessionsWithSentContent.delete(sessionId);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to close LLM tabs:', error);
    return { success: true }; // Return success even on error to not block
  }
}

/**
 * Switch an LLM provider by updating the tab URL
 * @param {string} sessionId - The session ID for this chat session
 * @param {string} oldProviderId - The provider to replace
 * @param {string} newProviderId - The new provider to load
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function switchLLMProvider(sessionId, oldProviderId, newProviderId) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (!llmTabs) {
      return { success: false, error: 'No LLM tabs found for this chat session' };
    }

    const oldTabId = llmTabs.get(oldProviderId);
    if (!oldTabId) {
      return { success: false, error: 'Old provider tab not found' };
    }

    const newMeta = LLM_PROVIDER_META[newProviderId];
    if (!newMeta) {
      return { success: false, error: 'Invalid new provider' };
    }

    // Update the tab to load the new provider URL
    await chrome.tabs.update(oldTabId, { url: newMeta.url });

    // Update the mapping
    llmTabs.delete(oldProviderId);
    llmTabs.set(newProviderId, oldTabId);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to switch LLM provider:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reuse LLM tabs to send content and prompt
 * @param {string} sessionId - The session ID for this chat session
 * @param {string[]} selectedLLMProviders - Array of provider IDs to send to
 * @param {Array<{tabId: number, title: string, url: string, content: string}>} contents - Content to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function reuseLLMTabs(sessionId, selectedLLMProviders, contents) {
  try {
    console.log('[background] reuseLLMTabs called with sessionId:', sessionId);
    
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    // Mark this session as having sent content IMMEDIATELY (before anything else)
    // This prevents auto-cleanup if the popup closes while we're processing
    sessionsWithSentContent.add(sessionId);
    console.log('[background] Marked session as sent, sessionsWithSentContent:', Array.from(sessionsWithSentContent));

    const llmTabs = sessionToLLMTabs.get(sessionId);
    if (!llmTabs) {
      console.log('[background] No LLM tabs found for session');
      sessionsWithSentContent.delete(sessionId); // Clean up if we're failing
      return { success: false, error: 'No LLM tabs found for this chat session' };
    }
    
    console.log('[background] Found LLM tabs:', Array.from(llmTabs.entries()));

    // Find the first valid tab and activate it immediately
    let firstTabId = null;
    for (const providerId of selectedLLMProviders) {
      const tabId = llmTabs.get(providerId);
      if (tabId) {
        try {
          await chrome.tabs.get(tabId);
          firstTabId = tabId;
          break;
        } catch (error) {
          // Tab was closed, continue searching
          llmTabs.delete(providerId);
        }
      }
    }

    // Activate the first tab immediately so user sees it right away
    if (firstTabId) {
      await chrome.tabs.update(firstTabId, { active: true });
    }

    // Process all tabs in parallel for better performance
    const injectionPromises = selectedLLMProviders.map(async (providerId) => {
      const tabId = llmTabs.get(providerId);
      if (!tabId) return;

      const meta = LLM_PROVIDER_META[providerId];
      if (!meta) return;

      // Check if tab still exists
      try {
        await chrome.tabs.get(tabId);
      } catch (error) {
        // Tab was closed, skip it
        llmTabs.delete(providerId);
        return;
      }

      // Inject the script and wait for it to be ready
      const ok = await injectLLMPageInjector(tabId);
      if (ok) {
        // Small delay to ensure the content script is fully initialized
        // and message listener is set up (50ms should be enough)
        await new Promise((resolve) => setTimeout(resolve, 50));

        console.log('[background] Sending data to LLM tab', tabId);
        await chrome.tabs.sendMessage(tabId, {
          type: 'inject-llm-data',
          tabs: contents,
          promptContent: selectedPromptContent,
          files: selectedLocalFiles,
          sendButtonSelector: meta.sendButtonSelector || null,
        });
      }
    });

    // Wait for all injections to complete
    await Promise.all(injectionPromises);

    return { success: true };
  } catch (error) {
    console.error('[background] Failed to reuse LLM tabs:', error);
    // Remove from sent content tracking if we failed
    sessionsWithSentContent.delete(sessionId);
    return { success: false, error: error.message };
  }
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

            // Small delay to ensure script is settled
            await new Promise((resolve) => setTimeout(resolve, 100));

            console.log(
              '[background] Sending data to current tab',
              currentTab.id,
            );
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

        // Small delay to ensure script is settled
        await new Promise((resolve) => setTimeout(resolve, 100));

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
    } else {
      sendResponse({ tabId: null });
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

  if (message.type === 'splitTabs') {
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
          sendResponse({ success: true });
          return;
        }

        // Get current active tab
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          active: true,
        });
        const currentTab = tabs && tabs[0];
        if (!currentTab) {
          sendResponse({ success: false, error: 'No active tab found' });
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
        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Failed to split/unsplit tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
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

  if (message.type === OPEN_LLM_TABS_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const chatPageTabId =
          typeof message.chatPageTabId === 'number'
            ? message.chatPageTabId
            : null;
        const providers = Array.isArray(message.providers)
          ? message.providers
          : [];
        const currentTabIndex =
          typeof message.currentTabIndex === 'number'
            ? message.currentTabIndex
            : 0;

        if (!sessionId) {
          sendResponse({
            success: false,
            error: 'Invalid session ID',
          });
          return;
        }

        const result = await openLLMTabs(
          sessionId,
          chatPageTabId,
          providers,
          currentTabIndex,
        );
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error opening LLM tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === CLOSE_LLM_TABS_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';

        if (!sessionId) {
          sendResponse({ success: false, error: 'Invalid session ID' });
          return;
        }

        const result = await closeLLMTabs(sessionId);
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error closing LLM tabs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === SWITCH_LLM_PROVIDER_MESSAGE) {
    void (async () => {
      try {
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const oldProviderId =
          typeof message.oldProviderId === 'string'
            ? message.oldProviderId
            : '';
        const newProviderId =
          typeof message.newProviderId === 'string'
            ? message.newProviderId
            : '';

        if (!sessionId) {
          sendResponse({ success: false, error: 'Invalid session ID' });
          return;
        }

        if (!oldProviderId || !newProviderId) {
          sendResponse({
            success: false,
            error: 'Invalid provider IDs',
          });
          return;
        }

        const result = await switchLLMProvider(
          sessionId,
          oldProviderId,
          newProviderId,
        );
        sendResponse(result);
      } catch (error) {
        console.error('[background] Error switching LLM provider:', error);
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
        const sessionId =
          typeof message.sessionId === 'string' ? message.sessionId : '';
        const useReuseTabs = message.useReuseTabs === true;

        if (tabIds.length === 0) {
          // Get highlighted tabs or active tab
          const highlightedTabs = await chrome.tabs.query({
            currentWindow: true,
            highlighted: true,
          });

          if (highlightedTabs.length > 0) {
            tabIds = highlightedTabs
              .map((t) => t.id)
              .filter((id) => typeof id === 'number');
          } else {
            const activeTabs = await chrome.tabs.query({
              currentWindow: true,
              active: true,
            });
            const activeTab = activeTabs && activeTabs[0];
            if (activeTab && typeof activeTab.id === 'number') {
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

        // Get current tab
        const currentTabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentTab = currentTabs[0];

        // Capture screenshot if only current tab is selected
        if (tabIds.length === 1 && currentTab && tabIds[0] === currentTab.id) {
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

        // Use reuseLLMTabs if requested and session ID is provided
        console.log('[background] useReuseTabs:', useReuseTabs, 'sessionId:', sessionId);
        if (useReuseTabs && sessionId) {
          console.log('[background] Using reuseLLMTabs');
          const result = await reuseLLMTabs(
            sessionId,
            llmProviders,
            collectedContents,
          );
          console.log('[background] reuseLLMTabs result:', result);
          sendResponse(result);
        } else {
          console.log('[background] Using openOrReuseLLMTabs (fallback)');
          // Fallback to old behavior for backward compatibility
          await openOrReuseLLMTabs(
            currentTab,
            llmProviders,
            collectedContents,
          );
          sendResponse({ success: true });
        }
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


  if (message.type === 'INJECT_CUSTOM_JS') {
    const ruleId = message.ruleId;
    const code = typeof message.code === 'string' ? message.code : '';

    if (!code || !sender.tab || typeof sender.tab.id !== 'number') {
      sendResponse({ success: false, error: 'Invalid request' });
      return false;
    }

    const tabId = sender.tab.id;

    void (async () => {
      try {
        // Inject the custom JavaScript code into the MAIN world
        // This bypasses the page's CSP restrictions
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: (jsCode) => {
            // Execute the code in the page context
            try {
              // Use indirect eval to execute in global scope
              (0, eval)(jsCode);
            } catch (error) {
              console.error(
                '[Nenya CustomCode] Script execution error:',
                error,
              );
            }
          },
          args: [code],
        });

        sendResponse({ success: true });
      } catch (error) {
        console.error('[background] Failed to inject custom JS:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'auto-google-login-notification') {
    const title =
      typeof message.title === 'string' ? message.title : 'Auto Google Login';
    const notificationMessage =
      typeof message.message === 'string' ? message.message : '';
    const targetUrl =
      typeof message.targetUrl === 'string' ? message.targetUrl : undefined;

    if (notificationMessage) {
      void pushNotification(
        'auto-google-login',
        title,
        notificationMessage,
        targetUrl,
      );
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Missing message' });
    }
    return true;
  }

  if (message.type === 'auto-google-login:checkTabActive') {
    void (async () => {
      try {
        if (!sender.tab || typeof sender.tab.id !== 'number') {
          sendResponse({ isActive: false });
          return;
        }

        const tabId = sender.tab.id;
        const windowId =
          typeof sender.tab.windowId === 'number'
            ? sender.tab.windowId
            : null;

        if (windowId === null) {
          sendResponse({ isActive: false });
          return;
        }

        // Get the window to check if it's focused
        const window = await chrome.windows.get(windowId);
        if (!window || !window.focused) {
          sendResponse({ isActive: false });
          return;
        }

        // Check if this tab is active in its window
        const tabs = await chrome.tabs.query({
          active: true,
          windowId: windowId,
        });

        const isActive =
          tabs.length > 0 &&
          typeof tabs[0]?.id === 'number' &&
          tabs[0].id === tabId;

        sendResponse({ isActive });
      } catch (error) {
        console.warn(
          '[background] Failed to check tab active status:',
          error,
        );
        sendResponse({ isActive: false });
      }
    })();
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
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_SAVE_PAGE_ID) {
      const url = typeof info.pageUrl === 'string' ? info.pageUrl : '';
      if (!url) {
        return;
      }
      // Convert split page URLs to nenya.local format before normalization
      const convertedUrl = convertSplitUrlForSave(url);
      const normalizedUrl = normalizeHttpUrl(convertedUrl);
      if (!normalizedUrl) {
        return;
      }
      const processedUrl = await processUrl(normalizedUrl, 'save-to-raindrop');
      const title = typeof tab?.title === 'string' ? tab.title : '';
      void saveUrlsToUnsorted([{ url: processedUrl, title }]).catch((error) => {
        console.error('[contextMenu] Failed to save page:', error);
      });
      return;
    }

    if (info.menuItemId === CONTEXT_MENU_SAVE_LINK_ID) {
      const url = typeof info.linkUrl === 'string' ? info.linkUrl : '';
      if (!url) {
        return;
      }
      // Convert split page URLs to nenya.local format before normalization
      const convertedUrl = convertSplitUrlForSave(url);
      const normalizedUrl = normalizeHttpUrl(convertedUrl);
      if (!normalizedUrl) {
        return;
      }
      const processedUrl = await processUrl(normalizedUrl, 'save-to-raindrop');
      const selection =
        typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
      const title =
        selection || (typeof tab?.title === 'string' ? tab.title : '');
      void saveUrlsToUnsorted([{ url: processedUrl, title }]).catch((error) => {
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

// ============================================================================
// URL PROCESSING ON TAB OPEN
// ============================================================================

/**
 * Process URLs when tabs are opened or navigated to
 */
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Only process top-level navigation (not iframes)
    if (details.frameId !== 0) {
      return;
    }

    // Ignore about:, chrome:, and extension URLs
    if (
      details.url.startsWith('about:') ||
      details.url.startsWith('chrome:') ||
      details.url.startsWith('chrome-extension:')
    ) {
      return;
    }

    try {
      // Process the URL with 'open-in-new-tab' context
      const processedUrl = await processUrl(details.url, 'open-in-new-tab');

      // If URL was modified, update the tab
      if (processedUrl !== details.url) {
        console.log(
          '[urlProcessor] Processing URL on tab open:',
          details.url,
          '->',
          processedUrl,
        );
        await chrome.tabs.update(details.tabId, { url: processedUrl });
      }
    } catch (error) {
      console.error('[urlProcessor] Failed to process URL on tab open:', error);
    }
  });
}
