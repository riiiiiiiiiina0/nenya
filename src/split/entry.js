/**
 * Split screen entry point - handles URL parsing and iframe creation
 */

import { showTabPicker } from './tab-picker.js';

// Parse URL state from query parameters
const urlParams = new URLSearchParams(window.location.search);
const stateParam = urlParams.get('state');
let state = { urls: [] };

if (stateParam) {
  try {
    state = JSON.parse(decodeURIComponent(stateParam));
  } catch (e) {
    console.error('Failed to parse state parameter:', e);
  }
}

const urls = Array.isArray(state.urls) ? state.urls : [];
const iframeContainer = document.getElementById('iframe-container');

// Store iframe data for tracking
/** @type {Map<string, {url: string, title: string, urlValue: HTMLElement, loaded: boolean, wrapper: HTMLElement}>} */
const iframeData = new Map();

// Track currently active (hovered) iframe
let activeIframeName = null;

// Track iframe load timeouts
/** @type {Map<string, number>} */
const iframeLoadTimeouts = new Map();

if (!iframeContainer) {
  console.error('iframe-container not found');
} else if (urls.length === 0) {
  // Show message when no URLs provided
  iframeContainer.innerHTML = `
    <div class="flex items-center justify-center h-full w-full">
      <div class="text-center p-8">
        <h2 class="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">No tabs to split</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">Select multiple tabs and use the context menu to split them.</p>
        <div class="text-sm text-gray-500 dark:text-gray-500">
          <p>Right-click on any page and select "Split tabs" to get started.</p>
        </div>
      </div>
    </div>
  `;
} else {
  // Create iframes for each URL
  urls.forEach((url, index) => {
    const iframeWrapper = document.createElement('div');
    iframeWrapper.className =
      'iframe-wrapper group relative flex-shrink-0 flex-grow-0';
    iframeWrapper.style.order = String(index * 2);
    iframeWrapper.style.flex = '1';

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.name = `nenya-iframe-${index}`;
    iframe.className = 'w-full h-full border-0';
    iframe.setAttribute(
      'sandbox',
      'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads',
    );
    iframe.setAttribute('allow', 'fullscreen');

    // Inject monitoring script when iframe loads
    iframe.addEventListener('load', async () => {
      const success = await injectMonitoringScript(iframe);
      if (!success) {
        // For cross-origin iframes, request background script to inject
        requestBackgroundInjection(iframe);
      }
      
      // After iframe loads, wait briefly for content script to send message
      // If no message arrives, the iframe is likely blocked
      setupIframeLoadedCheck(iframe.name, iframeWrapper, iframe, url);
    });

    // Add error handling for iframe loading
    iframe.addEventListener('error', () => {
      clearIframeLoadTimeout(iframe.name);
      showIframeError(iframeWrapper, iframe, url, 'Failed to load page');
    });

    // Set up initial timeout for iframe loading (longer timeout for slow networks)
    setupIframeLoadTimeout(iframe.name, iframeWrapper, iframe, url, 10000);

    // Add control bar at the top
    const controlBar = document.createElement('div');
    controlBar.className =
      'absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-2 items-center justify-center z-50';

    // Move left button
    const moveLeftButton = document.createElement('button');
    moveLeftButton.className =
      'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed';
    moveLeftButton.innerHTML = '◀️';
    moveLeftButton.title = 'Move left';
    moveLeftButton.addEventListener('click', (e) => {
      e.stopPropagation();
      swapIframeWithNeighbor(iframeWrapper, 'left');
    });

    // Move right button
    const moveRightButton = document.createElement('button');
    moveRightButton.className =
      'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed';
    moveRightButton.innerHTML = '▶️';
    moveRightButton.title = 'Move right';
    moveRightButton.addEventListener('click', (e) => {
      e.stopPropagation();
      swapIframeWithNeighbor(iframeWrapper, 'right');
    });

    // Restore as tab button
    const restoreButton = document.createElement('button');
    restoreButton.className =
      'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200';
    restoreButton.innerHTML = '↗️';
    restoreButton.title = 'Restore as browser tab';
    restoreButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Get the current URL from iframe data
      const data = iframeData.get(iframe.name);
      const currentUrl = data ? data.url : iframe.src;

      // Open the URL in a new tab
      await chrome.tabs.create({ url: currentUrl });

      // Remove this iframe
      removeIframeWrapper(iframeWrapper);
    });

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className =
      'bg-red-500/70 hover:bg-red-600/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200';
    deleteButton.innerHTML = '🗑️';
    deleteButton.title = 'Delete from split page';
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      removeIframeWrapper(iframeWrapper);
    });

    // Update button states on hover to reflect current position
    iframeWrapper.addEventListener('mouseenter', () => {
      updateMoveButtonStates(iframeWrapper, moveLeftButton, moveRightButton);
    });

    controlBar.appendChild(moveLeftButton);
    controlBar.appendChild(moveRightButton);
    controlBar.appendChild(restoreButton);
    controlBar.appendChild(deleteButton);

    // Set initial button states
    // Use setTimeout to ensure all iframes are in the DOM first
    setTimeout(() => {
      updateMoveButtonStates(iframeWrapper, moveLeftButton, moveRightButton);
    }, 0);

    // Add URL display at the bottom
    const urlDisplay = document.createElement('div');
    urlDisplay.className =
      'absolute bottom-1 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-2 items-center justify-center';
    const urlValue = document.createElement('div');
    urlValue.className =
      'url-value text-xs min-w-0 max-w-[80%] cursor-pointer truncate bg-black/50 backdrop-blur-sm text-white rounded-full px-2 py-1';
    urlValue.textContent = url;
    urlValue.title = 'Click to copy URL';

    // Add click handler to copy URL to clipboard
    urlValue.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(url);
        const originalText = urlValue.textContent;
        urlValue.textContent = '✅ Copied';
        setTimeout(() => {
          urlValue.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    });

    urlDisplay.appendChild(urlValue);

    // Store iframe data for tracking
    iframeData.set(iframe.name, {
      url,
      title: '', // Will be updated when iframe loads
      urlValue,
      loaded: false,
      wrapper: iframeWrapper,
    });

    // Add hover tracking for title updates
    iframeWrapper.addEventListener('mouseenter', () => {
      activeIframeName = iframe.name;
      updatePageTitle();
    });

    iframeWrapper.addEventListener('mouseleave', () => {
      // Only clear if this is still the active iframe
      if (activeIframeName === iframe.name) {
        activeIframeName = null;
        updatePageTitle();
      }
    });

    iframeWrapper.appendChild(iframe);
    iframeWrapper.appendChild(controlBar);
    iframeWrapper.appendChild(urlDisplay);
    iframeContainer.appendChild(iframeWrapper);

    // Add divider between iframes (except for the last one)
    if (index < urls.length - 1) {
      const divider = document.createElement('div');
      divider.className =
        'iframe-divider bg-gray-300 dark:bg-gray-600 cursor-col-resize';
      divider.style.order = String(index * 2 + 1);
      divider.style.width = '4px';
      divider.style.flexShrink = '0';

      // Add + button to divider
      addPlusButtonToDivider(divider);

      iframeContainer.appendChild(divider);
    }
  });

  // Set up basic resizing functionality
  setupResizing();

  // Add edge plus buttons
  addEdgePlusButtons();

  // Update plus button visibility based on iframe count
  updatePlusButtonVisibility();
}

// Global resize state and handlers (to avoid duplicate event listeners)
let isResizing = false;
let resizeCurrentIndex = -1;
let resizeStartX = 0;
let resizeStartLeftWidth = 0;
let resizeStartRightWidth = 0;
let resizeLeftWrapper = null;
let resizeRightWrapper = null;
let resizeOtherWrapperWidths = [];

/**
 * Handle mouse move during resize
 * @param {MouseEvent} e
 */
function handleResizeMouseMove(e) {
  if (
    !isResizing ||
    resizeCurrentIndex === -1 ||
    !resizeLeftWrapper ||
    !resizeRightWrapper
  )
    return;

  e.preventDefault();

  const deltaX = e.clientX - resizeStartX;

  // Calculate new widths for the two adjacent iframes
  let newLeftWidth = resizeStartLeftWidth + deltaX;
  let newRightWidth = resizeStartRightWidth - deltaX;

  // Apply minimum width constraint (50px)
  const minWidth = 50;
  if (newLeftWidth < minWidth) {
    newLeftWidth = minWidth;
    newRightWidth = resizeStartLeftWidth + resizeStartRightWidth - minWidth;
  }
  if (newRightWidth < minWidth) {
    newRightWidth = minWidth;
    newLeftWidth = resizeStartLeftWidth + resizeStartRightWidth - minWidth;
  }

  // Set fixed pixel widths for the two adjacent iframes
  resizeLeftWrapper.style.flex = `0 0 ${newLeftWidth}px`;
  resizeRightWrapper.style.flex = `0 0 ${newRightWidth}px`;

  // Keep all other iframes at their original widths
  resizeOtherWrapperWidths.forEach(({ wrapper, width }) => {
    wrapper.style.flex = `0 0 ${width}px`;
  });
}

/**
 * Handle mouse up during resize
 */
function handleResizeMouseUp() {
  if (!isResizing) return;

  isResizing = false;
  resizeCurrentIndex = -1;
  resizeLeftWrapper = null;
  resizeRightWrapper = null;
  resizeOtherWrapperWidths = [];

  // Reset visual feedback
  const dividers = document.querySelectorAll('.iframe-divider');
  dividers.forEach((divider) => {
    const dividerEl = /** @type {HTMLElement} */ (divider);
    dividerEl.style.backgroundColor = '';
  });

  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  // Re-enable pointer events on iframes
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    /** @type {HTMLElement} */ (iframe).style.pointerEvents = '';
  });
}

/**
 * Set up improved resizing functionality for the iframe dividers
 */
function setupResizing() {
  // Remove old global event listeners if they exist
  document.removeEventListener('mousemove', handleResizeMouseMove);
  document.removeEventListener('mouseup', handleResizeMouseUp);

  // Add global event listeners once
  document.addEventListener('mousemove', handleResizeMouseMove);
  document.addEventListener('mouseup', handleResizeMouseUp);

  const dividers = document.querySelectorAll('.iframe-divider');

  dividers.forEach((divider, index) => {
    const dividerEl = /** @type {HTMLElement} */ (divider);

    // Remove the plus button before cloning (we'll re-add it after)
    const plusButton = dividerEl.querySelector('.divider-plus-btn');
    if (plusButton) {
      plusButton.remove();
    }

    // Remove old event listeners by cloning the element
    const newDivider = /** @type {HTMLElement} */ (dividerEl.cloneNode(true));
    dividerEl.parentNode?.replaceChild(newDivider, dividerEl);

    // Re-add the plus button with its event listeners
    addPlusButtonToDivider(newDivider);

    // Add hover effect
    newDivider.addEventListener('mouseenter', () => {
      if (!isResizing) {
        newDivider.style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
      }
    });

    newDivider.addEventListener('mouseleave', () => {
      if (!isResizing) {
        newDivider.style.backgroundColor = '';
      }
    });

    newDivider.addEventListener('mousedown', (e) => {
      const mouseEvent = /** @type {MouseEvent} */ (e);
      mouseEvent.preventDefault();
      isResizing = true;
      resizeCurrentIndex = index;
      resizeStartX = mouseEvent.clientX;

      // Get the order of this divider
      const dividerOrder = parseInt(newDivider.style.order);

      // Get all wrappers sorted by order
      const wrappers = Array.from(
        document.querySelectorAll('.iframe-wrapper'),
      ).sort(
        (a, b) =>
          parseInt(/** @type {HTMLElement} */ (a).style.order) -
          parseInt(/** @type {HTMLElement} */ (b).style.order),
      );

      // Find the wrappers immediately before and after this divider based on order
      // Divider order should be between left wrapper and right wrapper
      // For example: leftWrapper.order = 0, divider.order = 1, rightWrapper.order = 2
      const leftWrapperEl = wrappers.find(
        (w) =>
          parseInt(/** @type {HTMLElement} */ (w).style.order) ===
          dividerOrder - 1,
      );
      const rightWrapperEl = wrappers.find(
        (w) =>
          parseInt(/** @type {HTMLElement} */ (w).style.order) ===
          dividerOrder + 1,
      );

      if (!leftWrapperEl || !rightWrapperEl) {
        console.error(
          'Could not find adjacent wrappers for divider',
          dividerOrder,
        );
        return;
      }

      resizeLeftWrapper = /** @type {HTMLElement} */ (leftWrapperEl);
      resizeRightWrapper = /** @type {HTMLElement} */ (rightWrapperEl);

      // Store initial widths of the two adjacent iframes
      resizeStartLeftWidth = resizeLeftWrapper.getBoundingClientRect().width;
      resizeStartRightWidth = resizeRightWrapper.getBoundingClientRect().width;

      // Store widths of all other iframes to keep them fixed
      resizeOtherWrapperWidths = wrappers
        .filter((wrapper) => {
          const wrapperOrder = parseInt(
            /** @type {HTMLElement} */ (wrapper).style.order,
          );
          return (
            wrapperOrder !== dividerOrder - 1 &&
            wrapperOrder !== dividerOrder + 1
          );
        })
        .map((wrapper) => ({
          wrapper: /** @type {HTMLElement} */ (wrapper),
          width: wrapper.getBoundingClientRect().width,
        }));

      // Visual feedback
      newDivider.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Disable pointer events on iframes to prevent losing mouse tracking
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        /** @type {HTMLElement} */ (iframe).style.pointerEvents = 'none';
      });
    });
  });
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-current-urls') {
    // Get current URLs from tracked iframe data (which includes updated URLs from navigation)
    const currentUrls = Array.from(
      document.querySelectorAll('.iframe-wrapper iframe'),
    )
      .map((iframe) => {
        const iframeName = /** @type {HTMLIFrameElement} */ (iframe).name;
        const data = iframeData.get(iframeName);
        // Use tracked URL if available, otherwise fall back to iframe.src
        return data && data.url
          ? data.url
          : /** @type {HTMLIFrameElement} */ (iframe).src;
      })
      .filter((url) => url && url !== 'about:blank');
    sendResponse({ urls: currentUrls });
    return true;
  }
  return false;
});

// Listen for messages from iframe content scripts
window.addEventListener('message', (event) => {
  // Validate message type
  if (!event.data) return;

  // Handle iframe loaded confirmation
  if (event.data.type === 'iframe-loaded') {
    const { frameName } = event.data;
    console.log('[split] Iframe loaded successfully:', frameName);
    
    // Clear the timeout since iframe loaded
    clearIframeLoadTimeout(frameName);
    
    // Mark as loaded
    const data = iframeData.get(frameName);
    if (data) {
      data.loaded = true;
    }
  }
  
  // Handle iframe update
  if (event.data.type === 'iframe-update') {
    const { frameName, url, title, loaded } = event.data;

    // Update iframe data
    const data = iframeData.get(frameName);
    if (data) {
      data.url = url;
      data.title = title;
      
      // Mark as loaded if indicated
      if (loaded) {
        data.loaded = true;
        clearIframeLoadTimeout(frameName);
      }

      // Update URL display
      data.urlValue.textContent = url;

      // Update page title with all iframe titles
      updatePageTitle();

      // Update the URL state parameter to reflect current iframe URLs
      updateUrlStateParameter();
    }
  }
});

/**
 * Update the page title with the currently active iframe's title
 */
function updatePageTitle() {
  // If we have an active iframe, use its title
  if (activeIframeName) {
    const activeData = iframeData.get(activeIframeName);
    if (activeData && activeData.title && activeData.title.trim() !== '') {
      document.title = activeData.title;
      return;
    }
  }

  // Fallback to default title if no active iframe or no title available
  document.title = 'Split View - Nenya';
}

/**
 * Update the URL state parameter to reflect current iframe URLs
 */
function updateUrlStateParameter() {
  // Collect current URLs from all iframes in order
  const currentUrls = Array.from(
    document.querySelectorAll('.iframe-wrapper iframe'),
  )
    .map((iframe) => {
      const iframeName = /** @type {HTMLIFrameElement} */ (iframe).name;
      const data = iframeData.get(iframeName);
      // Use tracked URL if available, otherwise fall back to iframe.src
      return data && data.url
        ? data.url
        : /** @type {HTMLIFrameElement} */ (iframe).src;
    })
    .filter((url) => url && url !== 'about:blank');

  // Update state object
  const newState = { urls: currentUrls };
  const newUrl = `${window.location.pathname}?state=${encodeURIComponent(
    JSON.stringify(newState),
  )}`;

  // Update browser URL without reload using replaceState
  window.history.replaceState(null, '', newUrl);
}

/**
 * Set up a timeout to detect if iframe fails to load at all
 * @param {string} frameName - The iframe name
 * @param {HTMLElement} wrapper - The wrapper element
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - The URL being loaded
 * @param {number} timeoutMs - Timeout in milliseconds
 */
function setupIframeLoadTimeout(frameName, wrapper, iframe, url, timeoutMs = 10000) {
  // Clear any existing timeout
  clearIframeLoadTimeout(frameName);
  
  // Set timeout - if iframe hasn't loaded at all by then, show error
  const timeoutId = setTimeout(() => {
    const data = iframeData.get(frameName);
    if (data && !data.loaded) {
      console.log('[split] Iframe failed to load within timeout:', url);
      showIframeError(wrapper, iframe, url, 'Failed to load page');
    }
  }, timeoutMs);
  
  iframeLoadTimeouts.set(frameName, timeoutId);
}

/**
 * After iframe "load" event, check if content script sent a message
 * If not, the page is likely blocked by security policies
 * @param {string} frameName - The iframe name
 * @param {HTMLElement} wrapper - The wrapper element
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - The URL being loaded
 */
function setupIframeLoadedCheck(frameName, wrapper, iframe, url) {
  // Clear the initial load timeout since iframe has loaded
  clearIframeLoadTimeout(frameName);
  
  // Now set a short timeout to check if content script sent a message
  const timeoutId = setTimeout(() => {
    const data = iframeData.get(frameName);
    if (data && !data.loaded) {
      console.log('[split] Iframe loaded but content script did not run - likely blocked:', url);
      showIframeError(wrapper, iframe, url, 'This site cannot be embedded');
    }
  }, 1000); // Only 1 second after load event
  
  iframeLoadTimeouts.set(frameName, timeoutId);
}

/**
 * Clear the load timeout for an iframe
 * @param {string} frameName - The iframe name
 */
function clearIframeLoadTimeout(frameName) {
  const timeoutId = iframeLoadTimeouts.get(frameName);
  if (timeoutId) {
    clearTimeout(timeoutId);
    iframeLoadTimeouts.delete(frameName);
  }
}

/**
 * Show an error message when iframe fails to load
 * @param {HTMLElement} iframeWrapper - The wrapper element
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - The URL that failed to load
 * @param {string} message - Error message to display
 */
function showIframeError(iframeWrapper, iframe, url, message) {
  // Check if error div already exists
  if (iframeWrapper.querySelector('.iframe-error-message')) {
    return;
  }

  const errorDiv = document.createElement('div');
  errorDiv.className =
    'iframe-error-message flex flex-col items-center justify-center h-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300';
  errorDiv.innerHTML = `
    <div class="text-center p-8 max-w-md">
      <div class="text-6xl mb-4">🔒</div>
      <p class="font-semibold text-lg mb-2">${message}</p>
      <p class="text-sm mb-4 opacity-80">Due to browser security policies, some sites (like X.com, Perplexity) cannot be embedded in iframes.</p>
      <div class="flex gap-2 justify-center">
        <button class="open-in-tab-btn bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          Open in New Tab
        </button>
        <button class="remove-frame-btn bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          Remove
        </button>
      </div>
      <p class="text-xs mt-4 opacity-60">${url}</p>
    </div>
  `;

  // Add button handlers
  const openBtn = errorDiv.querySelector('.open-in-tab-btn');
  const removeBtn = errorDiv.querySelector('.remove-frame-btn');

  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      await chrome.tabs.create({ url });
      removeIframeWrapper(iframeWrapper);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      removeIframeWrapper(iframeWrapper);
    });
  }

  iframeWrapper.replaceChild(errorDiv, iframe);
}

/**
 * Inject monitoring script into an iframe
 * @param {HTMLIFrameElement} iframe
 * @returns {Promise<boolean>} True if injection was successful
 */
async function injectMonitoringScript(iframe) {
  try {
    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument;

    if (!iframeWindow || !iframeDocument) {
      console.warn('Cannot access iframe content:', iframe.src);
      return false;
    }

    // Create and inject the monitoring script
    const script = iframeDocument.createElement('script');
    script.textContent = `
      (function() {
        'use strict';
        
        // Prevent double-injection
        if (window['__nenyaIframeMonitorInstalled']) {
          return;
        }
        window['__nenyaIframeMonitorInstalled'] = true;
        
        let lastUrl = window.location.href;
        let lastTitle = '';
        
        function sendUpdate() {
          const currentUrl = window.location.href;
          // Get title, but prefer a non-empty title over falling back to URL
          let currentTitle = document.title;
          if (!currentTitle || currentTitle.trim() === '') {
            // If title is empty, try to extract from meta tags
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle && ogTitle instanceof HTMLMetaElement) {
              currentTitle = ogTitle.content;
            } else {
              // Only use URL as last resort
              currentTitle = currentUrl;
            }
          }
          
          if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
            lastUrl = currentUrl;
            lastTitle = currentTitle;
            console.log('sendUpdate', currentUrl, currentTitle);
            
            window.parent.postMessage({
              type: 'iframe-update',
              url: currentUrl,
              title: currentTitle,
              frameName: window.name
            }, '*');
          }
        }
        
        function debounce(func, wait) {
          let timeout;
          return function executedFunction(...args) {
            const later = () => {
              clearTimeout(timeout);
              func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
          };
        }
        
        const debouncedUpdate = debounce(sendUpdate, 100);
        
        // Monitor page load
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', sendUpdate);
        } else {
          sendUpdate();
        }
        
        window.addEventListener('load', sendUpdate);
        
        // Monitor SPA navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
          originalPushState.apply(this, args);
          sendUpdate();
        };
        
        history.replaceState = function(...args) {
          originalReplaceState.apply(this, args);
          sendUpdate();
        };
        
        window.addEventListener('popstate', sendUpdate);
        window.addEventListener('hashchange', sendUpdate);
        
        // Monitor DOM mutations for title changes
        const titleObserver = new MutationObserver(() => {
          const newTitle = document.title;
          if (newTitle !== lastTitle) {
            debouncedUpdate();
          }
        });
        
        titleObserver.observe(document.documentElement, {
          childList: true,
          characterData: true,
          subtree: true
        });
        
        // Send initial update with retries to catch the title as it loads
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelays = [50, 200, 500, 1000, 2000];
        
        function sendInitialUpdate() {
          const hadTitle = document.title && document.title.trim() !== '';
          sendUpdate();
          
          // If we still don't have a title and haven't exhausted retries, try again
          if (!hadTitle && retryCount < maxRetries) {
            setTimeout(sendInitialUpdate, retryDelays[retryCount]);
            retryCount++;
          }
        }
        
        // Start initial update sequence
        setTimeout(sendInitialUpdate, 50);
      })();
    `;

    iframeDocument.head.appendChild(script);
    console.log('Monitoring script injected into iframe:', iframe.name);
    return true;
  } catch (err) {
    // This will happen for cross-origin iframes - that's expected
    console.log(
      'Cannot inject monitoring script (cross-origin):',
      iframe.src,
      err.message,
    );
    return false;
  }
}

/**
 * Request background script to inject monitoring code into cross-origin iframe
 * @param {HTMLIFrameElement} iframe
 */
function requestBackgroundInjection(iframe) {
  // Get all frames and find the index of our iframe
  chrome.runtime.sendMessage(
    {
      action: 'inject-iframe-monitor',
      frameName: iframe.name,
      url: iframe.src,
    },
    (response) => {
      // Suppress errors - the content script from manifest will handle it
      if (chrome.runtime.lastError) {
        // Ignore - content script will inject via manifest
        return;
      }
      if (response && response.success) {
        console.log('Background injection successful for:', iframe.name);
      }
      // If background injection fails, content script will handle it
    },
  );
}

/**
 * Add a + button to a divider
 * @param {HTMLElement} divider
 */
function addPlusButtonToDivider(divider) {
  const plusButton = document.createElement('button');
  plusButton.className =
    'divider-plus-btn absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 z-10';
  plusButton.innerHTML = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
  `;
  plusButton.title = 'Add tab here';

  // Show button on divider hover
  divider.style.position = 'relative';
  divider.addEventListener('mouseenter', () => {
    plusButton.style.opacity = '1';
  });
  divider.addEventListener('mouseleave', () => {
    plusButton.style.opacity = '0';
  });
  plusButton.addEventListener('mouseenter', () => {
    plusButton.style.opacity = '1';
  });

  plusButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await showTabPicker({ x: e.clientX, y: e.clientY }, (tab) => {
      insertIframeAtDivider(divider, tab);
    });
  });

  divider.appendChild(plusButton);
}

/**
 * Add + buttons to left and right edges of the split page
 */
function addEdgePlusButtons() {
  // Left edge button
  const leftEdgeButton = document.createElement('button');
  leftEdgeButton.id = 'nenya-edge-plus-left';
  leftEdgeButton.className =
    'edge-plus-btn fixed left-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg transition-all duration-200 z-10 opacity-50 hover:opacity-100';
  leftEdgeButton.innerHTML = `
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
  `;
  leftEdgeButton.title = 'Add tab to the left';

  leftEdgeButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await showTabPicker({ x: e.clientX, y: e.clientY }, (tab) => {
      insertIframeAtEdge('left', tab);
    });
  });

  // Right edge button
  const rightEdgeButton = document.createElement('button');
  rightEdgeButton.id = 'nenya-edge-plus-right';
  rightEdgeButton.className =
    'edge-plus-btn fixed right-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg transition-all duration-200 z-10 opacity-50 hover:opacity-100';
  rightEdgeButton.innerHTML = `
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
  `;
  rightEdgeButton.title = 'Add tab to the right';

  rightEdgeButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await showTabPicker({ x: e.clientX, y: e.clientY }, (tab) => {
      insertIframeAtEdge('right', tab);
    });
  });

  document.body.appendChild(leftEdgeButton);
  document.body.appendChild(rightEdgeButton);
}

/**
 * Update plus button visibility based on iframe count
 */
function updatePlusButtonVisibility() {
  const wrappers = document.querySelectorAll('.iframe-wrapper');
  const shouldHide = wrappers.length >= 4;

  // Hide/show divider plus buttons
  const dividerPlusButtons = document.querySelectorAll('.divider-plus-btn');
  dividerPlusButtons.forEach((btn) => {
    /** @type {HTMLElement} */ (btn).style.display = shouldHide
      ? 'none'
      : 'flex';
  });

  // Hide/show edge plus buttons
  const edgePlusButtons = document.querySelectorAll('.edge-plus-btn');
  edgePlusButtons.forEach((btn) => {
    /** @type {HTMLElement} */ (btn).style.display = shouldHide
      ? 'none'
      : 'flex';
  });
}

/**
 * Insert an iframe at a divider position
 * @param {HTMLElement} divider
 * @param {Object} tab - Chrome tab object
 */
function insertIframeAtDivider(divider, tab) {
  if (!iframeContainer) return;

  const dividerOrder = parseInt(divider.style.order);

  // Update orders: shift all wrappers and dividers after this divider by 2
  const allElements = Array.from(iframeContainer.children);
  allElements.forEach((el) => {
    const htmlEl = /** @type {HTMLElement} */ (el);
    const currentOrder = parseInt(htmlEl.style.order);
    if (currentOrder > dividerOrder) {
      htmlEl.style.order = String(currentOrder + 2);
    }
  });

  // Keep the clicked divider at its position (dividerOrder)
  // Insert new wrapper after the divider
  const iframeWrapper = createIframeWrapper(tab.url, dividerOrder + 1);
  iframeContainer.appendChild(iframeWrapper);

  // Insert new divider after the new wrapper
  const newDivider = document.createElement('div');
  newDivider.className =
    'iframe-divider bg-gray-300 dark:bg-gray-600 cursor-col-resize';
  newDivider.style.order = String(dividerOrder + 2);
  newDivider.style.width = '4px';
  newDivider.style.flexShrink = '0';
  addPlusButtonToDivider(newDivider);
  iframeContainer.appendChild(newDivider);

  // Rebalance flex sizes
  rebalanceIframeSizes();

  // Re-setup resizing
  setupResizing();

  // Update visibility
  updatePlusButtonVisibility();

  // Close the source tab after iframe loads
  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      chrome.tabs.remove(tab.id);
    });
  }
}

/**
 * Insert an iframe at edge (left or right)
 * @param {string} position - 'left' or 'right'
 * @param {Object} tab - Chrome tab object
 */
function insertIframeAtEdge(position, tab) {
  if (!iframeContainer) return;

  const wrappers = Array.from(document.querySelectorAll('.iframe-wrapper'));
  if (wrappers.length === 0) return;

  let newOrder;
  if (position === 'left') {
    // Insert at the beginning
    // Shift all existing elements by 2 first
    const allElements = Array.from(iframeContainer.children);
    allElements.forEach((el) => {
      const htmlEl = /** @type {HTMLElement} */ (el);
      const currentOrder = parseInt(htmlEl.style.order);
      htmlEl.style.order = String(currentOrder + 2);
    });

    // Now insert at order 0 (after shifting, old 0 is now at 2)
    newOrder = 0;
  } else {
    // Insert at the end
    const maxOrder = Math.max(
      ...Array.from(iframeContainer.children).map((el) =>
        parseInt(/** @type {HTMLElement} */ (el).style.order),
      ),
    );
    newOrder = maxOrder + 2;
  }

  // Create new iframe wrapper
  const iframeWrapper = createIframeWrapper(tab.url, newOrder);
  iframeContainer.appendChild(iframeWrapper);

  // Add divider
  const divider = document.createElement('div');
  divider.className =
    'iframe-divider bg-gray-300 dark:bg-gray-600 cursor-col-resize';
  divider.style.order =
    position === 'left' ? String(newOrder + 1) : String(newOrder - 1);
  divider.style.width = '4px';
  divider.style.flexShrink = '0';
  addPlusButtonToDivider(divider);
  iframeContainer.appendChild(divider);

  // Rebalance flex sizes
  rebalanceIframeSizes();

  // Re-setup resizing
  setupResizing();

  // Update visibility
  updatePlusButtonVisibility();

  // Close the source tab after iframe loads
  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      chrome.tabs.remove(tab.id);
    });
  }
}

/**
 * Create an iframe wrapper with all necessary components
 * @param {string} url
 * @param {number} order
 * @returns {HTMLElement}
 */
function createIframeWrapper(url, order) {
  const iframeWrapper = document.createElement('div');
  iframeWrapper.className =
    'iframe-wrapper group relative flex-shrink-0 flex-grow-0';
  iframeWrapper.style.order = String(order);
  iframeWrapper.style.flex = '1';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.name = `nenya-iframe-${Date.now()}`;
  iframe.className = 'w-full h-full border-0';
  iframe.setAttribute(
    'sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads',
  );
  iframe.setAttribute('allow', 'fullscreen');

  // Inject monitoring script when iframe loads
  iframe.addEventListener('load', async () => {
    const success = await injectMonitoringScript(iframe);
    if (!success) {
      // For cross-origin iframes, request background script to inject
      requestBackgroundInjection(iframe);
    }
    
    // After iframe loads, wait briefly for content script to send message
    // If no message arrives, the iframe is likely blocked
    setupIframeLoadedCheck(iframe.name, iframeWrapper, iframe, url);
  });

  // Add error handling for iframe loading
  iframe.addEventListener('error', () => {
    clearIframeLoadTimeout(iframe.name);
    showIframeError(iframeWrapper, iframe, url, 'Failed to load page');
  });

  // Set up initial timeout for iframe loading (longer timeout for slow networks)
  setupIframeLoadTimeout(iframe.name, iframeWrapper, iframe, url, 10000);

  // Add control bar at the top
  const controlBar = document.createElement('div');
  controlBar.className =
    'absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-2 items-center justify-center z-50';

  // Move left button
  const moveLeftButton = document.createElement('button');
  moveLeftButton.className =
    'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed';
  moveLeftButton.innerHTML = '◀️';
  moveLeftButton.title = 'Move left';
  moveLeftButton.addEventListener('click', (e) => {
    e.stopPropagation();
    swapIframeWithNeighbor(iframeWrapper, 'left');
  });

  // Move right button
  const moveRightButton = document.createElement('button');
  moveRightButton.className =
    'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed';
  moveRightButton.innerHTML = '▶️';
  moveRightButton.title = 'Move right';
  moveRightButton.addEventListener('click', (e) => {
    e.stopPropagation();
    swapIframeWithNeighbor(iframeWrapper, 'right');
  });

  // Restore as tab button
  const restoreButton = document.createElement('button');
  restoreButton.className =
    'bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200';
  restoreButton.innerHTML = '↗️';
  restoreButton.title = 'Restore as browser tab';
  restoreButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    // Get the current URL from iframe data
    const data = iframeData.get(iframe.name);
    const currentUrl = data ? data.url : iframe.src;

    // Open the URL in a new tab
    await chrome.tabs.create({ url: currentUrl });

    // Remove this iframe
    removeIframeWrapper(iframeWrapper);
  });

  // Delete button
  const deleteButton = document.createElement('button');
  deleteButton.className =
    'bg-red-500/70 hover:bg-red-600/90 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200';
  deleteButton.innerHTML = '🗑️';
  deleteButton.title = 'Delete from split page';
  deleteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    removeIframeWrapper(iframeWrapper);
  });

  // Update button states on hover to reflect current position
  iframeWrapper.addEventListener('mouseenter', () => {
    updateMoveButtonStates(iframeWrapper, moveLeftButton, moveRightButton);
  });

  controlBar.appendChild(moveLeftButton);
  controlBar.appendChild(moveRightButton);
  controlBar.appendChild(restoreButton);
  controlBar.appendChild(deleteButton);

  // Set initial button states
  // Use setTimeout to ensure all iframes are in the DOM first
  setTimeout(() => {
    updateMoveButtonStates(iframeWrapper, moveLeftButton, moveRightButton);
  }, 0);

  // Add URL display at the bottom
  const urlDisplay = document.createElement('div');
  urlDisplay.className =
    'absolute bottom-1 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-2 items-center justify-center';
  const urlValue = document.createElement('div');
  urlValue.className =
    'url-value text-xs min-w-0 max-w-[80%] cursor-pointer truncate bg-black/50 backdrop-blur-sm text-white rounded-full px-2 py-1';
  urlValue.textContent = url;
  urlValue.title = 'Click to copy URL';

  // Add click handler to copy URL to clipboard
  urlValue.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      const originalText = urlValue.textContent;
      urlValue.textContent = '✅ Copied';
      setTimeout(() => {
        urlValue.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  });

  urlDisplay.appendChild(urlValue);

  // Store iframe data for tracking
  iframeData.set(iframe.name, {
    url,
    title: '', // Will be updated when iframe loads
    urlValue,
    loaded: false,
    wrapper: iframeWrapper,
  });

  // Add hover tracking for title updates
  iframeWrapper.addEventListener('mouseenter', () => {
    activeIframeName = iframe.name;
    updatePageTitle();
  });

  iframeWrapper.addEventListener('mouseleave', () => {
    // Only clear if this is still the active iframe
    if (activeIframeName === iframe.name) {
      activeIframeName = null;
      updatePageTitle();
    }
  });

  iframeWrapper.appendChild(iframe);
  iframeWrapper.appendChild(controlBar);
  iframeWrapper.appendChild(urlDisplay);

  return iframeWrapper;
}

/**
 * Rebalance iframe sizes to be equal
 */
function rebalanceIframeSizes() {
  const wrappers = document.querySelectorAll('.iframe-wrapper');
  wrappers.forEach((wrapper) => {
    /** @type {HTMLElement} */ (wrapper).style.flex = '1';
  });
}

/**
 * Renormalize the order values of all wrappers and dividers to be sequential
 * This fixes issues where gaps in order values prevent dividers from finding adjacent wrappers
 */
function renormalizeOrders() {
  if (!iframeContainer) return;

  // Get all children (wrappers and dividers) and sort by current order
  const allElements = Array.from(iframeContainer.children).sort(
    (a, b) =>
      parseInt(/** @type {HTMLElement} */ (a).style.order) -
      parseInt(/** @type {HTMLElement} */ (b).style.order),
  );

  // Reassign sequential orders
  allElements.forEach((el, index) => {
    /** @type {HTMLElement} */ (el).style.order = String(index);
  });
}

/**
 * Remove an iframe wrapper and clean up related elements
 * @param {HTMLElement} iframeWrapper - The wrapper element to remove
 */
function removeIframeWrapper(iframeWrapper) {
  if (!iframeContainer) return;

  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe) {
    // Clean up iframe data
    const iframeName = /** @type {HTMLIFrameElement} */ (iframe).name;
    
    // Clear any pending timeout
    clearIframeLoadTimeout(iframeName);
    
    // Remove from data tracking
    iframeData.delete(iframeName);

    // Clear active iframe if it's the one being removed
    if (activeIframeName === iframeName) {
      activeIframeName = null;
      updatePageTitle();
    }
  }

  const wrapperOrder = parseInt(iframeWrapper.style.order);

  // Find and remove the adjacent divider
  // Divider could be before (order - 1) or after (order + 1)
  const allElements = Array.from(iframeContainer.children);
  const adjacentDivider = allElements.find((el) => {
    const htmlEl = /** @type {HTMLElement} */ (el);
    if (!htmlEl.classList.contains('iframe-divider')) return false;
    const dividerOrder = parseInt(htmlEl.style.order);
    return (
      dividerOrder === wrapperOrder - 1 || dividerOrder === wrapperOrder + 1
    );
  });

  // Remove the wrapper
  iframeWrapper.remove();

  // Remove the adjacent divider
  if (adjacentDivider) {
    adjacentDivider.remove();
  }

  // Check if there are any iframes left
  const remainingWrappers = document.querySelectorAll('.iframe-wrapper');
  if (remainingWrappers.length === 0) {
    // No iframes left, close the split page tab
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      }
    });
  } else {
    // Renormalize orders to ensure sequential values (0, 1, 2, 3...)
    renormalizeOrders();

    // Rebalance remaining iframes
    rebalanceIframeSizes();

    // Update URL state parameter
    updateUrlStateParameter();

    // Update plus button visibility
    updatePlusButtonVisibility();

    // Re-setup resizing
    setupResizing();
  }
}

/**
 * Swap an iframe with its neighbor (left or right)
 * @param {HTMLElement} iframeWrapper - The iframe wrapper to move
 * @param {'left' | 'right'} direction - Direction to move
 */
function swapIframeWithNeighbor(iframeWrapper, direction) {
  if (!iframeContainer) return;

  // Get all wrappers sorted by order
  const allWrappers = Array.from(
    document.querySelectorAll('.iframe-wrapper'),
  ).sort(
    (a, b) =>
      parseInt(/** @type {HTMLElement} */ (a).style.order) -
      parseInt(/** @type {HTMLElement} */ (b).style.order),
  );

  // Find current wrapper index
  const currentIndex = allWrappers.indexOf(iframeWrapper);
  if (currentIndex === -1) return;

  // Find neighbor wrapper
  const neighborIndex =
    direction === 'left' ? currentIndex - 1 : currentIndex + 1;

  // Check boundaries
  if (neighborIndex < 0 || neighborIndex >= allWrappers.length) return;

  const neighborWrapper = /** @type {HTMLElement} */ (
    allWrappers[neighborIndex]
  );

  // Swap order values
  const currentOrder = iframeWrapper.style.order;
  const neighborOrder = neighborWrapper.style.order;

  iframeWrapper.style.order = neighborOrder;
  neighborWrapper.style.order = currentOrder;

  // Update URL state parameter to reflect new order
  updateUrlStateParameter();

  // Update all move button states after swap
  updateAllMoveButtonStates();

  // Re-setup resizing to update divider event listeners with new iframe positions
  setupResizing();
}

/**
 * Update the disabled state of move buttons based on wrapper position
 * @param {HTMLElement} iframeWrapper - The iframe wrapper
 * @param {HTMLButtonElement} moveLeftButton - The move left button
 * @param {HTMLButtonElement} moveRightButton - The move right button
 */
function updateMoveButtonStates(
  iframeWrapper,
  moveLeftButton,
  moveRightButton,
) {
  // Get all wrappers sorted by order
  const allWrappers = Array.from(
    document.querySelectorAll('.iframe-wrapper'),
  ).sort(
    (a, b) =>
      parseInt(/** @type {HTMLElement} */ (a).style.order) -
      parseInt(/** @type {HTMLElement} */ (b).style.order),
  );

  // Find current wrapper index
  const currentIndex = allWrappers.indexOf(iframeWrapper);

  // Update button states
  moveLeftButton.disabled = currentIndex === 0;
  moveRightButton.disabled = currentIndex === allWrappers.length - 1;
}

/**
 * Update all move button states for all iframes
 */
function updateAllMoveButtonStates() {
  const allWrappers = Array.from(
    document.querySelectorAll('.iframe-wrapper'),
  ).sort(
    (a, b) =>
      parseInt(/** @type {HTMLElement} */ (a).style.order) -
      parseInt(/** @type {HTMLElement} */ (b).style.order),
  );

  allWrappers.forEach((wrapper, index) => {
    const htmlWrapper = /** @type {HTMLElement} */ (wrapper);
    const controlBar = htmlWrapper.querySelector('.absolute.top-2');
    if (!controlBar) return;

    const buttons = controlBar.querySelectorAll('button');
    const moveLeftButton = /** @type {HTMLButtonElement} */ (buttons[0]);
    const moveRightButton = /** @type {HTMLButtonElement} */ (buttons[1]);

    if (moveLeftButton && moveRightButton) {
      moveLeftButton.disabled = index === 0;
      moveRightButton.disabled = index === allWrappers.length - 1;
    }
  });
}
