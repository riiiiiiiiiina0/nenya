/* global chrome */

/**
 * @typedef {Object} ShortcutButton
 * @property {string} id - Button identifier
 * @property {string} emoji - Button emoji icon
 * @property {string} tooltip - Button tooltip text
 */

/**
 * Available shortcut buttons that can be pinned
 * @type {ShortcutButton[]}
 */
const AVAILABLE_SHORTCUTS = [
  { id: 'getMarkdown', emoji: '💬', tooltip: 'Chat with llm' },
  { id: 'pull', emoji: '🌧️', tooltip: 'Pull from raindrop' },
  { id: 'saveUnsorted', emoji: '📤', tooltip: 'Save to unsorted' },
  { id: 'importCustomCode', emoji: '💾', tooltip: 'Import custom JS/CSS rule' },
  { id: 'customFilter', emoji: '⚡️', tooltip: 'Hide elements in page' },
  { id: 'splitPage', emoji: '🈹', tooltip: 'Split page' },
  { id: 'autoReload', emoji: '🔁', tooltip: 'Auto reload this page' },
  { id: 'brightMode', emoji: '🔆', tooltip: 'Render this page in bright mode' },
  { id: 'darkMode', emoji: '🌘', tooltip: 'Render this page in dark mode' },
  { id: 'highlightText', emoji: '🟨', tooltip: 'Highlight text in this page' },
  { id: 'customCode', emoji: '📑', tooltip: 'Inject js/css into this page' },
  { id: 'pictureInPicture', emoji: '🖼️', tooltip: 'Picture in Picture' },
  // Note: openOptions is always shown at the end and cannot be pinned
];

const STORAGE_KEY = 'pinnedShortcuts';
const MAX_SHORTCUTS = 6;

/** @type {string[]} Default pinned shortcuts */
const DEFAULT_PINNED_SHORTCUTS = [
  'getMarkdown', // Chat with llm
  'pull', // Pull from raindrop
  'saveUnsorted', // Save to unsorted
  'customFilter', // Hide elements in page
  'splitPage', // Split page
];

/** @type {string[]} */
let pinnedShortcuts = [];

const pinnedList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('pinnedShortcutsList')
);
const availableList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('pinnedShortcutsAvailableList')
);
const resetButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('pinnedShortcutsResetButton')
);

/**
 * Normalize and validate pinned shortcuts data
 * @param {unknown} value
 * @returns {{ shortcuts: string[], mutated: boolean }}
 */
function normalizeShortcuts(value) {
  if (!Array.isArray(value)) {
    return { shortcuts: [], mutated: true };
  }

  const sanitized = value.filter(
    (id) =>
      typeof id === 'string' && AVAILABLE_SHORTCUTS.some((s) => s.id === id),
  );

  // Filter out openOptions - it's always shown separately
  const filtered = sanitized.filter((id) => id !== 'openOptions');

  // Limit to max shortcuts
  const limited = filtered.slice(0, MAX_SHORTCUTS);

  return {
    shortcuts: limited,
    mutated:
      limited.length !== value.length ||
      sanitized.length !== value.length ||
      filtered.length !== sanitized.length,
  };
}

/**
 * Save pinned shortcuts to storage
 * @param {string[]} shortcuts
 * @returns {Promise<void>}
 */
async function saveShortcuts(shortcuts) {
  if (!chrome?.storage?.sync) {
    return;
  }
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: shortcuts,
    });
  } catch (error) {
    console.error('[options:pinnedShortcuts] Failed to save shortcuts:', error);
    throw error;
  }
}

/**
 * Load pinned shortcuts from storage
 * @returns {Promise<void>}
 */
async function loadShortcuts() {
  if (!chrome?.storage?.sync) {
    pinnedShortcuts = DEFAULT_PINNED_SHORTCUTS;
    render();
    return;
  }

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const storedValue = stored?.[STORAGE_KEY];

    // If no value is stored, use defaults
    if (storedValue === undefined || storedValue === null) {
      pinnedShortcuts = [...DEFAULT_PINNED_SHORTCUTS];
      await saveShortcuts(pinnedShortcuts);
      render();
      return;
    }

    const { shortcuts: sanitized, mutated } = normalizeShortcuts(storedValue);

    // If normalized result is empty, use defaults
    if (sanitized.length === 0) {
      pinnedShortcuts = [...DEFAULT_PINNED_SHORTCUTS];
      await saveShortcuts(pinnedShortcuts);
    } else {
      pinnedShortcuts = sanitized;
      if (mutated) {
        await saveShortcuts(sanitized);
      }
    }
    render();
  } catch (error) {
    console.warn('[options:pinnedShortcuts] Failed to load shortcuts:', error);
    pinnedShortcuts = [...DEFAULT_PINNED_SHORTCUTS];
    render();
  }
}

/**
 * Render the pinned shortcuts UI
 */
function render() {
  if (!pinnedList || !availableList) {
    return;
  }

  // Render pinned shortcuts
  pinnedList.innerHTML = '';
  if (pinnedShortcuts.length === 0) {
    pinnedList.innerHTML = `
      <div class="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/70">
        No shortcuts pinned yet. Select shortcuts from the available list below.
      </div>
    `;
  } else {
    pinnedShortcuts.forEach((shortcutId, index) => {
      const shortcut = AVAILABLE_SHORTCUTS.find((s) => s.id === shortcutId);
      if (!shortcut) {
        return;
      }

      const item = document.createElement('div');
      item.className =
        'flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-base-200 hover:bg-base-300 transition-colors';
      item.dataset.shortcutId = shortcutId;

      item.innerHTML = `
        <div class="flex items-center gap-2 flex-1">
          <span class="text-2xl">${shortcut.emoji}</span>
          <div class="flex-1">
            <div class="font-medium text-sm">${shortcut.tooltip}</div>
            <div class="text-xs text-base-content/60">${shortcut.id}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm btn-ghost btn-square move-up" type="button" ${
            index === 0 ? 'disabled' : ''
          }>
            ⬆️
          </button>
          <button class="btn btn-sm btn-ghost btn-square move-down" type="button" ${
            index === pinnedShortcuts.length - 1 ? 'disabled' : ''
          }>
            ⬇️
          </button>
          <button class="btn btn-sm btn-error btn-square remove" type="button">
            ❌
          </button>
        </div>
      `;

      // Add event listeners
      const moveUpBtn = item.querySelector('.move-up');
      const moveDownBtn = item.querySelector('.move-down');
      const removeBtn = item.querySelector('.remove');

      if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => {
          if (index > 0) {
            const newShortcuts = [...pinnedShortcuts];
            [newShortcuts[index - 1], newShortcuts[index]] = [
              newShortcuts[index],
              newShortcuts[index - 1],
            ];
            void updateShortcuts(newShortcuts);
          }
        });
      }

      if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => {
          if (index < pinnedShortcuts.length - 1) {
            const newShortcuts = [...pinnedShortcuts];
            [newShortcuts[index], newShortcuts[index + 1]] = [
              newShortcuts[index + 1],
              newShortcuts[index],
            ];
            void updateShortcuts(newShortcuts);
          }
        });
      }

      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          const newShortcuts = pinnedShortcuts.filter(
            (id) => id !== shortcutId,
          );
          void updateShortcuts(newShortcuts);
        });
      }

      pinnedList.appendChild(item);
    });
  }

  // Render available shortcuts (not pinned)
  const availableShortcuts = AVAILABLE_SHORTCUTS.filter(
    (s) => !pinnedShortcuts.includes(s.id),
  );
  availableList.innerHTML = '';
  if (availableShortcuts.length === 0) {
    availableList.innerHTML = `
      <div class="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/70">
        All shortcuts are pinned. Remove some to see available shortcuts here.
      </div>
    `;
  } else {
    availableShortcuts.forEach((shortcut) => {
      const item = document.createElement('div');
      item.className =
        'flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-base-200 hover:bg-base-300 transition-colors cursor-pointer';
      item.dataset.shortcutId = shortcut.id;

      item.innerHTML = `
        <div class="flex items-center gap-2 flex-1">
          <span class="text-2xl">${shortcut.emoji}</span>
          <div class="flex-1">
            <div class="font-medium text-sm">${shortcut.tooltip}</div>
            <div class="text-xs text-base-content/60">${shortcut.id}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-square add" type="button" ${
          pinnedShortcuts.length >= MAX_SHORTCUTS ? 'disabled' : ''
        }>
          ➕
        </button>
      `;

      const addBtn = item.querySelector('.add');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          if (pinnedShortcuts.length < MAX_SHORTCUTS) {
            const newShortcuts = [...pinnedShortcuts, shortcut.id];
            void updateShortcuts(newShortcuts);
          }
        });
      }

      // Also allow clicking the item itself
      item.addEventListener('click', (e) => {
        if (e.target === addBtn || addBtn?.contains(e.target)) {
          return;
        }
        if (pinnedShortcuts.length < MAX_SHORTCUTS) {
          const newShortcuts = [...pinnedShortcuts, shortcut.id];
          void updateShortcuts(newShortcuts);
        }
      });

      availableList.appendChild(item);
    });
  }
}

/**
 * Update pinned shortcuts
 * @param {string[]} newShortcuts
 * @returns {Promise<void>}
 */
async function updateShortcuts(newShortcuts) {
  const { shortcuts: sanitized } = normalizeShortcuts(newShortcuts);
  pinnedShortcuts = sanitized;
  await saveShortcuts(sanitized);
  render();
}

/**
 * Reset to default shortcuts
 * @returns {Promise<void>}
 */
async function resetToDefaults() {
  pinnedShortcuts = [...DEFAULT_PINNED_SHORTCUTS];
  await saveShortcuts(pinnedShortcuts);
  render();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void loadShortcuts();
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        void resetToDefaults();
      });
    }
  });
} else {
  void loadShortcuts();
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      void resetToDefaults();
    });
  }
}

// Listen for storage changes from other tabs/windows
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes[STORAGE_KEY]) {
      const { shortcuts: sanitized } = normalizeShortcuts(
        changes[STORAGE_KEY].newValue,
      );
      pinnedShortcuts = sanitized;
      render();
    }
  });
}
