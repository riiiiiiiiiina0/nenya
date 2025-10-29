/* global window, document */

/**
 * Element Picker UI Script
 * Handles the dialog interface for the element picker
 */

(() => {
  'use strict';

  const dialog = document.getElementById('dialog');
  const selectorDisplay = document.getElementById('selectorDisplay');
  const specificitySlider = /** @type {HTMLInputElement|null} */ (
    document.getElementById('specificitySlider')
  );
  const matchCount = document.getElementById('matchCount');
  const candidatesList = document.getElementById('candidatesList');
  const pickButton = document.getElementById('pick');
  const previewButton = document.getElementById('preview');
  const createButton = document.getElementById('create');
  const quitButton = document.getElementById('quit');
  const svgRoot = document.getElementById('sea');
  const svgOcean = svgRoot?.children[0];
  const svgIslands = svgRoot?.children[1];

  let pickerContentPort = null;
  let selectorCandidates = [];
  let currentSelectorIndex = 0;
  let previewActive = false;

  /**
   * Handle SVG click events
   * @param {MouseEvent} ev
   */
  const onSvgClicked = (ev) => {
    if (!pickerContentPort) {
      return;
    }
    pickerContentPort.postMessage({
      what: 'filterElementAtPoint',
      mx: ev.clientX,
      my: ev.clientY,
    });
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
      if (pickerContentPort) {
        pickerContentPort.postMessage({
          what: 'highlightElementAtPoint',
          mx,
          my,
        });
      }
    };

    return (ev) => {
      // Only highlight if dialog is hidden
      if (!dialog || !dialog.classList.contains('hidden')) {
        return;
      }
      mx = ev.clientX;
      my = ev.clientY;
      if (timer === undefined) {
        timer = requestAnimationFrame(onTimer);
      }
    };
  })();

  /**
   * Handle quit button click
   */
  const onQuitClicked = () => {
    if (pickerContentPort) {
      pickerContentPort.postMessage({ what: 'quitPicker' });
      pickerContentPort.close();
      pickerContentPort = null;
    }
  };

  /**
   * Handle pick button click
   */
  const onPickClicked = () => {
    // Hide dialog and go back to picking mode
    if (dialog) {
      dialog.classList.add('hidden');
    }
    if (selectorDisplay) {
      selectorDisplay.textContent = 'Click an element to select...';
    }
    selectorCandidates = [];
    currentSelectorIndex = 0;
    if (createButton) {
      /** @type {HTMLButtonElement} */ (createButton).disabled = true;
    }

    // Turn off preview if active
    if (previewActive) {
      previewActive = false;
      if (previewButton) {
        previewButton.classList.remove('active');
      }
      if (pickerContentPort) {
        pickerContentPort.postMessage({ what: 'togglePreview', state: false });
      }
    }

    if (pickerContentPort) {
      pickerContentPort.postMessage({ what: 'unhighlight' });
    }
  };

  /**
   * Handle preview button click
   */
  const onPreviewClicked = () => {
    previewActive = !previewActive;
    if (previewButton) {
      previewButton.classList.toggle('active', previewActive);
    }

    if (pickerContentPort) {
      const selector = selectorCandidates[currentSelectorIndex];
      pickerContentPort.postMessage({
        what: 'togglePreview',
        state: previewActive,
        selector,
      });
    }
  };

  /**
   * Handle create button click
   */
  const onCreateClicked = () => {
    const selector = selectorCandidates[currentSelectorIndex];
    if (!selector) {
      return;
    }

    if (pickerContentPort) {
      pickerContentPort.postMessage({
        what: 'confirmSelector',
        selector,
      });
    }
  };

  /**
   * Update match count by querying selector
   * @param {string} selector
   */
  const updateMatchCount = (selector) => {
    if (!matchCount) {
      return;
    }

    if (!selector) {
      matchCount.textContent = '0';
      return;
    }

    try {
      const matches = document.querySelectorAll(selector);
      matchCount.textContent = matches.length.toString();
    } catch (e) {
      matchCount.textContent = '0';
    }
  };

  /**
   * Handle slider change
   */
  const onSliderChanged = () => {
    if (!specificitySlider) {
      return;
    }

    const index = parseInt(specificitySlider.value, 10);
    if (index >= 0 && index < selectorCandidates.length) {
      currentSelectorIndex = index;
      const selector = selectorCandidates[index];
      if (selectorDisplay) {
        selectorDisplay.textContent = selector;
      }
      updateMatchCount(selector);
      updateCandidatesList();

      // Update preview if active
      if (previewActive && pickerContentPort) {
        pickerContentPort.postMessage({
          what: 'updatePreview',
          selector,
        });
      }

      // Highlight the selected elements
      if (pickerContentPort) {
        pickerContentPort.postMessage({
          what: 'highlightSelector',
          selector,
        });
      }
    }
  };

  /**
   * Update the candidates list display
   */
  const updateCandidatesList = () => {
    if (!candidatesList) {
      return;
    }

    candidatesList.innerHTML = '';

    for (let i = 0; i < selectorCandidates.length; i++) {
      const item = document.createElement('div');
      item.className = 'candidate-item';
      if (i === currentSelectorIndex) {
        item.classList.add('active');
      }
      item.textContent = selectorCandidates[i];
      item.addEventListener('click', () => {
        if (specificitySlider) {
          specificitySlider.value = i.toString();
          onSliderChanged();
        }
      });
      candidatesList.appendChild(item);
    }
  };

  /**
   * Handle messages from content script
   * @param {MessageEvent} ev
   */
  const onPickerMessage = (ev) => {
    const msg = ev.data || {};

    switch (msg.what) {
      case 'svgPaths':
        if (svgOcean) {
          svgOcean.setAttribute('d', msg.ocean || '');
        }
        if (svgIslands) {
          svgIslands.setAttribute('d', msg.islands || '');
        }
        break;

      case 'showDialog':
        if (msg.candidates && Array.isArray(msg.candidates)) {
          selectorCandidates = msg.candidates;
          currentSelectorIndex = Math.floor(selectorCandidates.length / 2); // Start in middle

          if (selectorCandidates.length > 0) {
            const selector = selectorCandidates[currentSelectorIndex];
            if (selectorDisplay) {
              selectorDisplay.textContent = selector;
            }
            if (specificitySlider) {
              specificitySlider.max = (
                selectorCandidates.length - 1
              ).toString();
              specificitySlider.value = currentSelectorIndex.toString();
            }
            updateMatchCount(selector);
            updateCandidatesList();
            if (createButton) {
              /** @type {HTMLButtonElement} */ (createButton).disabled = false;
            }
            if (dialog) {
              dialog.classList.remove('hidden');
            }

            // Highlight all matching elements for the initial selector
            if (pickerContentPort) {
              pickerContentPort.postMessage({
                what: 'highlightSelector',
                selector,
              });
            }
          }
        }
        break;

      default:
        break;
    }
  };

  /**
   * Start the picker
   */
  const startPicker = () => {
    // Set up event listeners
    if (svgRoot) {
      svgRoot.addEventListener('click', onSvgClicked);
      svgRoot.addEventListener(
        'mousemove',
        onSvgHover,
        /** @type {AddEventListenerOptions} */ ({ passive: true }),
      );
    }
    if (quitButton) {
      quitButton.addEventListener('click', onQuitClicked);
    }
    if (pickButton) {
      pickButton.addEventListener('click', onPickClicked);
    }
    if (previewButton) {
      previewButton.addEventListener('click', onPreviewClicked);
    }
    if (createButton) {
      createButton.addEventListener('click', onCreateClicked);
    }
    if (specificitySlider) {
      specificitySlider.addEventListener('input', onSliderChanged);
    }

    // Notify content script that we're ready
    if (pickerContentPort) {
      pickerContentPort.postMessage({ what: 'start' });
    }
  };

  /**
   * Initialize the picker UI
   */
  window.addEventListener(
    'message',
    (ev) => {
      const msg = ev.data || {};
      if (msg.what !== 'epickerStart') {
        return;
      }
      if (!Array.isArray(ev.ports) || ev.ports.length === 0) {
        return;
      }

      pickerContentPort = ev.ports[0];
      pickerContentPort.onmessage = onPickerMessage;
      pickerContentPort.onmessageerror = () => {
        onQuitClicked();
      };

      startPicker();
    },
    { once: true },
  );
})();
