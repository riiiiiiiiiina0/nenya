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
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    sendButtonSelector: 'button[data-testid="send-button"]:not([disabled])',
  },
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

