/**
 * Split screen entry point - handles URL parsing and iframe creation
 */

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
/** @type {Map<string, {url: string, title: string, urlValue: HTMLElement}>} */
const iframeData = new Map();

// Track currently active (hovered) iframe
let activeIframeName = null;

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
    });

    // Add error handling for iframe loading
    iframe.addEventListener('error', () => {
      const errorDiv = document.createElement('div');
      errorDiv.className =
        'flex items-center justify-center h-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400';
      errorDiv.innerHTML = `
        <div class="text-center p-4">
          <p class="font-semibold">Failed to load page</p>
          <p class="text-sm mt-1">${url}</p>
        </div>
      `;
      iframeWrapper.replaceChild(errorDiv, iframe);
    });

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
      iframeContainer.appendChild(divider);
    }
  });

  // Set up basic resizing functionality
  setupResizing();
}

/**
 * Set up improved resizing functionality for the iframe dividers
 */
function setupResizing() {
  const dividers = document.querySelectorAll('.iframe-divider');
  let isResizing = false;
  let currentIndex = -1;
  let startX = 0;
  let startLeftWidth = 0;
  let startRightWidth = 0;

  dividers.forEach((divider, index) => {
    const dividerEl = /** @type {HTMLElement} */ (divider);

    // Add hover effect
    dividerEl.addEventListener('mouseenter', () => {
      if (!isResizing) {
        dividerEl.style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
      }
    });

    dividerEl.addEventListener('mouseleave', () => {
      if (!isResizing) {
        dividerEl.style.backgroundColor = '';
      }
    });

    dividerEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      currentIndex = index;
      startX = e.clientX;

      // Get the adjacent wrappers
      const wrappers = Array.from(
        document.querySelectorAll('.iframe-wrapper'),
      ).sort(
        (a, b) =>
          parseInt(/** @type {HTMLElement} */ (a).style.order) -
          parseInt(/** @type {HTMLElement} */ (b).style.order),
      );

      const leftWrapper = wrappers[index];
      const rightWrapper = wrappers[index + 1];

      if (leftWrapper && rightWrapper) {
        startLeftWidth = leftWrapper.getBoundingClientRect().width;
        startRightWidth = rightWrapper.getBoundingClientRect().width;
      }

      // Visual feedback
      dividerEl.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Disable pointer events on iframes to prevent losing mouse tracking
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        /** @type {HTMLElement} */ (iframe).style.pointerEvents = 'none';
      });
    });
  });

  // Global mouse move handler
  document.addEventListener('mousemove', (e) => {
    if (!isResizing || currentIndex === -1) return;

    e.preventDefault();

    const deltaX = e.clientX - startX;
    const containerWidth = iframeContainer?.clientWidth || 1;

    // Get the adjacent wrappers
    const wrappers = Array.from(
      document.querySelectorAll('.iframe-wrapper'),
    ).sort(
      (a, b) =>
        parseInt(/** @type {HTMLElement} */ (a).style.order) -
        parseInt(/** @type {HTMLElement} */ (b).style.order),
    );

    const leftWrapper = /** @type {HTMLElement} */ (wrappers[currentIndex]);
    const rightWrapper = /** @type {HTMLElement} */ (
      wrappers[currentIndex + 1]
    );

    if (leftWrapper && rightWrapper) {
      // Calculate new widths based on initial widths + delta
      const newLeftWidth = startLeftWidth + deltaX;
      const newRightWidth = startRightWidth - deltaX;

      // Convert to percentages
      const totalWidth = startLeftWidth + startRightWidth;
      let leftPercent = (newLeftWidth / totalWidth) * 100;
      let rightPercent = (newRightWidth / totalWidth) * 100;

      // Apply constraints (min 10%, max 90%)
      leftPercent = Math.max(10, Math.min(90, leftPercent));
      rightPercent = 100 - leftPercent;

      // Apply the new flex values
      leftWrapper.style.flex = `0 0 ${leftPercent}%`;
      rightWrapper.style.flex = `0 0 ${rightPercent}%`;
    }
  });

  // Global mouse up handler
  document.addEventListener('mouseup', () => {
    if (!isResizing) return;

    isResizing = false;
    currentIndex = -1;

    // Reset visual feedback
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
  if (event.data && event.data.type === 'iframe-update') {
    const { frameName, url, title } = event.data;

    // Update iframe data
    const data = iframeData.get(frameName);
    if (data) {
      data.url = url;
      data.title = title;

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
