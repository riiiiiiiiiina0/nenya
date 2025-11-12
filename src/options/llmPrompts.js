/* global chrome */

/**
 * @typedef {Object} LLMPromptSettings
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

const LLM_PROMPTS_KEY = 'llmPrompts';

const promptForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('llmPromptForm')
);
const promptNameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('llmPromptNameInput')
);
const promptTextInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('llmPromptTextInput')
);
const promptFormError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('llmPromptFormError')
);
const promptSaveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('llmPromptSaveButton')
);
const promptCancelEditButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('llmPromptCancelEditButton')
);
const promptsEmpty = /** @type {HTMLDivElement | null} */ (
  document.getElementById('llmPromptsEmpty')
);
const promptsList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('llmPromptsList')
);
const promptDetails = /** @type {HTMLDivElement | null} */ (
  document.getElementById('llmPromptDetails')
);
const promptDetailName = /** @type {HTMLElement | null} */ (
  document.getElementById('llmPromptDetailName')
);
const promptDetailText = /** @type {HTMLElement | null} */ (
  document.getElementById('llmPromptDetailText')
);
const promptDetailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('llmPromptDetailCreated')
);
const promptDetailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('llmPromptDetailUpdated')
);
const promptEditButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('llmPromptEditButton')
);
const promptDeleteButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('llmPromptDeleteButton')
);

/** @type {string | null} */
let currentlyEditingPromptId = null;
/** @type {string | null} */
let selectedPromptId = null;

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

const TOAST_BACKGROUND_BY_VARIANT = {
  success: 'linear-gradient(135deg, #22c55e, #16a34a)',
  error: 'linear-gradient(135deg, #f97316, #ea580c)',
  info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Show a toast notification.
 * @param {string} message
 * @param {ToastVariant} [variant='info']
 * @returns {void}
 */
function showToast(message, variant = 'info') {
  const background =
    TOAST_BACKGROUND_BY_VARIANT[variant] || TOAST_BACKGROUND_BY_VARIANT.info;
  /** @type {{ Toastify?: (options: any) => { showToast: () => void } }} */
  const windowWithToastify = /** @type {any} */ (window);
  if (typeof windowWithToastify.Toastify === 'function') {
    windowWithToastify
      .Toastify({
        text: message,
        duration: 3000,
        gravity: 'top',
        position: 'right',
        close: true,
        style: { background },
      })
      .showToast();
  }
}

/**
 * Generate a unique identifier for prompts.
 * @returns {string}
 */
function generatePromptId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'prompt-' + Date.now().toString(36) + '-' + random;
}

/**
 * Format a timestamp for display.
 * @param {string | undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value) {
    return 'Never';
  }
  try {
    return dateFormatter.format(new Date(value));
  } catch (error) {
    return 'Never';
  }
}

/**
 * Load all LLM prompts from storage.
 * @returns {Promise<LLMPromptSettings[]>}
 */
export async function loadLLMPrompts() {
  const result = await chrome.storage.sync.get(LLM_PROMPTS_KEY);
  const prompts = result?.[LLM_PROMPTS_KEY];
  if (!Array.isArray(prompts)) {
    return [];
  }
  return prompts.filter((p) => p && typeof p === 'object');
}

/**
 * Save LLM prompts to storage.
 * @param {LLMPromptSettings[]} prompts
 * @returns {Promise<void>}
 */
async function savePrompts(prompts) {
  await chrome.storage.sync.set({
    [LLM_PROMPTS_KEY]: prompts,
  });
}


/**
 * Clear the form inputs.
 * @returns {void}
 */
function clearForm() {
  if (promptNameInput) promptNameInput.value = '';
  if (promptTextInput) promptTextInput.value = '';
  if (promptFormError) {
    promptFormError.textContent = '';
    promptFormError.hidden = true;
  }
  currentlyEditingPromptId = null;
  if (promptSaveButton) promptSaveButton.textContent = 'Add prompt';
  if (promptCancelEditButton) promptCancelEditButton.hidden = true;
}

/**
 * Show an error message in the form.
 * @param {string} message
 * @returns {void}
 */
function showFormError(message) {
  if (!promptFormError) {
    return;
  }
  promptFormError.textContent = message;
  promptFormError.hidden = false;
}

/**
 * Render a prompt in the list.
 * @param {LLMPromptSettings} prompt
 * @returns {HTMLDivElement}
 */
function renderPromptListItem(prompt) {
  const item = document.createElement('div');
  item.className =
    'rounded-lg border border-base-300 p-3 cursor-pointer hover:bg-base-200 transition-colors';
  item.setAttribute('role', 'listitem');
  item.setAttribute('data-prompt-id', prompt.id);

  if (selectedPromptId === prompt.id) {
    item.classList.add('bg-base-200', 'border-primary');
  }

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-2';

  const name = document.createElement('div');
  name.className = 'font-medium text-base-content';
  name.textContent = prompt.name;

  header.appendChild(name);

  const preview = document.createElement('div');
  preview.className = 'text-sm text-base-content/70 mt-1 truncate';
  preview.textContent = prompt.prompt;

  item.appendChild(header);
  item.appendChild(preview);

  item.addEventListener('click', () => {
    selectPrompt(prompt.id);
  });

  return item;
}

/**
 * Render the prompts list.
 * @param {LLMPromptSettings[]} prompts
 * @returns {void}
 */
function renderPromptsList(prompts) {
  if (!promptsList || !promptsEmpty) {
    return;
  }

  if (prompts.length === 0) {
    promptsEmpty.hidden = false;
    promptsList.innerHTML = '';
    return;
  }

  promptsEmpty.hidden = true;
  promptsList.innerHTML = '';

  prompts.forEach((prompt) => {
    const item = renderPromptListItem(prompt);
    promptsList.appendChild(item);
  });
}

/**
 * Select a prompt and show its details.
 * @param {string} promptId
 * @returns {Promise<void>}
 */
async function selectPrompt(promptId) {
  selectedPromptId = promptId;
  const prompts = await loadLLMPrompts();
  const prompt = prompts.find((p) => p.id === promptId);

  if (!prompt) {
    selectedPromptId = null;
    if (promptDetails) promptDetails.hidden = true;
    renderPromptsList(prompts);
    return;
  }

  // Update list item selection
  renderPromptsList(prompts);

  // Show details
  if (promptDetails) promptDetails.hidden = false;
  if (promptDetailName) promptDetailName.textContent = prompt.name;
  if (promptDetailText) promptDetailText.textContent = prompt.prompt;

  if (promptDetailCreated) {
    promptDetailCreated.textContent = formatTimestamp(prompt.createdAt);
  }
  if (promptDetailUpdated) {
    promptDetailUpdated.textContent = formatTimestamp(prompt.updatedAt);
  }
}

/**
 * Handle form submission.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  if (!promptNameInput || !promptTextInput) {
    return;
  }

  const name = promptNameInput.value.trim();
  const text = promptTextInput.value.trim();

  if (!name) {
    showFormError('Please enter a name for the prompt.');
    return;
  }

  if (!text) {
    showFormError('Please enter the prompt text.');
    return;
  }

  const prompts = await loadLLMPrompts();
  const now = new Date().toISOString();

  if (currentlyEditingPromptId) {
    // Update existing prompt
    const index = prompts.findIndex((p) => p.id === currentlyEditingPromptId);
    if (index !== -1) {
      prompts[index] = {
        ...prompts[index],
        name,
        prompt: text,
        updatedAt: now,
      };
      await savePrompts(prompts);
      showToast('Prompt updated successfully.', 'success');
      selectedPromptId = currentlyEditingPromptId;
    }
  } else {
    // Create new prompt
    const newPrompt = {
      id: generatePromptId(),
      name,
      prompt: text,
      createdAt: now,
      updatedAt: now,
    };
    prompts.push(newPrompt);
    await savePrompts(prompts);
    showToast('Prompt added successfully.', 'success');
    selectedPromptId = newPrompt.id;
  }

  clearForm();
  renderPromptsList(await loadLLMPrompts());
  if (selectedPromptId) {
    await selectPrompt(selectedPromptId);
  }
}

/**
 * Handle edit button click.
 * @returns {Promise<void>}
 */
async function handleEditClick() {
  if (!selectedPromptId) {
    return;
  }

  const prompts = await loadLLMPrompts();
  const prompt = prompts.find((p) => p.id === selectedPromptId);

  if (!prompt) {
    return;
  }

  currentlyEditingPromptId = prompt.id;
  if (promptNameInput) promptNameInput.value = prompt.name;
  if (promptTextInput) promptTextInput.value = prompt.prompt;

  if (promptSaveButton) promptSaveButton.textContent = 'Update prompt';
  if (promptCancelEditButton) promptCancelEditButton.hidden = false;

  // Scroll to form
  if (promptForm) {
    promptForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Handle delete button click.
 * @returns {Promise<void>}
 */
async function handleDeleteClick() {
  if (!selectedPromptId) {
    return;
  }

  const prompts = await loadLLMPrompts();
  const prompt = prompts.find((p) => p.id === selectedPromptId);

  if (!prompt) {
    return;
  }

  const confirmed = window.confirm(
    'Are you sure you want to delete the prompt "' + prompt.name + '"?',
  );

  if (!confirmed) {
    return;
  }

  const filtered = prompts.filter((p) => p.id !== selectedPromptId);
  await savePrompts(filtered);

  showToast('Prompt deleted successfully.', 'success');

  selectedPromptId = null;
  if (promptDetails) promptDetails.hidden = true;

  renderPromptsList(await loadLLMPrompts());
}

/**
 * Handle cancel edit button click.
 * @returns {void}
 */
function handleCancelEdit() {
  clearForm();
}

/**
 * Initialize the LLM prompts section.
 * @returns {Promise<void>}
 */
async function initLLMPrompts() {
  if (!promptForm) {
    return;
  }

  promptForm.addEventListener('submit', (event) => {
    void handleFormSubmit(event);
  });

  if (promptCancelEditButton) {
    promptCancelEditButton.addEventListener('click', handleCancelEdit);
  }

  if (promptEditButton) {
    promptEditButton.addEventListener('click', () => {
      void handleEditClick();
    });
  }

  if (promptDeleteButton) {
    promptDeleteButton.addEventListener('click', () => {
      void handleDeleteClick();
    });
  }

  const prompts = await loadLLMPrompts();
  renderPromptsList(prompts);

  // Listen for storage changes to update UI when options are restored/imported
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, LLM_PROMPTS_KEY)) {
        return;
      }
      void (async () => {
        const prompts = await loadLLMPrompts();
        renderPromptsList(prompts);
        // Clear selection if selected prompt no longer exists
        if (selectedPromptId && !prompts.find(p => p.id === selectedPromptId)) {
          selectedPromptId = null;
          if (promptDetails) promptDetails.hidden = true;
        }
        // Clear editing state if editing prompt no longer exists
        if (currentlyEditingPromptId && !prompts.find(p => p.id === currentlyEditingPromptId)) {
          currentlyEditingPromptId = null;
          clearForm();
        }
        // Update details if the selected prompt still exists
        if (selectedPromptId) {
          const prompt = prompts.find(p => p.id === selectedPromptId);
          if (prompt) {
            if (promptDetails) promptDetails.hidden = false;
            if (promptDetailName) promptDetailName.textContent = prompt.name;
            if (promptDetailText) promptDetailText.textContent = prompt.prompt;
            if (promptDetailCreated) {
              promptDetailCreated.textContent = formatTimestamp(prompt.createdAt);
            }
            if (promptDetailUpdated) {
              promptDetailUpdated.textContent = formatTimestamp(prompt.updatedAt);
            }
          }
        }
      })();
    });
  }
}

initLLMPrompts();
