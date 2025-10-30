/* global chrome */

/**
 * LLM Page Injector
 * Injects markdown files and prompts into LLM provider pages
 */

(function () {
  'use strict';

  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector
   * @param {number} timeout
   * @returns {Promise<Element | null>}
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Wait for an element to disappear from the DOM
   * @param {string} selector
   * @param {number} timeout
   * @returns {Promise<boolean>}
   */
  function waitForElementToDisappear(selector, timeout = 10000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (!element) {
        resolve(true);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(true);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  /**
   * Inject prompt content into the editor using multiple fallback methods
   * @param {HTMLElement} editor
   * @param {string} promptText
   * @returns {void}
   */
  function injectPromptContent(editor, promptText) {
    editor.focus();

    // Try multiple methods in order
    const methods = [
      injectPromptContentViaExecCommand,
      injectPromptContentViaSelectionAPI,
      injectPromptContentViaTextContent,
      injectPromptContentViaFrameworkEvents,
    ];

    for (const method of methods) {
      try {
        if (method(editor, promptText)) {
          console.log(
            '[llmPageInjector] Successfully injected prompt using',
            method.name,
          );
          return;
        }
      } catch (error) {
        console.warn('[llmPageInjector] Method failed:', method.name, error);
      }
    }

    console.warn('[llmPageInjector] All injection methods failed');
  }

  /**
   * Method 1: execCommand (legacy but works on many sites)
   * @param {HTMLElement} editor
   * @param {string} promptText
   * @returns {boolean}
   */
  function injectPromptContentViaExecCommand(editor, promptText) {
    try {
      if (document.execCommand) {
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertText', false, promptText);
        return true;
      }
    } catch (error) {
      console.log('[llmPageInjector] execCommand failed', error);
    }
    return false;
  }

  /**
   * Method 2: Selection API with DOM manipulation
   * @param {HTMLElement} editor
   * @param {string} promptText
   * @returns {boolean}
   */
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
      console.log('[llmPageInjector] Selection API failed', error);
    }
    return false;
  }

  /**
   * Method 3: Simple textContent
   * @param {HTMLElement} editor
   * @param {string} promptText
   * @returns {boolean}
   */
  function injectPromptContentViaTextContent(editor, promptText) {
    try {
      editor.textContent = promptText;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (error) {
      console.log('[llmPageInjector] textContent failed', error);
    }
    return false;
  }

  /**
   * Method 4: Framework-specific events
   * @param {HTMLElement} editor
   * @param {string} promptText
   * @returns {boolean}
   */
  function injectPromptContentViaFrameworkEvents(editor, promptText) {
    try {
      ['input', 'change', 'keyup', 'keydown'].forEach((eventType) => {
        editor.dispatchEvent(
          new Event(eventType, { bubbles: true, cancelable: true }),
        );
      });

      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: promptText,
        }),
      );

      return true;
    } catch (error) {
      console.log('[llmPageInjector] Framework events failed', error);
    }
    return false;
  }

  /**
   * Auto-trigger send button
   * @param {string} selector
   * @returns {Promise<void>}
   */
  async function autoTriggerSend(selector) {
    if (!selector) return;

    console.log('[llmPageInjector] Waiting for send button:', selector);

    // Wait for send button to become enabled
    const sendButton = await waitForElement(selector, 10000);
    if (sendButton) {
      console.log('[llmPageInjector] Clicking send button');
      /** @type {HTMLElement} */ (sendButton).click();
    } else {
      console.warn('[llmPageInjector] Send button not found or not enabled');
    }
  }

  /**
   * Main message handler
   */
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type !== 'inject-llm-data') return;

    console.log('[llmPageInjector] Received inject-llm-data message', message);

    const { tabs, promptContent, files, sendButtonSelector } = message;

    if ((!tabs || tabs.length === 0) && (!files || files.length === 0)) {
      console.warn('[llmPageInjector] No data to inject');
      return;
    }

    // Wait for editor to be ready
    const editor = await waitForElement('[contenteditable="true"]', 10000);
    if (!editor) {
      console.warn('[llmPageInjector] Timed out waiting for prompt editor');
      return;
    }

    console.log('[llmPageInjector] Found editor, starting injection');

    // 1. Attach local files (screenshots, PDFs, etc.)
    if (files && files.length > 0) {
      console.log('[llmPageInjector] Attaching', files.length, 'local files');
      for (const f of files) {
        try {
          const blob = await (await fetch(f.dataUrl)).blob();
          const file = new File([blob], f.name, {
            type: f.type || blob.type,
          });
          const dt = new DataTransfer();
          dt.items.add(file);

          const pasteEvt = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          });
          editor.dispatchEvent(pasteEvt);
          console.log('[llmPageInjector] Attached file:', f.name);
        } catch (err) {
          console.error(
            '[llmPageInjector] Failed to attach local file',
            f,
            err,
          );
        }
      }
    }

    // 2. Attach tab contents as markdown files
    if (tabs && tabs.length > 0) {
      console.log('[llmPageInjector] Attaching', tabs.length, 'markdown files');
      tabs.forEach((tab, idx) => {
        const { title, url, content } = tab;
        if (!content) return;

        // Create markdown file with metadata
        const fileContent = `Please treat this as the content of a web page titled "${
          title || `Tab ${idx + 1}`
        }" (URL: ${url}). If a <selectedText> section is present, please pay special attention to it and consider it higher priority than the rest of the content.

---

${content || '<no content>'}`;

        const fileName = `${(title || `tab-${idx + 1}`).replace(
          /[^a-z0-9\-_]+/gi,
          '_',
        )}.md`;
        const file = new File([fileContent], fileName, {
          type: 'text/markdown',
          lastModified: Date.now(),
        });

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
        });
        editor.dispatchEvent(pasteEvent);
        console.log('[llmPageInjector] Attached markdown file:', fileName);
      });
    }

    // Wait for file uploads to complete
    if ((files && files.length > 0) || (tabs && tabs.length > 0)) {
      console.log('[llmPageInjector] Waiting for uploads to complete...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 3. Inject prompt content into editor
    if (promptContent) {
      console.log('[llmPageInjector] Injecting prompt content');
      const normalizedPrompt = promptContent.replace(/[\r\n]+/g, ' ');
      injectPromptContent(editor, normalizedPrompt);

      // 4. Auto-trigger send button
      if (sendButtonSelector) {
        console.log('[llmPageInjector] Auto-triggering send');
        await new Promise((resolve) => setTimeout(resolve, 500));
        await autoTriggerSend(sendButtonSelector);
      }
    }

    // Notify background script that injection is complete
    chrome.runtime.sendMessage({ type: 'llm-injection-complete' });
    console.log('[llmPageInjector] Injection complete');
  });

  console.log('[llmPageInjector] Content script loaded');
})();
