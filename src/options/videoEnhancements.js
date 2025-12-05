/* global chrome, URLPattern */

/**
 * @typedef {'url-pattern' | 'wildcard'} VideoEnhancementPatternType
 */

/**
 * @typedef {Object} VideoEnhancements
 * @property {boolean} autoFullscreen
 */

/**
 * @typedef {Object} VideoEnhancementRule
 * @property {string} id
 * @property {string} pattern
 * @property {VideoEnhancementPatternType} patternType
 * @property {VideoEnhancements} enhancements
 * @property {boolean} [disabled]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

const VIDEO_ENHANCEMENT_RULES_KEY = 'videoEnhancementRules';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('videoEnhancementsForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('videoEnhancementsPatternInput')
);
const patternTypeSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('videoEnhancementsPatternTypeSelect')
);
const autoFullscreenInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('videoEnhancementsAutoFullscreenInput')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('videoEnhancementsFormError')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('videoEnhancementsSaveButton')
);
const cancelEditButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('videoEnhancementsCancelEditButton')
);
const rulesEmptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('videoEnhancementsEmpty')
);
const rulesList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('videoEnhancementsList')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {VideoEnhancementRule[]} */
let rules = [];
/** @type {string | null} */
let editingRuleId = null;

/**
 * Generate a stable identifier for rules lacking one.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'video-enhancement-' + Date.now().toString(36) + '-' + random;
}

/**
 * Determine whether a URLPattern string is valid.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidUrlPattern(pattern) {
  try {
    // eslint-disable-next-line no-new
    new URLPattern(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Determine whether a wildcard pattern is valid.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidWildcardPattern(pattern) {
  const value = pattern.trim();
  if (!value) {
    return false;
  }
  return !/\s/.test(value);
}

/**
 * Sort rules so newest items render first.
 * @param {VideoEnhancementRule[]} collection
 * @returns {VideoEnhancementRule[]}
 */
function sortRulesByCreatedAt(collection) {
  return [...collection].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    if (aTime === bTime) {
      return a.pattern.localeCompare(b.pattern);
    }
    return bTime - aTime;
  });
}

/**
 * Normalize rules loaded from storage.
 * @param {unknown} value
 * @returns {VideoEnhancementRule[]}
 */
function normalizeStoredRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {VideoEnhancementRule[]} */
  const sanitized = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const raw =
      /** @type {{ id?: unknown, pattern?: unknown, patternType?: unknown, enhancements?: { autoFullscreen?: unknown }, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) {
      return;
    }

    /** @type {VideoEnhancementPatternType} */
    const patternType =
      raw.patternType === 'wildcard' ? 'wildcard' : 'url-pattern';

    if (
      (patternType === 'url-pattern' && !isValidUrlPattern(pattern)) ||
      (patternType === 'wildcard' && !isValidWildcardPattern(pattern))
    ) {
      return;
    }

    const autoFullscreen =
      typeof raw.enhancements?.autoFullscreen === 'boolean'
        ? raw.enhancements.autoFullscreen
        : false;

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : generateRuleId();

    sanitized.push({
      id,
      pattern,
      patternType,
      enhancements: {
        autoFullscreen,
      },
      disabled: Boolean(raw.disabled),
      createdAt:
        typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      updatedAt:
        typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    });
  });

  return sortRulesByCreatedAt(sanitized);
}

/**
 * Load rules from storage.
 * @returns {Promise<VideoEnhancementRule[]>}
 */
async function loadRules() {
  if (!chrome?.storage?.local) {
    return [];
  }
  try {
    const stored = await chrome.storage.local.get(VIDEO_ENHANCEMENT_RULES_KEY);
    return normalizeStoredRules(stored?.[VIDEO_ENHANCEMENT_RULES_KEY]);
  } catch (error) {
    console.warn('[videoEnhancements] Failed to load rules:', error);
    return [];
  }
}

/**
 * Persist rules to storage.
 * @param {VideoEnhancementRule[]} nextRules
 * @returns {Promise<void>}
 */
async function saveRules(nextRules) {
  if (!chrome?.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.set({
      [VIDEO_ENHANCEMENT_RULES_KEY]: nextRules,
    });
  } catch (error) {
    console.warn('[videoEnhancements] Failed to save rules:', error);
  }
}

/**
 * Update the form level error message.
 * @param {string} message
 */
function setFormError(message) {
  if (!formError) {
    return;
  }
  if (!message) {
    formError.hidden = true;
    formError.textContent = '';
    return;
  }
  formError.hidden = false;
  formError.textContent = message;
}

/**
 * Reset the form to its default state.
 */
function clearForm() {
  editingRuleId = null;
  if (patternInput) {
    patternInput.value = '';
  }
  if (patternTypeSelect) {
    patternTypeSelect.value = 'url-pattern';
  }
  if (autoFullscreenInput) {
    autoFullscreenInput.checked = true;
  }
  if (saveButton) {
    saveButton.textContent = 'Add rule';
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = true;
  }
  setFormError('');
}

/**
 * Format an ISO timestamp for display.
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
 * Create a badge element.
 * @param {string} text
 * @param {string} className
 * @returns {HTMLSpanElement}
 */
function createBadge(text, className) {
  const badge = document.createElement('span');
  badge.className = `nenya-badge ${className}`;
  badge.textContent = text;
  return badge;
}

/**
 * Render the list of saved rules.
 */
function renderRulesList() {
  if (!rulesList || !rulesEmptyState) {
    return;
  }

  rulesList.textContent = '';
  if (rules.length === 0) {
    rulesEmptyState.hidden = false;
    return;
  }
  rulesEmptyState.hidden = true;

  const sortedRules = sortRulesByCreatedAt(rules);

  sortedRules.forEach((rule) => {
    const item = document.createElement('article');
    item.className =
      'rule-item flex flex-col gap-4 md:flex-row md:items-center md:justify-between';
    item.setAttribute('role', 'listitem');
    if (rule.disabled) {
      item.classList.add('opacity-50');
    }

    const info = document.createElement('div');
    info.className = 'space-y-2';

    const patternText = document.createElement('p');
    patternText.className = 'font-mono text-sm break-words';
    patternText.textContent = rule.pattern;
    info.appendChild(patternText);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'flex flex-wrap gap-2 text-xs text-base-content/70';
    const typeBadge =
      rule.patternType === 'wildcard'
        ? createBadge('Wildcard', 'nenya-badge-yellow')
        : createBadge('URLPattern', 'nenya-badge-blue');
    const autoBadge = rule.enhancements.autoFullscreen
      ? createBadge('Auto fullscreen', 'nenya-badge-green')
      : createBadge('Auto fullscreen off', 'nenya-badge-red');
    badgeRow.appendChild(typeBadge);
    badgeRow.appendChild(autoBadge);
    info.appendChild(badgeRow);

    const timestamp = document.createElement('p');
    timestamp.className = 'text-xs text-base-content/60';
    timestamp.textContent = 'Created ' + formatTimestamp(rule.createdAt);
    info.appendChild(timestamp);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-3 md:justify-end md:min-w-[220px]';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'flex items-center gap-2 text-xs text-base-content/70';
    const enabledToggle = document.createElement('input');
    enabledToggle.type = 'checkbox';
    enabledToggle.className = 'toggle toggle-primary';
    enabledToggle.checked = !rule.disabled;
    enabledToggle.title = 'Toggle rule';
    enabledToggle.addEventListener('change', (event) => {
      const isChecked = /** @type {HTMLInputElement} */ (event.target).checked;
      rule.disabled = !isChecked;
      rule.updatedAt = new Date().toISOString();
      void saveRules(rules);
      renderRulesList();
    });
    enabledLabel.appendChild(enabledToggle);
    enabledLabel.appendChild(document.createTextNode('Enabled'));
    actions.appendChild(enabledLabel);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'nenya-btn nenya-btn-secondary !py-2 !px-4 text-sm';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editingRuleId = rule.id;
      if (patternInput) {
        patternInput.value = rule.pattern;
        patternInput.focus();
      }
      if (patternTypeSelect) {
        patternTypeSelect.value = rule.patternType;
      }
      if (autoFullscreenInput) {
        autoFullscreenInput.checked = Boolean(
          rule.enhancements.autoFullscreen,
        );
      }
      if (saveButton) {
        saveButton.textContent = 'Update rule';
      }
      if (cancelEditButton) {
        cancelEditButton.hidden = false;
      }
    });
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'nenya-btn nenya-btn-danger !py-2 !px-4 text-sm';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      const confirmed = window.confirm(
        'Delete the rule for "' + rule.pattern + '"?',
      );
      if (!confirmed) {
        return;
      }
      rules = rules.filter((candidate) => candidate.id !== rule.id);
      void saveRules(rules);
      if (editingRuleId === rule.id) {
        clearForm();
      }
      renderRulesList();
    });
    actions.appendChild(deleteButton);

    item.appendChild(actions);
    rulesList.appendChild(item);
  });
}

/**
 * Validate current form values.
 * @returns {string | null}
 */
function validateFormValues() {
  if (!patternInput || !patternTypeSelect) {
    return 'Form controls are unavailable.';
  }
  const pattern = patternInput.value.trim();
  const patternType =
    patternTypeSelect.value === 'wildcard' ? 'wildcard' : 'url-pattern';

  if (!pattern) {
    return 'Enter a URL pattern.';
  }
  if (patternType === 'url-pattern' && !isValidUrlPattern(pattern)) {
    return 'Enter a valid URLPattern string.';
  }
  if (patternType === 'wildcard' && !isValidWildcardPattern(pattern)) {
    return 'Wildcard patterns cannot contain spaces.';
  }
  return null;
}

/**
 * Collect form values.
 * @returns {{ pattern: string, patternType: VideoEnhancementPatternType, autoFullscreen: boolean } | null}
 */
function getFormValues() {
  if (!patternInput || !patternTypeSelect || !autoFullscreenInput) {
    return null;
  }
  return {
    pattern: patternInput.value.trim(),
    patternType:
      patternTypeSelect.value === 'wildcard' ? 'wildcard' : 'url-pattern',
    autoFullscreen: autoFullscreenInput.checked,
  };
}

/**
 * Handle form submission.
 * @param {SubmitEvent} event
 */
async function handleFormSubmit(event) {
  event.preventDefault();
  const error = validateFormValues();
  if (error) {
    setFormError(error);
    return;
  }
  const values = getFormValues();
  if (!values) {
    setFormError('Unable to read form values.');
    return;
  }

  if (editingRuleId) {
    const existing = rules.find((rule) => rule.id === editingRuleId);
    if (!existing) {
      setFormError('Selected rule no longer exists.');
      clearForm();
      return;
    }
    existing.pattern = values.pattern;
    existing.patternType = values.patternType;
    existing.enhancements.autoFullscreen = values.autoFullscreen;
    existing.updatedAt = new Date().toISOString();
  } else {
    const now = new Date().toISOString();
    rules.push({
      id: generateRuleId(),
      pattern: values.pattern,
      patternType: values.patternType,
      enhancements: {
        autoFullscreen: values.autoFullscreen,
      },
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  await saveRules(rules);
  renderRulesList();
  clearForm();
}

/**
 * Initialize module.
 */
async function initVideoEnhancements() {
  if (!form || !patternInput || !patternTypeSelect || !autoFullscreenInput) {
    return;
  }

  rules = await loadRules();
  renderRulesList();

  form.addEventListener('submit', (event) => {
    void handleFormSubmit(event);
  });

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      clearForm();
    });
  }

  [
    patternInput,
    patternTypeSelect,
    autoFullscreenInput,
  ].forEach((element) => {
    element.addEventListener('input', () => setFormError(''));
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, VIDEO_ENHANCEMENT_RULES_KEY)) {
        return;
      }
      void (async () => {
        rules = await loadRules();
        renderRulesList();
        if (editingRuleId && !rules.find((rule) => rule.id === editingRuleId)) {
          clearForm();
        }
      })();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void initVideoEnhancements();
});

export { loadRules, saveRules };

