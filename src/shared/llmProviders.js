/* global chrome */

/**
 * LLM Provider configuration and utilities
 */

/**
 * @typedef {Object} LLMProviderMeta
 * @property {string} name - Display name of the provider
 * @property {string} url - Base URL to open for the provider
 * @property {string} sendButtonSelector - CSS selector for the send button
 */

/**
 * LLM Provider metadata
 * @type {Record<string, LLMProviderMeta>}
 */
export const LLM_PROVIDER_META = {
  'chatgpt-search': {
    name: 'ChatGPT with Search',
    url: 'https://chatgpt.com?hints=search',
    sendButtonSelector: 'button[data-testid="send-button"]:not([disabled])',
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    sendButtonSelector: 'button.send-button:not([aria-disabled="true"])',
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    sendButtonSelector: 'button[aria-label="Send Message"]:not([disabled])',
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    sendButtonSelector: 'button[aria-label="Submit"]:not([disabled])',
  },
};

/**
 * Check if a URL is an LLM provider page
 * @param {string} url
 * @returns {boolean}
 */
export function isLLMPage(url) {
  if (!url) return false;
  return (
    url.startsWith('https://chatgpt.com') ||
    url.startsWith('https://chat.openai.com') ||
    url.startsWith('https://gemini.google.com') ||
    url.startsWith('https://claude.ai') ||
    url.startsWith('https://www.perplexity.ai')
  );
}

/**
 * Get the LLM provider ID from a URL
 * @param {string} url
 * @returns {string | null}
 */
export function getLLMProviderFromURL(url) {
  if (!url) return null;

  if (
    url.startsWith('https://chatgpt.com') ||
    url.startsWith('https://chat.openai.com')
  ) {
    // Always return chatgpt-search for ChatGPT URLs
    return 'chatgpt-search';
  }

  if (url.startsWith('https://gemini.google.com')) {
    return 'gemini';
  }

  if (url.startsWith('https://claude.ai')) {
    return 'claude';
  }

  if (url.startsWith('https://www.perplexity.ai')) {
    return 'perplexity';
  }

  return null;
}
