/* global chrome, URLPattern */

/**
 * @typedef {Object} HighlightTextRuleSettings
 * @property {string} id
 * @property {string} pattern
 * @property {'whole-phrase' | 'comma-separated' | 'regex'} type
 * @property {string} value
 * @property {string} textColor
 * @property {string} backgroundColor
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} ignoreCase
 * @property {boolean} [disabled]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_BACKGROUND_COLOR = '#ffff00';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('highlightTextRuleForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextPatternInput')
);
const typeSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('highlightTextTypeSelect')
);
const valueInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('highlightTextValueInput')
);
const textColorInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextColorInput')
);
const textColorAlphaInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextColorAlphaInput')
);
const textColorAlphaLabel = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('highlightTextColorAlphaLabel')
);
const backgroundColorInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextBackgroundInput')
);
const backgroundColorAlphaInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextBackgroundAlphaInput')
);
const backgroundColorAlphaLabel = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('highlightTextBackgroundAlphaLabel')
);
const boldInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextBoldInput')
);
const italicInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextItalicInput')
);
const underlineInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextUnderlineInput')
);
const ignoreCaseInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextIgnoreCaseInput')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('highlightTextFormError')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextSaveButton')
);
const cancelEditButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextCancelEditButton')
);
const rulesEmpty = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRulesEmpty')
);
const rulesList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRulesList')
);
const ruleDetails = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRuleDetails')
);
const ignoreCaseDetail = /** @type {HTMLElement | null} */ (
  document.getElementById('highlightTextRuleIgnoreCaseDetail')
);
const boldPreview = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('highlightTextRuleBoldPreview')
);
const italicPreview = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('highlightTextRuleItalicPreview')
);
const underlinePreview = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('highlightTextRuleUnderlinePreview')
);

/** @type {HighlightTextRuleSettings[]} */
let rules = [];
/** @type {string | null} */
let editingRuleId = null;

/**
 * Generate a stable identifier for highlight text rules lacking one.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'highlight-rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Validate URL pattern using URLPattern constructor.
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
 * Validate regex pattern.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidRegex(pattern) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Clamp a number between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

/**
 * Normalize hexadecimal color strings to #rrggbb format.
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
function expandHexColor(color, fallback = DEFAULT_TEXT_COLOR) {
  if (typeof color !== 'string') {
    return fallback;
  }

  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    return `#${value.slice(1, 7)}`;
  }
  if (/^#[0-9a-f]{4}$/i.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

/**
 * Parse a stored color string that may include alpha information.
 * @param {string} colorValue
 * @param {string} fallbackHex
 * @returns {{hex: string, alpha: number}}
 */
function parseColorWithAlpha(colorValue, fallbackHex = DEFAULT_TEXT_COLOR) {
  const fallback = {
    hex: expandHexColor(fallbackHex),
    alpha: 1,
  };

  if (typeof colorValue !== 'string') {
    return fallback;
  }

  const value = colorValue.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (/^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{3}$/i.test(value)) {
    return {
      hex: expandHexColor(value, fallback.hex),
      alpha: 1,
    };
  }

  if (/^#[0-9a-f]{8}$/i.test(value)) {
    const hex = `#${value.slice(1, 7)}`;
    const alpha = clamp(parseInt(value.slice(7), 16) / 255, 0, 1);
    return { hex, alpha };
  }

  if (/^#[0-9a-f]{4}$/i.test(value)) {
    const hex = expandHexColor(value, fallback.hex);
    const alphaComponent = value[4] + value[4];
    const alpha = clamp(parseInt(alphaComponent, 16) / 255, 0, 1);
    return { hex, alpha };
  }

  const rgbaMatch = value.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)/i);
  if (rgbaMatch) {
    const r = clamp(parseInt(rgbaMatch[1], 10), 0, 255);
    const g = clamp(parseInt(rgbaMatch[2], 10), 0, 255);
    const b = clamp(parseInt(rgbaMatch[3], 10), 0, 255);
    const a = rgbaMatch[4] !== undefined ? clamp(parseFloat(rgbaMatch[4]), 0, 1) : 1;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return { hex, alpha: a };
  }

  return fallback;
}

/**
 * Build a CSS color string with optional alpha component.
 * @param {string} hexColor
 * @param {number} alpha
 * @returns {string}
 */
function formatColorWithAlpha(hexColor, alpha) {
  const normalizedHex = expandHexColor(hexColor);
  const normalizedAlpha = clamp(alpha, 0, 1);

  if (normalizedAlpha >= 0.999) {
    return normalizedHex;
  }

  const r = parseInt(normalizedHex.slice(1, 3), 16);
  const g = parseInt(normalizedHex.slice(3, 5), 16);
  const b = parseInt(normalizedHex.slice(5, 7), 16);
  const alphaRounded = Math.round(normalizedAlpha * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
}

/**
 * Apply a color string to UI controls.
 * @param {HTMLInputElement | null} colorInputEl
 * @param {HTMLInputElement | null} alphaInputEl
 * @param {HTMLSpanElement | null} alphaLabelEl
 * @param {string} colorValue
 * @param {string} fallbackHex
 */
function applyColorToInputs(colorInputEl, alphaInputEl, alphaLabelEl, colorValue, fallbackHex) {
  const { hex, alpha } = parseColorWithAlpha(colorValue, fallbackHex);
  if (colorInputEl) {
    colorInputEl.value = hex;
  }
  if (alphaInputEl) {
    alphaInputEl.value = String(Math.round(alpha * 100));
  }
  updateAlphaLabel(alphaInputEl, alphaLabelEl);
}

/**
 * Combine color and alpha inputs into a CSS color string.
 * @param {HTMLInputElement | null} colorInputEl
 * @param {HTMLInputElement | null} alphaInputEl
 * @param {string} fallbackHex
 * @returns {string}
 */
function getColorFromInputs(colorInputEl, alphaInputEl, fallbackHex) {
  const hex = colorInputEl ? colorInputEl.value : fallbackHex;
  const alphaPercent = alphaInputEl ? clamp(Number(alphaInputEl.value), 0, 100) : 100;
  return formatColorWithAlpha(hex, alphaPercent / 100);
}

/**
 * Update alpha percentage label next to a slider.
 * @param {HTMLInputElement | null} alphaInputEl
 * @param {HTMLSpanElement | null} labelEl
 */
function updateAlphaLabel(alphaInputEl, labelEl) {
  if (!alphaInputEl || !labelEl) {
    return;
  }
  const percent = clamp(Number(alphaInputEl.value), 0, 100);
  labelEl.textContent = `${percent}%`;
}

/**
 * Validate form data.
 * @returns {string | null} Error message or null if valid
 */
function validateForm() {
  if (!patternInput || !typeSelect || !valueInput) {
    return 'Form elements not found';
  }

  const pattern = patternInput.value.trim();
  const type = typeSelect.value;
  const value = valueInput.value.trim();

  if (!pattern) {
    return 'URL pattern is required';
  }

  if (!isValidUrlPattern(pattern)) {
    return 'Invalid URL pattern format';
  }

  if (!value) {
    return 'Value is required';
  }

  if (type === 'regex' && !isValidRegex(value)) {
    return 'Invalid regular expression pattern';
  }

  return null;
}

/**
 * Clear form and reset to add mode.
 */
function clearForm() {
  if (patternInput) patternInput.value = '';
  if (typeSelect) typeSelect.value = 'whole-phrase';
  if (valueInput) valueInput.value = '';
  applyColorToInputs(textColorInput, textColorAlphaInput, textColorAlphaLabel, DEFAULT_TEXT_COLOR, DEFAULT_TEXT_COLOR);
  applyColorToInputs(
    backgroundColorInput,
    backgroundColorAlphaInput,
    backgroundColorAlphaLabel,
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BACKGROUND_COLOR
  );
  if (boldInput) boldInput.checked = false;
  if (italicInput) italicInput.checked = false;
  if (underlineInput) underlineInput.checked = false;
  if (ignoreCaseInput) ignoreCaseInput.checked = false;
  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
  if (saveButton) saveButton.textContent = 'Add rule';
  if (cancelEditButton) cancelEditButton.hidden = true;
  editingRuleId = null;
}

/**
 * Load rules from storage.
 * @returns {Promise<HighlightTextRuleSettings[]>}
 */
async function loadRules() {
  try {
    const result = await chrome.storage.local.get(HIGHLIGHT_TEXT_RULES_KEY);
    const storedRules = result[HIGHLIGHT_TEXT_RULES_KEY];
    
    if (!Array.isArray(storedRules)) {
      return [];
    }

    // Validate and normalize rules
    return storedRules.filter(rule => {
      return rule &&
        typeof rule === 'object' &&
        typeof rule.id === 'string' &&
        typeof rule.pattern === 'string' &&
        typeof rule.type === 'string' &&
        typeof rule.value === 'string' &&
        typeof rule.textColor === 'string' &&
        typeof rule.backgroundColor === 'string' &&
        ['whole-phrase', 'comma-separated', 'regex'].includes(rule.type) &&
        isValidUrlPattern(rule.pattern) &&
        (rule.type !== 'regex' || isValidRegex(rule.value));
    }).map(rule => ({
      ...rule,
      bold: typeof rule.bold === 'boolean' ? rule.bold : false,
      italic: typeof rule.italic === 'boolean' ? rule.italic : false,
      underline: typeof rule.underline === 'boolean' ? rule.underline : false,
      ignoreCase: typeof rule.ignoreCase === 'boolean' ? rule.ignoreCase : false,
      disabled: typeof rule.disabled === 'boolean' ? rule.disabled : false,
    }));
  } catch (error) {
    console.warn('[highlightText] Failed to load rules:', error);
    return [];
  }
}

/**
 * Save rules to storage.
 * @param {HighlightTextRuleSettings[]} rulesToSave
 * @returns {Promise<void>}
 */
async function saveRules(rulesToSave) {
  try {
    await chrome.storage.local.set({
      [HIGHLIGHT_TEXT_RULES_KEY]: rulesToSave
    });
  } catch (error) {
    console.warn('[highlightText] Failed to save rules:', error);
    throw error;
  }
}

/**
 * Format date for display.
 * @param {string | undefined} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get type display name.
 * @param {string} type
 * @returns {string}
 */
function getTypeDisplayName(type) {
  switch (type) {
    case 'whole-phrase':
      return 'Whole phrase';
    case 'comma-separated':
      return 'Comma separated';
    case 'regex':
      return 'Regex';
    default:
      return type;
  }
}

/**
 * Render rules list.
 */
function renderRulesList() {
  if (!rulesList || !rulesEmpty) return;

  if (rules.length === 0) {
    rulesList.innerHTML = '';
    rulesEmpty.hidden = false;
    return;
  }

  rulesEmpty.hidden = true;
  rulesList.textContent = '';

  rules.forEach((rule) => {
    const container = document.createElement('article');
    container.className =
      'rounded-lg border border-base-300 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
    container.setAttribute('role', 'listitem');

    if (rule.disabled) {
      container.classList.add('opacity-50');
    }

    const info = document.createElement('div');
    info.className = 'space-y-1 flex-1 min-w-0';

    const pattern = document.createElement('p');
    pattern.className = 'font-mono text-sm break-words';
    pattern.textContent = rule.pattern;
    info.appendChild(pattern);

    const value = document.createElement('p');
    value.className = 'text-sm text-base-content/70 truncate';
    value.textContent = rule.value;
    info.appendChild(value);

    const meta = document.createElement('div');
    meta.className = 'flex items-center gap-2 mt-1';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge badge-outline badge-sm';
    typeBadge.textContent = getTypeDisplayName(rule.type);
    meta.appendChild(typeBadge);

    if (rule.ignoreCase) {
      const caseBadge = document.createElement('span');
      caseBadge.className = 'badge badge-sm badge-ghost';
      caseBadge.textContent = 'Aa';
      meta.appendChild(caseBadge);
    }

    const colorPreview = document.createElement('div');
    colorPreview.className = 'flex gap-1';
    const textColorBox = document.createElement('div');
    textColorBox.className = 'w-3 h-3 rounded border border-base-300';
    textColorBox.style.backgroundColor = rule.textColor;
    colorPreview.appendChild(textColorBox);
    const bgColorBox = document.createElement('div');
    bgColorBox.className = 'w-3 h-3 rounded border border-base-300';
    bgColorBox.style.backgroundColor = rule.backgroundColor;
    colorPreview.appendChild(bgColorBox);
    meta.appendChild(colorPreview);

    const stylePreview = document.createElement('div');
    stylePreview.className = 'flex gap-1 text-xs';
    if (rule.bold) {
      const boldSpan = document.createElement('span');
      boldSpan.className = 'font-bold';
      boldSpan.textContent = 'B';
      stylePreview.appendChild(boldSpan);
    }
    if (rule.italic) {
      const italicSpan = document.createElement('span');
      italicSpan.className = 'italic';
      italicSpan.textContent = 'I';
      stylePreview.appendChild(italicSpan);
    }
    if (rule.underline) {
      const underlineSpan = document.createElement('span');
      underlineSpan.className = 'underline';
      underlineSpan.textContent = 'U';
      stylePreview.appendChild(underlineSpan);
    }
    meta.appendChild(stylePreview);

    info.appendChild(meta);
    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-ghost';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      showRuleDetails(rule.id);
    });
    actions.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editRule(rule.id);
    });
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-error btn-outline';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      void deleteRule(rule.id);
    });
    actions.appendChild(deleteButton);

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'flex items-center gap-2';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-success';
    toggle.checked = !rule.disabled;
    toggle.title = 'Enabled';
    toggle.addEventListener('change', (event) => {
      const isChecked = /** @type {HTMLInputElement} */ (event.target).checked;
      rule.disabled = !isChecked;
      void saveRules(rules).then(renderRulesList);
    });
    toggleContainer.appendChild(toggle);
    actions.appendChild(toggleContainer);

    container.appendChild(actions);
    rulesList.appendChild(container);
  });
}

/**
 * Show rule details.
 * @param {string} ruleId
 */
function showRuleDetails(ruleId) {
  const rule = rules.find(r => r.id === ruleId);
  if (!rule || !ruleDetails) return;

  const patternDetail = document.getElementById('highlightTextRulePatternDetail');
  const valueDetail = document.getElementById('highlightTextRuleValueDetail');
  const typeSummary = document.getElementById('highlightTextRuleTypeSummary');
  const colorPreview = document.getElementById('highlightTextRuleColorPreview');
  const backgroundPreview = document.getElementById('highlightTextRuleBackgroundPreview');
  const createdDetail = document.getElementById('highlightTextRuleCreatedDetail');
  const updatedDetail = document.getElementById('highlightTextRuleUpdatedDetail');

  if (patternDetail) patternDetail.textContent = rule.pattern;
  if (valueDetail) valueDetail.textContent = rule.value;
  if (typeSummary) typeSummary.textContent = getTypeDisplayName(rule.type);
  if (colorPreview) colorPreview.style.backgroundColor = rule.textColor;
  if (backgroundPreview) backgroundPreview.style.backgroundColor = rule.backgroundColor;
  if (boldPreview) boldPreview.hidden = !rule.bold;
  if (italicPreview) italicPreview.hidden = !rule.italic;
  if (underlinePreview) underlinePreview.hidden = !rule.underline;
  if (ignoreCaseDetail) ignoreCaseDetail.textContent = rule.ignoreCase ? 'Yes' : 'No';
  if (createdDetail) createdDetail.textContent = formatDate(rule.createdAt);
  if (updatedDetail) updatedDetail.textContent = formatDate(rule.updatedAt);

  ruleDetails.hidden = false;
}

/**
 * Edit rule.
 * @param {string} ruleId
 */
function editRule(ruleId) {
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;

  if (patternInput) patternInput.value = rule.pattern;
  if (typeSelect) typeSelect.value = rule.type;
  if (valueInput) valueInput.value = rule.value;
  applyColorToInputs(
    textColorInput,
    textColorAlphaInput,
    textColorAlphaLabel,
    rule.textColor,
    DEFAULT_TEXT_COLOR
  );
  applyColorToInputs(
    backgroundColorInput,
    backgroundColorAlphaInput,
    backgroundColorAlphaLabel,
    rule.backgroundColor,
    DEFAULT_BACKGROUND_COLOR
  );
  if (boldInput) boldInput.checked = rule.bold || false;
  if (italicInput) italicInput.checked = rule.italic || false;
  if (underlineInput) underlineInput.checked = rule.underline || false;
  if (ignoreCaseInput) ignoreCaseInput.checked = rule.ignoreCase || false;

  if (saveButton) saveButton.textContent = 'Update rule';
  if (cancelEditButton) cancelEditButton.hidden = false;
  editingRuleId = ruleId;

  // Scroll to form
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Delete rule.
 * @param {string} ruleId
 */
async function deleteRule(ruleId) {
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;

  const confirmed = window.confirm(`Delete rule for pattern "${rule.pattern}"?`);
  if (!confirmed) return;

  try {
    rules = rules.filter(r => r.id !== ruleId);
    await saveRules(rules);
    renderRulesList();
    
    // Hide details if showing deleted rule
    if (ruleDetails) {
      ruleDetails.hidden = true;
    }
  } catch (error) {
    console.warn('[highlightText] Failed to delete rule:', error);
    alert('Failed to delete rule. Please try again.');
  }
}

/**
 * Handle form submission.
 * @param {Event} event
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const error = validateForm();
  if (error) {
    if (formError) {
      formError.textContent = error;
      formError.hidden = false;
    }
    return;
  }

  if (!patternInput || !typeSelect || !valueInput || !textColorInput || !backgroundColorInput || !boldInput || !italicInput || !underlineInput || !ignoreCaseInput) {
    return;
  }

  const ruleData = {
    pattern: patternInput.value.trim(),
    type: typeSelect.value,
    value: valueInput.value.trim(),
    textColor: getColorFromInputs(textColorInput, textColorAlphaInput, DEFAULT_TEXT_COLOR),
    backgroundColor: getColorFromInputs(
      backgroundColorInput,
      backgroundColorAlphaInput,
      DEFAULT_BACKGROUND_COLOR
    ),
    bold: boldInput.checked,
    italic: italicInput.checked,
    underline: underlineInput.checked,
    ignoreCase: ignoreCaseInput.checked,
  };

  try {
    if (editingRuleId) {
      // Update existing rule
      const ruleIndex = rules.findIndex(r => r.id === editingRuleId);
      if (ruleIndex !== -1) {
        rules[ruleIndex] = /** @type {HighlightTextRuleSettings} */ ({
          ...rules[ruleIndex],
          ...ruleData,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      // Add new rule
      const newRule = /** @type {HighlightTextRuleSettings} */ ({
        id: generateRuleId(),
        ...ruleData,
        createdAt: new Date().toISOString(),
      });
      rules.push(newRule);
    }

    await saveRules(rules);
    renderRulesList();
    clearForm();
  } catch (error) {
    console.warn('[highlightText] Failed to save rule:', error);
    alert('Failed to save rule. Please try again.');
  }
}

/**
 * Initialize highlight text functionality.
 */
async function initHighlightText() {
  if (!form || !patternInput || !typeSelect || !valueInput || !textColorInput || !backgroundColorInput) {
    console.warn('[highlightText] Required form elements not found');
    return;
  }

  // Load existing rules
  rules = await loadRules();
  renderRulesList();

  // Set up form event listeners
  form.addEventListener('submit', handleFormSubmit);

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      clearForm();
    });
  }

  if (textColorAlphaInput) {
    textColorAlphaInput.addEventListener('input', () => {
      updateAlphaLabel(textColorAlphaInput, textColorAlphaLabel);
    });
  }

  if (backgroundColorAlphaInput) {
    backgroundColorAlphaInput.addEventListener('input', () => {
      updateAlphaLabel(backgroundColorAlphaInput, backgroundColorAlphaLabel);
    });
  }

  updateAlphaLabel(textColorAlphaInput, textColorAlphaLabel);
  updateAlphaLabel(backgroundColorAlphaInput, backgroundColorAlphaLabel);

  // Clear form error when user starts typing
  [
    patternInput,
    typeSelect,
    valueInput,
    textColorInput,
    backgroundColorInput,
    textColorAlphaInput,
    backgroundColorAlphaInput,
    boldInput,
    italicInput,
    underlineInput,
    ignoreCaseInput,
  ].forEach(element => {
    if (element) {
      element.addEventListener('input', () => {
        if (formError) {
          formError.hidden = true;
        }
      });
    }
  });

  // Listen for storage changes to update UI when options are restored/imported
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, HIGHLIGHT_TEXT_RULES_KEY)) {
        return;
      }
      void (async () => {
        rules = await loadRules();
        renderRulesList();
        // Clear selection if selected rule no longer exists
        if (editingRuleId && !rules.find(r => r.id === editingRuleId)) {
          editingRuleId = null;
          clearForm();
        }
      })();
    });
  }
}

/**
 * Check for prefilled URL from popup and set it in the pattern input.
 * Also navigates to the highlight text section if needed.
 * @returns {Promise<void>}
 */
async function checkForPrefillUrl() {
  try {
    const stored = await chrome.storage.local.get('highlightTextPrefillUrl');
    const prefillUrl = stored?.highlightTextPrefillUrl;
    if (!prefillUrl || typeof prefillUrl !== 'string') {
      return;
    }

    // Clear the prefilled URL from storage
    await chrome.storage.local.remove('highlightTextPrefillUrl');

    // Wait for navigation manager to be available
    let attempts = 0;
    while (!window.navigationManager && attempts < 50) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      attempts++;
    }

    // Navigate to highlight text section
    if (window.location.hash !== '#highlight-text-heading') {
      window.location.hash = '#highlight-text-heading';
    }

    // Show the highlight text section if navigation manager is available
    if (window.navigationManager) {
      window.navigationManager.showSection('highlight-text-heading');
    }

    // Wait a bit more for the section to be visible
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Set the pattern input value
    if (patternInput) {
      patternInput.value = prefillUrl;
      patternInput.focus();
    }
  } catch (error) {
    console.warn('[highlightText] Failed to check for prefill URL:', error);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  void initHighlightText();
  void checkForPrefillUrl();
});

// Export for use in other modules
export { loadRules, saveRules };
