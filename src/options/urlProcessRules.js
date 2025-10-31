/* global chrome, URLPattern */

/**
 * @typedef {'add' | 'replace' | 'remove'} ProcessorType
 */

/**
 * @typedef {'copy-to-clipboard' | 'save-to-raindrop'} ApplyWhenOption
 */

/**
 * @typedef {Object} UrlProcessor
 * @property {string} id
 * @property {ProcessorType} type
 * @property {string} name - Parameter name (string or regex pattern)
 * @property {string} [value] - Value for add/replace processors
 */

/**
 * @typedef {Object} UrlProcessRule
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {UrlProcessor[]} processors
 * @property {ApplyWhenOption[]} applyWhen - When to apply this rule
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'urlProcessRules';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('urlProcessRuleForm')
);
const nameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('urlProcessRuleNameInput')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('urlProcessRuleSaveButton')
);
const cancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('urlProcessRuleCancelEditButton')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('urlProcessRuleFormError')
);
const emptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('urlProcessRulesEmpty')
);
const listElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('urlProcessRulesList')
);
const detailsPanel = /** @type {HTMLDivElement | null} */ (
  document.getElementById('urlProcessRuleDetails')
);
const detailName = /** @type {HTMLElement | null} */ (
  document.getElementById('urlProcessRuleDetailName')
);
const detailPatterns = /** @type {HTMLElement | null} */ (
  document.getElementById('urlProcessRuleDetailPatterns')
);
const detailProcessors = /** @type {HTMLElement | null} */ (
  document.getElementById('urlProcessRuleDetailProcessors')
);
const detailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('urlProcessRuleDetailCreated')
);
const detailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('urlProcessRuleDetailUpdated')
);
const patternsList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('urlProcessRulePatternsList')
);
const addPatternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('urlProcessRuleAddPatternInput')
);
const addPatternButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('urlProcessRuleAddPatternButton')
);
const processorsList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('urlProcessRuleProcessorsList')
);
const processorTypeSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('urlProcessRuleProcessorTypeSelect')
);
const processorNameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('urlProcessRuleProcessorNameInput')
);
const processorValueInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('urlProcessRuleProcessorValueInput')
);
const addProcessorButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('urlProcessRuleAddProcessorButton')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {UrlProcessRule[]} */
let rules = [];
let selectedRuleId = '';
let editingRuleId = '';
let syncing = false;
let editingPatterns = [];
let editingProcessors = [];
let editingApplyWhen = [];

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
 * Generate a unique identifier for processors.
 * @returns {string}
 */
function generateProcessorId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'proc-' + Date.now().toString(36) + '-' + random;
}

/**
 * Create a deep copy of the provided rules and sort them for consistent rendering.
 * @param {UrlProcessRule[]} collection
 * @returns {UrlProcessRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validate URL pattern using URLPattern API.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidUrlPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }

  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return false;
  }

  try {
    // Use URL Pattern API for robust validation
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
    return false;
  }
}

/**
 * Validate regex pattern.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: UrlProcessRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, processors?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const name =
        typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return;
      }

      const urlPatterns = Array.isArray(raw.urlPatterns)
        ? raw.urlPatterns
            .map((p) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p) => p && isValidUrlPattern(p))
        : [];
      if (urlPatterns.length === 0) {
        return;
      }

      const processors = Array.isArray(raw.processors)
        ? raw.processors
            .map((p) => {
              if (!p || typeof p !== 'object') {
                return null;
              }
              const procRaw =
                /** @type {{ id?: unknown, type?: unknown, name?: unknown, value?: unknown }} */ (
                  p
                );
              const type = procRaw.type;
              if (
                typeof type !== 'string' ||
                !['add', 'replace', 'remove'].includes(type)
              ) {
                return null;
              }
              const procName =
                typeof procRaw.name === 'string' ? procRaw.name.trim() : '';
              if (!procName) {
                return null;
              }
              // For replace and remove, name can be regex
              if (type === 'replace' || type === 'remove') {
                // Validate as regex if it looks like one
                if (procName.startsWith('/') && procName.endsWith('/')) {
                  const regexPattern = procName.slice(1, -1);
                  if (!isValidRegex(regexPattern)) {
                    return null;
                  }
                }
              }
              const procId =
                typeof procRaw.id === 'string' && procRaw.id.trim()
                  ? procRaw.id.trim()
                  : generateProcessorId();

              /** @type {UrlProcessor} */
              const processor = {
                id: procId,
                type: /** @type {ProcessorType} */ (type),
                name: procName,
              };

              if (type === 'add' || type === 'replace') {
                const procValue =
                  typeof procRaw.value === 'string' ? procRaw.value : '';
                processor.value = procValue;
              }

              return processor;
            })
            .filter((p) => p !== null)
        : [];
      if (processors.length === 0) {
        return;
      }

      const applyWhen = Array.isArray(raw.applyWhen)
        ? raw.applyWhen.filter((aw) =>
            ['copy-to-clipboard', 'save-to-raindrop'].includes(aw),
          )
        : [];
      if (applyWhen.length === 0) {
        return;
      }

      const id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : generateRuleId();
      if (!id) {
        mutated = true;
      }

      /** @type {UrlProcessRule} */
      const normalized = {
        id,
        name,
        urlPatterns,
        processors,
        applyWhen: /** @type {ApplyWhenOption[]} */ (applyWhen),
      };

      if (typeof raw.createdAt === 'string') {
        normalized.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        normalized.updatedAt = raw.updatedAt;
      }

      sanitized.push(normalized);
    });
  }

  const sorted = sortRules(sanitized);
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { rules: sorted, mutated };
}

/**
 * Load rules from storage and update the UI.
 * @returns {Promise<void>}
 */
async function loadAndRenderRules() {
  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const { rules: sanitized, mutated } = normalizeRules(
      result?.[STORAGE_KEY],
    );
    if (mutated) {
      await chrome.storage.sync.set({
        [STORAGE_KEY]: sanitized,
      });
    }
    rules = sanitized;
    render();
  } catch (error) {
    console.error('[urlProcessRules] Failed to load rules:', error);
    if (formError) {
      formError.textContent =
        'Failed to load rules. Please refresh the page.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Render the rules list and details panel.
 * @returns {void}
 */
function render() {
  if (!listElement || !emptyState) {
    return;
  }

  if (rules.length === 0) {
    listElement.innerHTML = '';
    emptyState.hidden = false;
    if (detailsPanel) {
      detailsPanel.hidden = true;
    }
    return;
  }

  emptyState.hidden = true;
  listElement.innerHTML = rules
    .map(
      (rule) => `
    <div
      class="rounded-lg border border-base-300 p-3 cursor-pointer transition-colors hover:bg-base-200 ${
        selectedRuleId === rule.id ? 'bg-base-200 border-primary' : ''
      }"
      data-rule-id="${rule.id}"
      role="button"
      tabindex="0"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <h4 class="font-medium text-base-content truncate">${rule.name}</h4>
          <p class="text-sm text-base-content/70 mt-1">
            ${rule.urlPatterns.length} pattern${rule.urlPatterns.length !== 1 ? 's' : ''}, ${rule.processors.length} processor${rule.processors.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            class="btn btn-sm btn-ghost"
            data-edit-id="${rule.id}"
            type="button"
            aria-label="Edit rule"
          >
            ✏️
          </button>
          <button
            class="btn btn-sm btn-error btn-outline"
            data-delete-id="${rule.id}"
            type="button"
            aria-label="Delete rule"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join('');

  // Attach event listeners
  listElement.querySelectorAll('[data-rule-id]').forEach((el) => {
    const ruleId = el.getAttribute('data-rule-id');
    if (!ruleId) {
      return;
    }
    el.addEventListener('click', () => {
      selectedRuleId = ruleId;
      renderDetails(ruleId);
      render();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectedRuleId = ruleId;
        renderDetails(ruleId);
        render();
      }
    });
  });

  listElement.querySelectorAll('[data-edit-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = el.getAttribute('data-edit-id');
      if (ruleId) {
        startEdit(ruleId);
      }
    });
  });

  listElement.querySelectorAll('[data-delete-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = el.getAttribute('data-delete-id');
      if (ruleId) {
        deleteRule(ruleId);
      }
    });
  });

  if (selectedRuleId) {
    const ruleExists = rules.some((r) => r.id === selectedRuleId);
    if (ruleExists) {
      renderDetails(selectedRuleId);
    } else {
      selectedRuleId = '';
      if (detailsPanel) {
        detailsPanel.hidden = true;
      }
    }
  } else if (detailsPanel) {
    detailsPanel.hidden = true;
  }
}

/**
 * Render the details panel for a selected rule.
 * @param {string} ruleId
 * @returns {void}
 */
function renderDetails(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule || !detailsPanel) {
    return;
  }

  detailsPanel.hidden = false;

  if (detailName) {
    detailName.textContent = rule.name;
  }
  if (detailCreated) {
    detailCreated.textContent = rule.createdAt
      ? dateFormatter.format(new Date(rule.createdAt))
      : 'Unknown';
  }
  if (detailUpdated) {
    detailUpdated.textContent = rule.updatedAt
      ? dateFormatter.format(new Date(rule.updatedAt))
      : 'Unknown';
  }

  if (detailPatterns) {
    detailPatterns.innerHTML = rule.urlPatterns
      .map(
        (pattern) => `
      <div class="font-mono text-sm break-words text-base-content">${pattern}</div>
    `,
      )
      .join('');
  }

  if (detailProcessors) {
    detailProcessors.innerHTML = rule.processors
      .map((processor) => {
        const typeLabel =
          processor.type === 'add'
            ? 'Add'
            : processor.type === 'replace'
              ? 'Replace'
              : 'Remove';
        const nameDisplay = processor.name.startsWith('/') &&
          processor.name.endsWith('/')
          ? `Regex: ${processor.name}`
          : processor.name;
        const valueDisplay =
          processor.type === 'add' || processor.type === 'replace'
            ? ` = "${processor.value || ''}"`
            : '';
        return `
      <div class="text-sm text-base-content">
        <span class="badge badge-outline">${typeLabel}</span>
        <span class="font-mono">${nameDisplay}${valueDisplay}</span>
      </div>
    `;
      })
      .join('');
  }

  // Render apply when options
  const applyWhenContainer = document.getElementById('urlProcessRuleDetailApplyWhen');
  if (applyWhenContainer) {
    const applyWhenLabels = {
      'copy-to-clipboard': 'Copy to clipboard',
      'save-to-raindrop': 'Save to Raindrop',
    };
    applyWhenContainer.innerHTML = rule.applyWhen
      .map((aw) => {
        const label = applyWhenLabels[aw] || aw;
        return `<div class="text-sm text-base-content"><span class="badge badge-primary">${label}</span></div>`;
      })
      .join('');
  }
}

/**
 * Clear the form and reset editing state.
 * @returns {void}
 */
function clearForm() {
  editingRuleId = '';
  editingPatterns = [];
  editingProcessors = [];
  editingApplyWhen = [];

  if (nameInput) {
    nameInput.value = '';
  }
  if (addPatternInput) {
    addPatternInput.value = '';
  }
  if (processorNameInput) {
    processorNameInput.value = '';
  }
  if (processorValueInput) {
    processorValueInput.value = '';
  }
  if (processorTypeSelect) {
    processorTypeSelect.value = 'add';
  }
  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }

  updatePatternsList();
  updateProcessorsList();
  updateProcessorFormVisibility();
  updateApplyWhenDisplay();

  if (saveButton) {
    saveButton.textContent = 'Add rule';
  }
  if (cancelButton) {
    cancelButton.hidden = true;
  }
}

/**
 * Validate the form.
 * @returns {boolean}
 */
function validateForm() {
  if (!nameInput) {
    return false;
  }

  const name = nameInput.value.trim();
  if (!name) {
    if (formError) {
      formError.textContent = 'Rule name is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (editingPatterns.length === 0) {
    if (formError) {
      formError.textContent = 'At least one URL pattern is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (editingProcessors.length === 0) {
    if (formError) {
      formError.textContent = 'At least one processor is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
  return true;
}

/**
 * Start editing an existing rule.
 * @param {string} ruleId
 * @returns {void}
 */
function startEdit(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    return;
  }

  editingRuleId = ruleId;
  selectedRuleId = ruleId;

  if (nameInput) {
    nameInput.value = rule.name;
  }

  editingPatterns = [...rule.urlPatterns];
  editingProcessors = rule.processors.map((p) => ({ ...p }));
  editingApplyWhen = [...rule.applyWhen];

  updatePatternsList();
  updateProcessorsList();
  updateProcessorFormVisibility();
  updateApplyWhenDisplay();

  if (saveButton) {
    saveButton.textContent = 'Save changes';
  }
  if (cancelButton) {
    cancelButton.hidden = false;
  }

  render();
  renderDetails(ruleId);
}

/**
 * Delete a rule.
 * @param {string} ruleId
 * @returns {Promise<void>}
 */
async function deleteRule(ruleId) {
  // eslint-disable-next-line no-alert
  if (!confirm('Are you sure you want to delete this rule?')) {
    return;
  }

  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const filtered = rules.filter((r) => r.id !== ruleId);
    await chrome.storage.sync.set({
      [STORAGE_KEY]: filtered,
    });
    rules = filtered;

    if (selectedRuleId === ruleId) {
      selectedRuleId = '';
    }
    if (editingRuleId === ruleId) {
      clearForm();
    }

    render();
  } catch (error) {
    console.error('[urlProcessRules] Failed to delete rule:', error);
    if (formError) {
      formError.textContent = 'Failed to delete rule. Please try again.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Handle form submission.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const name = nameInput?.value.trim() || '';
    const now = new Date().toISOString();

    if (editingRuleId) {
      // Update existing rule
      const index = rules.findIndex((r) => r.id === editingRuleId);
      if (index >= 0) {
        rules[index] = {
          ...rules[index],
          name,
          urlPatterns: [...editingPatterns],
          processors: editingProcessors.map((p) => ({ ...p })),
          applyWhen: [...editingApplyWhen],
          updatedAt: now,
        };
      }
    } else {
      // Create new rule
      const newRule = {
        id: generateRuleId(),
        name,
        urlPatterns: [...editingPatterns],
        processors: editingProcessors.map((p) => ({ ...p })),
        applyWhen: [...editingApplyWhen],
        createdAt: now,
        updatedAt: now,
      };
      rules.push(newRule);
      selectedRuleId = newRule.id;
    }

    const sorted = sortRules(rules);
    await chrome.storage.sync.set({
      [STORAGE_KEY]: sorted,
    });
    rules = sorted;

    clearForm();
    render();
  } catch (error) {
    console.error('[urlProcessRules] Failed to save rule:', error);
    if (formError) {
      formError.textContent = 'Failed to save rule. Please try again.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Handle cancel edit button.
 * @returns {void}
 */
function handleCancelEdit() {
  clearForm();
  render();
}

/**
 * Add a URL pattern.
 * @returns {void}
 */
function addPattern() {
  if (!addPatternInput) {
    return;
  }

  const pattern = addPatternInput.value.trim();
  if (!pattern) {
    return;
  }

  if (!isValidUrlPattern(pattern)) {
    if (formError) {
      formError.textContent = 'Invalid URL pattern.';
      formError.hidden = false;
    }
    return;
  }

  if (editingPatterns.includes(pattern)) {
    if (formError) {
      formError.textContent = 'Pattern already added.';
      formError.hidden = false;
    }
    return;
  }

  editingPatterns.push(pattern);
  addPatternInput.value = '';
  updatePatternsList();

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

/**
 * Remove a URL pattern.
 * @param {string} pattern
 * @returns {void}
 */
function removePattern(pattern) {
  editingPatterns = editingPatterns.filter((p) => p !== pattern);
  updatePatternsList();
}

/**
 * Update the patterns list display.
 * @returns {void}
 */
function updatePatternsList() {
  if (!patternsList) {
    return;
  }

  if (editingPatterns.length === 0) {
    patternsList.innerHTML =
      '<div class="text-sm text-base-content/70">No patterns added yet.</div>';
    return;
  }

  patternsList.innerHTML = editingPatterns
    .map(
      (pattern) => `
    <div class="flex items-center justify-between gap-2 p-2 rounded border border-base-300 bg-base-200">
      <span class="font-mono text-sm break-words text-base-content flex-1">${pattern}</span>
      <button
        class="btn btn-xs btn-error btn-outline"
        data-remove-pattern="${pattern}"
        type="button"
        aria-label="Remove pattern"
      >
        ❌
      </button>
    </div>
  `,
    )
    .join('');

  patternsList.querySelectorAll('[data-remove-pattern]').forEach((el) => {
    el.addEventListener('click', () => {
      const pattern = el.getAttribute('data-remove-pattern');
      if (pattern) {
        removePattern(pattern);
      }
    });
  });
}

/**
 * Add a processor.
 * @returns {void}
 */
function addProcessor() {
  if (!processorNameInput || !processorTypeSelect) {
    return;
  }

  const type = /** @type {ProcessorType} */ (processorTypeSelect.value);
  const name = processorNameInput.value.trim();
  const value = processorValueInput?.value.trim() || '';

  if (!name) {
    if (formError) {
      formError.textContent = 'Processor name is required.';
      formError.hidden = false;
    }
    return;
  }

  if (type === 'add' || type === 'replace') {
    if (!value && type === 'add') {
      if (formError) {
        formError.textContent = 'Value is required for add processor.';
        formError.hidden = false;
      }
      return;
    }
  }

  // Validate regex for replace/remove if it looks like regex
  if (type === 'replace' || type === 'remove') {
    if (name.startsWith('/') && name.endsWith('/')) {
      const regexPattern = name.slice(1, -1);
      if (!isValidRegex(regexPattern)) {
        if (formError) {
          formError.textContent = 'Invalid regex pattern.';
          formError.hidden = false;
        }
        return;
      }
    }
  }

  const processor = {
    id: generateProcessorId(),
    type,
    name,
    value: type === 'add' || type === 'replace' ? value : undefined,
  };

  editingProcessors.push(processor);

  processorNameInput.value = '';
  if (processorValueInput) {
    processorValueInput.value = '';
  }
  updateProcessorsList();

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

/**
 * Remove a processor.
 * @param {string} processorId
 * @returns {void}
 */
function removeProcessor(processorId) {
  editingProcessors = editingProcessors.filter((p) => p.id !== processorId);
  updateProcessorsList();
}

/**
 * Move a processor up in the list.
 * @param {number} index
 * @returns {void}
 */
function moveProcessorUp(index) {
  if (index <= 0) {
    return;
  }
  [editingProcessors[index - 1], editingProcessors[index]] = [
    editingProcessors[index],
    editingProcessors[index - 1],
  ];
  updateProcessorsList();
}

/**
 * Move a processor down in the list.
 * @param {number} index
 * @returns {void}
 */
function moveProcessorDown(index) {
  if (index >= editingProcessors.length - 1) {
    return;
  }
  [editingProcessors[index], editingProcessors[index + 1]] = [
    editingProcessors[index + 1],
    editingProcessors[index],
  ];
  updateProcessorsList();
}

/**
 * Update the processors list display.
 * @returns {void}
 */
function updateProcessorsList() {
  if (!processorsList) {
    return;
  }

  if (editingProcessors.length === 0) {
    processorsList.innerHTML =
      '<div class="text-sm text-base-content/70">No processors added yet.</div>';
    return;
  }

  processorsList.innerHTML = editingProcessors
    .map((processor, index) => {
      const typeLabel =
        processor.type === 'add'
          ? 'Add'
          : processor.type === 'replace'
            ? 'Replace'
            : 'Remove';
      const nameDisplay = processor.name.startsWith('/') &&
        processor.name.endsWith('/')
        ? `Regex: ${processor.name}`
        : processor.name;
      const valueDisplay =
        processor.type === 'add' || processor.type === 'replace'
          ? ` = "${processor.value || ''}"`
          : '';
      return `
    <div class="flex items-center gap-2 p-2 rounded border border-base-300 bg-base-200">
      <div class="flex gap-1">
        <button
          class="btn btn-xs btn-ghost"
          data-move-up="${index}"
          type="button"
          aria-label="Move up"
          ${index === 0 ? 'disabled' : ''}
        >
          ⬆️
        </button>
        <button
          class="btn btn-xs btn-ghost"
          data-move-down="${index}"
          type="button"
          aria-label="Move down"
          ${index === editingProcessors.length - 1 ? 'disabled' : ''}
        >
          ⬇️
        </button>
      </div>
      <div class="flex-1">
        <span class="badge badge-outline">${typeLabel}</span>
        <span class="font-mono text-sm">${nameDisplay}${valueDisplay}</span>
      </div>
      <button
        class="btn btn-xs btn-error btn-outline"
        data-remove-processor="${processor.id}"
        type="button"
        aria-label="Remove processor"
      >
        ❌
      </button>
    </div>
  `;
    })
    .join('');

  processorsList.querySelectorAll('[data-remove-processor]').forEach((el) => {
    el.addEventListener('click', () => {
      const processorId = el.getAttribute('data-remove-processor');
      if (processorId) {
        removeProcessor(processorId);
      }
    });
  });

  processorsList.querySelectorAll('[data-move-up]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-move-up'));
      if (!Number.isNaN(index)) {
        moveProcessorUp(index);
      }
    });
  });

  processorsList.querySelectorAll('[data-move-down]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-move-down'));
      if (!Number.isNaN(index)) {
        moveProcessorDown(index);
      }
    });
  });
}

/**
 * Update processor form visibility based on selected type.
 * @returns {void}
 */
function updateProcessorFormVisibility() {
  if (!processorTypeSelect || !processorValueInput) {
    return;
  }

  const type = processorTypeSelect.value;
  const valueContainer = processorValueInput.closest('.form-control');
  if (valueContainer) {
    valueContainer.hidden = type === 'remove';
  }
}

/**
 * Update apply when display and checkboxes.
 * @returns {void}
 */
function updateApplyWhenDisplay() {
  const copyCheckbox = document.getElementById('urlProcessRuleApplyWhenCopy');
  const raindropCheckbox = document.getElementById('urlProcessRuleApplyWhenRaindrop');

  if (copyCheckbox) {
    copyCheckbox.checked = editingApplyWhen.includes('copy-to-clipboard');
  }
  if (raindropCheckbox) {
    raindropCheckbox.checked = editingApplyWhen.includes('save-to-raindrop');
  }
}

/**
 * Handle apply when checkbox change.
 * @param {ApplyWhenOption} option
 * @param {boolean} checked
 * @returns {void}
 */
function handleApplyWhenChange(option, checked) {
  if (checked) {
    if (!editingApplyWhen.includes(option)) {
      editingApplyWhen.push(option);
    }
  } else {
    editingApplyWhen = editingApplyWhen.filter((aw) => aw !== option);
  }
  updateApplyWhenDisplay();
}

/**
 * Initialize event listeners and load rules.
 * @returns {void}
 */
function init() {
  if (form) {
    form.addEventListener('submit', (e) => {
      void handleFormSubmit(e);
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', handleCancelEdit);
  }

  if (addPatternButton && addPatternInput) {
    addPatternButton.addEventListener('click', (e) => {
      e.preventDefault();
      addPattern();
    });
    addPatternInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPattern();
      }
    });
  }

  if (addProcessorButton) {
    addProcessorButton.addEventListener('click', (e) => {
      e.preventDefault();
      addProcessor();
    });
  }

  if (processorTypeSelect) {
    processorTypeSelect.addEventListener('change', () => {
      updateProcessorFormVisibility();
    });
  }

  if (processorNameInput) {
    processorNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addProcessor();
      }
    });
  }

  if (processorValueInput) {
    processorValueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addProcessor();
      }
    });
  }

  // Apply when checkboxes
  const copyCheckbox = document.getElementById('urlProcessRuleApplyWhenCopy');
  const raindropCheckbox = document.getElementById('urlProcessRuleApplyWhenRaindrop');

  if (copyCheckbox) {
    copyCheckbox.addEventListener('change', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      handleApplyWhenChange('copy-to-clipboard', target.checked);
    });
  }

  if (raindropCheckbox) {
    raindropCheckbox.addEventListener('change', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      handleApplyWhenChange('save-to-raindrop', target.checked);
    });
  }

  void loadAndRenderRules();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Load rules from storage (for export/import).
 * @returns {Promise<UrlProcessRule[]>}
 */
export async function loadRules() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const { rules: sanitized } = normalizeRules(result?.[STORAGE_KEY]);
  return sanitized;
}

