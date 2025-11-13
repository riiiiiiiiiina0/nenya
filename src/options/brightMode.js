/* global chrome, URLPattern */

/**
 * @typedef {Object} BrightModePattern
 * @property {string} id
 * @property {string} pattern
 * @property {boolean} [disabled]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */


const WHITELIST_STORAGE_KEY = 'brightModeWhitelist';

// Whitelist elements
const whitelistForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('brightModeWhitelistForm')
);
const whitelistPatternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('brightModeWhitelistPatternInput')
);
const whitelistSaveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('brightModeWhitelistSaveButton')
);
const whitelistCancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('brightModeWhitelistCancelEditButton')
);
const whitelistFormError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('brightModeWhitelistFormError')
);
const whitelistEmptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('brightModeWhitelistEmpty')
);
const whitelistListElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('brightModeWhitelistList')
);


const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {BrightModePattern[]} */
let whitelistPatterns = [];
let editingWhitelistId = '';
let syncing = false;

/**
 * Generate a unique identifier for new patterns.
 * @returns {string}
 */
function generatePatternId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'pattern-' + Date.now().toString(36) + '-' + random;
}

/**
 * Create a deep copy of the provided patterns and sort them for consistent rendering.
 * @param {BrightModePattern[]} collection
 * @returns {BrightModePattern[]}
 */
function sortPatterns(collection) {
  return [...collection].sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Normalize possibly partial pattern data read from storage.
 * @param {unknown} value
 * @returns {{ patterns: BrightModePattern[], mutated: boolean }}
 */
function normalizePatterns(value) {
  const sanitized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      if (!isValidUrlPattern(pattern)) {
        console.warn(
          '[options:brightMode] Invalid pattern ignored in storage:',
          pattern,
        );
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generatePatternId();
        mutated = true;
      }

      /** @type {BrightModePattern} */
      const patternObj = {
        id,
        pattern,
        disabled: !!raw.disabled,
        createdAt: undefined,
        updatedAt: undefined,
      };
      if (typeof raw.createdAt === 'string') {
        patternObj.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        patternObj.updatedAt = raw.updatedAt;
      }
      sanitized.push(patternObj);
    });
  }

  return { patterns: sortPatterns(sanitized), mutated };
}

/**
 * Persist the provided patterns in chrome.storage.sync.
 * @param {BrightModePattern[]} patterns
 * @param {string} storageKey
 * @returns {Promise<void>}
 */
async function savePatterns(patterns, storageKey) {
  if (!chrome?.storage?.sync) {
    return;
  }
  syncing = true;
  try {
    await chrome.storage.sync.set({
      [storageKey]: patterns,
    });
  } catch (error) {
    console.warn('[options:brightMode] Failed to save patterns:', error);
  } finally {
    syncing = false;
  }
}

/**
 * Load patterns from storage, synchronizing invalid entries if needed.
 * @param {string} storageKey
 * @returns {Promise<BrightModePattern[]>}
 */
async function loadPatterns(storageKey) {
  if (!chrome?.storage?.sync) {
    return [];
  }

  try {
    const stored = await chrome.storage.sync.get(storageKey);
    const { patterns: sanitized, mutated } = normalizePatterns(
      stored?.[storageKey],
    );
    if (mutated) {
      await savePatterns(sanitized, storageKey);
    }
    return sanitized;
  } catch (error) {
    console.warn('[options:brightMode] Failed to load patterns:', error);
    return [];
  }
}

/**
 * Display or hide a form level error message.
 * @param {HTMLParagraphElement | null} errorElement
 * @param {string} message
 * @returns {void}
 */
function showFormError(errorElement, message) {
  if (!errorElement) {
    return;
  }
  if (!message) {
    errorElement.hidden = true;
    errorElement.textContent = '';
    return;
  }
  errorElement.hidden = false;
  errorElement.textContent = message;
}

/**
 * Find a pattern by ID in the given collection.
 * @param {BrightModePattern[]} patterns
 * @param {string} patternId
 * @returns {BrightModePattern | undefined}
 */
function findPattern(patterns, patternId) {
  return patterns.find((pattern) => pattern.id === patternId);
}

/**
 * Reset the form to its default (create) state.
 * @returns {void}
 */
function resetForm() {
  editingWhitelistId = '';
  if (whitelistForm) {
    whitelistForm.reset();
  }
  if (whitelistSaveButton) {
    whitelistSaveButton.textContent = '➕';
  }
  if (whitelistCancelButton) {
    whitelistCancelButton.hidden = true;
  }
  showFormError(whitelistFormError, '');
}

/**
 * Format a timestamp for display.
 * @param {string | undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value) {
    return '—';
  }
  try {
    return dateFormatter.format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * Render the patterns list.
 * @param {BrightModePattern[]} patterns
 * @param {HTMLDivElement | null} listElement
 * @param {HTMLDivElement | null} emptyState
 * @returns {void}
 */
function renderList(patterns, listElement, emptyState) {
  if (!listElement || !emptyState) {
    return;
  }

  listElement.textContent = '';
  if (patterns.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  patterns.forEach((pattern) => {
    const container = document.createElement('article');
    container.className =
      'rounded-lg border border-base-300 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
    container.setAttribute('role', 'listitem');

    if (pattern.disabled) {
      container.classList.add('opacity-50');
    }

    const info = document.createElement('div');
    info.className = 'space-y-1';

    const patternText = document.createElement('p');
    patternText.className = 'font-mono text-sm break-words';
    patternText.textContent = pattern.pattern;
    info.appendChild(patternText);

    const timestamp = document.createElement('p');
    timestamp.className = 'text-sm text-base-content/70';
    timestamp.textContent = 'Created: ' + formatTimestamp(pattern.createdAt);
    info.appendChild(timestamp);

    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editingWhitelistId = pattern.id;
      if (whitelistPatternInput) {
        whitelistPatternInput.value = pattern.pattern;
      }
      if (whitelistSaveButton) {
        whitelistSaveButton.textContent = '✅';
      }
      if (whitelistCancelButton) {
        whitelistCancelButton.hidden = false;
      }
      if (whitelistPatternInput) {
        whitelistPatternInput.focus();
      }
    });
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-error btn-outline';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        'Delete the whitelist pattern for "' + pattern.pattern + '"?',
      );
      if (!confirmed) {
        return;
      }
      whitelistPatterns = whitelistPatterns.filter(
        (candidate) => candidate.id !== pattern.id,
      );
      if (editingWhitelistId === pattern.id) {
        resetForm();
      }
      void savePatterns(whitelistPatterns, WHITELIST_STORAGE_KEY);
      renderWhitelist();
    });
    actions.appendChild(deleteButton);

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'form-control';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'label cursor-pointer gap-4';
    toggleLabel.textContent = 'Enabled';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-success';
    toggle.checked = !pattern.disabled;
    toggle.addEventListener('change', (event) => {
      const isChecked = /** @type {HTMLInputElement} */ (event.target).checked;
      pattern.disabled = !isChecked;
      void savePatterns(whitelistPatterns, WHITELIST_STORAGE_KEY);
      renderWhitelist();
    });
    toggleLabel.appendChild(toggle);
    toggleContainer.appendChild(toggleLabel);
    actions.appendChild(toggleContainer);

    container.appendChild(actions);
    listElement.appendChild(container);
  });
}

/**
 * Render whitelist patterns.
 * @returns {void}
 */
function renderWhitelist() {
  renderList(
    whitelistPatterns,
    whitelistListElement,
    whitelistEmptyState,
  );
}

/**
 * Handle form submission to create or update patterns.
 * @param {SubmitEvent} event
 * @returns {void}
 */
function handleFormSubmit(event) {
  event.preventDefault();

  if (!whitelistPatternInput) {
    return;
  }

  const pattern = whitelistPatternInput.value.trim();
  if (!pattern) {
    showFormError(whitelistFormError, 'Enter a URL pattern.');
    return;
  }

  if (!isValidUrlPattern(pattern)) {
    showFormError(
      whitelistFormError,
      'Enter a valid URL pattern that the browser accepts.',
    );
    return;
  }

  const now = new Date().toISOString();

  if (editingWhitelistId) {
    const existing = findPattern(whitelistPatterns, editingWhitelistId);
    if (!existing) {
      showFormError(whitelistFormError, 'Selected pattern no longer exists.');
      resetForm();
      return;
    }
    existing.pattern = pattern;
    existing.updatedAt = now;
    if (!existing.createdAt) {
      existing.createdAt = now;
    }
  } else {
    const patternObj = {
      id: generatePatternId(),
      pattern,
      createdAt: now,
      updatedAt: now,
    };
    whitelistPatterns.push(patternObj);
  }
  whitelistPatterns = sortPatterns(whitelistPatterns);
  showFormError(whitelistFormError, '');
  resetForm();
  void savePatterns(whitelistPatterns, WHITELIST_STORAGE_KEY);
  renderWhitelist();
}

/**
 * Handle cancel edit button click.
 * @returns {void}
 */
function handleCancelEdit() {
  resetForm();
}

/**
 * Initialize listeners and load existing data.
 * @returns {void}
 */
function init() {
  // Whitelist form
  if (whitelistForm) {
    whitelistForm.addEventListener('submit', (event) =>
      handleFormSubmit(event),
    );
  }
  if (whitelistCancelButton) {
    whitelistCancelButton.addEventListener('click', () =>
      handleCancelEdit(),
    );
  }

  // Storage change listener
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (syncing) {
        return;
      }

      if (
        Object.prototype.hasOwnProperty.call(changes, WHITELIST_STORAGE_KEY)
      ) {
        const { patterns: sanitized } = normalizePatterns(
          changes[WHITELIST_STORAGE_KEY]?.newValue,
        );
        whitelistPatterns = sanitized;
        if (
          editingWhitelistId &&
          !findPattern(whitelistPatterns, editingWhitelistId)
        ) {
          resetForm();
        }
        renderWhitelist();
      }
    });
  }

  // Load initial data
  void loadPatterns(WHITELIST_STORAGE_KEY).then((patterns) => {
    whitelistPatterns = patterns;
    renderWhitelist();
  });

  // Check for prefilled URL from popup
  void checkForPrefillUrl();
}

/**
 * Check for prefilled URL from popup and set it in the whitelist pattern input.
 * Also navigates to the bright mode section if needed.
 * @returns {Promise<void>}
 */
async function checkForPrefillUrl() {
  try {
    const stored = await chrome.storage.local.get('brightModePrefillUrl');
    const prefillUrl = stored?.brightModePrefillUrl;
    if (!prefillUrl || typeof prefillUrl !== 'string') {
      return;
    }

    // Clear the prefilled URL from storage
    await chrome.storage.local.remove('brightModePrefillUrl');

    // Wait for navigation manager to be available
    let attempts = 0;
    while (!window.navigationManager && attempts < 50) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      attempts++;
    }

    // Navigate to bright mode section
    if (window.location.hash !== '#bright-mode-heading') {
      window.location.hash = '#bright-mode-heading';
    }

    // Show the bright mode section if navigation manager is available
    if (window.navigationManager) {
      window.navigationManager.showSection('bright-mode-heading');
    }

    // Wait a bit more for the section to be visible
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Set the whitelist pattern input value
    if (whitelistPatternInput) {
      whitelistPatternInput.value = prefillUrl;
      whitelistPatternInput.focus();
    }
  } catch (error) {
    console.warn('[options:brightMode] Failed to check for prefill URL:', error);
  }
}

init();

/**
 * Get current whitelist patterns for export.
 * @returns {BrightModePattern[]}
 */
export function getWhitelistPatterns() {
  return [...whitelistPatterns];
}

/**
 * Set patterns from import.
 * @param {BrightModePattern[]} whitelist
 * @returns {Promise<void>}
 */
export async function setPatterns(whitelist) {
  const { patterns: normalizedWhitelist } = normalizePatterns(whitelist);

  whitelistPatterns = normalizedWhitelist;

  await savePatterns(whitelistPatterns, WHITELIST_STORAGE_KEY);

  renderWhitelist();
}

export function isValidUrlPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }
  
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return false;
  }
  
  try {
    // Use URL Pattern API for robust validation
    // The pattern can be a full URL or just a pathname pattern
    if (trimmedPattern.includes('://')) {
      // Full URL pattern
      new URLPattern(trimmedPattern);
    } else if (trimmedPattern.startsWith('/')) {
      // Pathname pattern
      new URLPattern({ pathname: trimmedPattern });
    } else if (trimmedPattern.includes('*') || trimmedPattern.includes(':')) {
      // Pattern with wildcards or named groups - treat as pathname
      new URLPattern({ pathname: '/' + trimmedPattern });
    } else {
      // Domain or hostname pattern
      new URLPattern({ hostname: trimmedPattern });
    }
    return true;
  } catch (error) {
    // Pattern is invalid according to URLPattern API
    return false;
  }
}
