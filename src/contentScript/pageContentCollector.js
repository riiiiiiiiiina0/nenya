/* global chrome */

/**
 * Shared page content collector.
 * This script collects content from any content script that registers a window.getContent function.
 */

(function () {
  'use strict';

  /**
   * Collect page content and send to background script.
   * @returns {Promise<void>}
   */
  async function collectAndSendPageContent() {
    const result = {
      type: 'page-content-collected',
      title: document.title,
      url: document.location.href,
      content: '',
    };

    // Check if a content getter function has been registered
    if (typeof window['getContent'] !== 'function') {
      console.error(
        '[pageContentCollector] No window.getContent function registered',
      );
      chrome.runtime.sendMessage(result);
      return;
    }

    try {
      // Call the registered content getter
      const content = await window['getContent']();

      // Include any user-selected text
      const sel = window.getSelection();
      const selectedText = sel ? sel.toString().trim() : '';

      // Wrap content in XML tags for structure
      const formattedContent = [];
      if (selectedText) {
        formattedContent.push(
          `<selectedText>\n${selectedText}\n</selectedText>`,
        );
      }
      formattedContent.push(
        `<content>\n${content || 'no content'}\n</content>`,
      );

      // Send back to background script
      chrome.runtime.sendMessage({
        ...result,
        content: formattedContent.join('\n\n'),
      });
    } catch (error) {
      console.error('[pageContentCollector] Error collecting content:', error);
      chrome.runtime.sendMessage(result);
    }
  }

  // Auto-execute after content scripts have registered
  setTimeout(collectAndSendPageContent, 100);
})();
