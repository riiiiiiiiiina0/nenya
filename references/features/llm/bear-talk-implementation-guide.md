# Bear Talk Implementation Guide

This document describes how the Bear Talk extension implements page content extraction, prompt management, and LLM context injection. This serves as a reference for implementing similar features in other projects.

---

## Table of Contents

1. [Getting Page Content as Markdown](#1-getting-page-content-as-markdown)
2. [Managing Saved Prompts](#2-managing-saved-prompts)
3. [Collecting and Sending Content to LLM Pages](#3-collecting-and-sending-content-to-llm-pages)

---

## 1. Getting Page Content as Markdown

### Architecture Overview

The content extraction system uses a **strategy pattern** where different content scripts handle different websites:

- **General pages**: Using Mozilla's Readability + Turndown
- **YouTube**: Extracting video metadata and captions
- **Reddit**: Custom extraction for Reddit posts
- **Notion**: Custom extraction for Notion pages

### Key Components

#### 1.1 Content Script Registration System

The `pageContent.js` module manages content script injection based on URL patterns:

```javascript
// Define script bundles for different page types
const generalScripts = [
  'libs/turndown.7.2.0.js',
  'libs/turndown-plugin-gfm.1.0.2.js',
  'components/contentScripts/general/getContent.js',
  ...sharedScripts,
];

const youtubeScripts = [
  'components/contentScripts/youtube/getContent.js',
  ...sharedScripts,
];
```

**URL Pattern Matching:**
```javascript
function injectScriptToGetPageContent(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    const tabUrl = tab.url || '';
    let scripts = [];
    
    if (/^https?:\/\/(?:www\.)?youtube\.com\/watch/.test(tabUrl)) {
      scripts = youtubeScripts;
    } else if (/^https?:\/\/(?:www\.)?reddit\.com\//.test(tabUrl)) {
      scripts = redditScripts;
    } else if (/^https?:\/\/(?:www\.)?notion\.so/.test(tabUrl)) {
      scripts = notionScripts;
    } else {
      scripts = generalScripts;
    }
    
    injectContentScripts(tabId, scripts);
  });
}
```

#### 1.2 General Page Content Extraction

**Implementation** (`contentScripts/general/getContent.js`):

```javascript
async function getGeneralPageContent() {
  // 1. Clone the document to avoid mutating the live page
  const clone = document.cloneNode(true);
  
  // 2. Remove unwanted elements
  clone.querySelectorAll(
    'script, style, noscript, iframe, svg, canvas, img, video, ' +
    'header, footer, nav, aside, [hidden], [aria-hidden="true"]'
  ).forEach((el) => el.remove());
  
  // 3. Convert HTML to Markdown using TurndownService
  const turndownService = new TurndownService({
    headingStyle: 'atx',        // # H1
    codeBlockStyle: 'fenced',   // ```js
    bulletListMarker: '-',       // - list item
    emDelimiter: '*',           // *italic*
    strongDelimiter: '**',      // **bold**
    hr: '---',
    br: '\n',
    linkStyle: 'inlined',       // [text](url)
    linkReferenceStyle: 'full',
  });
  
  // 4. Use GitHub Flavored Markdown plugin for tables, strikethrough, etc.
  turndownService.use(turndownPluginGfm.gfm);
  
  // 5. Add custom rule to drop empty paragraphs
  turndownService.addRule('dropEmpty', {
    filter: (node) =>
      node.nodeName === 'P' &&
      !node.textContent.trim() &&
      !node.querySelector('img'),
    replacement: () => '',
  });
  
  const markdown = turndownService.turndown(clone.body.innerHTML);
  return markdown;
}

// Register the content getter function
window['getContent'] = getGeneralPageContent;
```

**Key Libraries Used:**
- **TurndownService** (v7.2.0): HTML to Markdown converter
- **turndown-plugin-gfm** (v1.0.2): GitHub Flavored Markdown support (tables, strikethrough, task lists)

#### 1.3 YouTube Content Extraction

**Special Handling** (`contentScripts/youtube/getContent.js`):

```javascript
async function getYouTubeContent() {
  // 1. Check if subtitles are available
  const btn = await waitForElement('.ytp-subtitles-button', 5_000);
  const available = btn && !btn.title.includes('unavailable');
  
  let captions = 'no captions';
  
  if (available) {
    // 2. Try to fetch cached captions from background service worker first
    captions = await getCaptionsFromBackgroundScript();
    
    // 3. If no cached captions, extract from DOM
    if (!captions) {
      // Expand video description
      const description = await waitForElement('ytd-watch-metadata #description', 3_000);
      description.click();
      
      // Click "Show transcript" button
      const transcriptBtn = await waitForElement(
        'ytd-video-description-transcript-section-renderer #primary-button button',
        2_000
      );
      transcriptBtn.click();
      
      // Wait for transcript list and scroll to load lazy segments
      const list = await waitForElement('.ytd-transcript-segment-list-renderer', 3_000);
      list.scrollTop = list.scrollHeight;
      await sleep(300);
      
      // Extract captions with timestamps
      captions = Array.from(list.children)
        .map((child) => {
          const ts = child.querySelector('.segment-timestamp')?.textContent?.trim();
          const txt = child.querySelector('.segment-text')?.textContent?.trim();
          return ts && txt ? `${ts}: ${txt}` : null;
        })
        .filter(Boolean)
        .join('\n');
    }
  }
  
  // 4. Extract video metadata
  const title = document.querySelector('ytd-watch-metadata #title')?.textContent?.trim();
  const description = document.querySelector('ytd-watch-metadata #description')?.textContent;
  const channel = document.querySelector('ytd-channel-name yt-formatted-string')?.textContent?.trim();
  
  // 5. Return formatted content
  return [
    `Video title: ${title}`,
    `Description: ${description}`,
    `Channel: ${channel}`,
    `Captions:\n${captions}`,
  ].join('\n\n');
}

window['getContent'] = getYouTubeContent;
```

#### 1.4 Shared Content Collection System

**Implementation** (`contentScripts/shared/pageContentCollector.js`):

This shared module collects content from any content script that registers a `window.getContent` function:

```javascript
async function collectAndSendPageContent() {
  const result = {
    type: 'page-content-collected',
    title: document.title,
    url: document.location.href,
    content: '',
  };
  
  // 1. Check if a content getter function has been registered
  if (typeof window['getContent'] !== 'function') {
    console.error('No window.getContent function registered');
    chrome.runtime.sendMessage(result);
    return;
  }
  
  // 2. Call the registered content getter
  const content = await window['getContent']();
  
  // 3. Include any user-selected text
  const sel = window.getSelection();
  const selectedText = sel ? sel.toString().trim() : '';
  
  // 4. Wrap content in XML tags for structure
  let formattedContent = [];
  if (selectedText) {
    formattedContent.push(`<selectedText>\n${selectedText}\n</selectedText>`);
  }
  formattedContent.push(`<content>\n${content || 'no content'}\n</content>`);
  
  // 5. Send back to background script
  chrome.runtime.sendMessage({
    ...result,
    content: formattedContent.join('\n\n'),
  });
}

// Auto-execute after content scripts have registered
setTimeout(collectAndSendPageContent, 100);
```

**Key Design Patterns:**
- **Registration Pattern**: Each content script registers its extractor as `window['getContent']`
- **Wrapper Pattern**: The collector wraps all content extractors with consistent message handling
- **Selected Text Priority**: User-selected text is marked with `<selectedText>` tags for LLM attention

#### 1.5 Background Script Collection Flow

**Implementation** (`background.js`):

```javascript
async function collectPageContentOneByOne(tabsToProcess) {
  isProcessing = true;
  await showLoadingBadge(); // Show animated clock badge
  
  const results = [];
  
  try {
    for (const tab of tabsToProcess) {
      // Inject scripts and collect content for each tab
      const content = await collectPageContent(tab);
      results.push(content);
    }
    
    // Clear badge if any collection failed
    if (results.some((r) => r === null || r.content === '')) {
      await clearLoadingBadge();
      isProcessing = false;
    }
    
    return results;
  } catch (err) {
    await clearLoadingBadge();
    isProcessing = false;
    throw err;
  }
}

async function collectPageContent(tabId, timeout = 10_000) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }
    
    // Set up message listener for content
    const onMessage = (message, sender) => {
      if (sender?.tab?.id !== tabId) return;
      if (!message || typeof message.content !== 'string') return;
      
      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(onMessage);
      
      resolve({
        tabId,
        title: message.title || '',
        url: message.url || '',
        content: message.content,
      });
    };
    
    chrome.runtime.onMessage.addListener(onMessage);
    
    // Fallback timeout
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(null);
    }, timeout);
    
    // Start extraction chain
    injectScriptToGetPageContent(tabId);
  });
}
```

---

## 2. Managing Saved Prompts

### Architecture Overview

The prompt management system stores prompts in Chrome's `sync` storage and provides a full CRUD interface through the options page.

### Key Components

#### 2.1 Data Model

```javascript
const PROMPTS_STORAGE_KEY = 'savedPrompts';

// Prompt structure
interface Prompt {
  id: string;              // Unique ID generated from timestamp + random
  name: string;            // Display name (max 50 chars)
  content: string;         // Prompt text (max 2000 chars)
  requireSearch: boolean;  // Flag for search-enabled LLM variants
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}
```

#### 2.2 Storage Operations

**Get Prompts:**
```javascript
async function getPrompts() {
  try {
    const result = await chrome.storage.sync.get([PROMPTS_STORAGE_KEY]);
    return result[PROMPTS_STORAGE_KEY] || [];
  } catch (error) {
    console.error('Error getting prompts:', error);
    return [];
  }
}
```

**Save Prompts:**
```javascript
async function savePrompts(promptsArray) {
  try {
    await chrome.storage.sync.set({ [PROMPTS_STORAGE_KEY]: promptsArray });
  } catch (error) {
    console.error('Error saving prompts:', error);
    throw error;
  }
}
```

**Generate Unique ID:**
```javascript
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
```

#### 2.3 CRUD Operations

**Create Prompt:**
```javascript
async function createPrompt(name, content) {
  const newPrompt = {
    id: generateId(),
    name: name.trim(),
    content: content.trim(),
    requireSearch: Boolean(promptRequireSearchInput?.checked),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Add to beginning (newest first)
  prompts.unshift(newPrompt);
  await savePrompts(prompts);
  
  // Trigger auto backup to Raindrop (if enabled)
  chrome.runtime.sendMessage({
    type: 'schedule_auto_backup',
    reason: 'prompt_created',
  });
}
```

**Update Prompt:**
```javascript
async function updatePrompt(id, name, content) {
  const promptIndex = prompts.findIndex((p) => p.id === id);
  if (promptIndex === -1) {
    throw new Error('Prompt not found');
  }
  
  const updatedPrompt = {
    ...prompts[promptIndex],
    name: name.trim(),
    content: content.trim(),
    requireSearch: Boolean(promptRequireSearchInput?.checked),
    updatedAt: new Date().toISOString(),
  };
  
  // Remove old entry and move updated one to top
  prompts.splice(promptIndex, 1);
  prompts.unshift(updatedPrompt);
  
  await savePrompts(prompts);
  
  chrome.runtime.sendMessage({
    type: 'schedule_auto_backup',
    reason: 'prompt_updated',
  });
}
```

**Delete Prompt:**
```javascript
async function deletePrompt(id) {
  prompts = prompts.filter((p) => p.id !== id);
  await savePrompts(prompts);
  
  chrome.runtime.sendMessage({
    type: 'schedule_auto_backup',
    reason: 'prompt_deleted',
  });
}
```

#### 2.4 Validation

```javascript
function validatePrompt(name, content) {
  if (!name.trim()) {
    return 'Prompt name is required';
  }
  if (name.trim().length > 50) {
    return 'Prompt name must be 50 characters or less';
  }
  if (!content.trim()) {
    return 'Prompt content is required';
  }
  if (content.trim().length > 2000) {
    return 'Prompt content must be 2000 characters or less';
  }
  
  // Check for duplicate names (excluding current prompt when editing)
  const existingPrompt = prompts.find(
    (p) =>
      p.name.toLowerCase() === name.trim().toLowerCase() &&
      p.id !== editingPromptId,
  );
  if (existingPrompt) {
    return 'A prompt with this name already exists';
  }
  
  return null; // Valid
}
```

#### 2.5 Prompt Selection in Popup

**Loading Prompts:**
```javascript
async function createPromptsMenu() {
  allPrompts = await getPrompts();
  renderPrompts(allPrompts);
  
  // Add search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredPrompts = allPrompts.filter(
      (prompt) =>
        prompt.name.toLowerCase().includes(searchTerm) ||
        prompt.content.toLowerCase().includes(searchTerm),
    );
    promptsSelectedIndex = 0;
    renderPrompts(filteredPrompts);
    applyPromptSelectionHighlight();
  });
}
```

**Rendering Prompts:**
```javascript
function renderPrompts(prompts) {
  promptsList.innerHTML = '';
  
  if (prompts.length === 0) {
    promptsList.innerHTML = '<div class="text-center text-gray-500 p-4">No prompts found</div>';
    return;
  }
  
  prompts.forEach((prompt) => {
    const menuItem = document.createElement('div');
    menuItem.className = 'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-base-200';
    menuItem.dataset.promptId = prompt.id;
    
    const snippet = prompt.content.substring(0, 100);
    const badgeHtml = prompt.requireSearch
      ? '<span class="badge badge-xs badge-primary">Search</span>'
      : '';
    
    menuItem.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="font-medium leading-tight flex gap-1">${prompt.name}${badgeHtml}</div>
        <div class="text-xs text-base-content/60 leading-tight mt-0.5">
          ${snippet}${prompt.content.length > 100 ? '...' : ''}
        </div>
      </div>
    `;
    
    // Click handler to insert prompt
    menuItem.addEventListener('click', () => {
      const textarea = document.getElementById('prompt-textarea');
      if (textarea) {
        // Handle slash trigger position for inline insertion
        if (slashTriggerPos !== null) {
          const before = textarea.value.slice(0, slashTriggerPos);
          const after = textarea.value.slice(slashTriggerPos + 1);
          textarea.value = before + prompt.content + after;
          textarea.selectionStart = textarea.selectionEnd = before.length + prompt.content.length;
          slashTriggerPos = null;
        } else {
          textarea.value += prompt.content;
        }
        textarea.focus();
      }
      
      // Auto-switch to search-enabled LLM if prompt requires it
      if (prompt.requireSearch && selectedLLMProviders.includes('chatgpt')) {
        selectedLLMProviders = selectedLLMProviders.filter(p => p !== 'chatgpt');
        if (!selectedLLMProviders.includes('chatgpt_search')) {
          selectedLLMProviders.push('chatgpt_search');
        }
        updateAIButtonIcon(selectedLLMProviders);
      }
      
      hidePopups();
    });
    
    promptsList.appendChild(menuItem);
  });
}
```

**Keyboard Navigation:**
```javascript
// Slash (/) trigger - Opens prompt selector
textarea.addEventListener('keydown', (e) => {
  if (e.key === '/') {
    slashTriggerPos = textarea.selectionStart;
    showPopup('prompts-popup');
    setTimeout(() => initPromptsPopup(), 50);
  }
});

// Arrow key navigation
document.addEventListener('keydown', (e) => {
  const promptsPopup = document.getElementById('prompts-popup');
  if (!promptsPopup || promptsPopup.classList.contains('invisible')) return;
  
  const promptsList = promptsPopup.querySelectorAll('[data-prompt-id]');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    promptsSelectedIndex = (promptsSelectedIndex + 1) % promptsList.length;
    promptsList[promptsSelectedIndex].focus();
    applyPromptSelectionHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    promptsSelectedIndex = (promptsSelectedIndex - 1 + promptsList.length) % promptsList.length;
    promptsList[promptsSelectedIndex].focus();
    applyPromptSelectionHighlight();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    promptsList[promptsSelectedIndex].click();
  }
});
```

#### 2.6 Import/Export

**Export Prompts:**
```javascript
exportPromptsBtn.addEventListener('click', () => {
  if (prompts.length === 0) {
    showStatus('No prompts to export.', true);
    return;
  }
  
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const filename = `beartalk-prompts-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
  
  const jsonStr = JSON.stringify(prompts, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
  showStatus('Prompts exported successfully!');
});
```

**Import Prompts:**
```javascript
importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    if (!Array.isArray(imported)) {
      throw new Error('Invalid file format');
    }
    
    const validImports = imported.filter(
      (p) => p && typeof p.name === 'string' && typeof p.content === 'string',
    );
    
    if (validImports.length === 0) {
      showStatus('No valid prompts found in file.', true);
      return;
    }
    
    // Filter out duplicates by name
    const existingNames = new Set(prompts.map((p) => p.name.toLowerCase()));
    const newPrompts = validImports
      .filter((p) => !existingNames.has(p.name.toLowerCase()))
      .map((p) => ({
        id: p.id || generateId(),
        name: p.name.trim(),
        content: p.content.trim(),
        requireSearch: Boolean(p.requireSearch),
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    
    if (newPrompts.length === 0) {
      showStatus('All prompts in file already exist.', true);
      return;
    }
    
    prompts = [...prompts, ...newPrompts];
    await savePrompts(prompts);
    filterPrompts(searchInput?.value || '');
    showStatus(`${newPrompts.length} prompts imported successfully!`);
  } catch (error) {
    showStatus('Error importing prompts. Please ensure the file is valid JSON.', true);
  }
});
```

#### 2.7 Drag & Drop Reordering

**Implementation:**
```javascript
let draggedPromptId = null;

function handleDragStart(e) {
  const row = e.currentTarget;
  draggedPromptId = row.getAttribute('data-prompt-id');
  row.classList.add('opacity-50');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedPromptId);
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('ring', 'ring-blue-400');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('ring', 'ring-blue-400');
}

function handleDrop(e) {
  e.preventDefault();
  const row = e.currentTarget;
  row.classList.remove('ring', 'ring-blue-400');
  
  const targetPromptId = row.getAttribute('data-prompt-id');
  if (!draggedPromptId || draggedPromptId === targetPromptId) return;
  
  // Reorder in array
  const srcIndex = prompts.findIndex((p) => p.id === draggedPromptId);
  const destIndex = prompts.findIndex((p) => p.id === targetPromptId);
  
  if (srcIndex === -1 || destIndex === -1) return;
  
  const [moved] = prompts.splice(srcIndex, 1);
  prompts.splice(destIndex, 0, moved);
  
  // Persist and re-render
  savePrompts(prompts).then(() => {
    filterPrompts(currentSearchTerm);
  });
}

function handleDragEnd() {
  document.querySelectorAll('tr[data-prompt-id]')
    .forEach((r) => r.classList.remove('opacity-50', 'ring', 'ring-blue-400'));
  draggedPromptId = null;
}

// Attach handlers to prompt rows
document.querySelectorAll('tr[data-prompt-id]').forEach((row) => {
  row.addEventListener('dragstart', handleDragStart);
  row.addEventListener('dragover', handleDragOver);
  row.addEventListener('dragleave', handleDragLeave);
  row.addEventListener('drop', handleDrop);
  row.addEventListener('dragend', handleDragEnd);
});
```

---

## 3. Collecting and Sending Content to LLM Pages

### Architecture Overview

The system collects page content as markdown files, captures screenshots (for single tab selections), and injects them into LLM pages using clipboard events.

### Flow Diagram

```
Popup Selection → Background Collection → LLM Tab Creation/Reuse → Content Injection → Auto Send
```

### Key Components

#### 3.1 Popup - User Selection

**Tab Selection:**
```javascript
async function createTabsMenu() {
  // Get all tabs
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    allTabs = tabs.filter((tab) => tab.url && tab.url.startsWith('http'));
    
    // Get highlighted tabs to determine default selection
    chrome.tabs.query({ currentWindow: true, highlighted: true }, (highlightedTabs) => {
      const activeTab = allTabs.find((tab) => tab.active);
      
      // Pre-select highlighted tabs or active tab (excluding LLM pages)
      let tabsToPreSelect = highlightedTabs.length > 1 ? highlightedTabs : [activeTab];
      tabsToPreSelect = tabsToPreSelect.filter((tab) => !isLLMPage(tab.url));
      
      selectedTabIds = tabsToPreSelect.map((tab) => tab.id);
      renderTabs(allTabs);
      updateSelectedTabsDisplay();
    });
  });
}
```

**Send to LLM:**
```javascript
async function sendPromptToLLM() {
  if (isSending) return;
  isSending = true;
  
  const textarea = document.getElementById('prompt-textarea');
  let promptText = textarea ? textarea.value.trim() : '';
  
  // Serialize selected local files to data URLs
  const serializedFiles = await Promise.all(
    selectedFiles.map((file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            name: file.name,
            type: file.type,
            dataUrl: reader.result,
          });
        };
        reader.readAsDataURL(file);
      }),
    ),
  );
  
  // Append URL context list to prompt
  if (promptText && selectedTabIds.length > 0) {
    const selectedTabs = allTabs.filter((tab) => selectedTabIds.includes(tab.id));
    const urlList = selectedTabs
      .map((tab, index) => {
        const isLast = index === selectedTabs.length - 1;
        return `- ${tab.url}${isLast ? '' : ','}`;
      })
      .join('\n');
    promptText += `\n\n| Context:\n${urlList}`;
  }
  
  // Send message to background script
  const llmProviders = selectedLLMProviders.length > 0 
    ? selectedLLMProviders 
    : await getSelectedLLMProviders();
  
  chrome.runtime.sendMessage({
    type: 'collect-page-content',
    tabIds: selectedTabIds,
    llmProviders,
    promptContent: promptText,
    localFiles: serializedFiles,
  });
  
  // Close popup
  setTimeout(() => window.close(), 100);
}
```

#### 3.2 Background - Content Collection

**Main Handler:**
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'collect-page-content' && Array.isArray(message.tabIds)) {
    showLoadingBadge();
    
    collectPageContentOneByOne(message.tabIds).then(async (contents) => {
      collectedContents = contents;
      selectedPromptContent = message.promptContent || null;
      selectedLocalFiles = message.localFiles || [];
      
      // Append language instruction if specified
      const replyLang = await getReplyLanguage();
      if (replyLang && replyLang !== REPLY_LANG_DEFAULT && replyLang !== REPLY_LANG_CUSTOM) {
        const langName = REPLY_LANGUAGE_META[replyLang]?.name || replyLang;
        const instruction = `Please reply in ${langName}.`;
        if (selectedPromptContent) {
          selectedPromptContent = `${selectedPromptContent}${
            selectedPromptContent.endsWith('.') ? '' : '.'
          }\n\n${instruction}`;
        } else {
          selectedPromptContent = instruction;
        }
      }
      
      // Get current tab to check if it's an LLM page
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const currentTab = tabs[0];
        const selectedLLMProviders = message.llmProviders || await getSelectedLLMProviders();
        
        // Capture screenshot if only current tab is selected and it's not an LLM page
        if (message.tabIds.length === 1 && 
            message.tabIds[0] === currentTab.id && 
            !isLLMPage(currentTab.url)) {
          const dataUrl = await chrome.tabs.captureVisibleTab(
            currentTab.windowId,
            { format: 'jpeg', quality: 80 }
          );
          if (dataUrl) {
            selectedLocalFiles.unshift({
              name: 'screenshot.jpg',
              type: 'image/jpeg',
              dataUrl,
            });
          }
        }
        
        // Open/reuse LLM tabs and inject content
        await openOrReuseLLMTabs(currentTab, selectedLLMProviders, collectedContents);
      });
    });
  }
});
```

**Screenshot Capture:**
```javascript
// Capture screenshot if only current tab is selected
if (message.tabIds.length === 1 && 
    message.tabIds[0] === tabId && 
    !isLLMPage(currentTab?.url)) {
  const dataUrl = await chrome.tabs.captureVisibleTab(
    currentTab.windowId,
    { format: 'jpeg', quality: 80 },
  );
  if (dataUrl) {
    selectedLocalFiles.unshift({
      name: 'screenshot.jpg',
      type: 'image/jpeg',
      dataUrl,
    });
  }
}
```

#### 3.3 LLM Tab Creation or Reuse

**Implementation:**
```javascript
const providersToOpen = [...selectedLLMProviders];
let firstTabToActivateId = null;

// Check if current tab can be reused
if (currentTab.url && isLLMPage(currentTab.url)) {
  for (const providerId of selectedLLMProviders) {
    if (currentTab.url.startsWith(LLM_PROVIDER_META[providerId].url)) {
      // Found a match, reuse this tab
      const index = providersToOpen.indexOf(providerId);
      if (index > -1) {
        providersToOpen.splice(index, 1);
      }
      
      // Inject into current tab
      const ok = await injectScriptToPasteFilesAsAttachments(currentTab.id);
      if (ok) {
        llmTabIds.push(currentTab.id);
        firstTabToActivateId = currentTab.id;
        
        await waitForTabReady(currentTab.id);
        chrome.tabs.sendMessage(currentTab.id, {
          type: 'inject-data',
          tabs: collectedContents,
          promptContent: selectedPromptContent,
          files: selectedLocalFiles,
          sendButtonSelector: LLM_PROVIDER_META[providerId]?.sendButtonSelector || null,
        });
      } else {
        await disableProviderAndNotify(providerId);
      }
      break;
    }
  }
}

// Create new tabs for remaining providers
const tabCreationPromises = providersToOpen.map((providerId) => {
  const meta = LLM_PROVIDER_META[providerId];
  if (!meta) return Promise.resolve(null);
  
  return chrome.tabs.create({
    url: meta.url,
    active: false,
  });
});

const createdTabs = await Promise.all(tabCreationPromises);

// Inject into new tabs
for (let i = 0; i < createdTabs.length; i++) {
  const newTab = createdTabs[i];
  const providerId = providersToOpen[i];
  
  if (newTab && newTab.id) {
    const ok = await injectScriptToPasteFilesAsAttachments(newTab.id);
    if (ok) {
      llmTabIds.push(newTab.id);
      await waitForTabReady(newTab.id);
      
      chrome.tabs.sendMessage(newTab.id, {
        type: 'inject-data',
        tabs: collectedContents,
        promptContent: selectedPromptContent,
        files: selectedLocalFiles,
        sendButtonSelector: LLM_PROVIDER_META[providerId]?.sendButtonSelector || null,
      });
    } else {
      await disableProviderAndNotify(providerId);
    }
  }
}

// Activate first tab
if (firstTabToActivateId) {
  await chrome.tabs.update(firstTabToActivateId, { active: true });
}
```

#### 3.4 Content Injection into LLM Page

**Implementation** (`contentScripts/llm/pasteFilesAsAttachments.js`):

```javascript
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'inject-data') {
    const { tabs, promptContent, files, sendButtonSelector } = message;
    
    if (tabs.length === 0 && files.length === 0) {
      console.warn('No data to paste.');
      return;
    }
    
    // Wait for editor to be ready
    const editor = await waitForElement('[contenteditable="true"]', 10_000);
    if (!editor) {
      console.warn('Timed out waiting for prompt editor.');
      return;
    }
    
    // 1. Attach local files (screenshots, PDFs, etc.)
    for (const f of files) {
      try {
        const blob = await (await fetch(f.dataUrl)).blob();
        const file = new File([blob], f.name, { type: f.type || blob.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        
        const pasteEvt = new ClipboardEvent('paste', { 
          clipboardData: dt, 
          bubbles: true, 
          cancelable: true 
        });
        editor.dispatchEvent(pasteEvt);
      } catch (err) {
        console.error('Failed to attach local file', f, err);
      }
    }
    
    // 2. Attach tab contents as markdown files
    tabs.forEach((tab, idx) => {
      const { title, url, content } = tab;
      if (!content) return;
      
      // Create markdown file with metadata
      const fileContent = `Please treat this as the content of a web page titled "${title || `Tab ${idx + 1}`}" (URL: ${url}). If a <selectedText> section is present, please pay special attention to it and consider it higher priority than the rest of the content.\n\n---\n\n${content || '<no content>'}`;
      
      const fileName = `${(title || `tab-${idx + 1}`).replace(/[^a-z0-9\-_]+/gi, '_')}.md`;
      const file = new File([fileContent], fileName, { 
        type: 'text/markdown', 
        lastModified: Date.now() 
      });
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      const pasteEvent = new ClipboardEvent('paste', { 
        clipboardData: dataTransfer, 
        bubbles: true, 
        cancelable: true 
      });
      editor.dispatchEvent(pasteEvent);
    });
    
    // Wait for file uploads to complete
    if (files.length > 0 || tabs.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 3. Inject prompt content into editor
    if (promptContent) {
      const normalizedPrompt = promptContent.replace(/[\r\n]+/g, ' ');
      injectPromptContent(editor, normalizedPrompt);
      
      // 4. Auto-trigger send button
      if (sendButtonSelector) {
        await autoTriggerSend(sendButtonSelector);
      }
    }
    
    // Notify background script that paste is complete
    chrome.runtime.sendMessage({ type: 'markdown-paste-complete' });
  }
});
```

**Prompt Injection Methods:**

The extension uses multiple fallback methods to inject prompt text:

```javascript
function injectPromptContent(editor, promptText) {
  editor.focus();
  
  const methods = [
    injectPromptContentViaExecCommand,
    injectPromptContentViaSelectionAPI,
    injectPromptContentViaTextContent,
    injectPromptContentViaFrameworkEvents,
  ];
  
  for (const method of methods) {
    if (method(editor, promptText)) {
      return;
    }
  }
}

// Method 1: execCommand (legacy but works on many sites)
function injectPromptContentViaExecCommand(editor, promptText) {
  try {
    if (document.execCommand) {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, promptText);
      return true;
    }
  } catch (error) {
    console.log('execCommand failed', error);
  }
  return false;
}

// Method 2: Selection API with DOM manipulation
function injectPromptContentViaSelectionAPI(editor, promptText) {
  try {
    editor.innerHTML = '';
    const textNode = document.createTextNode(promptText);
    editor.appendChild(textNode);
    
    // Position cursor at end
    const range = document.createRange();
    const selection = window.getSelection();
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    
    // Trigger events to notify framework
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
    console.log('Selection API failed', error);
  }
  return false;
}

// Method 3: Simple textContent
function injectPromptContentViaTextContent(editor, promptText) {
  editor.textContent = promptText;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// Method 4: Framework-specific events
function injectPromptContentViaFrameworkEvents(editor, promptText) {
  try {
    ['input', 'change', 'keyup', 'keydown'].forEach((eventType) => {
      editor.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });
    
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: promptText,
    }));
    
    return true;
  } catch (error) {
    console.log('Framework events failed', error);
  }
  return false;
}
```

**Auto-Trigger Send:**

```javascript
async function autoTriggerSend(selector) {
  if (!selector) return;
  
  const provider = getLLMProviderFromURL(window.location.href);
  
  // Wait for file loading to complete (provider-specific)
  if (provider === 'perplexity') {
    await waitForElementToDisappear('[data-testid="file-loading-icon"]', 10_000);
  }
  
  // Wait for send button to become enabled
  const sendButton = await waitForElement(selector, 10_000);
  if (sendButton) {
    sendButton.click();
  }
}
```

#### 3.5 LLM Provider Configuration

**Provider Metadata:**
```javascript
export const LLM_PROVIDER_META = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    sendButtonSelector: 'button#composer-submit-button:not([disabled])',
  },
  chatgpt_search: {
    name: 'ChatGPT with Search',
    url: 'https://chatgpt.com?hints=search',
    sendButtonSelector: 'button#composer-submit-button:not([disabled])',
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    sendButtonSelector: 'button.send-button:not([aria-disabled="true"])',
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    sendButtonSelector: 'button[data-testid="submit-button"]:not([disabled])',
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    sendButtonSelector: 'button[aria-label="Send message"]:not([disabled])',
  },
};
```

#### 3.6 Loading Badge Animation

**Implementation:**
```javascript
const loadingBadgeSequence = [
  '🕛', '🕐', '🕑', '🕒', '🕓', '🕔',
  '🕕', '🕖', '🕗', '🕘', '🕙', '🕚',
];

let loadingBadgeIndex = 0;
let loadingBadgeInterval = 0;

function startLoadingBadgeAnimation() {
  clearInterval(loadingBadgeInterval);
  loadingBadgeIndex = 0;
  
  loadingBadgeInterval = setInterval(() => {
    loadingBadgeIndex = (loadingBadgeIndex + 1) % loadingBadgeSequence.length;
    setActionButtonBadge(loadingBadgeSequence[loadingBadgeIndex]);
  }, 100);
}

function setActionButtonBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab && tab.id !== undefined) {
        chrome.action.setBadgeText({ text, tabId: tab.id });
      }
    }
  });
}

async function clearLoadingBadge() {
  stopLoadingBadgeAnimation();
  await chrome.action.setBadgeText({ text: '' });
  
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab && tab.id !== undefined) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    }
  });
}
```

---

## Summary

### Key Technologies

1. **Content Extraction**:
   - TurndownService (v7.2.0) - HTML to Markdown conversion
   - turndown-plugin-gfm (v1.0.2) - GitHub Flavored Markdown support
   - Custom extractors for YouTube, Reddit, Notion

2. **Storage**:
   - Chrome Storage Sync API - Prompt persistence
   - Chrome Storage Local API - LLM provider state

3. **UI**:
   - TailwindCSS - Utility-first styling
   - DaisyUI - Component library
   - Vanilla JavaScript - No build step required

4. **File Handling**:
   - DataTransfer API - File attachment simulation
   - ClipboardEvent API - Paste event simulation
   - FileReader API - Local file serialization

### Design Patterns

1. **Strategy Pattern**: Different content extractors for different websites
2. **Observer Pattern**: Message passing between background and content scripts
3. **Registry Pattern**: Content scripts register extractors via `window.getContent`
4. **Factory Pattern**: Dynamic script injection based on URL patterns
5. **Singleton Pattern**: Global state management in background script

### Best Practices

1. **IIFE Wrapping**: All content scripts wrapped in IIFEs to prevent global pollution
2. **Graceful Degradation**: Multiple fallback methods for content injection
3. **Timeout Handling**: All async operations have reasonable timeouts
4. **Loading States**: Visual feedback via animated badge during operations
5. **Error Handling**: Comprehensive try-catch with fallback behaviors
6. **Provider Disabling**: Auto-disable LLM providers that fail script injection
7. **Tab Reuse**: Reuse existing LLM tabs when possible to avoid clutter

---

## References

- [TurndownService Documentation](https://github.com/mixmark-io/turndown)
- [Chrome Extension API - Storage](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Chrome Extension API - Scripting](https://developer.chrome.com/docs/extensions/reference/scripting/)
- [DataTransfer API](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer)
- [ClipboardEvent API](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent)

