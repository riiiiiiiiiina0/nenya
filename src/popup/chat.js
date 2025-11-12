/* global chrome */

import '../options/theme.js';
import { loadLLMPrompts } from '../options/llmPrompts.js';

const promptTextarea = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('promptTextarea')
);
const backButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('backButton')
);
const sendButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('sendButton')
);
const downloadButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('downloadButton')
);
const promptsDropdown = /** @type {HTMLDivElement | null} */ (
  document.getElementById('promptsDropdown')
);
const providersDropdown = /** @type {HTMLDivElement | null} */ (
  document.getElementById('providersDropdown')
);
const selectedProvidersDiv = /** @type {HTMLDivElement | null} */ (
  document.getElementById('selectedProviders')
);
const selectProvidersButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('selectProvidersButton')
);
const tabsInfoDiv = /** @type {HTMLDivElement | null} */ (
  document.getElementById('tabsInfo')
);
const tabFaviconsDiv = /** @type {HTMLDivElement | null} */ (
  document.getElementById('tabFavicons')
);
const tabCountSpan = /** @type {HTMLSpanElement | null} */ (
  document.getElementById('tabCount')
);

/**
 * @typedef {Object} LLMProvider
 * @property {string} id
 * @property {string} name
 * @property {boolean} supportsSearch
 * @property {string} url
 */

/** @type {LLMProvider[]} */
const LLM_PROVIDERS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    supportsSearch: false,
    url: 'https://chat.openai.com',
  },
  {
    id: 'chatgpt-search',
    name: 'ChatGPT with search',
    supportsSearch: true,
    url: 'https://chat.openai.com',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    supportsSearch: true,
    url: 'https://gemini.google.com',
  },
  {
    id: 'claude',
    name: 'Claude',
    supportsSearch: true,
    url: 'https://claude.ai',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    supportsSearch: true,
    url: 'https://www.perplexity.ai',
  },
];

const STORAGE_KEY_SELECTED_PROVIDERS = 'chatLLMSelectedProviders';

/**
 * Get icon image HTML for LLM provider
 * @param {LLMProvider} provider
 * @returns {string}
 */
function getProviderIconHtml(provider) {
  // Extract domain from URL (e.g., "https://chat.openai.com" -> "chat.openai.com")
  const urlObj = new URL(provider.url);
  const domain = urlObj.hostname;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  return `<img src="${faviconUrl}" alt="${provider.name}" class="provider-icon" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;" />`;
}

/** @type {Set<string>} */
let selectedProviders = new Set();

/** @type {chrome.tabs.Tab[]} */
let targetTabs = [];

/** @type {string | null} */
let currentSelectedPromptId = null;

/** @type {boolean} */
let currentPromptRequiresSearch = false;

let activeDropdownIndex = -1;

/** @type {boolean} */
let providerDropdownTriggeredByButton = false;

/** @type {number | null} */
let chatPageTabId = null;

/** @type {string} */
let sessionId = '';

/** @type {number} */
let currentTabIndex = 0;

/** @type {boolean} */
let llmTabsOpened = false;

/** @type {chrome.runtime.Port | null} */
let keepAlivePort = null;

/**
 * Load saved selected providers from storage.
 * @returns {Promise<void>}
 */
async function loadSelectedProviders() {
  try {
    const result = await chrome.storage.local.get(
      STORAGE_KEY_SELECTED_PROVIDERS,
    );
    const saved = result[STORAGE_KEY_SELECTED_PROVIDERS];
    if (Array.isArray(saved) && saved.length > 0) {
      selectedProviders = new Set(saved);
    } else {
      // Default to ChatGPT if no providers are saved
      selectedProviders = new Set(['chatgpt']);
      await saveSelectedProviders();
    }
  } catch (error) {
    console.error('[chat] Failed to load selected providers:', error);
    // Default to ChatGPT on error
    selectedProviders = new Set(['chatgpt']);
  }
}

/**
 * Save selected providers to storage.
 * @returns {Promise<void>}
 */
async function saveSelectedProviders() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_SELECTED_PROVIDERS]: Array.from(selectedProviders),
    });
  } catch (error) {
    console.error('[chat] Failed to save selected providers:', error);
  }
}

/**
 * Update the selected providers display in the toolbar.
 * @returns {void}
 */
function updateSelectedProvidersDisplay() {
  if (!selectedProvidersDiv || !selectProvidersButton) return;

  // Clear only the badges, not the button
  const existingBadges = selectedProvidersDiv.querySelectorAll(
    '.llm-provider-badge',
  );
  existingBadges.forEach((badge) => badge.remove());

  if (selectedProviders.size === 0) {
    // Show the button when no providers are selected
    selectProvidersButton.style.display = 'inline-flex';
    return;
  }

  // Hide the button when providers are selected
  selectProvidersButton.style.display = 'none';

  selectedProviders.forEach((providerId) => {
    const provider = LLM_PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    const badge = document.createElement('div');
    badge.className = 'llm-provider-badge';
    badge.style.cursor = 'pointer';
    badge.innerHTML = `${getProviderIconHtml(provider)}<span>${provider.name}</span>`;

    // Add click handler to show dropdown when clicking on badge
    badge.addEventListener('click', (event) => {
      event.stopPropagation();
      showProvidersDropdown(badge);
    });

    selectedProvidersDiv.appendChild(badge);
  });
}

/**
 * Get highlighted or active tabs.
 * Filters out tabs with URLs not starting with http.
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function getTargetTabs() {
  try {
    // First try to get highlighted tabs
    let tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });

    // If no highlighted tabs or only one (which is the current), get active tab
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    }

    // Filter to only include tabs with http/https URLs
    const filteredTabs = (tabs || []).filter((tab) => {
      const url = tab.url || '';
      return url.startsWith('http://') || url.startsWith('https://');
    });

    return filteredTabs;
  } catch (error) {
    console.error('[chat] Failed to get target tabs:', error);
    return [];
  }
}

/**
 * Update the tabs info display in the toolbar.
 * @returns {Promise<void>}
 */
async function updateTabsInfoDisplay() {
  targetTabs = await getTargetTabs();

  if (tabFaviconsDiv) {
    tabFaviconsDiv.innerHTML = '';
    if (targetTabs.length > 0) {
      targetTabs.slice(0, 5).forEach((tab) => {
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src =
          tab.favIconUrl ||
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
        favicon.alt = tab.title || '';
        favicon.title = tab.title || '';
        tabFaviconsDiv.appendChild(favicon);
      });
    }
  }

  if (tabCountSpan) {
    if (targetTabs.length === 0) {
      tabCountSpan.textContent = 'No http:// tabs';
      tabCountSpan.classList.add('text-warning');
    } else {
      tabCountSpan.textContent = `${targetTabs.length} tab${
        targetTabs.length !== 1 ? 's' : ''
      }`;
      tabCountSpan.classList.remove('text-warning');
    }
  }
}

/**
 * Show the saved prompts dropdown.
 * @param {string} [searchQuery] - Optional search query to filter prompts
 * @returns {Promise<void>}
 */
async function showPromptsDropdown(searchQuery = '') {
  if (!promptsDropdown || !promptTextarea) return;

  const prompts = await loadLLMPrompts();

  // Filter and sort prompts based on search query
  const query = searchQuery.toLowerCase().trim();
  let filteredPrompts = query
    ? prompts.filter(
        (prompt) =>
          prompt.name.toLowerCase().includes(query) ||
          prompt.prompt.toLowerCase().includes(query),
      )
    : prompts;

  // Sort by matching priority: title matches first, then content matches
  if (query) {
    filteredPrompts.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(query);
      const bNameMatch = b.name.toLowerCase().includes(query);

      // If one matches in name and the other doesn't, prioritize the name match
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      // If both match in name or both don't, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  } else {
    // When no query, sort alphabetically by name
    filteredPrompts.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (filteredPrompts.length === 0) {
    promptsDropdown.innerHTML =
      '<div class="dropdown-item text-base-content/60">No matching prompts</div>';
  } else {
    promptsDropdown.innerHTML = '';
    filteredPrompts.forEach((prompt, index) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.setAttribute('data-prompt-id', prompt.id);
      item.setAttribute('data-index', String(index));

      const nameSpan = document.createElement('div');
      nameSpan.className = 'font-medium';
      nameSpan.textContent = prompt.name;

      const previewSpan = document.createElement('div');
      previewSpan.className = 'text-sm text-base-content/60 truncate';
      previewSpan.textContent = prompt.prompt;

      item.appendChild(nameSpan);
      item.appendChild(previewSpan);

      if (prompt.requireSearch) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-xs badge-primary mt-1';
        badge.textContent = 'Requires search';
        item.appendChild(badge);
      }

      item.addEventListener('click', () => {
        selectPrompt(prompt);
      });

      promptsDropdown.appendChild(item);
    });
  }

  // Position the dropdown
  const rect = promptTextarea.getBoundingClientRect();
  const cursorPosition = getCursorCoordinates(promptTextarea);

  // Ensure dropdown stays within page boundaries
  const dropdownWidth = 400; // match the CSS width
  const maxLeft = Math.min(
    cursorPosition.left,
    window.innerWidth - dropdownWidth - 20,
  );

  promptsDropdown.style.left = `${Math.max(10, maxLeft)}px`;
  promptsDropdown.style.top = `${cursorPosition.top + 20}px`;
  promptsDropdown.classList.add('show');

  activeDropdownIndex = -1;
  updateActiveDropdownItem(promptsDropdown);
}

/**
 * Show the LLM providers dropdown.
 * @param {HTMLElement} [referenceElement] - Optional element to position dropdown near
 * @param {string} [searchQuery] - Optional search query to filter providers
 * @returns {void}
 */
function showProvidersDropdown(referenceElement, searchQuery = '') {
  if (!providersDropdown || !promptTextarea) return;

  // Track if opened via button or '@' trigger
  providerDropdownTriggeredByButton = !!referenceElement;

  providersDropdown.innerHTML = '';

  // Filter providers based on whether current prompt requires search
  let availableProviders = currentPromptRequiresSearch
    ? LLM_PROVIDERS.filter((p) => p.supportsSearch)
    : LLM_PROVIDERS;

  // Filter providers based on search query
  const query = searchQuery.toLowerCase().trim();
  if (query) {
    availableProviders = availableProviders.filter((p) =>
      p.name.toLowerCase().includes(query),
    );
    // Sort alphabetically by name (providers only have name, no separate content)
    availableProviders.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // When no query, sort alphabetically by name
    availableProviders.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (availableProviders.length === 0) {
    providersDropdown.innerHTML =
      '<div class="dropdown-item text-base-content/60">No matching providers</div>';
  } else {
    availableProviders.forEach((provider, index) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.setAttribute('data-provider-id', provider.id);
      item.setAttribute('data-index', String(index));

      const providerIconHtml = getProviderIconHtml(provider);
      if (selectedProviders.has(provider.id)) {
        item.classList.add('selected');
        item.innerHTML = `● ${providerIconHtml} ${provider.name}`;
      } else {
        item.innerHTML = `○ ${providerIconHtml} ${provider.name}`;
      }

      // Disable ChatGPT if prompt requires search
      if (currentPromptRequiresSearch && provider.id === 'chatgpt') {
        item.classList.add('opacity-50', 'cursor-not-allowed');
        item.innerHTML = `○ ${providerIconHtml} ${provider.name} (disabled - prompt requires search)`;
        return;
      }

      item.addEventListener('click', () => {
        // Use appropriate toggle function based on how dropdown was opened
        if (providerDropdownTriggeredByButton) {
          toggleProviderFromButton(provider.id);
        } else {
          toggleProvider(provider.id);
        }
      });

      providersDropdown.appendChild(item);
    });
  }

  // Position the dropdown
  if (referenceElement) {
    // Position above the button that triggered it
    const rect = referenceElement.getBoundingClientRect();
    const dropdownWidth = 400;
    const maxLeft = Math.min(rect.left, window.innerWidth - dropdownWidth - 20);

    providersDropdown.style.left = `${Math.max(10, maxLeft)}px`;
    // Position above the button - we'll adjust after showing to get accurate height
    providersDropdown.style.top = '0px';
    providersDropdown.classList.add('show');

    // Now get the actual dropdown height and position it above the button
    const dropdownHeight = providersDropdown.offsetHeight;
    providersDropdown.style.top = `${rect.top - dropdownHeight - 5}px`;
  } else {
    // Position near the textarea cursor (original behavior)
    const cursorPosition = getCursorCoordinates(promptTextarea);
    const dropdownWidth = 400;
    const maxLeft = Math.min(
      cursorPosition.left,
      window.innerWidth - dropdownWidth - 20,
    );

    providersDropdown.style.left = `${Math.max(10, maxLeft)}px`;
    providersDropdown.style.top = `${cursorPosition.top + 20}px`;
    providersDropdown.classList.add('show');
  }

  activeDropdownIndex = -1;
  updateActiveDropdownItem(providersDropdown);
}

/**
 * Hide all dropdowns.
 * @returns {void}
 */
function hideAllDropdowns() {
  if (promptsDropdown) {
    promptsDropdown.classList.remove('show');
  }
  if (providersDropdown) {
    providersDropdown.classList.remove('show');
  }
  activeDropdownIndex = -1;
  providerDropdownTriggeredByButton = false;
}

/**
 * Select a prompt and insert it into the textarea.
 * @param {any} prompt
 * @returns {void}
 */
function selectPrompt(prompt) {
  if (!promptTextarea) return;

  // Find the position of the last '/' character
  const text = promptTextarea.value;
  const cursorPos = promptTextarea.selectionStart;
  const lastSlashIndex = text.lastIndexOf('/', cursorPos);

  if (lastSlashIndex !== -1) {
    // Replace from the slash to the cursor with the prompt text
    const before = text.substring(0, lastSlashIndex);
    const after = text.substring(cursorPos);
    promptTextarea.value = before + prompt.prompt + after;

    // Set cursor after the inserted prompt
    const newCursorPos = lastSlashIndex + prompt.prompt.length;
    promptTextarea.setSelectionRange(newCursorPos, newCursorPos);
  }

  currentSelectedPromptId = prompt.id;
  currentPromptRequiresSearch = prompt.requireSearch || false;

  // Remove ChatGPT from selection if prompt requires search
  if (currentPromptRequiresSearch && selectedProviders.has('chatgpt')) {
    selectedProviders.delete('chatgpt');
    updateSelectedProvidersDisplay();
    void saveSelectedProviders();
  }

  hideAllDropdowns();
  promptTextarea.focus();
}

/**
 * Toggle a provider selection (single selection only).
 * @param {string} providerId
 * @returns {void}
 */
function toggleProvider(providerId) {
  if (!promptTextarea) return;

  // Don't allow ChatGPT if prompt requires search
  if (currentPromptRequiresSearch && providerId === 'chatgpt') {
    return;
  }

  // Get the old provider ID before changing
  const oldProviderId =
    selectedProviders.size > 0 ? Array.from(selectedProviders)[0] : null;

  // Single selection: clear previous selection and set new one
  selectedProviders.clear();
  selectedProviders.add(providerId);

  updateSelectedProvidersDisplay();
  void saveSelectedProviders();

  // If LLM tabs are already opened and we're switching providers, update the tab
  if (llmTabsOpened && oldProviderId && oldProviderId !== providerId) {
    void switchLLMProvider(oldProviderId, providerId);
  } else if (!llmTabsOpened && sessionId) {
    // If tabs not opened yet, open them now
    void openLLMTabs();
  }

  // Remove the '@' character that triggered the dropdown
  const text = promptTextarea.value;
  const cursorPos = promptTextarea.selectionStart;
  const lastAtIndex = text.lastIndexOf('@', cursorPos);

  if (lastAtIndex !== -1) {
    const before = text.substring(0, lastAtIndex);
    const after = text.substring(cursorPos);
    promptTextarea.value = before + after;
    promptTextarea.setSelectionRange(lastAtIndex, lastAtIndex);
  }

  hideAllDropdowns();
  promptTextarea.focus();
}

/**
 * Toggle a provider selection from the button (doesn't remove '@' character).
 * Single selection only.
 * @param {string} providerId
 * @returns {void}
 */
function toggleProviderFromButton(providerId) {
  // Don't allow ChatGPT if prompt requires search
  if (currentPromptRequiresSearch && providerId === 'chatgpt') {
    return;
  }

  // Get the old provider ID before changing
  const oldProviderId =
    selectedProviders.size > 0 ? Array.from(selectedProviders)[0] : null;

  // Single selection: clear previous selection and set new one
  selectedProviders.clear();
  selectedProviders.add(providerId);

  updateSelectedProvidersDisplay();
  void saveSelectedProviders();

  // If LLM tabs are already opened and we're switching providers, update the tab
  if (llmTabsOpened && oldProviderId && oldProviderId !== providerId) {
    void switchLLMProvider(oldProviderId, providerId);
  } else if (!llmTabsOpened && sessionId) {
    // If tabs not opened yet, open them now
    void openLLMTabs();
  }

  // Close dropdown after selection
  hideAllDropdowns();
}

/**
 * Get cursor coordinates in the textarea.
 * @param {HTMLTextAreaElement} textarea
 * @returns {{left: number, top: number}}
 */
function getCursorCoordinates(textarea) {
  const rect = textarea.getBoundingClientRect();
  // For simplicity, just position at the textarea's position
  return {
    left: rect.left + 10,
    top: rect.top + 30,
  };
}

/**
 * Update active dropdown item based on keyboard navigation.
 * @param {HTMLElement} dropdown
 * @returns {void}
 */
function updateActiveDropdownItem(dropdown) {
  const items = Array.from(dropdown.querySelectorAll('.dropdown-item'));
  items.forEach((item, index) => {
    if (index === activeDropdownIndex) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Handle keyboard navigation in dropdown.
 * @param {KeyboardEvent} event
 * @param {HTMLElement} dropdown
 * @returns {boolean}
 */
function handleDropdownKeyboard(event, dropdown) {
  const items = Array.from(dropdown.querySelectorAll('.dropdown-item'));
  if (items.length === 0) return false;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeDropdownIndex = Math.min(activeDropdownIndex + 1, items.length - 1);
    updateActiveDropdownItem(dropdown);
    return true;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeDropdownIndex = Math.max(activeDropdownIndex - 1, -1);
    updateActiveDropdownItem(dropdown);
    return true;
  }

  if (event.key === 'Enter' && activeDropdownIndex >= 0) {
    event.preventDefault();
    const activeItem = items[activeDropdownIndex];
    if (activeItem instanceof HTMLElement) {
      activeItem.click();
    }
    return true;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    hideAllDropdowns();
    return true;
  }

  return false;
}

/**
 * Get the current tab ID for the chat page and generate session ID
 * @returns {Promise<void>}
 */
async function getChatPageTabId() {
  try {
    // Generate a unique session ID for this chat session
    sessionId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Try to get tab ID if this is opened as a tab (not popup)
    const response = await chrome.runtime.sendMessage({
      type: 'getCurrentTabId',
    });
    if (response && typeof response.tabId === 'number') {
      chatPageTabId = response.tabId;
    }

    // Establish a keep-alive connection with background script
    // This will be used to detect when popup is closed
    keepAlivePort = chrome.runtime.connect({ name: `chat-${sessionId}` });
    keepAlivePort.onDisconnect.addListener(() => {
      console.log('[chat] Port disconnected');
    });
  } catch (error) {
    console.error('[chat] Failed to get chat page tab ID:', error);
  }
}

/**
 * Get current active tab info
 * @returns {Promise<void>}
 */
async function getCurrentTabInfo() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs && tabs[0]) {
      currentTabIndex = tabs[0].index || 0;
    }
  } catch (error) {
    console.error('[chat] Failed to get current tab info:', error);
  }
}

/**
 * Open LLM tabs for selected providers
 * @returns {Promise<void>}
 */
async function openLLMTabs() {
  if (llmTabsOpened || selectedProviders.size === 0 || !sessionId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'open-llm-tabs',
      sessionId,
      chatPageTabId,
      providers: Array.from(selectedProviders),
      currentTabIndex,
    });

    if (response?.success) {
      llmTabsOpened = true;
      console.log('[chat] LLM tabs opened successfully');
    } else {
      console.error('[chat] Failed to open LLM tabs:', response?.error);
    }
  } catch (error) {
    console.error('[chat] Failed to open LLM tabs:', error);
  }
}

/**
 * Close LLM tabs
 * @returns {Promise<void>}
 */
async function closeLLMTabs() {
  if (!llmTabsOpened || !sessionId) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'close-llm-tabs',
      sessionId,
    });
    llmTabsOpened = false;
    console.log('[chat] LLM tabs closed');
  } catch (error) {
    console.error('[chat] Failed to close LLM tabs:', error);
  }
}

/**
 * Switch LLM provider
 * @param {string} oldProviderId
 * @param {string} newProviderId
 * @returns {Promise<void>}
 */
async function switchLLMProvider(oldProviderId, newProviderId) {
  if (!sessionId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'switch-llm-provider',
      sessionId,
      oldProviderId,
      newProviderId,
    });

    if (!response?.success) {
      console.error('[chat] Failed to switch LLM provider:', response?.error);
    }
  } catch (error) {
    console.error('[chat] Failed to switch LLM provider:', error);
  }
}

/**
 * Handle sending the prompt to LLM providers.
 * @returns {Promise<void>}
 */
async function handleSend() {
  if (!promptTextarea || !sendButton) return;

  const promptText = promptTextarea.value.trim();

  if (selectedProviders.size === 0) {
    alert('Please select an LLM provider (type @ to select).');
    return;
  }

  // Check if we have any valid tabs to collect content from
  if (targetTabs.length === 0) {
    alert(
      'No valid tabs available. Please open an http:// or https:// page first.',
    );
    return;
  }

  // Show loading state and disable button
  const originalButtonText = sendButton.textContent;
  sendButton.disabled = true;
  sendButton.classList.add('loading');

  try {
    console.log('[chat] Sending to LLM, llmTabsOpened:', llmTabsOpened, 'sessionId:', sessionId);
    
    // Send message to background script to collect content and inject into LLM pages
    const response = await chrome.runtime.sendMessage({
      type: 'collect-and-send-to-llm',
      tabIds: targetTabs
        .map((t) => t.id)
        .filter((id) => typeof id === 'number'),
      llmProviders: Array.from(selectedProviders),
      promptContent: promptText,
      sessionId: sessionId,
      useReuseTabs: llmTabsOpened,
    });
    
    console.log('[chat] Send response:', response);

    if (!response?.success) {
      alert(`Failed to send to LLM: ${response?.error || 'Unknown error'}`);
      // Re-enable button on error
      sendButton.disabled = false;
      sendButton.classList.remove('loading');
      return;
    }

    // Don't close the popup - let user continue working
    // Re-enable button
    sendButton.disabled = false;
    sendButton.classList.remove('loading');
  } catch (error) {
    console.error('[chat] Failed to send:', error);
    alert('Failed to send prompt. Please try again.');
    // Re-enable button on error
    sendButton.disabled = false;
    sendButton.classList.remove('loading');
  }
}

/**
 * Handle downloading page content as markdown file.
 * @returns {Promise<void>}
 */
async function handleDownload() {
  if (!promptTextarea) return;

  const promptText = promptTextarea.value.trim();

  // Check if we have any valid tabs to collect content from
  if (targetTabs.length === 0) {
    alert(
      'No valid tabs available. Please open an http:// or https:// page first.',
    );
    return;
  }

  try {
    // Collect page content from target tabs
    const response = await chrome.runtime.sendMessage({
      type: 'collect-page-content-as-markdown',
      tabIds: targetTabs
        .map((t) => t.id)
        .filter((id) => typeof id === 'number'),
    });

    if (!response?.success) {
      alert('Failed to collect page content.');
      return;
    }

    const contents = response.contents || [];

    // Build the markdown content
    let markdownContent = '';

    // Add prompt if provided
    if (promptText) {
      markdownContent = `# Prompt\n\n${promptText}\n\n---\n\n`;
    }

    // Add page contents
    contents.forEach((content, index) => {
      markdownContent += `## Page ${index + 1}: ${content.title}\n\n`;
      markdownContent += `**URL:** ${content.url}\n\n`;
      markdownContent += content.content;
      markdownContent += '\n\n---\n\n';
    });

    // Create a blob and download it
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `page-content-${timestamp}.md`;

    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[chat] Failed to download:', error);
    alert('Failed to download page content. Please try again.');
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

if (backButton) {
  backButton.addEventListener('click', async () => {
    // Close LLM tabs before navigating away
    await closeLLMTabs();
    // Navigate back to the main popup page
    window.location.href = 'index.html';
  });
}

if (sendButton) {
  sendButton.addEventListener('click', () => {
    void handleSend();
  });
}

if (downloadButton) {
  downloadButton.addEventListener('click', () => {
    void handleDownload();
  });
}

if (selectProvidersButton) {
  selectProvidersButton.addEventListener('click', (event) => {
    event.stopPropagation(); // Prevent click from bubbling to document listener
    showProvidersDropdown(selectProvidersButton);
  });
}

if (promptTextarea) {
  promptTextarea.addEventListener('input', (event) => {
    const target = /** @type {HTMLTextAreaElement} */ (event.target);
    const text = target.value;
    const cursorPos = target.selectionStart;

    // Check for '/' trigger
    const lastSlashIndex = text.lastIndexOf('/', cursorPos);
    if (lastSlashIndex !== -1) {
      const textAfterSlash = text.substring(lastSlashIndex + 1, cursorPos);
      // Check if there's a space before the cursor (which means we're done with the trigger)
      if (textAfterSlash.includes(' ')) {
        // Hide prompts dropdown if space is found
        if (promptsDropdown && promptsDropdown.classList.contains('show')) {
          hideAllDropdowns();
        }
      } else {
        // Show or update prompts dropdown with search query
        void showPromptsDropdown(textAfterSlash);
        return;
      }
    }

    // Check for '@' trigger
    const lastAtIndex = text.lastIndexOf('@', cursorPos);
    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1, cursorPos);
      // Check if there's a space before the cursor (which means we're done with the trigger)
      if (textAfterAt.includes(' ')) {
        // Hide providers dropdown if space is found
        if (providersDropdown && providersDropdown.classList.contains('show')) {
          hideAllDropdowns();
        }
      } else {
        // Show or update providers dropdown with search query
        showProvidersDropdown(undefined, textAfterAt);
        return;
      }
    }

    // Hide dropdowns if neither trigger is active
    if (
      lastSlashIndex === -1 &&
      promptsDropdown &&
      promptsDropdown.classList.contains('show')
    ) {
      hideAllDropdowns();
    }

    if (
      lastAtIndex === -1 &&
      providersDropdown &&
      providersDropdown.classList.contains('show') &&
      !providerDropdownTriggeredByButton
    ) {
      hideAllDropdowns();
    }
  });

  promptTextarea.addEventListener('keydown', (event) => {
    // Handle dropdown keyboard navigation
    if (promptsDropdown && promptsDropdown.classList.contains('show')) {
      if (handleDropdownKeyboard(event, promptsDropdown)) {
        return;
      }
    }

    if (providersDropdown && providersDropdown.classList.contains('show')) {
      if (handleDropdownKeyboard(event, providersDropdown)) {
        return;
      }
    }

    // Send on Cmd/Ctrl+Enter
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSend();
    }
  });
}

// Click outside to close dropdowns
document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  if (!target) return;

  // Close prompts dropdown if clicking anywhere except the dropdown itself
  if (promptsDropdown && !promptsDropdown.contains(target)) {
    promptsDropdown.classList.remove('show');
  }

  // Close providers dropdown if clicking anywhere except the dropdown, the button, or provider badges
  const isProviderBadge = target.closest('.llm-provider-badge');
  if (
    providersDropdown &&
    !providersDropdown.contains(target) &&
    target !== selectProvidersButton &&
    !(selectProvidersButton && selectProvidersButton.contains(target)) &&
    !isProviderBadge
  ) {
    providersDropdown.classList.remove('show');
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the chat page.
 * @returns {Promise<void>}
 */
async function initChatPage() {
  // Get chat page tab ID and current tab info first
  await getChatPageTabId();
  await getCurrentTabInfo();

  await loadSelectedProviders();
  updateSelectedProvidersDisplay();
  await updateTabsInfoDisplay();

  // Open LLM tabs if providers are already selected
  if (selectedProviders.size > 0 && sessionId) {
    await openLLMTabs();
  }

  // Set emoji icons for buttons
  const editPromptsButton = document.getElementById('editPromptsButton');
  if (editPromptsButton) {
    editPromptsButton.innerHTML = '✏️';
  }

  const downloadBtn = document.getElementById('downloadButton');
  if (downloadBtn) {
    downloadBtn.innerHTML = '📥';
  }

  const sendBtn = document.getElementById('sendButton');
  if (sendBtn) {
    sendBtn.innerHTML = '💬';
  }

  // Focus the textarea
  if (promptTextarea) {
    promptTextarea.focus();
  }
}

void initChatPage();
