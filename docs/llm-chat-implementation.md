# LLM Chat Implementation Summary

## Overview

This document describes the implementation of the LLM chat feature, which allows users to collect page content as markdown and automatically inject it into LLM provider pages along with custom prompts.

## Architecture

The implementation follows the Bear Talk architecture pattern with the following components:

### 1. LLM Provider Configuration (`src/shared/llmProviders.js`)

- **Purpose**: Centralized configuration for all supported LLM providers
- **Features**:
  - Provider metadata (name, URL, send button selector)
  - URL pattern matching utilities
  - Helper functions to identify LLM pages

**Supported Providers**:
- ChatGPT (https://chatgpt.com)
- ChatGPT with Search (https://chatgpt.com?hints=search)
- Gemini (https://gemini.google.com)
- Claude (https://claude.ai)
- Perplexity (https://www.perplexity.ai)

### 2. LLM Page Injector (`src/contentScript/llmPageInjector.js`)

- **Purpose**: Content script that injects markdown files and prompts into LLM provider pages
- **Key Features**:
  - Waits for contenteditable editor to be ready
  - Injects local files (screenshots, PDFs) via clipboard events
  - Injects page content as markdown file attachments
  - Injects user prompt text using multiple fallback methods
  - Auto-triggers send button if specified

**Injection Methods** (with fallbacks):
1. `execCommand` (legacy, works on many sites)
2. Selection API with DOM manipulation
3. Simple `textContent` assignment
4. Framework-specific events

### 3. Background Script Enhancement (`src/background/index.js`)

**New Functions Added**:

- `injectLLMPageInjector(tabId)`: Injects the LLM page injector content script
- `waitForTabReady(tabId, timeout)`: Waits for a tab to finish loading
- `openOrReuseLLMTabs(currentTab, selectedLLMProviders, contents)`: Main orchestration function that:
  - Reuses current tab if it's already an LLM page
  - Creates new tabs for additional providers
  - Injects content script and sends data to each tab
  - Activates the first LLM tab

**New Message Handler**:
- `collect-and-send-to-llm`: Collects page content from highlighted/active tabs, captures screenshot for single-tab selections, and opens/injects content into LLM provider pages

### 4. Chat Page Updates (`src/popup/chat.js`)

**Modified Function**:
- `handleSend()`: Now sends a single message to background script (`collect-and-send-to-llm`) which handles the entire workflow

**Simplified Flow**:
1. User clicks send button
2. Message sent to background with tab IDs, providers, and prompt
3. Background collects content and injects into LLM pages
4. Popup closes automatically

## User Workflow

1. User opens chat page (via keyboard shortcut or popup)
2. User selects target tabs (highlighted or active)
3. User types prompt (can use `/` to select saved prompts)
4. User selects LLM providers (can use `@` to select providers)
5. User clicks Send or presses Cmd/Ctrl+Enter
6. Extension:
   - Collects page content from selected tabs as markdown
   - Captures screenshot for single-tab selection
   - Opens or reuses LLM provider tabs
   - Injects markdown files as attachments
   - Injects user prompt
   - Auto-triggers send button
7. User receives LLM response with full page context

## Key Features

### Screenshot Capture
- Automatically captures visible tab as screenshot when only one tab is selected
- Attached as first file in the LLM conversation
- Only captured if the tab is not an LLM page

### Tab Reuse
- If current tab is already an LLM provider page, it will be reused
- Avoids creating duplicate tabs
- Maintains user's workflow continuity

### Selected Text Priority
- If user has selected text on a page, it's wrapped in `<selectedText>` tags
- Markdown content includes instruction to prioritize selected text
- Helps LLM focus on specific portions of the page

### Markdown File Metadata
- Each tab's content is converted to a markdown file
- File includes metadata: page title, URL
- Instructions embedded for LLM to treat it as page content

## Error Handling

- Graceful degradation if content extraction fails
- Multiple fallback methods for prompt injection
- Timeout handling for tab loading
- Console logging for debugging

## Testing Checklist

- [ ] Single tab selection with screenshot
- [ ] Multiple tab selection (no screenshot)
- [ ] Reusing existing LLM tab
- [ ] Opening new LLM tabs
- [ ] ChatGPT injection and send
- [ ] Gemini injection and send
- [ ] Claude injection and send
- [ ] Perplexity injection and send
- [ ] Selected text priority
- [ ] YouTube content extraction
- [ ] Notion content extraction
- [ ] General page content extraction

## Future Enhancements

1. **File Attachments**: Allow users to attach local files from their computer
2. **Custom Instructions**: Per-provider custom system prompts
3. **Conversation History**: Save and restore LLM conversations
4. **Batch Processing**: Process multiple prompts across multiple tabs
5. **Provider Auto-Detection**: Detect best provider based on task type
6. **Rate Limiting**: Handle provider rate limits gracefully

## References

- Bear Talk Implementation Guide: `references/features/llm/bear-talk-implementation-guide.md`
- LLM Providers Config: `src/shared/llmProviders.js`
- Page Content Collector: `src/contentScript/pageContentCollector.js`

