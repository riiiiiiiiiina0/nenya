/**
 * Emoji Picker Content Script
 * Shows an emoji picker panel and inserts selected emoji at cursor position
 * Uses an iframe-based approach for better isolation and ES module support
 */

(async () => {
  'use strict';

  // Prevent double-injection - toggle off if already active
  if (/** @type {any} */ (window).__nenyaEmojiPickerActive) {
    const existingFrame = document.querySelector('[data-nenya-emoji-picker]');
    if (existingFrame) {
      quitPicker();
    }
    return;
  }
  /** @type {any} */ (window).__nenyaEmojiPickerActive = true;

  const pickerUniqueId = `nenya-emoji-picker-${Date.now()}`;
  
  /** @type {HTMLIFrameElement | null} */
  let pickerFrame = null;
  
  /** @type {MessagePort | null} */
  let pickerFramePort = null;

  /** @type {Element | null} */
  let lastActiveElement = null;

  /** @type {{ start: number, end: number } | null} */
  let savedInputSelection = null;

  /** @type {Range | null} */
  let savedRange = null;

  /**
   * Save the current selection/cursor position before showing the picker
   */
  function saveSelection() {
    lastActiveElement = document.activeElement;
    
    // Save input/textarea selection
    if (
      lastActiveElement instanceof HTMLInputElement ||
      lastActiveElement instanceof HTMLTextAreaElement
    ) {
      savedInputSelection = {
        start: lastActiveElement.selectionStart ?? 0,
        end: lastActiveElement.selectionEnd ?? 0
      };
      return;
    }
    
    // Save contenteditable selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  /**
   * Insert text at cursor position in an input or textarea
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   * @param {string} text
   */
  function insertIntoInput(element, text) {
    const start = savedInputSelection?.start ?? element.selectionStart ?? 0;
    const end = savedInputSelection?.end ?? element.selectionEnd ?? 0;
    const value = element.value;

    element.value = value.substring(0, start) + text + value.substring(end);
    
    // Set cursor position after inserted text
    const newPos = start + text.length;
    element.setSelectionRange(newPos, newPos);
    
    // Trigger input event for frameworks that listen to it
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Insert text at cursor position in a contenteditable element
   * @param {string} text
   * @returns {boolean}
   */
  function insertIntoContentEditable(text) {
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    // Restore saved range if available
    if (savedRange) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    if (selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    
    // Move cursor after inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger input event
    const container = range.commonAncestorContainer;
    if (container instanceof HTMLElement || container.parentElement) {
      const target = container instanceof HTMLElement ? container : container.parentElement;
      if (target) {
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    
    return true;
  }

  /**
   * Insert emoji at the saved cursor position
   * @param {string} emoji
   */
  function insertEmoji(emoji) {
    if (!lastActiveElement) {
      return;
    }

    // Focus back to the element
    if (lastActiveElement instanceof HTMLElement) {
      lastActiveElement.focus();
    }

    // Handle input and textarea elements
    if (
      lastActiveElement instanceof HTMLInputElement ||
      lastActiveElement instanceof HTMLTextAreaElement
    ) {
      insertIntoInput(lastActiveElement, emoji);
      return;
    }

    // Handle contenteditable elements
    if (
      lastActiveElement instanceof HTMLElement &&
      (lastActiveElement.isContentEditable ||
        lastActiveElement.getAttribute('contenteditable') === 'true')
    ) {
      insertIntoContentEditable(emoji);
      return;
    }

    // Fallback: try to find any focused contenteditable or use document.execCommand
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.isContentEditable ||
        activeElement.getAttribute('contenteditable') === 'true')
    ) {
      activeElement.focus();
      insertIntoContentEditable(emoji);
    }
  }

  /**
   * Handle keydown events (for Escape key)
   * @param {KeyboardEvent} event
   */
  function handleKeyDown(event) {
    if (event.key === 'Escape' || event.which === 27) {
      event.stopPropagation();
      event.preventDefault();
      quitPicker();
    }
  }

  /**
   * Clean up and close the emoji picker
   */
  function quitPicker() {
    document.removeEventListener('keydown', handleKeyDown, true);

    if (pickerFramePort) {
      pickerFramePort.close();
      pickerFramePort = null;
    }

    if (pickerFrame) {
      pickerFrame.remove();
      pickerFrame = null;
    }

    /** @type {any} */ (window).__nenyaEmojiPickerActive = false;
  }

  /**
   * Handle messages from the picker iframe
   * @param {object} msg
   */
  function handlePickerMessage(msg) {
    switch (msg.what) {
      case 'ready':
        // Picker is ready
        break;
      case 'emojiSelected':
        if (msg.emoji) {
          insertEmoji(msg.emoji);
          quitPicker();
        }
        break;
      case 'close':
        quitPicker();
        break;
    }
  }

  /**
   * Bootstrap the emoji picker iframe
   * @returns {Promise<HTMLIFrameElement | null>}
   */
  async function bootstrap() {
    // Save selection before showing picker
    saveSelection();

    const pickerUrl = chrome.runtime.getURL('src/contentScript/emoji-picker-ui.html');

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-nenya-emoji-picker', pickerUniqueId);
      
      // Detect if OS theme is dark
      const isDarkMode = window.matchMedia && 
                        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const colorScheme = isDarkMode ? 'color-scheme: dark !important;' : '';
      
      iframe.style.cssText = `
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        ${colorScheme}
        display: block !important;
        height: 100vh !important;
        left: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        min-height: unset !important;
        min-width: unset !important;
        opacity: 1 !important;
        outline: 0 !important;
        padding: 0 !important;
        pointer-events: auto !important;
        position: fixed !important;
        top: 0 !important;
        transform: none !important;
        visibility: visible !important;
        width: 100% !important;
        z-index: 2147483647 !important;
      `;

      document.documentElement.appendChild(iframe);

      iframe.addEventListener('load', () => {
        const channel = new MessageChannel();
        pickerFramePort = channel.port1;
        
        pickerFramePort.onmessage = (ev) => {
          handlePickerMessage(ev.data || {});
        };
        
        pickerFramePort.onmessageerror = () => {
          quitPicker();
        };

        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(
            { what: 'emojiPickerStart' },
            pickerUrl,
            [channel.port2]
          );
        }

        resolve(iframe);
      }, { once: true });

      if (iframe.contentWindow) {
        iframe.contentWindow.location = pickerUrl;
      }

      // Listen for keyboard events
      document.addEventListener('keydown', handleKeyDown, true);
    });
  }

  // Initialize the picker
  pickerFrame = await bootstrap();
  if (!pickerFrame) {
    quitPicker();
  }
})();
