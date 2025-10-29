/* global chrome */

/**
 * @typedef {Object} CustomCodeRule
 * @property {string} id
 * @property {string} pattern
 * @property {string} css
 * @property {string} js
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'customCodeRules';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('customCodeRuleForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('customCodePatternInput')
);
const cssInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('customCodeCSSInput')
);
const jsInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('customCodeJSInput')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('customCodeSaveButton')
);
const cancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('customCodeCancelEditButton')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('customCodeFormError')
);
const emptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('customCodeRulesEmpty')
);
const listElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('customCodeRulesList')
);
const detailsPanel = /** @type {HTMLDivElement | null} */ (
  document.getElementById('customCodeRuleDetails')
);
const detailPattern = /** @type {HTMLElement | null} */ (
  document.getElementById('customCodeRulePatternDetail')
);
const detailCSS = /** @type {HTMLElement | null} */ (
  document.getElementById('customCodeRuleCSSDetail')
);
const detailJS = /** @type {HTMLElement | null} */ (
  document.getElementById('customCodeRuleJSDetail')
);
const detailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('customCodeRuleCreatedDetail')
);
const detailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('customCodeRuleUpdatedDetail')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {CustomCodeRule[]} */
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
 * @param {CustomCodeRule[]} collection
 * @returns {CustomCodeRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => {
    return a.pattern.localeCompare(b.pattern);
  });
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: CustomCodeRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, css?: unknown, js?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
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
        console.warn('[options:customCode] Invalid pattern ignored in storage:', pattern, error);
      }
      if (!isValidPattern) {
        return;
      }

      const css = typeof raw.css === 'string' ? raw.css : '';
      const js = typeof raw.js === 'string' ? raw.js : '';

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {CustomCodeRule} */
      const rule = {
        id,
        pattern,
        css,
        js,
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
 * Persist the provided rules in chrome.storage.local.
 * Note: Using local storage instead of sync due to quota limits for code content.
 * @param {CustomCodeRule[]} nextRules
 * @returns {Promise<void>}
 */
async function saveRules(nextRules) {
  if (!chrome?.storage?.local) {
    return;
  }
  syncing = true;
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: nextRules,
    });
  } catch (error) {
    console.warn('[options:customCode] Failed to save rules:', error);
    throw error;
  } finally {
    syncing = false;
  }
}

/**
 * Load rules from storage, synchronizing invalid entries if needed.
 * @returns {Promise<void>}
 */
async function loadRules() {
  if (!chrome?.storage?.local) {
    rules = [];
    return;
  }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const { rules: sanitized, mutated } = normalizeRules(stored?.[STORAGE_KEY]);
    rules = sanitized;
    if (mutated) {
      await saveRules(sanitized);
    }
    render();
  } catch (error) {
    console.warn('[options:customCode] Failed to load rules:', error);
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
 * Find a rule by ID.
 * @param {string} ruleId
 * @returns {CustomCodeRule | undefined}
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
 * Format code for display (truncate if too long)
 * @param {string} code
 * @param {number} maxLength
 * @returns {string}
 */
function formatCode(code, maxLength = 200) {
  if (!code || !code.trim()) {
    return '(empty)';
  }
  if (code.length > maxLength) {
    return code.substring(0, maxLength) + '...';
  }
  return code;
}

/**
 * Render the rule details panel for the current selection.
 * @returns {void}
 */
function renderDetails() {
  if (!detailsPanel || !detailPattern || !detailCSS || !detailJS || !detailCreated || !detailUpdated) {
    return;
  }
  const rule = findRule(selectedRuleId);
  if (!rule) {
    detailsPanel.hidden = true;
    detailPattern.textContent = '';
    detailCSS.textContent = '';
    detailJS.textContent = '';
    detailCreated.textContent = '';
    detailUpdated.textContent = '';
    return;
  }

  detailsPanel.hidden = false;
  detailPattern.textContent = rule.pattern;
  detailCSS.textContent = formatCode(rule.css);
  detailJS.textContent = formatCode(rule.js);
  detailCreated.textContent = formatTimestamp(rule.createdAt);
  detailUpdated.textContent = formatTimestamp(rule.updatedAt ?? rule.createdAt);
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
    info.className = 'space-y-1 flex-1 min-w-0';

    const pattern = document.createElement('p');
    pattern.className = 'font-mono text-sm break-words';
    pattern.textContent = rule.pattern;
    info.appendChild(pattern);

    const summary = document.createElement('p');
    summary.className = 'text-xs text-base-content/70';
    const hasCss = rule.css && rule.css.trim();
    const hasJs = rule.js && rule.js.trim();
    const parts = [];
    if (hasCss) parts.push('CSS');
    if (hasJs) parts.push('JS');
    summary.textContent = parts.length > 0 ? parts.join(' + ') : 'No code';
    info.appendChild(summary);

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
      if (cssInput) {
        cssInput.value = rule.css || '';
      }
      if (jsInput) {
        jsInput.value = rule.js || '';
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
        'Delete the custom code rule for "' + rule.pattern + '"?',
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
  if (!patternInput || !cssInput || !jsInput) {
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
    console.warn('[options:customCode] Pattern validation failed:', error);
    showFormError('Enter a valid URL pattern that the browser accepts.');
    return;
  }

  const css = cssInput.value || '';
  const js = jsInput.value || '';

  if (!css.trim() && !js.trim()) {
    showFormError('Enter at least some CSS or JavaScript code.');
    return;
  }

  const now = new Date().toISOString();

  if (editingRuleId) {
    const existing = findRule(editingRuleId);
    if (!existing) {
      showFormError('Selected rule no longer exists.');
      resetForm();
      return;
    }
    existing.pattern = pattern;
    existing.css = css;
    existing.js = js;
    existing.updatedAt = now;
    if (!existing.createdAt) {
      existing.createdAt = now;
    }
  } else {
    const rule = {
      id: generateRuleId(),
      pattern,
      css,
      js,
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
      if (area !== 'local') {
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

