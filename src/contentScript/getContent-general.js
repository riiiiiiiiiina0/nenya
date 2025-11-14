/* global chrome, TurndownService, turndownPluginGfm, Readability */

/**
 * Extract general page content and convert to markdown.
 * Uses Mozilla's Readability for content extraction and Turndown for HTML to Markdown conversion.
 */

(function () {
  'use strict';

  /**
   * Extract and convert page content to markdown.
   * @returns {Promise<string>}
   */
  async function getGeneralPageContent() {
    try {
      // Clone the document to avoid mutating the live page
      const clone = document.cloneNode(true);

      // Try to use Readability for better content extraction
      let contentHtml = '';
      try {
        const reader = new Readability(clone);
        const article = reader.parse();
        if (article && article.content) {
          contentHtml = article.content;
        }
      } catch (readabilityError) {
        console.warn(
          '[getContent] Readability failed, falling back to body:',
          readabilityError,
        );
      }

      // Fallback to body content if Readability fails
      if (!contentHtml) {
        const bodyClone = document.body.cloneNode(true);
        // Remove unwanted elements
        bodyClone
          .querySelectorAll(
            'script, style, noscript, iframe, svg, canvas, img, video, ' +
              'header, footer, nav, aside, [hidden], [aria-hidden="true"]',
          )
          .forEach((el) => el.remove());
        contentHtml = bodyClone.innerHTML;
      }

      // Convert HTML to Markdown using TurndownService
      const turndownService = new TurndownService({
        headingStyle: 'atx', // # H1
        codeBlockStyle: 'fenced', // ```js
        bulletListMarker: '-', // - list item
        emDelimiter: '*', // *italic*
        strongDelimiter: '**', // **bold**
        hr: '---',
        br: '\n',
        linkStyle: 'inlined', // [text](url)
        linkReferenceStyle: 'full',
      });

      // Use GitHub Flavored Markdown plugin for tables, strikethrough, etc.
      if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
      }

      // Add custom rule to drop empty paragraphs
      turndownService.addRule('dropEmpty', {
        filter: (node) =>
          node.nodeName === 'P' &&
          !node.textContent.trim() &&
          !node.querySelector('img'),
        replacement: () => '',
      });

      const markdown = turndownService.turndown(contentHtml);
      return markdown;
    } catch (error) {
      console.error('[getContent] Error extracting content:', error);
      return '';
    }
  }

  // Register the content getter function
  window['getContent'] = getGeneralPageContent;
})();

