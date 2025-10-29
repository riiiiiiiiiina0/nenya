/* global chrome */

/**
 * @typedef {Object} BlockElementRule
 * @property {string} id
 * @property {string} urlPattern
 * @property {string[]} selectors
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'blockElementRules';

const emptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('blockElementsRulesEmpty')
);
const listElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('blockElementsRulesList')
);
const detailsPanel = /** @type {HTMLDivElement | null} */ (
  document.getElementById('blockElementsRuleDetails')
);
const detailPattern = /** @type {HTMLInputElement | null} */ (
  document.getElementById('blockElementsRulePatternInput')
);
const detailPatternSaveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('blockElementsRulePatternSaveButton')
);
const detailPatternCancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('blockElementsRulePatternCancelButton')
);
const detailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('blockElementsRuleCreatedDetail')
);
const detailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('blockElementsRuleUpdatedDetail')
);
const detailSelectorCount = /** @type {HTMLElement | null} */ (
  document.getElementById('blockElementsRuleSelectorCount')
);
const detailSelectorsList = /** @type {HTMLElement | null} */ (
  document.getElementById('blockElementsRuleSelectorsList')
);
const deleteButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('blockElementsRuleDeleteButton')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {BlockElementRule[]} */
let rules = [];
let selectedRuleId = '';
let editingPatternRuleId = '';
let originalPattern = '';
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
 * @param {BlockElementRule[]} collection
 * @returns {BlockElementRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => {
    return a.urlPattern.localeCompare(b.urlPattern);
  });
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: BlockElementRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, urlPattern?: unknown, selectors?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const urlPattern =
        typeof raw.urlPattern === 'string' ? raw.urlPattern.trim() : '';
      if (!urlPattern) {
        return;
      }

      let isValidPattern = false;
      try {
        // Throws if invalid
        // eslint-disable-next-line no-new
        new URLPattern(urlPattern);
        isValidPattern = true;
      } catch (error) {
        console.warn(
          '[options:blockElements] Invalid pattern ignored in storage:',
          urlPattern,
          error,
        );
      }
      if (!isValidPattern) {
        return;
      }

      const selectors = Array.isArray(raw.selectors)
        ? raw.selectors.filter((s) => typeof s === 'string' && s.trim())
        : [];

      if (selectors.length === 0) {
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {BlockElementRule} */
      const rule = {
        id,
        urlPattern,
        selectors,
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
 * @param {BlockElementRule[]} nextRules
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
    console.warn('[options:blockElements] Failed to save rules:', error);
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
    console.warn('[options:blockElements] Failed to load rules:', error);
    rules = [];
    render();
  }
}

/**
 * Find a rule by ID.
 * @param {string} ruleId
 * @returns {BlockElementRule | undefined}
 */
function findRule(ruleId) {
  return rules.find((rule) => rule.id === ruleId);
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
 * Cancel pattern editing.
 * @returns {void}
 */
function cancelPatternEdit() {
  editingPatternRuleId = '';
  originalPattern = '';
  if (detailPattern) {
    detailPattern.readOnly = true;
  }
  if (detailPatternSaveButton) {
    detailPatternSaveButton.hidden = true;
  }
  if (detailPatternCancelButton) {
    detailPatternCancelButton.hidden = true;
  }
  renderDetails();
}

/**
 * Save pattern edit.
 * @returns {void}
 */
async function savePatternEdit() {
  if (!detailPattern) {
    return;
  }

  const newPattern = detailPattern.value.trim();
  if (!newPattern) {
    alert('URL pattern cannot be empty.');
    return;
  }

  try {
    // eslint-disable-next-line no-new
    new URLPattern(newPattern);
  } catch (error) {
    console.warn('[options:blockElements] Pattern validation failed:', error);
    alert('Enter a valid URL pattern that the browser accepts.');
    return;
  }

  const rule = findRule(editingPatternRuleId);
  if (!rule) {
    cancelPatternEdit();
    return;
  }

  rule.urlPattern = newPattern;
  rule.updatedAt = new Date().toISOString();

  rules = sortRules(rules);
  await saveRules(rules);
  cancelPatternEdit();
  render();
}

/**
 * Delete a selector from the current rule.
 * @param {string} selector
 * @returns {void}
 */
async function deleteSelector(selector) {
  const rule = findRule(selectedRuleId);
  if (!rule) {
    return;
  }

  // eslint-disable-next-line no-alert
  const confirmed = window.confirm('Delete the selector "' + selector + '"?');
  if (!confirmed) {
    return;
  }

  rule.selectors = rule.selectors.filter((s) => s !== selector);
  rule.updatedAt = new Date().toISOString();

  // If no selectors left, delete the entire rule
  if (rule.selectors.length === 0) {
    rules = rules.filter((r) => r.id !== rule.id);
    selectedRuleId = '';
  }

  await saveRules(rules);
  render();
}

/**
 * Render the rule details panel for the current selection.
 * @returns {void}
 */
function renderDetails() {
  if (
    !detailsPanel ||
    !detailPattern ||
    !detailCreated ||
    !detailUpdated ||
    !detailSelectorCount ||
    !detailSelectorsList
  ) {
    return;
  }
  const rule = findRule(selectedRuleId);
  if (!rule) {
    detailsPanel.hidden = true;
    detailPattern.value = '';
    detailCreated.textContent = '';
    detailUpdated.textContent = '';
    detailSelectorCount.textContent = '';
    detailSelectorsList.textContent = '';
    return;
  }

  detailsPanel.hidden = false;
  detailPattern.value = rule.urlPattern;
  detailPattern.readOnly = editingPatternRuleId !== rule.id;
  detailCreated.textContent = formatTimestamp(rule.createdAt);
  detailUpdated.textContent = formatTimestamp(rule.updatedAt ?? rule.createdAt);
  detailSelectorCount.textContent =
    rule.selectors.length +
    ' selector' +
    (rule.selectors.length === 1 ? '' : 's');

  // Render selectors list
  detailSelectorsList.textContent = '';
  rule.selectors.forEach((selector) => {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-2 p-2 rounded-lg bg-base-200';

    const text = document.createElement('code');
    text.className = 'flex-1 text-xs break-all';
    text.textContent = selector;
    item.appendChild(text);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-xs btn-error btn-outline';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      void deleteSelector(selector);
    });
    item.appendChild(deleteBtn);

    detailSelectorsList.appendChild(item);
  });
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
    info.className = 'space-y-1 flex-1';

    const pattern = document.createElement('p');
    pattern.className = 'font-mono text-sm break-words';
    pattern.textContent = rule.urlPattern;
    info.appendChild(pattern);

    const selectorCount = document.createElement('p');
    selectorCount.className = 'text-sm text-base-content/70';
    selectorCount.textContent =
      rule.selectors.length +
      ' selector' +
      (rule.selectors.length === 1 ? '' : 's');
    info.appendChild(selectorCount);

    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-ghost';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      selectedRuleId = rule.id;
      editingPatternRuleId = '';
      originalPattern = '';
      renderDetails();
    });
    actions.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit pattern';
    editButton.addEventListener('click', () => {
      selectedRuleId = rule.id;
      editingPatternRuleId = rule.id;
      originalPattern = rule.urlPattern;
      if (detailPattern) {
        detailPattern.readOnly = false;
      }
      if (detailPatternSaveButton) {
        detailPatternSaveButton.hidden = false;
      }
      if (detailPatternCancelButton) {
        detailPatternCancelButton.hidden = false;
      }
      renderDetails();
      if (detailPattern) {
        detailPattern.focus();
        detailPattern.select();
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
        'Delete the blocking rule for "' + rule.urlPattern + '"?',
      );
      if (!confirmed) {
        return;
      }
      rules = rules.filter((candidate) => candidate.id !== rule.id);
      if (selectedRuleId === rule.id) {
        selectedRuleId = '';
        editingPatternRuleId = '';
        originalPattern = '';
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
 * Initialize listeners and load existing data.
 * @returns {void}
 */
function init() {
  if (detailPatternSaveButton) {
    detailPatternSaveButton.addEventListener('click', () => {
      void savePatternEdit();
    });
  }
  if (detailPatternCancelButton) {
    detailPatternCancelButton.addEventListener('click', cancelPatternEdit);
  }
  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      const rule = findRule(selectedRuleId);
      if (!rule) {
        return;
      }
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        'Delete the blocking rule for "' + rule.urlPattern + '"?',
      );
      if (!confirmed) {
        return;
      }
      rules = rules.filter((candidate) => candidate.id !== rule.id);
      selectedRuleId = '';
      editingPatternRuleId = '';
      originalPattern = '';
      void saveRules(rules);
      render();
    });
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
        editingPatternRuleId = '';
        originalPattern = '';
      }
      render();
    });
  }

  void loadRules();
}

init();
