/* global chrome */

/**
 * @typedef {Object} AceConfig
 * @property {function(string, *): void} set
 * @property {function(string): *} get
 * @property {function(string, string): void} setModuleUrl
 */

/**
 * @typedef {Object} AceApi
 * @property {AceConfig} config
 * @property {function(string[]|string, function?): *} require
 * @property {function(HTMLElement): any} edit
 * @property {function(string, string[], function): void} define
 */

/**
 * @type {AceApi | undefined}
 */
const ace =
  typeof window !== 'undefined' && /** @type {any} */ (window).ace
    ? /** @type {any} */ (window).ace
    : undefined;

/**
 * @typedef {Object} ToastifyOptions
 * @property {string} text
 * @property {number} duration
 * @property {string} gravity
 * @property {string} position
 * @property {string} backgroundColor
 */

/**
 * @typedef {Object} ToastifyInstance
 * @property {function(): void} showToast
 */

/**
 * @typedef {function(ToastifyOptions): ToastifyInstance} ToastifyFunction
 */

/**
 * @type {ToastifyFunction | undefined}
 */
const Toastify =
  typeof window !== 'undefined' && /** @type {any} */ (window).Toastify
    ? /** @type {any} */ (window).Toastify
    : undefined;

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
const cssInputContainer = /** @type {HTMLDivElement | null} */ (
  document.getElementById('customCodeCSSInput')
);
const jsInputContainer = /** @type {HTMLDivElement | null} */ (
  document.getElementById('customCodeJSInput')
);

/** @type {any} */
let cssEditor = null;
/** @type {any} */
let jsEditor = null;
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
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, css?: unknown, js?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
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
        console.warn(
          '[options:customCode] Invalid pattern ignored in storage:',
          pattern,
          error,
        );
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
        createdAt: undefined,
        updatedAt: undefined,
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
 * Resize Ace editors to match their containers.
 * @returns {void}
 */
function resizeAceEditors() {
  if (cssEditor) {
    cssEditor.resize();
  }
  if (jsEditor) {
    jsEditor.resize();
  }
}

/**
 * Configure Ace workers to use blob URLs with embedded code for Chrome extension CSP compliance.
 * This patches Ace's worker creation to embed worker code directly instead of using importScripts.
 * @returns {Promise<void>}
 */
async function configureAceWorkers() {
  if (typeof ace === 'undefined' || !ace.config) {
    return;
  }

  // Enable blob URL loading for workers
  ace.config.set('loadWorkerFromBlob', true);

  // Load worker files and store their content
  let cssWorkerCode = null;
  let jsWorkerCode = null;

  try {
    // Load CSS worker
    const cssWorkerResponse = await fetch(
      chrome.runtime.getURL('src/libs/worker-css.js'),
    );
    cssWorkerCode = await cssWorkerResponse.text();

    // Load JavaScript worker
    const jsWorkerResponse = await fetch(
      chrome.runtime.getURL('src/libs/worker-javascript.js'),
    );
    jsWorkerCode = await jsWorkerResponse.text();
  } catch (error) {
    console.warn(
      '[options:customCode] Failed to load Ace worker files:',
      error,
    );
    return;
  }

  // Patch Ace's worker creation to embed code directly
  // Access worker client module through Ace's require system
  return new Promise((resolve) => {
    try {
      // Use async require to access the worker client module
      if (ace.require && typeof ace.require === 'function') {
        ace.require(
          ['ace/worker/worker_client'],
          function (workerClientModule) {
            if (workerClientModule && workerClientModule.createWorker) {
              const originalCreateWorker = workerClientModule.createWorker;

              workerClientModule.createWorker = function (workerUrl) {
                if (workerUrl && typeof workerUrl === 'string') {
                  let workerCode = null;
                  if (
                    workerUrl.includes('worker-css') ||
                    workerUrl.includes('css_worker')
                  ) {
                    workerCode = cssWorkerCode;
                  } else if (
                    workerUrl.includes('worker-javascript') ||
                    workerUrl.includes('javascript_worker')
                  ) {
                    workerCode = jsWorkerCode;
                  }

                  if (workerCode) {
                    // Create blob with worker code embedded directly (no importScripts)
                    const blob = new Blob([workerCode], {
                      type: 'application/javascript',
                    });
                    const blobURL = URL.createObjectURL(blob);
                    return new Worker(blobURL);
                  }
                }
                return originalCreateWorker.call(this, workerUrl);
              };
            }
            resolve();
          },
        );
      } else {
        resolve();
      }
    } catch (error) {
      console.warn(
        '[options:customCode] Failed to patch Ace worker creation:',
        error,
      );
      resolve();
    }
  });
}

/**
 * Initialize Ace editors for CSS and JavaScript.
 * @returns {Promise<void>}
 */
async function initAceEditors() {
  if (typeof ace === 'undefined') {
    console.warn('[options:customCode] Ace editor not available');
    return;
  }

  // Configure workers first - this patches Ace to use embedded worker code
  await configureAceWorkers();

  // Enable language tools for autocomplete
  // The extension is loaded via script tag, so it should be available automatically
  // We just need to ensure it's initialized by referencing it
  if (ace && ace.require) {
    try {
      ace.require(['ace/ext/language_tools'], function () {
        // Language tools extension loaded
      });
    } catch (error) {
      console.warn(
        '[options:customCode] Failed to load Ace language tools:',
        error,
      );
    }
  }

  // Initialize CSS editor
  if (cssInputContainer && !cssEditor) {
    cssEditor = ace.edit(cssInputContainer);
    cssEditor.session.setMode('ace/mode/css');
    cssEditor.setTheme('ace/theme/monokai');
    cssEditor.setOptions({
      fontSize: 14,
      showPrintMargin: false,
      wrap: true,
      useSoftTabs: true,
      tabSize: 2,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
    });
    cssEditor.setValue('', -1);
  }

  // Initialize JavaScript editor
  if (jsInputContainer && !jsEditor) {
    jsEditor = ace.edit(jsInputContainer);
    jsEditor.session.setMode('ace/mode/javascript');
    jsEditor.setTheme('ace/theme/monokai');
    jsEditor.setOptions({
      fontSize: 14,
      showPrintMargin: false,
      wrap: true,
      useSoftTabs: true,
      tabSize: 2,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
    });
    jsEditor.setValue('', -1);
  }

  // Resize editors when window resizes
  window.addEventListener('resize', resizeAceEditors);

  // Observe section visibility to resize editors when section becomes visible
  const section = form?.closest('[data-section]');
  if (section) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'hidden'
        ) {
          // Section visibility changed, resize editors after a short delay
          setTimeout(resizeAceEditors, 100);
        }
      });
    });
    observer.observe(section, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
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
  if (cssEditor) {
    cssEditor.setValue('', -1);
  }
  if (jsEditor) {
    jsEditor.setValue('', -1);
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
  if (
    !detailsPanel ||
    !detailPattern ||
    !detailCSS ||
    !detailJS ||
    !detailCreated ||
    !detailUpdated
  ) {
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
      if (cssEditor) {
        cssEditor.setValue(rule.css || '', -1);
        // Resize editor after setting value to ensure proper display
        setTimeout(() => cssEditor?.resize(), 50);
      }
      if (jsEditor) {
        jsEditor.setValue(rule.js || '', -1);
        // Resize editor after setting value to ensure proper display
        setTimeout(() => jsEditor?.resize(), 50);
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

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'btn btn-sm btn-outline';
    exportButton.textContent = 'Export';
    exportButton.addEventListener('click', () => {
      exportRule(rule);
    });
    actions.appendChild(exportButton);

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
  if (!patternInput || !cssEditor || !jsEditor) {
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

  const css = cssEditor.getValue() || '';
  const js = jsEditor.getValue() || '';

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
 * Extract domain from URL pattern for filename generation.
 * @param {string} pattern - URL pattern
 * @returns {string} - Domain name or fallback
 */
function extractDomainFromPattern(pattern) {
  try {
    // Try to parse as URL first
    const url = new URL(pattern);
    return url.hostname;
  } catch (error) {
    // If not a valid URL, try to extract domain from pattern
    // Handle patterns like "*://*.example.com/*" or "https://*.example.com/*"
    const domainMatch = pattern.match(/(?:https?:\/\/)?(?:\*\.)?([^\/\*]+)/);
    if (domainMatch && domainMatch[1]) {
      return domainMatch[1];
    }
    // Fallback to sanitized pattern
    return pattern.replace(/[^a-zA-Z0-9.-]/g, '-').substring(0, 50);
  }
}

/**
 * Export a single custom code rule as JSON file.
 * @param {CustomCodeRule} rule - The rule to export
 * @returns {void}
 */
function exportRule(rule) {
  try {
    const domain = extractDomainFromPattern(rule.pattern);
    const filename = `nenya-cjc-${domain}.json`;

    // Create export data
    const exportData = {
      id: rule.id,
      pattern: rule.pattern,
      css: rule.css,
      js: rule.js,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    // Create and download file
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);

    // Show success notification if Toastify is available
    if (typeof Toastify !== 'undefined') {
      Toastify({
        text: `Rule exported as ${filename}`,
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#10b981',
      }).showToast();
    }
  } catch (error) {
    console.error('[options:customCode] Failed to export rule:', error);

    // Show error notification if Toastify is available
    if (typeof Toastify !== 'undefined') {
      Toastify({
        text: 'Failed to export rule',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#ef4444',
      }).showToast();
    }
  }
}

/**
 * Initialize listeners and load existing data.
 * @returns {void}
 */
function init() {
  // Initialize Ace editors after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void initAceEditors();
    });
  } else {
    void initAceEditors();
  }

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
