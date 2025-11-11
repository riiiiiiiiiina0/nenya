/* global chrome */

/**
 * @typedef {Object} AutoGoogleLoginRule
 * @property {string} id
 * @property {string} pattern
 * @property {string | undefined} email
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'autoGoogleLoginRules';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('autoGoogleLoginRuleForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('autoGoogleLoginPatternInput')
);
const emailInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('autoGoogleLoginEmailInput')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('autoGoogleLoginSaveButton')
);
const cancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('autoGoogleLoginCancelEditButton')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('autoGoogleLoginFormError')
);
const emptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('autoGoogleLoginRulesEmpty')
);
const listElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('autoGoogleLoginRulesList')
);
const detailsPanel = /** @type {HTMLDivElement | null} */ (
  document.getElementById('autoGoogleLoginRuleDetails')
);
const detailPattern = /** @type {HTMLElement | null} */ (
  document.getElementById('autoGoogleLoginRulePatternDetail')
);
const detailEmail = /** @type {HTMLElement | null} */ (
  document.getElementById('autoGoogleLoginRuleEmailDetail')
);
const detailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('autoGoogleLoginRuleCreatedDetail')
);
const detailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('autoGoogleLoginRuleUpdatedDetail')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {AutoGoogleLoginRule[]} */
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
 * @param {AutoGoogleLoginRule[]} collection
 * @returns {AutoGoogleLoginRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) {
      return patternCompare;
    }
    const emailA = a.email || '';
    const emailB = b.email || '';
    return emailA.localeCompare(emailB);
  });
}

/**
 * Validate URL pattern using URLPattern API.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidUrlPattern(pattern) {
  try {
    // eslint-disable-next-line no-new
    new URLPattern(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || !email.trim()) {
    return true; // Email is optional
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: AutoGoogleLoginRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw = /** @type {{ id?: unknown, pattern?: unknown, email?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
        entry
      );
      const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!pattern) {
        return;
      }

      if (!isValidUrlPattern(pattern)) {
        console.warn(
          '[options:autoGoogleLogin] Invalid pattern ignored in storage:',
          pattern,
        );
        return;
      }

      const email =
        typeof raw.email === 'string' ? raw.email.trim() : undefined;
      if (email && !isValidEmail(email)) {
        console.warn(
          '[options:autoGoogleLogin] Invalid email ignored in storage:',
          email,
        );
        return;
      }

      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoGoogleLoginRule} */
      const rule = {
        id,
        pattern,
      };
      if (email) {
        rule.email = email;
      }
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
 * @param {AutoGoogleLoginRule[]} nextRules
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
    console.warn('[options:autoGoogleLogin] Failed to save rules:', error);
  } finally {
    syncing = false;
  }
}

/**
 * Load rules from storage, synchronizing invalid entries if needed.
 * @returns {Promise<void>}
 */
async function loadAndRenderRules() {
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
    console.warn('[options:autoGoogleLogin] Failed to load rules:', error);
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
 * @returns {AutoGoogleLoginRule | undefined}
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
  if (
    !detailsPanel ||
    !detailPattern ||
    !detailEmail ||
    !detailCreated ||
    !detailUpdated
  ) {
    return;
  }
  const rule = findRule(selectedRuleId);
  if (!rule) {
    detailsPanel.hidden = true;
    detailPattern.textContent = '';
    detailEmail.textContent = '';
    detailCreated.textContent = '';
    detailUpdated.textContent = '';
    return;
  }

  detailsPanel.hidden = false;
  detailPattern.textContent = rule.pattern;
  detailEmail.textContent = rule.email || '—';
  detailCreated.textContent = formatTimestamp(rule.createdAt);
  detailUpdated.textContent = formatTimestamp(
    rule.updatedAt ?? rule.createdAt,
  );
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

    if (rule.email) {
      const email = document.createElement('p');
      email.className = 'text-sm text-base-content/70';
      email.textContent = rule.email;
      info.appendChild(email);
    }

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
      if (emailInput) {
        emailInput.value = rule.email || '';
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
        'Delete the auto Google login rule for "' + rule.pattern + '"?',
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
  if (!patternInput || !emailInput) {
    return;
  }

  const pattern = patternInput.value.trim();
  if (!pattern) {
    showFormError('Enter a URL pattern.');
    return;
  }

  if (!isValidUrlPattern(pattern)) {
    showFormError('Enter a valid URL pattern that the browser accepts.');
    return;
  }

  const email = emailInput.value.trim();
  if (email && !isValidEmail(email)) {
    showFormError('Enter a valid email address or leave it empty.');
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
    if (email) {
      existing.email = email;
    } else {
      delete existing.email;
    }
    existing.updatedAt = now;
    if (!existing.createdAt) {
      existing.createdAt = now;
    }
  } else {
    const rule = {
      id: generateRuleId(),
      pattern,
      createdAt: now,
      updatedAt: now,
    };
    if (email) {
      rule.email = email;
    }
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

  void loadAndRenderRules();
}

init();

/**
 * Export function for import/export functionality.
 * @returns {Promise<AutoGoogleLoginRule[]>}
 */
export async function loadRules() {
  if (!chrome?.storage?.sync) {
    return [];
  }

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const { rules: sanitized } = normalizeRules(stored?.[STORAGE_KEY]);
    return sanitized;
  } catch (error) {
    console.warn('[options:autoGoogleLogin] Failed to load rules:', error);
    return [];
  }
}

