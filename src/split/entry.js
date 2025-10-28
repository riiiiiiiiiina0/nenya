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
      'absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity';
    urlDisplay.textContent = url;

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
    const currentUrls = Array.from(
      document.querySelectorAll('.iframe-wrapper iframe'),
    )
      .map((iframe) => /** @type {HTMLIFrameElement} */ (iframe).src)
      .filter((url) => url && url !== 'about:blank');
    sendResponse({ urls: currentUrls });
    return true;
  }
  return false;
});

// Add visual feedback when unsplitting
document.addEventListener('keydown', (e) => {
  // Add keyboard shortcut for unsplitting (Ctrl/Cmd + U)
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    // Trigger unsplit via context menu
    chrome.runtime.sendMessage({ action: 'unsplit-tabs' });
  }
});
