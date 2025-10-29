/* global chrome */

/**
 * Element Picker Content Script
 * Simplified version inspired by uBlock Origin's element picker
 */

(async () => {
  'use strict';

  // Prevent double-injection
  if (/** @type {any} */ (window).__nenyaPickerActive) {
    console.log('[epicker] Picker already active');
    return;
  }
  /** @type {any} */ (window).__nenyaPickerActive = true;

  const pickerUniqueId = `nenya-picker-${Date.now()}`;
  let pickerFrame = null;
  let pickerFramePort = null;
  let targetElements = [];
  let originalBodyOverflow = '';
  let originalHtmlOverflow = '';

  // Inject CSS for click-blind mechanism
  const pickerCSS = `
    [${pickerUniqueId}-clickblind] {
      pointer-events: none !important;
    }
  `;
  const styleElement = document.createElement('style');
  styleElement.textContent = pickerCSS;
  document.head.appendChild(styleElement);

  /**
   * Get element from coordinates
   * @param {number} x
   * @param {number} y
   * @returns {HTMLElement|null}
   */
  const elementFromPoint = (x, y) => {
    if (!pickerFrame) {
      return null;
    }
    const magicAttr = `${pickerUniqueId}-clickblind`;
    pickerFrame.setAttribute(magicAttr, '');

    // Use elementsFromPoint to get all elements and skip the picker iframe
    let elem = null;
    if (document.elementsFromPoint) {
      const elems = document.elementsFromPoint(x, y);
      for (const el of elems) {
        if (
          el !== pickerFrame &&
          el !== document.body &&
          el !== document.documentElement
        ) {
          elem = el;
          break;
        }
      }
    } else {
      // Fallback for older browsers
      elem = document.elementFromPoint(x, y);
      if (elem === pickerFrame) {
        elem = null;
      }
    }

    pickerFrame.removeAttribute(magicAttr);

    if (!elem || elem === document.body || elem === document.documentElement) {
      return null;
    }

    return /** @type {HTMLElement} */ (elem);
  };

  /**
   * Get bounding rect of element
   * @param {HTMLElement} elem
   * @returns {DOMRect}
   */
  const getElementBoundingClientRect = (elem) => {
    const rect = elem.getBoundingClientRect();
    if (rect.width !== 0 && rect.height !== 0) {
      return rect;
    }

    let left = rect.left;
    let right = left + rect.width;
    let top = rect.top;
    let bottom = top + rect.height;

    for (const child of elem.children) {
      const childRect = getElementBoundingClientRect(
        /** @type {HTMLElement} */ (child),
      );
      if (childRect.width === 0 || childRect.height === 0) {
        continue;
      }
      if (childRect.left < left) {
        left = childRect.left;
      }
      if (childRect.right > right) {
        right = childRect.right;
      }
      if (childRect.top < top) {
        top = childRect.top;
      }
      if (childRect.bottom > bottom) {
        bottom = childRect.bottom;
      }
    }

    return {
      bottom,
      height: bottom - top,
      left,
      right,
      top,
      width: right - left,
      x: left,
      y: top,
      toJSON: () => ({
        bottom,
        height: bottom - top,
        left,
        right,
        top,
        width: right - left,
      }),
    };
  };

  /**
   * Highlight elements on the page
   * @param {HTMLElement[]} elems
   */
  const highlightElements = (elems) => {
    targetElements = elems;

    const ow = window.innerWidth;
    const oh = window.innerHeight;
    const islands = [];

    for (const elem of elems) {
      if (elem === pickerFrame) {
        continue;
      }
      const rect = getElementBoundingClientRect(elem);
      if (
        rect.left > ow ||
        rect.top > oh ||
        rect.left + rect.width < 0 ||
        rect.top + rect.height < 0
      ) {
        continue;
      }
      islands.push(
        `M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`,
      );
    }

    if (pickerFramePort) {
      pickerFramePort.postMessage({
        what: 'svgPaths',
        ocean: `M0 0h${ow}v${oh}h-${ow}z`,
        islands: islands.join(''),
      });
    }
  };

  /**
   * Test if a selector is unique in the document
   * @param {string} selector
   * @returns {boolean}
   */
  const isUniqueSelector = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  };

  /**
   * Generate the shortest unique selector for an element
   * @param {HTMLElement} elem
   * @returns {string}
   */
  const generateShortestSelector = (elem) => {
    if (!elem || elem.nodeType !== 1) {
      return '';
    }

    const tagName = elem.localName;

    // 1. Try ID alone (shortest possible)
    if (elem.id) {
      try {
        const idSelector = `#${CSS.escape(elem.id)}`;
        if (isUniqueSelector(idSelector)) {
          return idSelector;
        }
      } catch (e) {
        // Invalid ID
      }
    }

    // 2. Try single class combinations
    const classList = elem.classList;
    if (classList && classList.length > 0) {
      for (let i = 0; i < classList.length; i++) {
        try {
          const classSelector = `.${CSS.escape(classList[i])}`;
          if (isUniqueSelector(classSelector)) {
            return classSelector;
          }
        } catch (e) {
          // Invalid class
        }
      }

      // 3. Try tag + single class
      for (let i = 0; i < classList.length; i++) {
        try {
          const selector = `${tagName}.${CSS.escape(classList[i])}`;
          if (isUniqueSelector(selector)) {
            return selector;
          }
        } catch (e) {
          // Invalid class
        }
      }

      // 4. Try combinations of 2 classes
      if (classList.length > 1) {
        for (let i = 0; i < classList.length; i++) {
          for (let j = i + 1; j < Math.min(i + 3, classList.length); j++) {
            try {
              const selector = `.${CSS.escape(classList[i])}.${CSS.escape(
                classList[j],
              )}`;
              if (isUniqueSelector(selector)) {
                return selector;
              }
            } catch (e) {
              // Invalid class
            }
          }
        }
      }
    }

    // 5. Build a minimal selector with parent context
    let selector = tagName;
    if (classList && classList.length > 0) {
      try {
        selector += `.${CSS.escape(classList[0])}`;
      } catch (e) {
        // Invalid class
      }
    }

    // Try adding parent context until unique
    let current = elem.parentElement;
    let depth = 0;
    const maxDepth = 3;

    while (current && depth < maxDepth) {
      const parentTag = current.localName;
      let parentSelector = parentTag;

      // Add first class if available
      if (current.classList && current.classList.length > 0) {
        try {
          parentSelector += `.${CSS.escape(current.classList[0])}`;
        } catch (e) {
          // Invalid class
        }
      }

      const testSelector = `${parentSelector} > ${selector}`;
      if (isUniqueSelector(testSelector)) {
        return testSelector;
      }

      selector = `${parentSelector} > ${selector}`;
      current = current.parentElement;
      depth++;
    }

    // If still not unique, add nth-of-type
    const parentNode = elem.parentNode;
    if (parentNode) {
      let i = 1;
      let sibling = elem.previousSibling;
      while (sibling !== null) {
        if (
          sibling.nodeType === 1 &&
          /** @type {Element} */ (sibling).localName === tagName
        ) {
          i++;
        }
        sibling = sibling.previousSibling;
      }
      selector = selector.replace(
        new RegExp(`${tagName}(?=\\.|$)`),
        `${tagName}:nth-of-type(${i})`,
      );
    }

    return selector;
  };

  /**
   * Generate multiple selector candidates with varying specificity
   * Optimized to create shorter, more practical selectors
   * @param {HTMLElement} elem
   * @returns {string[]}
   */
  const generateSelectorCandidates = (elem) => {
    const candidates = [];
    const tagName = elem.localName;

    // 1. Try ID alone
    if (elem.id) {
      try {
        const idSelector = `#${CSS.escape(elem.id)}`;
        if (isUniqueSelector(idSelector)) {
          candidates.push(idSelector);
        }
      } catch (e) {
        // Invalid ID
      }
    }

    // 2. Try single classes
    const classList = elem.classList;
    if (classList && classList.length > 0) {
      for (let i = 0; i < Math.min(classList.length, 3); i++) {
        try {
          const classSelector = `.${CSS.escape(classList[i])}`;
          if (isUniqueSelector(classSelector)) {
            candidates.push(classSelector);
          }
        } catch (e) {
          // Invalid class
        }
      }
    }

    // 3. Try tag + class combinations
    if (classList && classList.length > 0) {
      for (let i = 0; i < Math.min(classList.length, 2); i++) {
        try {
          const selector = `${tagName}.${CSS.escape(classList[i])}`;
          candidates.push(selector);
        } catch (e) {
          // Invalid class
        }
      }
    }

    // 4. Try multiple classes
    if (classList && classList.length > 1) {
      let classStr = '';
      for (let i = 0; i < Math.min(classList.length, 3); i++) {
        try {
          classStr += `.${CSS.escape(classList[i])}`;
        } catch (e) {
          // Invalid class
        }
      }
      if (classStr) {
        candidates.push(classStr);
        candidates.push(tagName + classStr);
      }
    }

    // 5. Build short parent-child combinations
    const buildShortPath = (depth) => {
      const parts = [];
      let current = elem;
      let d = 0;

      while (current && d < depth) {
        const tag = current.localName;
        let part = tag;

        // Add first significant class
        if (current.classList && current.classList.length > 0) {
          try {
            const firstClass = CSS.escape(current.classList[0]);
            part += `.${firstClass}`;
          } catch (e) {
            // Invalid class
          }
        }

        parts.unshift(part);
        const parentElem = current.parentElement;
        d++;

        if (
          !parentElem ||
          parentElem === document.body ||
          parentElem === document.documentElement
        ) {
          break;
        }
        current = parentElem;
      }

      return parts.join(' > ');
    };

    // Add paths with different depths
    for (let depth = 1; depth <= 3; depth++) {
      const path = buildShortPath(depth);
      if (path) {
        candidates.push(path);
      }
    }

    // 6. Descendant selectors (shorter than child)
    const buildDescendantPath = (depth) => {
      const parts = [];
      let current = elem;
      let d = 0;

      while (current && d < depth) {
        const tag = current.localName;
        let part = tag;

        if (current.classList && current.classList.length > 0) {
          try {
            part += `.${CSS.escape(current.classList[0])}`;
          } catch (e) {
            // Invalid class
          }
        }

        parts.unshift(part);
        const parentElem = current.parentElement;
        d++;

        if (
          !parentElem ||
          parentElem === document.body ||
          parentElem === document.documentElement
        ) {
          break;
        }
        current = parentElem;
      }

      return parts.join(' ');
    };

    for (let depth = 2; depth <= 3; depth++) {
      const path = buildDescendantPath(depth);
      if (path) {
        candidates.push(path);
      }
    }

    // 7. Add just tag name as last resort
    candidates.push(tagName);

    // Remove duplicates while preserving order
    const seen = new Set();
    const unique = candidates.filter((c) => {
      if (!c || seen.has(c)) {
        return false;
      }
      seen.add(c);
      return true;
    });

    // Sort by specificity: shorter and more unique first
    return unique.sort((a, b) => {
      // Prioritize unique selectors
      const aUnique = isUniqueSelector(a);
      const bUnique = isUniqueSelector(b);
      if (aUnique && !bUnique) return -1;
      if (!aUnique && bUnique) return 1;

      // Then by length
      return a.length - b.length;
    });
  };

  /**
   * Handle element selection at point
   * @param {number} mx
   * @param {number} my
   */
  const filterElementAtPoint = (mx, my) => {
    const elem = elementFromPoint(mx, my);
    if (!elem) {
      return;
    }

    highlightElements([elem]);

    const candidates = generateSelectorCandidates(elem);
    if (!candidates || candidates.length === 0) {
      return;
    }

    if (pickerFramePort) {
      pickerFramePort.postMessage({
        what: 'showDialog',
        candidates,
      });
    }
  };

  /**
   * Handle highlight at point
   * @param {number} mx
   * @param {number} my
   */
  const highlightElementAtPoint = (mx, my) => {
    const elem = elementFromPoint(mx, my);
    highlightElements(elem ? [elem] : []);
  };

  /**
   * Highlight elements matching a selector
   * @param {string} selector
   */
  const highlightSelector = (selector) => {
    if (!selector) {
      highlightElements([]);
      return;
    }

    try {
      const elems = Array.from(document.querySelectorAll(selector))
        .filter((el) => el !== pickerFrame)
        .map((el) => /** @type {HTMLElement} */ (el));
      highlightElements(elems);
    } catch (e) {
      highlightElements([]);
    }
  };

  /**
   * Apply/remove preview styling (hides matching elements)
   * @param {boolean} state
   * @param {string} selector
   */
  const togglePreview = (state, selector) => {
    if (!state) {
      // Restore all hidden elements
      document.querySelectorAll('[data-nenya-preview]').forEach((el) => {
        const htmlEl = /** @type {HTMLElement} */ (el);
        htmlEl.removeAttribute('data-nenya-preview');
        const originalDisplay = htmlEl.getAttribute(
          'data-nenya-original-display',
        );
        if (originalDisplay !== null) {
          htmlEl.style.display = originalDisplay;
          htmlEl.removeAttribute('data-nenya-original-display');
        } else {
          htmlEl.style.display = '';
        }
      });
      return;
    }

    if (!selector) {
      return;
    }

    try {
      const elems = document.querySelectorAll(selector);
      elems.forEach((el) => {
        const htmlEl = /** @type {HTMLElement} */ (el);
        if (htmlEl !== pickerFrame) {
          htmlEl.setAttribute('data-nenya-preview', '');
          // Save original display value
          const currentDisplay = htmlEl.style.display;
          htmlEl.setAttribute('data-nenya-original-display', currentDisplay);
          // Hide the element
          htmlEl.style.display = 'none';
        }
      });
    } catch (e) {
      // Invalid selector
    }
  };

  /**
   * Handle messages from picker UI
   * @param {object} msg
   */
  const onDialogMessage = (msg) => {
    switch (msg.what) {
      case 'start':
        startPicker();
        break;
      case 'quitPicker':
        quitPicker();
        break;
      case 'highlightElementAtPoint':
        highlightElementAtPoint(msg.mx, msg.my);
        break;
      case 'filterElementAtPoint':
        filterElementAtPoint(msg.mx, msg.my);
        break;
      case 'unhighlight':
        highlightElements([]);
        break;
      case 'highlightSelector':
        highlightSelector(msg.selector);
        break;
      case 'togglePreview':
        togglePreview(msg.state, msg.selector);
        break;
      case 'updatePreview':
        // Update preview with new selector
        togglePreview(true, msg.selector);
        break;
      case 'confirmSelector':
        // Log the selector and quit
        console.log('[epicker] Final selector:', msg.selector);
        // Send selector to background script to save
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime
            .sendMessage({
              type: 'blockElement:addSelector',
              selector: msg.selector,
              url: window.location.href,
            })
            .catch((error) => {
              console.warn(
                '[epicker] Failed to send selector to background:',
                error,
              );
            });
        }
        quitPicker();
        break;
      default:
        break;
    }
  };

  /**
   * Handle SVG click events
   * @param {MouseEvent} ev
   */
  const onSvgClicked = (ev) => {
    filterElementAtPoint(ev.clientX, ev.clientY);
  };

  /**
   * Handle SVG hover events
   */
  const onSvgHover = (() => {
    let timer;
    let mx = 0;
    let my = 0;

    const onTimer = () => {
      timer = undefined;
      highlightElementAtPoint(mx, my);
    };

    return (ev) => {
      mx = ev.clientX;
      my = ev.clientY;
      if (timer === undefined) {
        timer = requestAnimationFrame(onTimer);
      }
    };
  })();

  /**
   * Handle key press events
   * @param {KeyboardEvent} ev
   */
  const onKeyPressed = (ev) => {
    if (ev.key === 'Escape' || ev.which === 27) {
      ev.stopPropagation();
      ev.preventDefault();
      quitPicker();
    }
  };

  /**
   * Start the picker
   */
  const startPicker = () => {
    if (!pickerFrame) {
      return;
    }

    pickerFrame.focus();

    // Disable page scrolling
    originalBodyOverflow = document.body.style.overflow;
    originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Listen for mousemove events
    document.addEventListener(
      'mousemove',
      onSvgHover,
      /** @type {AddEventListenerOptions} */ ({ passive: true }),
    );
    document.addEventListener('keydown', onKeyPressed, true);
  };

  /**
   * Quit the picker and clean up
   */
  const quitPicker = () => {
    document.removeEventListener(
      'mousemove',
      onSvgHover,
      /** @type {EventListenerOptions} */ ({ passive: true }),
    );
    document.removeEventListener('keydown', onKeyPressed, true);

    // Restore page scrolling
    document.body.style.overflow = originalBodyOverflow;
    document.documentElement.style.overflow = originalHtmlOverflow;

    // Clean up preview - restore hidden elements
    document.querySelectorAll('[data-nenya-preview]').forEach((el) => {
      const htmlEl = /** @type {HTMLElement} */ (el);
      htmlEl.removeAttribute('data-nenya-preview');
      const originalDisplay = htmlEl.getAttribute(
        'data-nenya-original-display',
      );
      if (originalDisplay !== null) {
        htmlEl.style.display = originalDisplay;
        htmlEl.removeAttribute('data-nenya-original-display');
      } else {
        htmlEl.style.display = '';
      }
    });

    if (pickerFramePort) {
      pickerFramePort.close();
      pickerFramePort = null;
    }

    if (pickerFrame) {
      pickerFrame.remove();
      pickerFrame = null;
    }

    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }

    /** @type {any} */ (window).__nenyaPickerActive = false;
  };

  /**
   * Bootstrap the picker
   * @returns {Promise<HTMLIFrameElement|null>}
   */
  const bootstrap = async () => {
    const pickerUrl = chrome.runtime.getURL(
      'src/contentScript/epicker-ui.html',
    );

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute(pickerUniqueId, '');
      iframe.style.cssText = `
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
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

      iframe.addEventListener(
        'load',
        () => {
          const channel = new MessageChannel();
          pickerFramePort = channel.port1;
          pickerFramePort.onmessage = (ev) => {
            onDialogMessage(ev.data || {});
          };
          pickerFramePort.onmessageerror = () => {
            quitPicker();
          };

          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(
              { what: 'epickerStart' },
              pickerUrl,
              [channel.port2],
            );
          }

          resolve(iframe);
        },
        { once: true },
      );

      if (iframe.contentWindow) {
        iframe.contentWindow.location = pickerUrl;
      }
    });
  };

  // Initialize the picker
  pickerFrame = await bootstrap();
  if (!pickerFrame) {
    quitPicker();
  }
})();
