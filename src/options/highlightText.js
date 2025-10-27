/* global chrome */

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
    const result = await chrome.storage.sync.get(HIGHLIGHT_TEXT_RULES_KEY);
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
    await chrome.storage.sync.set({
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
  rulesList.innerHTML = rules.map(rule => `
    <div class="card bg-base-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" data-rule-id="${rule.id}">
      <div class="card-body p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h4 class="font-semibold text-sm truncate">${rule.pattern}</h4>
            <p class="text-xs text-base-content/70 truncate">${rule.value}</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge badge-outline badge-sm">${getTypeDisplayName(rule.type)}</span>
              ${rule.ignoreCase ? '<span class="badge badge-sm badge-ghost">Aa</span>' : ''}
              <div class="flex gap-1">
                <div class="w-3 h-3 rounded border border-base-300" style="background-color: ${rule.textColor}"></div>
                <div class="w-3 h-3 rounded border border-base-300" style="background-color: ${rule.backgroundColor}"></div>
              </div>
              <div class="flex gap-1 text-xs">
                ${rule.bold ? '<span class="font-bold">B</span>' : ''}
                ${rule.italic ? '<span class="italic">I</span>' : ''}
                ${rule.underline ? '<span class="underline">U</span>' : ''}
              </div>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-rule-id="${rule.id}">
              ✏️
            </button>
            <button class="btn btn-ghost btn-sm text-error" data-action="delete" data-rule-id="${rule.id}">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // Add event listeners
  rulesList.querySelectorAll('[data-action="edit"]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = button.getAttribute('data-rule-id');
      if (ruleId) editRule(ruleId);
    });
  });

  rulesList.querySelectorAll('[data-action="delete"]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = button.getAttribute('data-rule-id');
      if (ruleId) deleteRule(ruleId);
    });
  });

  rulesList.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const ruleId = card.getAttribute('data-rule-id');
      if (ruleId) showRuleDetails(ruleId);
    });
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  void initHighlightText();
});

// Export for use in other modules
export { loadRules, saveRules };
