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
 * @property {string} name - Parameter name ( string or regex pattern)
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

/**
 * Load URL processing rules from storage.
 * @returns {Promise<UrlProcessRule[]>}
 */
async function loadRules() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const rules = result?.[STORAGE_KEY];
    if (!Array.isArray(rules)) {
      return [];
    }
    return rules;
  } catch (error) {
    console.warn('[urlProcessor] Failed to load rules:', error);
    return [];
  }
}

/**
 * Check if a URL matches any of the given URL patterns.
 * @param {string} url - The URL to check
 * @param {string[]} patterns - Array of URL patterns
 * @returns {boolean}
 */
function urlMatchesPatterns(url, patterns) {
  if (!url || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    for (const pattern of patterns) {
      try {
        let urlPattern;
        if (pattern.includes('://')) {
          // Full URL pattern
          urlPattern = new URLPattern(pattern);
        } else if (pattern.startsWith('/')) {
          // Pathname pattern
          urlPattern = new URLPattern({ pathname: pattern });
        } else if (pattern.includes('*') || pattern.includes(':')) {
          // Pattern with wildcards or named groups - treat as pathname
          urlPattern = new URLPattern({ pathname: '/' + pattern });
        } else {
          // Domain or hostname pattern
          urlPattern = new URLPattern({ hostname: pattern });
        }

        if (urlPattern.test(url)) {
          return true;
        }
      } catch (error) {
        // Invalid pattern, skip
        continue;
      }
    }
    return false;
  } catch (error) {
    // Invalid URL, can't match
    return false;
  }
}

/**
 * Apply a single processor to a URL.
 * @param {string} url - The URL to process
 * @param {UrlProcessor} processor - The processor to apply
 * @returns {string} - The processed URL
 */
function applyProcessor(url, processor) {
  try {
    const urlObj = new URL(url);
    const { type, name, value } = processor;

    if (type === 'add') {
      // Add query parameter
      if (name && value !== undefined) {
        urlObj.searchParams.set(name, value);
      }
    } else if (type === 'replace') {
      // Replace query parameter value or use regex to replace parts of URL
      if (name.startsWith('/') && name.endsWith('/')) {
        // Regex replacement
        const regexPattern = name.slice(1, -1);
        try {
          const regex = new RegExp(regexPattern);
          url = url.replace(regex, value || '');
          return url;
        } catch (error) {
          // Invalid regex, skip
          return url;
        }
      } else {
        // Replace query parameter value
        if (value !== undefined) {
          urlObj.searchParams.set(name, value);
        }
      }
    } else if (type === 'remove') {
      // Remove query parameter or use regex to remove parts of URL
      if (name.startsWith('/') && name.endsWith('/')) {
        // Regex removal
        const regexPattern = name.slice(1, -1);
        try {
          const regex = new RegExp(regexPattern);
          url = url.replace(regex, '');
          return url;
        } catch (error) {
          // Invalid regex, skip
          return url;
        }
      } else {
        // Remove query parameter
        urlObj.searchParams.delete(name);
      }
    }

    return urlObj.toString();
  } catch (error) {
    // Failed to parse URL, return original
    return url;
  }
}

/**
 * Process a URL by applying matching URL processing rules.
 * @param {string} url - The URL to process
 * @param {ApplyWhenOption} applyWhen - When this URL is being used ('copy-to-clipboard' or 'save-to-raindrop')
 * @returns {Promise<string>} - The processed URL
 */
export async function processUrl(url, applyWhen) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  try {
    const rules = await loadRules();
    if (rules.length === 0) {
      return url;
    }

    let processedUrl = url;

    // Find all matching rules for this URL and applyWhen context
    const matchingRules = rules.filter((rule) => {
      // Check if rule applies to this context
      if (!rule.applyWhen || !rule.applyWhen.includes(applyWhen)) {
        return false;
      }
      // Check if URL matches any pattern in this rule
      return urlMatchesPatterns(processedUrl, rule.urlPatterns);
    });

    // Apply processors from all matching rules in order
    for (const rule of matchingRules) {
      for (const processor of rule.processors) {
        processedUrl = applyProcessor(processedUrl, processor);
      }
    }

    return processedUrl;
  } catch (error) {
    console.warn('[urlProcessor] Failed to process URL:', error);
    return url;
  }
}
