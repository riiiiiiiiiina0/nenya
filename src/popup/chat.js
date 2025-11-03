/* global chrome */

import '../options/theme.js';
import { loadLLMPrompts } from '../options/llmPrompts.js';
import { icons } from '../shared/icons.js';

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
    badge.innerHTML = `<span>${provider.name}</span>`;

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

      if (selectedProviders.has(provider.id)) {
        item.classList.add('selected');
        item.innerHTML = `<span>● ${provider.name}</span>`;
      } else {
        item.innerHTML = `<span>○ ${provider.name}</span>`;
      }

      // Disable ChatGPT if prompt requires search
      if (currentPromptRequiresSearch && provider.id === 'chatgpt') {
        item.classList.add('opacity-50', 'cursor-not-allowed');
        item.innerHTML = `<span>○ ${provider.name} (disabled - prompt requires search)</span>`;
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

  // Single selection: clear previous selection and set new one
  selectedProviders.clear();
  selectedProviders.add(providerId);

  updateSelectedProvidersDisplay();
  void saveSelectedProviders();

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

  // Single selection: clear previous selection and set new one
  selectedProviders.clear();
  selectedProviders.add(providerId);

  updateSelectedProvidersDisplay();
  void saveSelectedProviders();

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
    // Send message to background script to collect content and inject into LLM pages
    const response = await chrome.runtime.sendMessage({
      type: 'collect-and-send-to-llm',
      tabIds: targetTabs
        .map((t) => t.id)
        .filter((id) => typeof id === 'number'),
      llmProviders: Array.from(selectedProviders),
      promptContent: promptText,
    });

    if (!response?.success) {
      alert(`Failed to send to LLM: ${response?.error || 'Unknown error'}`);
      // Re-enable button on error
      sendButton.disabled = false;
      sendButton.classList.remove('loading');
      return;
    }

    // Close the popup - the LLM tabs have been opened/reused with content injected
    window.close();
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

    // Show success message
    alert(`Page content downloaded as ${filename}`);
  } catch (error) {
    console.error('[chat] Failed to download:', error);
    alert('Failed to download page content. Please try again.');
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

if (backButton) {
  backButton.addEventListener('click', () => {
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
  await loadSelectedProviders();
  updateSelectedProvidersDisplay();
  await updateTabsInfoDisplay();

  // Set SVG icons for buttons
  const editPromptsButton = document.getElementById('editPromptsButton');
  if (editPromptsButton) {
    editPromptsButton.innerHTML = icons['pencil-square'];
  }

  const downloadBtn = document.getElementById('downloadButton');
  if (downloadBtn) {
    downloadBtn.innerHTML = icons['arrow-down-tray'];
  }

  const sendBtn = document.getElementById('sendButton');
  if (sendBtn) {
    sendBtn.innerHTML = icons['chat-bubble-oval-left-ellipsis'];
  }

  // Focus the textarea
  if (promptTextarea) {
    promptTextarea.focus();
  }
}

void initChatPage();
