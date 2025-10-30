/* global chrome */

/**
 * Extract YouTube video content including title, description, and transcripts.
 */

(function () {
  'use strict';

  /**
   * Wait for an element to appear in the DOM.
   * @param {string} selector
   * @param {number} timeout
   * @returns {Promise<Element | null>}
   */
  function waitForElement(selector, timeout = 5000) {
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
   * Wait for an element to disappear from the DOM.
   * @param {string} selector
   * @param {number} timeout
   * @returns {Promise<boolean>}
   */
  function waitForElementToDisappear(selector, timeout = 5000) {
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
   * Sleep for a specified duration.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract YouTube video content including transcripts.
   * @returns {Promise<string>}
   */
  async function getYouTubeContent() {
    try {
      // Extract video metadata
      const title =
        document
          .querySelector('ytd-watch-metadata #title')
          ?.textContent?.trim() ||
        document.querySelector('h1.title')?.textContent?.trim() ||
        '';

      const channelElement = document.querySelector(
        'ytd-channel-name yt-formatted-string',
      );
      const channel = channelElement?.textContent?.trim() || '';

      // Get description - try to expand it first
      let description = '';
      try {
        const descriptionContainer = document.querySelector(
          'ytd-watch-metadata #description',
        );
        if (descriptionContainer) {
          // Click to expand description if collapsed
          const expandButton = /** @type {HTMLElement | null} */ (
            descriptionContainer.querySelector('tp-yt-paper-button#expand')
          );
          if (expandButton) {
            expandButton.click();
            await sleep(300);
          }
          const rawDescription = descriptionContainer.textContent?.trim() || '';

          // Clean up description: split into lines and remove empty lines
          if (rawDescription) {
            const seenLines = new Set();
            description = rawDescription
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => {
                // Remove empty lines
                if (line.length === 0) return false;

                // Remove common YouTube UI artifacts
                if (
                  line === 'Show less' ||
                  line === 'Show more' ||
                  line === '...more' ||
                  line === '…...more' ||
                  line === 'Shop' ||
                  line === 'Limited shipping areas' ||
                  line === 'Learn more' ||
                  line === 'Transcript' ||
                  line === 'Follow along using the transcript.'
                ) {
                  return false;
                }

                // Remove lines that look like view counts
                if (/^\d[\d,]+\s+views/.test(line)) return false;

                // Remove lines that look like product counts
                if (/^\d+\s+products?$/.test(line)) return false;

                // Remove lines that are just "Show transcript"
                if (line === 'Show transcript') return false;

                // Remove lines that look like shop URLs
                if (
                  /shop[.-]/.test(line) ||
                  /\.com\/products\//.test(line) ||
                  /fourthwall\.com/.test(line) ||
                  /kurzgesagt\.org/.test(line)
                ) {
                  return false;
                }

                // Remove lines with product/shopping tags
                if (
                  /tagged products below/i.test(line) ||
                  /the kurzgesagt shop/i.test(line)
                ) {
                  return false;
                }

                // Remove "People mentioned" section
                if (/People mentioned\d+ person/.test(line)) return false;

                // Remove lines that are just names of famous people (very short lines with capitals)
                if (
                  /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line) &&
                  line.length < 30
                ) {
                  return false;
                }

                // Remove biographical descriptions in parentheses
                if (/^[A-Z].*\(\d{4}[-–]\d{4}\)$/.test(line)) return false;

                // Remove channel info lines
                if (
                  /^\d+\.?\d*[KMB]?\s+subscribers?$/.test(line) ||
                  line === 'Videos' ||
                  line === 'About'
                ) {
                  return false;
                }

                // Remove social media menu items appearing as single words
                if (
                  line === 'Patreon' ||
                  line === 'TikTok' ||
                  line === 'Instagram' ||
                  line === 'Reddit' ||
                  line === 'Facebook'
                ) {
                  // Only remove if they appear standalone (not in a sentence)
                  return false;
                }

                // Remove duplicate lines (case-insensitive)
                const lowerLine = line.toLowerCase();
                if (seenLines.has(lowerLine)) {
                  return false;
                }
                seenLines.add(lowerLine);

                return true;
              })
              .join('\n');
          }
        }
      } catch (err) {
        console.warn('[getContent-youtube] Error getting description:', err);
      }

      // Check if subtitles/captions are available
      let captions = 'No captions available';
      try {
        const subtitlesButton = await waitForElement(
          '.ytp-subtitles-button',
          3000,
        );
        const isAvailable =
          subtitlesButton &&
          !subtitlesButton
            .getAttribute('title')
            ?.toLowerCase()
            .includes('unavailable');

        if (isAvailable) {
          console.log(
            '[getContent-youtube] Captions are available, extracting...',
          );

          // Try to expand description area to reveal transcript button
          const descriptionExpander = /** @type {HTMLElement | null} */ (
            document.querySelector(
              'ytd-watch-metadata tp-yt-paper-button#expand',
            )
          );
          if (descriptionExpander) {
            descriptionExpander.click();
            await sleep(500);
          }

          // Wait for and click "Show transcript" button
          const transcriptButton = /** @type {HTMLElement | null} */ (
            await waitForElement(
              'ytd-video-description-transcript-section-renderer button[aria-label*="transcript" i], ' +
                'ytd-video-description-transcript-section-renderer button[aria-label*="Show transcript" i], ' +
                'button[aria-label*="Show transcript" i]',
              3000,
            )
          );

          if (transcriptButton) {
            console.log(
              '[getContent-youtube] Found transcript button, clicking...',
            );
            transcriptButton.click();
            await sleep(800);

            // Wait for transcript panel to appear
            const transcriptPanel = await waitForElement(
              'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
              3000,
            );

            if (transcriptPanel) {
              console.log('[getContent-youtube] Transcript panel opened');

              // Wait for transcript items to load
              await sleep(500);

              // Find the transcript list container
              const transcriptList = transcriptPanel.querySelector(
                '#segments-container',
              );

              if (transcriptList) {
                // Scroll to load all lazy-loaded segments
                transcriptList.scrollTop = transcriptList.scrollHeight;
                await sleep(500);
                transcriptList.scrollTop = 0;
                await sleep(300);

                // Extract all transcript segments
                const segments = Array.from(
                  transcriptList.querySelectorAll(
                    'ytd-transcript-segment-renderer',
                  ),
                );

                if (segments.length > 0) {
                  captions = segments
                    .map((segment) => {
                      const timestamp = segment
                        .querySelector('.segment-timestamp')
                        ?.textContent?.trim();
                      const text = segment
                        .querySelector('.segment-text')
                        ?.textContent?.trim();
                      return timestamp && text ? `${timestamp}: ${text}` : null;
                    })
                    .filter(Boolean)
                    .join('\n');

                  console.log(
                    `[getContent-youtube] Extracted ${segments.length} transcript segments`,
                  );
                } else {
                  console.warn(
                    '[getContent-youtube] No transcript segments found',
                  );
                  captions = 'Transcript panel opened but no segments found';
                }
              } else {
                console.warn('[getContent-youtube] Transcript list not found');
                captions = 'Transcript panel opened but list not found';
              }
            } else {
              console.warn(
                '[getContent-youtube] Transcript panel did not open',
              );
              captions = 'Could not open transcript panel';
            }
          } else {
            console.warn('[getContent-youtube] Transcript button not found');
            captions = 'Transcript button not found on page';
          }
        } else {
          console.log(
            '[getContent-youtube] Captions not available for this video',
          );
        }
      } catch (err) {
        console.error('[getContent-youtube] Error extracting captions:', err);
        captions = `Error extracting captions: ${err.message}`;
      }

      // Format and return content
      const content = [
        `# ${title}`,
        '',
        `**Channel:** ${channel}`,
        '',
        '## Description',
        description || 'No description available',
        '',
        '## Transcript',
        captions,
      ].join('\n');

      return content;
    } catch (error) {
      console.error('[getContent-youtube] Error extracting content:', error);
      return `Error extracting YouTube content: ${error.message}`;
    }
  }

  // Register the content getter function
  window['getContent'] = getYouTubeContent;

  console.log('[getContent-youtube] YouTube content extraction registered');
})();
