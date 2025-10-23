/* global chrome */

/**
 * @typedef {Object} AutoReloadRule
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSeconds
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'autoReloadRules';
const MIN_INTERVAL_SECONDS = 5;

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('autoReloadRuleForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('autoReloadPatternInput')
);
const intervalInput = /** @type{HTMLInputElement | null} */ (
  document.getElementById('autoReloadIntervalInput')
);
const saveButton = /** @type{HTMLButtonElement | null} */ (
  document.getElementById('autoReloadSaveButton')
);
const cancelButton = /** @type{HTMLButtonElement | null} */ (
  document.getElementById('autoReloadCancelEditButton')
);
const formError = /** @type{HTMLParagraphElement | null} */ (
  document.getElementById('autoReloadFormError')
);
const emptyState = /** @type{HTMLDivElement | null} */ (
  document.getElementById('autoReloadRulesEmpty')
);
const listElement = /** @type{HTMLDivElement | null} */ (
  document.getElementById('autoReloadRulesList')
);
const detailsPanel = /** @type{HTMLDivElement | null} */ (
  document.getElementById('autoReloadRuleDetails')
);
const detailPattern = /** @type{HTMLElement | null} */ (
  document.getElementById('autoReloadRulePatternDetail')
);
const detailCreated = /** @type{HTMLElement | null} */ (
  document.getElementById('autoReloadRuleCreatedDetail')
);
const detailUpdated = /** @type{HTMLElement | null} */ (
  document.getElementById('autoReloadRuleUpdatedDetail')
);
const detailSummary = /** @type{HTMLElement | null} */ (
  document.getElementById('autoReloadRuleIntervalSummary')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {AutoReloadRule[]} */
let rules = [];
let selectedRuleId = '';
let editingRuleId = '';
let syncing = false;

/**
 * Generate a unique identifier for new rules.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Create a deep copy of the provided rules and sort them for consistent rendering.
 * @param {AutoReloadRule[]} collection
 * @returns {AutoReloadRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    return a.intervalSeconds - b.intervalSeconds;
  });
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: AutoReloadRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      let isValidPattern = false;
      try {
        // Throws if invalid
        // eslint-disable-next-line no-new
        new URLPattern(pattern);
        isValidPattern = true;
      } catch (error) {
        console.warn('[options:autoReload] Invalid pattern ignored in storage:', pattern, error);
      }
      if (!isValidPattern) {
        return;
      }

      const intervalCandidate = Math.floor(Number(raw.intervalSeconds));
      const interval = Number.isFinite(intervalCandidate) && intervalCandidate > 0
        ? Math.max(MIN_INTERVAL_SECONDS, intervalCandidate)
        : MIN_INTERVAL_SECONDS;

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoReloadRule} */
      const rule = {
        id,
        pattern,
        intervalSeconds: interval,
      };
      if (typeof raw.createdAt === 'string') {
        rule.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        rule.updatedAt = raw.updatedAt;
      }
      sanitized.push(rule);
    });
  }

  return { rules: sortRules(sanitized), mutated };
}

/**
 * Persist the provided rules in chrome.storage.sync.
 * @param {AutoReloadRule[]} nextRules
 * @returns {Promise<void>}
 */
async function saveRules(nextRules) {
  if (!chrome?.storage?.sync) {
    return;
  }
  syncing = true;
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: nextRules,
    });
  } catch (error) {
    console.warn('[options:autoReload] Failed to save rules:', error);
  } finally {
    syncing = false;
  }
}

/**
 * Load rules from storage, synchronizing invalid entries if needed.
 * @returns {Promise<void>}
 */
async function loadRules() {
  if (!chrome?.storage?.sync) {
    rules = [];
    return;
  }

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const { rules: sanitized, mutated } = normalizeRules(stored?.[STORAGE_KEY]);
    rules = sanitized;
    if (mutated) {
      await saveRules(sanitized);
    }
    render();
  } catch (error) {
    console.warn('[options:autoReload] Failed to load rules:', error);
    rules = [];
    render();
  }
}

/**
 * Display or hide a form level error message.
 * @param {string} message
 * @returns {void}
 */
function showFormError(message) {
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
 * Convert an interval in seconds into a human-readable summary.
 * @param {number} intervalSeconds
 * @returns {string}
 */
function formatInterval(intervalSeconds) {
  const normalized = Math.max(MIN_INTERVAL_SECONDS, Math.floor(intervalSeconds));
  if (normalized < 60) {
    return normalized === 1 ? 'Every second' : 'Every ' + normalized + ' seconds';
  }
  const minutes = normalized / 60;
  if (Number.isInteger(minutes)) {
    if (minutes === 1) {
      return 'Every minute';
    }
    return 'Every ' + minutes + ' minutes';
  }
  return 'Every ' + normalized + ' seconds';
}

/**
 * Find a rule by ID.
 * @param {string} ruleId
 * @returns {AutoReloadRule | undefined}
 */
function findRule(ruleId) {
  return rules.find((rule) => rule.id === ruleId);
}

/**
 * Reset the form to its default (create) state.
 * @returns {void}
 */
function resetForm() {
  editingRuleId = '';
  if (form) {
    form.reset();
  }
  if (saveButton) {
    saveButton.textContent = 'Add rule';
  }
  if (cancelButton) {
    cancelButton.hidden = true;
  }
  showFormError('');
}

/**
 * Format a timestamp for display in the details panel.
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
 * Render the rule details panel for the current selection.
 * @returns {void}
 */
function renderDetails() {
  if (!detailsPanel || !detailPattern || !detailCreated || !detailUpdated || !detailSummary) {
    return;
  }
  const rule = findRule(selectedRuleId);
  if (!rule) {
    detailsPanel.hidden = true;
    detailPattern.textContent = '';
    detailCreated.textContent = '';
    detailUpdated.textContent = '';
    detailSummary.textContent = '';
    return;
  }

  detailsPanel.hidden = false;
  detailPattern.textContent = rule.pattern;
  detailCreated.textContent = formatTimestamp(rule.createdAt);
  detailUpdated.textContent = formatTimestamp(rule.updatedAt ?? rule.createdAt);
  detailSummary.textContent = formatInterval(rule.intervalSeconds);
}

/**
 * Render the saved rules list.
 * @returns {void}
 */
function renderList() {
  if (!listElement || !emptyState) {
    return;
  }

  listElement.textContent = '';
  if (rules.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  rules.forEach((rule) => {
    const container = document.createElement('article');
    container.className =
      'rounded-lg border border-base-300 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
    container.setAttribute('role', 'listitem');

    const info = document.createElement('div');
    info.className = 'space-y-1';

    const pattern = document.createElement('p');
    pattern.className = 'font-mono text-sm break-words';
    pattern.textContent = rule.pattern;
    info.appendChild(pattern);

    const interval = document.createElement('p');
    interval.className = 'text-sm text-base-content/70';
    interval.textContent = formatInterval(rule.intervalSeconds);
    info.appendChild(interval);

    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-ghost';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      selectedRuleId = rule.id;
      renderDetails();
    });
    actions.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editingRuleId = rule.id;
      selectedRuleId = rule.id;
      if (patternInput) {
        patternInput.value = rule.pattern;
      }
      if (intervalInput) {
        intervalInput.value = String(rule.intervalSeconds);
      }
      if (saveButton) {
        saveButton.textContent = 'Save changes';
      }
      if (cancelButton) {
        cancelButton.hidden = false;
      }
      renderDetails();
      if (patternInput) {
        patternInput.focus();
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
        'Delete the auto reload rule for "' + rule.pattern + '"?',
      );
      if (!confirmed) {
        return;
      }
      rules = rules.filter((candidate) => candidate.id !== rule.id);
      if (selectedRuleId === rule.id) {
        selectedRuleId = '';
      }
      if (editingRuleId === rule.id) {
        resetForm();
      }
      void saveRules(rules);
      render();
    });
    actions.appendChild(deleteButton);

    container.appendChild(actions);
    listElement.appendChild(container);
  });
}

/**
 * Render list and details.
 * @returns {void}
 */
function render() {
  renderList();
  renderDetails();
}

/**
 * Handle form submission to create or update rules.
 * @param {SubmitEvent} event
 * @returns {void}
 */
function handleFormSubmit(event) {
  event.preventDefault();
  if (!patternInput || !intervalInput) {
    return;
  }

  const pattern = patternInput.value.trim();
  if (!pattern) {
    showFormError('Enter a URL pattern.');
    return;
  }

  try {
    // eslint-disable-next-line no-new
    new URLPattern(pattern);
  } catch (error) {
    console.warn('[options:autoReload] Pattern validation failed:', error);
    showFormError('Enter a valid URL pattern that the browser accepts.');
    return;
  }

  const intervalValue = Math.floor(Number(intervalInput.value));
  if (!Number.isFinite(intervalValue) || intervalValue < MIN_INTERVAL_SECONDS) {
    showFormError('Interval must be at least ' + MIN_INTERVAL_SECONDS + ' seconds.');
    return;
  }

  const normalizedInterval = Math.max(MIN_INTERVAL_SECONDS, intervalValue);
  const now = new Date().toISOString();

  if (editingRuleId) {
    const existing = findRule(editingRuleId);
    if (!existing) {
      showFormError('Selected rule no longer exists.');
      resetForm();
      return;
    }
    existing.pattern = pattern;
    existing.intervalSeconds = normalizedInterval;
    existing.updatedAt = now;
    if (!existing.createdAt) {
      existing.createdAt = now;
    }
  } else {
    const rule = {
      id: generateRuleId(),
      pattern,
      intervalSeconds: normalizedInterval,
      createdAt: now,
      updatedAt: now,
    };
    rules.push(rule);
    selectedRuleId = rule.id;
  }

  rules = sortRules(rules);
  showFormError('');
  resetForm();
  void saveRules(rules);
  render();
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
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
  if (cancelButton) {
    cancelButton.addEventListener('click', handleCancelEdit);
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        return;
      }
      if (syncing) {
        return;
      }
      const { rules: sanitized } = normalizeRules(
        changes[STORAGE_KEY]?.newValue,
      );
      rules = sanitized;
      if (selectedRuleId && !findRule(selectedRuleId)) {
        selectedRuleId = '';
      }
      if (editingRuleId && !findRule(editingRuleId)) {
        resetForm();
      }
      render();
    });
  }

  void loadRules();
}

init();
