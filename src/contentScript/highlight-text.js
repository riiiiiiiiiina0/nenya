/* global chrome */

/**
 * Debounce a function.
 * @param {Function} func
 * @param {number} delay
 * @returns {Function}
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

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
const HIGHLIGHT_CLASS_PREFIX = 'nenya-highlight-';

/** @type {HighlightTextRuleSettings[]} */
let rules = [];
/** @type {Map<string, HTMLElement[]>} */
let highlightedElements = new Map();

/**
 * Check if a URL matches a pattern.
 * @param {string} url
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesUrlPattern(url, pattern) {
  try {
    const urlPattern = new URLPattern(pattern);
    return urlPattern.test(url);
  } catch (error) {
    // Fallback to simple pattern matching for basic cases
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*');
      const regex = new RegExp('^' + regexPattern + '$');
      return regex.test(url);
    }
    return url.includes(pattern);
  }
}

/**
 * Check if text matches a rule.
 * @param {string} text
 * @param {HighlightTextRuleSettings} rule
 * @returns {boolean}
 */
function matchesText(text, rule) {
  const haystack = rule.ignoreCase ? text.toLowerCase() : text;

  switch (rule.type) {
    case 'whole-phrase':
      if (!rule.value) return false;
      return haystack.includes(rule.ignoreCase ? rule.value.toLowerCase() : rule.value);
    case 'comma-separated': {
      const words = rule.value
        .split(',')
        .map(word => word.trim())
        .filter(word => word.length > 0);
      return words.some(word => haystack.includes(rule.ignoreCase ? word.toLowerCase() : word));
    }
    case 'regex':
      try {
        const flags = rule.ignoreCase ? 'gi' : 'g';
        const regex = new RegExp(rule.value, flags);
        return regex.test(text);
      } catch (error) {
        console.warn('[highlight-text] Invalid regex pattern:', rule.value, error);
        return false;
      }
    default:
      return false;
  }
}

/**
 * Create a highlight element.
 * @param {string} text
 * @param {HighlightTextRuleSettings} rule
 * @returns {HTMLElement}
 */
function createHighlightElement(text, rule) {
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS_PREFIX + rule.id;
  span.style.color = rule.textColor;
  span.style.backgroundColor = rule.backgroundColor;
  span.style.padding = '1px 2px';
  span.style.borderRadius = '2px';
  
  // Apply text styling
  if (rule.bold) {
    span.style.fontWeight = 'bold';
  }
  if (rule.italic) {
    span.style.fontStyle = 'italic';
  }
  if (rule.underline) {
    span.style.textDecoration = 'underline';
  }
  
  span.textContent = text;
  return span;
}

/**
 * Highlight text in a text node.
 * @param {Text} textNode
 * @param {HighlightTextRuleSettings} rule
 * @returns {boolean} Whether any highlighting was applied
 */
function highlightTextNode(textNode, rule) {
  const text = textNode.textContent;
  if (!text || text.trim().length === 0) {
    return false;
  }

  let highlighted = false;
  const parent = textNode.parentNode;
  if (!parent) return false;

  switch (rule.type) {
    case 'whole-phrase': {
      const searchText = rule.ignoreCase ? text.toLowerCase() : text;
      const searchValue = rule.ignoreCase ? rule.value.toLowerCase() : rule.value;
      if (!searchValue) {
        break;
      }
      const index = searchText.indexOf(searchValue);
      if (index !== -1) {
        const beforeText = text.substring(0, index);
        const matchText = text.substring(index, index + rule.value.length);
        const afterText = text.substring(index + rule.value.length);

        const fragment = document.createDocumentFragment();
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }
        fragment.appendChild(createHighlightElement(matchText, rule));
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }

        parent.replaceChild(fragment, textNode);
        highlighted = true;
      }
      break;
    }
    case 'comma-separated': {
      const words = rule.value.split(',').map(w => w.trim()).filter(w => w.length > 0);
      const searchText = rule.ignoreCase ? text.toLowerCase() : text;

      for (const word of words) {
        const searchWord = rule.ignoreCase ? word.toLowerCase() : word;
        if (!searchWord) continue;
        const index = searchText.indexOf(searchWord);
        if (index !== -1) {
          const beforeText = text.substring(0, index);
          const matchText = text.substring(index, index + word.length);
          const afterText = text.substring(index + word.length);

          const fragment = document.createDocumentFragment();
          if (beforeText) {
            fragment.appendChild(document.createTextNode(beforeText));
          }
          fragment.appendChild(createHighlightElement(matchText, rule));
          if (afterText) {
            fragment.appendChild(document.createTextNode(afterText));
          }

          parent.replaceChild(fragment, textNode);
          highlighted = true;
          break;
        }
      }
      break;
    }
    case 'regex': {
      try {
        const flags = rule.ignoreCase ? 'gi' : 'g';
        const regex = new RegExp(rule.value, flags);
        const matches = [...text.matchAll(regex)];
        if (matches.length > 0) {
          let lastIndex = 0;
          const fragment = document.createDocumentFragment();

          for (const match of matches) {
            if (match.index !== undefined) {
              // Add text before match
              if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
              }
              // Add highlighted match
              fragment.appendChild(createHighlightElement(match[0], rule));
              lastIndex = match.index + match[0].length;
            }
          }

          // Add remaining text
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }

          parent.replaceChild(fragment, textNode);
          highlighted = true;
        }
      } catch (error) {
        console.warn('[highlight-text] Invalid regex pattern:', rule.value, error);
      }
      break;
    }
  }

  return highlighted;
}

/**
 * Process a node for highlighting.
 * @param {Node} node
 * @returns {void}
 */
function processNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    // Process text nodes
    for (const rule of rules) {
      if (highlightTextNode(/** @type {Text} */ (node), rule)) {
        // If highlighting was applied, the text node was replaced
        // so we need to stop processing this node
        break;
      }
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = /** @type {HTMLElement} */ (node);
    
    // Skip certain elements that shouldn't be highlighted
    const tagName = element.tagName.toLowerCase();
    if (['script', 'style', 'code', 'pre', 'textarea', 'input'].includes(tagName)) {
      return;
    }

    // Skip if already highlighted
    if (element.classList.toString().includes(HIGHLIGHT_CLASS_PREFIX)) {
      return;
    }

    // Process child nodes
    const childNodes = Array.from(element.childNodes);
    for (const childNode of childNodes) {
      processNode(childNode);
    }
  }
}

/**
 * Remove existing highlights for a rule.
 * @param {string} ruleId
 * @returns {void}
 */
function removeHighlights(ruleId) {
  const className = HIGHLIGHT_CLASS_PREFIX + ruleId;
  const elements = document.querySelectorAll('.' + className);
  
  for (const element of elements) {
    const parent = element.parentNode;
    if (parent) {
      // Replace highlighted element with just its text content
      parent.replaceChild(document.createTextNode(element.textContent), element);
      // Normalize adjacent text nodes
      parent.normalize();
    }
  }
}

/**
 * Remove all existing highlights regardless of rule.
 * Ensures stale highlights are cleared when URL changes or rules no longer match.
 * @returns {void}
 */
function removeAllHighlights() {
  // Select any element that has a class token starting with our highlight prefix
  const selector = '[class^="' + HIGHLIGHT_CLASS_PREFIX + '"], [class*=" ' + HIGHLIGHT_CLASS_PREFIX + '"]';
  const elements = document.querySelectorAll(selector);
  for (const element of elements) {
    const parent = element.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(element.textContent), element);
      parent.normalize();
    }
  }
}

/**
 * Apply highlighting to the page.
 * @returns {void}
 */
function applyHighlighting() {
  // Always clear any existing highlights first. This prevents leftover
  // highlights from a previous URL or ruleset from appearing on the wrong page.
  removeAllHighlights();
  highlightedElements.clear();

  // Check if current URL matches any rules
  const currentUrl = window.location.href;
  const applicableRules = rules.filter(rule => matchesUrlPattern(currentUrl, rule.pattern));

  if (applicableRules.length === 0) {
    return;
  }

  // Process the document body
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = /** @type {HTMLElement} */ (node);
          const tagName = element.tagName.toLowerCase();
          // Skip certain elements
          if (['script', 'style', 'code', 'pre', 'textarea', 'input'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip if already highlighted
          if (element.classList.toString().includes(HIGHLIGHT_CLASS_PREFIX)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodesToProcess = [];
  let node;
  while (node = walker.nextNode()) {
    nodesToProcess.push(node);
  }

  // Process text nodes for highlighting
  for (const node of nodesToProcess) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const rule of applicableRules) {
        if (highlightTextNode(/** @type {Text} */ (node), rule)) {
          // If highlighting was applied, the text node was replaced
          // so we need to stop processing this node
          break;
        }
      }
    }
  }
}

/**
 * Load rules from storage.
 * @returns {Promise<void>}
 */
async function loadRules() {
  try {
    const result = await chrome.storage.sync.get(HIGHLIGHT_TEXT_RULES_KEY);
    const storedRules = result[HIGHLIGHT_TEXT_RULES_KEY];
    
    if (!Array.isArray(storedRules)) {
      rules = [];
      return;
    }

    // Validate and normalize rules
    rules = storedRules.filter(rule => {
      return rule &&
        typeof rule === 'object' &&
        typeof rule.id === 'string' &&
        typeof rule.pattern === 'string' &&
        typeof rule.type === 'string' &&
        typeof rule.value === 'string' &&
        typeof rule.textColor === 'string' &&
        typeof rule.backgroundColor === 'string' &&
        ['whole-phrase', 'comma-separated', 'regex'].includes(rule.type);
    }).map(rule => ({
      ...rule,
      bold: typeof rule.bold === 'boolean' ? rule.bold : false,
      italic: typeof rule.italic === 'boolean' ? rule.italic : false,
      underline: typeof rule.underline === 'boolean' ? rule.underline : false,
      ignoreCase: typeof rule.ignoreCase === 'boolean' ? rule.ignoreCase : false,
    }));
  } catch (error) {
    console.warn('[highlight-text] Failed to load rules:', error);
    rules = [];
  }
}

/**
 * Initialize the highlight text functionality.
 * @returns {Promise<void>}
 */
async function initHighlightText() {
  await loadRules();
  applyHighlighting();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[HIGHLIGHT_TEXT_RULES_KEY]) {
      loadRules().then(() => {
        applyHighlighting();
      });
    }
  });

  // Track current URL to re-apply highlighting on navigation
  let currentUrl = window.location.href;
  
  // Re-apply highlighting when DOM changes (for dynamic content)
  const debouncedApplyHighlighting = debounce(applyHighlighting, 100);

  const observer = new MutationObserver((mutations) => {
    let shouldReapply = false;
    
    // Check if URL changed (for single-page applications)
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      shouldReapply = true;
    }
    
    // Check for new content
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added nodes contain text
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE ||
              (node.nodeType === Node.ELEMENT_NODE && node.textContent)) {
            shouldReapply = true;
            break;
          }
        }
      }
    }
    
    if (shouldReapply) {
      debouncedApplyHighlighting();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', () => {
    debouncedApplyHighlighting();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHighlightText);
} else {
  initHighlightText();
}
