/**
 * Split screen entry point - handles URL parsing and iframe creation
 */

import { showTabPicker, createEmbeddedTabPicker } from './tab-picker.js';
import { icons } from '../shared/icons.js';

// Parse URL state from query parameters
const urlParams = new URLSearchParams(window.location.search);
const stateParam = urlParams.get('state');
let state = { urls: [], layout: 'horizontal', sizes: [] };

if (stateParam) {
  try {
    state = JSON.parse(decodeURIComponent(stateParam));
    // Ensure layout field exists with default value
    if (!state.layout) {
      state.layout = 'horizontal';
    }
    if (!Array.isArray(state.sizes)) {
      state.sizes = [];
    }
  } catch (e) {
    console.error('Failed to parse state parameter:', e);
  }
}

const urls = Array.isArray(state.urls) ? state.urls : [];
const storedSizes = normalizeStateSizes(state.sizes, urls.length);
const iframeContainer = document.getElementById('iframe-container');

// Track current theme (light or dark)
/** @type {'light' | 'dark'} */
let currentTheme = 'light';

// Track current layout (horizontal or vertical)
/** @type {'horizontal' | 'vertical'} */
let currentLayout = state.layout === 'vertical' ? 'vertical' : 'horizontal';

const DIVIDER_THICKNESS_PX = 4;

/**
 * Normalize stored size values from URL state
 * @param {unknown} rawSizes
 * @param {number} expectedLength
 * @returns {number[] | null}
 */
function normalizeStateSizes(rawSizes, expectedLength) {
  if (!Array.isArray(rawSizes) || rawSizes.length !== expectedLength) {
    return null;
  }

  const numericSizes = rawSizes.map((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
  });

  if (numericSizes.some((value) => Number.isNaN(value))) {
    return null;
  }

  const total = numericSizes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return null;
  }

  return numericSizes.map((value) => (value / total) * 100);
}

/**
 * Get the icon for moving an iframe backward in the current layout
 * @returns {string}
 */
function getBackwardMoveIcon() {
  return currentLayout === 'horizontal' ? icons.leftCircle : icons.upCircle;
}

/**
 * Get the icon for moving an iframe forward in the current layout
 * @returns {string}
 */
function getForwardMoveIcon() {
  return currentLayout === 'horizontal' ? icons.rightCircle : icons.downCircle;
}

/**
 * Get the tooltip label for moving an iframe backward in the current layout
 * @returns {string}
 */
function getBackwardMoveTooltip() {
  return currentLayout === 'horizontal' ? 'Move left' : 'Move up';
}

/**
 * Get the tooltip label for moving an iframe forward in the current layout
 * @returns {string}
 */
function getForwardMoveTooltip() {
  return currentLayout === 'horizontal' ? 'Move right' : 'Move down';
}

/**
 * Create a control bar button with tooltip wrapper
 * @param {{ icon: string, title: string, className?: string, onClick: (e: MouseEvent) => void | Promise<void> }} opts
 * @returns {{ btn: HTMLButtonElement, tooltip: HTMLDivElement }}
 */
function createControlButton({ icon, title, className = '', onClick }) {
  const btn = document.createElement('button');
  btn.className =
    (className ? className : '') +
    ' text-white size-5 p-1 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';
  btn.innerHTML = icon;
  btn.addEventListener('click', onClick);

  const tooltip = document.createElement('div');
  tooltip.classList = 'tooltip tooltip-bottom';
  tooltip.setAttribute('data-tip', title);
  tooltip.appendChild(btn);

  return { btn, tooltip };
}

/**
 * Get the current theme based on system preference
 * @returns {'light' | 'dark'}
 */
function getCurrentTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  return prefersDark.matches ? 'dark' : 'light';
}

/**
 * Apply color scheme to an iframe
 * @param {HTMLIFrameElement} iframe
 * @param {'light' | 'dark'} theme
 */
function applyThemeToIframe(iframe, theme) {
  iframe.style.colorScheme = theme;
}

/**
 * Apply theme to all iframes
 * @param {'light' | 'dark'} theme
 */
function applyThemeToAllIframes(theme) {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    applyThemeToIframe(/** @type {HTMLIFrameElement} */ (iframe), theme);
  });
  currentTheme = theme;
}

/**
 * Initialize theme monitoring
 */
function initializeThemeMonitoring() {
  // Set initial theme
  currentTheme = getCurrentTheme();
  applyThemeToAllIframes(currentTheme);

  // Listen for OS theme changes
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  const handleThemeChange = (event) => {
    const newTheme = event.matches ? 'dark' : 'light';
    console.log('[split] Theme changed to:', newTheme);
    applyThemeToAllIframes(newTheme);
  };

  if (typeof prefersDark.addEventListener === 'function') {
    prefersDark.addEventListener('change', handleThemeChange);
  } else if (typeof prefersDark.addListener === 'function') {
    prefersDark.addListener(handleThemeChange);
  }
}

/**
 * Switch between horizontal and vertical layout
 */
function toggleLayout() {
  currentLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
  applyLayout(undefined);
  updateAllLayoutButtons();
  updateEdgePlusButtons(); // Update edge button positions
  setupResizing(); // Re-setup resizing for new layout
  updateUrlStateParameter(); // Persist layout state
}

/**
 * Apply the current layout to the container and dividers
 * @param {number[] | null | undefined} sizesToApply
 */
function applyLayout(sizesToApply) {
  if (!iframeContainer) return;

  // Update container flex direction
  if (currentLayout === 'horizontal') {
    iframeContainer.className = 'flex flex-row h-screen w-screen';
  } else {
    iframeContainer.className = 'flex flex-col h-screen w-screen';
  }

  // Update dividers
  const dividers = document.querySelectorAll('.iframe-divider');
  dividers.forEach((divider) => {
    const dividerEl = /** @type {HTMLElement} */ (divider);
    dividerEl.className = `iframe-divider bg-gray-300 dark:bg-gray-600 ${currentLayout}`;

    if (currentLayout === 'horizontal') {
      dividerEl.style.width = '4px';
      dividerEl.style.height = '';
    } else {
      dividerEl.style.width = '';
      dividerEl.style.height = '4px';
    }
  });

  // Rebalance iframe sizes
  const wrappers = document.querySelectorAll('.iframe-wrapper');
  const shouldApplyStoredSizes =
    Array.isArray(sizesToApply) &&
    sizesToApply.length === wrappers.length &&
    sizesToApply.length > 0;

  if (shouldApplyStoredSizes) {
    applyStoredIframeSizes(/** @type {number[]} */ (sizesToApply));
  } else {
    rebalanceIframeSizes();
  }
}

/**
 * Update all layout toggle buttons across all iframes
 */
function updateAllLayoutButtons() {
  const allWrappers = document.querySelectorAll('.iframe-wrapper');
  allWrappers.forEach((wrapper) => {
    const controlBar = /** @type {HTMLElement} */ (wrapper).querySelector(
      '.absolute.top-2',
    );
    if (!controlBar) return;

    const layoutButton = controlBar.querySelector('.layout-toggle-btn');
    if (layoutButton) {
      const btn = /** @type {HTMLButtonElement} */ (layoutButton);
      const layoutTooltip = btn.parentElement;
      const layoutTooltipText =
        currentLayout === 'horizontal'
          ? 'Switch to vertical layout'
          : 'Switch to horizontal layout';

      if (currentLayout === 'horizontal') {
        btn.innerHTML = icons.bars;
      } else {
        btn.innerHTML = icons.columns;
      }

      if (layoutTooltip && layoutTooltip.classList.contains('tooltip')) {
        layoutTooltip.setAttribute('data-tip', layoutTooltipText);
      }
    }

    const tooltipElements = Array.from(controlBar.querySelectorAll('.tooltip'));
    const buttonElements = Array.from(controlBar.querySelectorAll('button'));

    const moveBackwardTooltip = /** @type {HTMLElement | undefined} */ (
      tooltipElements[0]
    );
    const moveForwardTooltip = /** @type {HTMLElement | undefined} */ (
      tooltipElements[1]
    );
    const moveBackwardButton = /** @type {HTMLButtonElement | undefined} */ (
      buttonElements[0]
    );
    const moveForwardButton = /** @type {HTMLButtonElement | undefined} */ (
      buttonElements[1]
    );

    if (moveBackwardButton && moveBackwardTooltip) {
      moveBackwardButton.innerHTML = getBackwardMoveIcon();
      moveBackwardTooltip.setAttribute('data-tip', getBackwardMoveTooltip());
    }

    if (moveForwardButton && moveForwardTooltip) {
      moveForwardButton.innerHTML = getForwardMoveIcon();
      moveForwardTooltip.setAttribute('data-tip', getForwardMoveTooltip());
    }
  });
}

// Initialize theme monitoring
initializeThemeMonitoring();

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
      'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads',
    );
    iframe.setAttribute('allow', 'fullscreen');

    // Apply current theme to iframe
    applyThemeToIframe(iframe, currentTheme);

    // Inject monitoring script when iframe loads
    iframe.addEventListener('load', async () => {
      requestBackgroundInjection(iframe);

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
      'absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50';

    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.className =
      'flex flex-row gap-2 items-center justify-center bg-black/50 backdrop-blur-sm rounded-full p-1';

    const moveLeftButton = createControlButton({
      icon: getBackwardMoveIcon(),
      title: getBackwardMoveTooltip(),
      onClick: (e) => {
        e.stopPropagation();
        swapIframeWithNeighbor(iframeWrapper, 'left');
      },
    });

    const moveRightButton = createControlButton({
      icon: getForwardMoveIcon(),
      title: getForwardMoveTooltip(),
      onClick: (e) => {
        e.stopPropagation();
        swapIframeWithNeighbor(iframeWrapper, 'right');
      },
    });

    const layoutToggleButton = createControlButton({
      icon: currentLayout === 'horizontal' ? icons.bars : icons.columns,
      title:
        currentLayout === 'horizontal'
          ? 'Switch to vertical layout'
          : 'Switch to horizontal layout',
      className: 'layout-toggle-btn',
      onClick: (e) => {
        e.stopPropagation();
        toggleLayout();
      },
    });

    const reloadButton = createControlButton({
      icon: icons.reload,
      title: 'Reload iframe',
      onClick: (e) => {
        e.stopPropagation();
        // Get the current URL from iframe data
        const data = iframeData.get(iframe.name);
        const currentUrl = data ? data.url : iframe.src;
        // Clear any existing timeout
        clearIframeLoadTimeout(iframe.name);
        // Reset loaded state
        if (data) {
          data.loaded = false;
        }
        // Reload the iframe by setting src to current URL
        // This will trigger a new load event, which will set up new timeouts
        iframe.src = currentUrl;
      },
    });

    const restoreButton = createControlButton({
      icon: icons.arrowTopRight,
      title: 'Restore as browser tab',
      onClick: async (e) => {
        e.stopPropagation();
        // Get the current URL from iframe data
        const data = iframeData.get(iframe.name);
        const currentUrl = data ? data.url : iframe.src;
        // Open the URL in a new tab
        await chrome.tabs.create({ url: currentUrl });
        // Remove this iframe
        removeIframeWrapper(iframeWrapper);
      },
    });

    const deleteButton = createControlButton({
      icon: icons.trash,
      title: 'Delete from split page',
      className: 'bg-red-500/70 hover:bg-red-600/90 text-white',
      onClick: (e) => {
        e.stopPropagation();
        removeIframeWrapper(iframeWrapper);
      },
    });

    // Update button states on hover to reflect current position
    iframeWrapper.addEventListener('mouseenter', () => {
      updateMoveButtonStates(
        iframeWrapper,
        moveLeftButton.btn,
        moveRightButton.btn,
      );
    });

    controlBar.appendChild(buttonsWrapper);
    buttonsWrapper.appendChild(moveLeftButton.tooltip);
    buttonsWrapper.appendChild(moveRightButton.tooltip);
    buttonsWrapper.appendChild(layoutToggleButton.tooltip);
    buttonsWrapper.appendChild(reloadButton.tooltip);
    buttonsWrapper.appendChild(restoreButton.tooltip);
    buttonsWrapper.appendChild(deleteButton.tooltip);

    // Set initial button states
    // Use setTimeout to ensure all iframes are in the DOM first
    setTimeout(() => {
      updateMoveButtonStates(
        iframeWrapper,
        moveLeftButton.btn,
        moveRightButton.btn,
      );
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
      divider.className = `iframe-divider bg-gray-300 dark:bg-gray-600 ${currentLayout}`;
      divider.style.order = String(index * 2 + 1);
      if (currentLayout === 'horizontal') {
        divider.style.width = '4px';
      } else {
        divider.style.height = '4px';
      }
      divider.style.flexShrink = '0';

      // Add + button to divider
      addPlusButtonToDivider(divider);

      iframeContainer.appendChild(divider);
    }
  });

  // Apply the current layout (in case it was loaded from URL state)
  applyLayout(storedSizes);

  // Set up basic resizing functionality
  setupResizing();

  // Add edge plus buttons
  addEdgePlusButtons();

  // Update plus button visibility based on iframe count
  updatePlusButtonVisibility();

  // Check if we should show the embedded tab picker (only one iframe)
  checkAndShowEmbeddedTabPicker();

  // Save the split page URL to storage when page loads
  void saveSplitPageUrl();
}

// Global resize state and handlers (to avoid duplicate event listeners)
let isResizing = false;
let resizeCurrentIndex = -1;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartLeftWidth = 0;
let resizeStartRightWidth = 0;
let resizeStartTopHeight = 0;
let resizeStartBottomHeight = 0;
let resizeLeftWrapper = null;
let resizeRightWrapper = null;
let resizeTopWrapper = null;
let resizeBottomWrapper = null;
let resizeOtherWrapperWidths = [];
let resizeOtherWrapperHeights = [];

/**
 * Handle mouse move during resize
 * @param {MouseEvent} e
 */
function handleResizeMouseMove(e) {
  if (!isResizing || resizeCurrentIndex === -1) return;

  e.preventDefault();

  if (currentLayout === 'horizontal') {
    // Horizontal layout: resize widths
    if (!resizeLeftWrapper || !resizeRightWrapper) return;

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

    // Get total width including all iframes
    const totalWidth =
      newLeftWidth +
      newRightWidth +
      resizeOtherWrapperWidths.reduce((sum, { width }) => sum + width, 0);

    // Calculate percentages
    const leftPercent = (newLeftWidth / totalWidth) * 100;
    const rightPercent = (newRightWidth / totalWidth) * 100;

    // Set percentage-based flex values for the two adjacent iframes
    resizeLeftWrapper.style.flex = `${leftPercent} 0 0`;
    resizeRightWrapper.style.flex = `${rightPercent} 0 0`;

    // Keep all other iframes at their proportional widths
    resizeOtherWrapperWidths.forEach(({ wrapper, width }) => {
      const percent = (width / totalWidth) * 100;
      wrapper.style.flex = `${percent} 0 0`;
    });
  } else {
    // Vertical layout: resize heights
    if (!resizeTopWrapper || !resizeBottomWrapper) return;

    const deltaY = e.clientY - resizeStartY;

    // Calculate new heights for the two adjacent iframes
    let newTopHeight = resizeStartTopHeight + deltaY;
    let newBottomHeight = resizeStartBottomHeight - deltaY;

    // Apply minimum height constraint (50px)
    const minHeight = 50;
    if (newTopHeight < minHeight) {
      newTopHeight = minHeight;
      newBottomHeight =
        resizeStartTopHeight + resizeStartBottomHeight - minHeight;
    }
    if (newBottomHeight < minHeight) {
      newBottomHeight = minHeight;
      newTopHeight = resizeStartTopHeight + resizeStartBottomHeight - minHeight;
    }

    // Get total height including all iframes
    const totalHeight =
      newTopHeight +
      newBottomHeight +
      resizeOtherWrapperHeights.reduce((sum, { height }) => sum + height, 0);

    // Calculate percentages
    const topPercent = (newTopHeight / totalHeight) * 100;
    const bottomPercent = (newBottomHeight / totalHeight) * 100;

    // Set percentage-based flex values for the two adjacent iframes
    resizeTopWrapper.style.flex = `${topPercent} 0 0`;
    resizeBottomWrapper.style.flex = `${bottomPercent} 0 0`;

    // Keep all other iframes at their proportional heights
    resizeOtherWrapperHeights.forEach(({ wrapper, height }) => {
      const percent = (height / totalHeight) * 100;
      wrapper.style.flex = `${percent} 0 0`;
    });
  }
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
  resizeTopWrapper = null;
  resizeBottomWrapper = null;
  resizeOtherWrapperWidths = [];
  resizeOtherWrapperHeights = [];

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

  updateUrlStateParameter();
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
      resizeStartY = mouseEvent.clientY;

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
      const firstWrapperEl = wrappers.find(
        (w) =>
          parseInt(/** @type {HTMLElement} */ (w).style.order) ===
          dividerOrder - 1,
      );
      const secondWrapperEl = wrappers.find(
        (w) =>
          parseInt(/** @type {HTMLElement} */ (w).style.order) ===
          dividerOrder + 1,
      );

      if (!firstWrapperEl || !secondWrapperEl) {
        console.error(
          'Could not find adjacent wrappers for divider',
          dividerOrder,
        );
        return;
      }

      if (currentLayout === 'horizontal') {
        // Horizontal layout: resize widths (left/right)
        resizeLeftWrapper = /** @type {HTMLElement} */ (firstWrapperEl);
        resizeRightWrapper = /** @type {HTMLElement} */ (secondWrapperEl);

        // Store initial widths of the two adjacent iframes
        resizeStartLeftWidth = resizeLeftWrapper.getBoundingClientRect().width;
        resizeStartRightWidth =
          resizeRightWrapper.getBoundingClientRect().width;

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

        document.body.style.cursor = 'col-resize';
      } else {
        // Vertical layout: resize heights (top/bottom)
        resizeTopWrapper = /** @type {HTMLElement} */ (firstWrapperEl);
        resizeBottomWrapper = /** @type {HTMLElement} */ (secondWrapperEl);

        // Store initial heights of the two adjacent iframes
        resizeStartTopHeight = resizeTopWrapper.getBoundingClientRect().height;
        resizeStartBottomHeight =
          resizeBottomWrapper.getBoundingClientRect().height;

        // Store heights of all other iframes to keep them fixed
        resizeOtherWrapperHeights = wrappers
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
            height: wrapper.getBoundingClientRect().height,
          }));

        document.body.style.cursor = 'row-resize';
      }

      // Visual feedback
      newDivider.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
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

  // Handle iframe reload request
  if (event.data.type === 'request-iframe-reload') {
    const { frameName } = event.data;
    const data = iframeData.get(frameName);
    if (data && data.wrapper) {
      const iframe = data.wrapper.querySelector('iframe');
      if (iframe) {
        console.log('[split] Reloading iframe from request:', frameName);
        const currentUrl = data.url || iframe.src;
        clearIframeLoadTimeout(iframe.name);
        data.loaded = false;
        iframe.src = currentUrl;
      }
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
 * Save or update the current split page URL in Chrome storage
 */
async function saveSplitPageUrl() {
  try {
    const currentUrl = window.location.href;
    const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
    
    // Only save if this is a split page
    if (!currentUrl.startsWith(splitBaseUrl)) {
      return;
    }

    // Get existing split page URLs
    const result = await chrome.storage.local.get(['splitPageUrls']);
    const existingUrls = Array.isArray(result.splitPageUrls)
      ? result.splitPageUrls
      : [];

    // Remove this URL if it already exists (to avoid duplicates)
    const filteredUrls = existingUrls.filter((url) => url !== currentUrl);

    // Add current URL
    const updatedUrls = [...filteredUrls, currentUrl];

    // Save to storage
    await chrome.storage.local.set({ splitPageUrls: updatedUrls });
    console.log('[split] Saved split page URL:', currentUrl);
  } catch (error) {
    console.error('[split] Failed to save split page URL:', error);
  }
}

/**
 * Remove the current split page URL from Chrome storage
 */
async function removeSplitPageUrl() {
  try {
    const currentUrl = window.location.href;
    const splitBaseUrl = chrome.runtime.getURL('src/split/split.html');
    
    // Only remove if this is a split page
    if (!currentUrl.startsWith(splitBaseUrl)) {
      return;
    }

    // Get existing split page URLs
    const result = await chrome.storage.local.get(['splitPageUrls']);
    const existingUrls = Array.isArray(result.splitPageUrls)
      ? result.splitPageUrls
      : [];

    // Remove current URL
    const updatedUrls = existingUrls.filter((url) => url !== currentUrl);

    // Save to storage
    await chrome.storage.local.set({ splitPageUrls: updatedUrls });
    console.log('[split] Removed split page URL:', currentUrl);
  } catch (error) {
    console.error('[split] Failed to remove split page URL:', error);
  }
}

/**
 * Update the URL state parameter to reflect iframe URLs, layout, and size ratios
 */
function updateUrlStateParameter() {
  if (!iframeContainer) return;

  /** @type {{ url: string, size: number }[]} */
  const entries = [];

  const wrappers = Array.from(
    document.querySelectorAll('.iframe-wrapper'),
  ).sort((a, b) => {
    const orderA = Number.parseInt(
      /** @type {HTMLElement} */ (a).style.order || '0',
      10,
    );
    const orderB = Number.parseInt(
      /** @type {HTMLElement} */ (b).style.order || '0',
      10,
    );
    return orderA - orderB;
  });

  wrappers.forEach((wrapper) => {
    const iframe = wrapper.querySelector('iframe');
    if (!iframe) return;

    const iframeEl = /** @type {HTMLIFrameElement} */ (iframe);
    const iframeName = iframeEl.name;
    const data = iframeData.get(iframeName);
    const url = data && data.url ? data.url : iframeEl.src;

    if (!url || url === 'about:blank') {
      return;
    }

    const rect = /** @type {HTMLElement} */ (wrapper).getBoundingClientRect();
    const size = currentLayout === 'horizontal' ? rect.width : rect.height;

    entries.push({ url, size });
  });

  const sizeTotal = entries.reduce((sum, entry) => sum + entry.size, 0);
  const sizes =
    entries.length > 0 && sizeTotal > 0
      ? entries.map((entry) =>
          Number(((entry.size / sizeTotal) * 100).toFixed(4)),
        )
      : [];

  const currentUrls = entries.map((entry) => entry.url);

  const newState = {
    urls: currentUrls,
    layout: currentLayout,
    sizes,
  };

  const newUrl = `${window.location.pathname}?state=${encodeURIComponent(
    JSON.stringify(newState),
  )}`;

  window.history.replaceState(null, '', newUrl);
  
  // Save the updated URL to storage
  void saveSplitPageUrl();
}

/**
 * Set up a timeout to detect if iframe fails to load at all
 * @param {string} frameName - The iframe name
 * @param {HTMLElement} wrapper - The wrapper element
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - The URL being loaded
 * @param {number} timeoutMs - Timeout in milliseconds
 */
function setupIframeLoadTimeout(
  frameName,
  wrapper,
  iframe,
  url,
  timeoutMs = 10000,
) {
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
      console.log(
        '[split] Iframe loaded but content script did not run - likely blocked:',
        url,
      );
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

  // Store iframe name for retry
  const iframeName = iframe.name;

  const errorDiv = document.createElement('div');
  errorDiv.className =
    'iframe-error-message flex flex-col items-center justify-center h-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300';
  errorDiv.innerHTML = `
    <div class="text-center p-8 max-w-md">
      <div class="text-6xl mb-4">🔒</div>
      <p class="font-semibold text-lg mb-2">${message}</p>
      <p class="text-sm mb-4 opacity-80">Due to browser security policies, some sites (like X.com, Perplexity) cannot be embedded in iframes.</p>
      <div class="flex gap-2 justify-center">
        <button class="retry-btn bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          Retry
        </button>
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
  const retryBtn = errorDiv.querySelector('.retry-btn');
  const openBtn = errorDiv.querySelector('.open-in-tab-btn');
  const removeBtn = errorDiv.querySelector('.remove-frame-btn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      // Remove error div
      errorDiv.remove();

      // Create new iframe with same configuration
      const newIframe = document.createElement('iframe');
      newIframe.src = url;
      newIframe.name = iframeName;
      newIframe.className = 'w-full h-full border-0';
      newIframe.setAttribute(
        'sandbox',
        'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads',
      );
      newIframe.setAttribute('allow', 'fullscreen');

      // Apply current theme to iframe
      applyThemeToIframe(newIframe, currentTheme);

      // Reset loaded state in iframeData
      const data = iframeData.get(iframeName);
      if (data) {
        data.loaded = false;
      }

      // Inject monitoring script when iframe loads
      newIframe.addEventListener('load', async () => {
        requestBackgroundInjection(newIframe);
        setupIframeLoadedCheck(iframeName, iframeWrapper, newIframe, url);
      });

      // Add error handling for iframe loading
      newIframe.addEventListener('error', () => {
        clearIframeLoadTimeout(iframeName);
        showIframeError(iframeWrapper, newIframe, url, 'Failed to load page');
      });

      // Set up initial timeout for iframe loading
      setupIframeLoadTimeout(iframeName, iframeWrapper, newIframe, url, 10000);

      // Insert the new iframe as the first child (before control bar and URL display)
      iframeWrapper.insertBefore(newIframe, iframeWrapper.firstChild);
    });
  }

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
    'divider-plus-btn absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg transition-all duration-200 z-10 cursor-pointer';
  plusButton.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
 * Add + buttons to the edges of the split page
 */
function addEdgePlusButtons() {
  // Create edge buttons
  const firstEdgeButton = document.createElement('button');
  firstEdgeButton.id = 'nenya-edge-plus-first';
  firstEdgeButton.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
  `;

  const secondEdgeButton = document.createElement('button');
  secondEdgeButton.id = 'nenya-edge-plus-second';
  secondEdgeButton.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
  `;

  // Add event listeners
  firstEdgeButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const position = currentLayout === 'horizontal' ? 'left' : 'top';
    await showTabPicker({ x: e.clientX, y: e.clientY }, (tab) => {
      insertIframeAtEdge(position, tab);
    });
  });

  secondEdgeButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const position = currentLayout === 'horizontal' ? 'right' : 'bottom';
    await showTabPicker({ x: e.clientX, y: e.clientY }, (tab) => {
      insertIframeAtEdge(position, tab);
    });
  });

  // Append to body
  document.body.appendChild(firstEdgeButton);
  document.body.appendChild(secondEdgeButton);

  // Set initial positions
  updateEdgePlusButtons();
}

/**
 * Update the position and tooltips of edge plus buttons based on layout
 */
function updateEdgePlusButtons() {
  const firstBtn = document.getElementById('nenya-edge-plus-first');
  const secondBtn = document.getElementById('nenya-edge-plus-second');

  if (!firstBtn || !secondBtn) return;

  const baseClasses =
    'edge-plus-btn fixed bg-blue-500 hover:bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg transition-all duration-200 z-10 opacity-50 hover:opacity-100 cursor-pointer';

  if (currentLayout === 'horizontal') {
    // Left button
    firstBtn.className = `${baseClasses} left-2 top-1/2 -translate-y-1/2`;
    firstBtn.title = 'Add tab to the left';
    // Right button
    secondBtn.className = `${baseClasses} right-2 top-1/2 -translate-y-1/2`;
    secondBtn.title = 'Add tab to the right';
  } else {
    // Vertical layout
    // Top button
    firstBtn.className = `${baseClasses} top-2 left-1/2 -translate-x-1/2`;
    firstBtn.title = 'Add tab to the top';
    // Bottom button
    secondBtn.className = `${baseClasses} bottom-2 left-1/2 -translate-x-1/2`;
    secondBtn.title = 'Add tab to the bottom';
  }
}

/**
 * Update plus button visibility based on iframe count
 */
function updatePlusButtonVisibility() {
  const wrappers = document.querySelectorAll('.iframe-wrapper');
  // Hide plus buttons if there are 4+ iframes OR if there's only 1 (embedded picker shows)
  const shouldHide = wrappers.length >= 4 || wrappers.length === 1;

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
  newDivider.className = `iframe-divider bg-gray-300 dark:bg-gray-600 ${currentLayout}`;
  newDivider.style.order = String(dividerOrder + 2);
  if (currentLayout === 'horizontal') {
    newDivider.style.width = '4px';
  } else {
    newDivider.style.height = '4px';
  }
  newDivider.style.flexShrink = '0';
  addPlusButtonToDivider(newDivider);
  iframeContainer.appendChild(newDivider);

  // Rebalance flex sizes
  rebalanceIframeSizes();

  // Re-setup resizing
  setupResizing();

  // Update visibility
  updatePlusButtonVisibility();

  // Check if we should show/hide embedded tab picker
  checkAndShowEmbeddedTabPicker();

  // Close the source tab after iframe loads
  const iframe = iframeWrapper.querySelector('iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      chrome.tabs.remove(tab.id);
    });
  }
}

/**
 * Insert an iframe at an edge of the layout
 * @param {'left' | 'right' | 'top' | 'bottom'} position
 * @param {chrome.tabs.Tab} tab
 */
function insertIframeAtEdge(position, tab) {
  if (!iframeContainer) return;

  const wrappers = Array.from(document.querySelectorAll('.iframe-wrapper'));
  if (wrappers.length === 0) return;

  // Hide embedded picker before calculating orders to avoid order conflicts
  hideEmbeddedTabPickerPanel();

  let newOrder;
  if (position === 'left' || position === 'top') {
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
    // Only consider iframe-wrapper elements, not other elements like the embedded picker
    const wrapperElements = Array.from(iframeContainer.children).filter(
      (el) => el.classList.contains('iframe-wrapper'),
    );
    const maxOrder = Math.max(
      ...wrapperElements.map((el) =>
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
  divider.className = `iframe-divider bg-gray-300 dark:bg-gray-600 ${currentLayout}`;
  divider.style.order = String(
    position === 'left' || position === 'top' ? newOrder + 1 : newOrder - 1,
  );
  if (currentLayout === 'horizontal') {
    divider.style.width = '4px';
  } else {
    divider.style.height = '4px';
  }
  divider.style.flexShrink = '0';
  addPlusButtonToDivider(divider);
  iframeContainer.appendChild(divider);

  // Rebalance flex sizes
  rebalanceIframeSizes();

  // Re-setup resizing
  setupResizing();

  // Update visibility
  updatePlusButtonVisibility();

  // Check if we should show/hide embedded tab picker
  checkAndShowEmbeddedTabPicker();

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
    'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads',
  );
  iframe.setAttribute('allow', 'fullscreen');

  // Apply current theme to iframe
  applyThemeToIframe(iframe, currentTheme);

  // Inject monitoring script when iframe loads
  iframe.addEventListener('load', async () => {
    requestBackgroundInjection(iframe);

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
    'absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50';

  const buttonsWrapper = document.createElement('div');
  buttonsWrapper.className =
    'flex flex-row gap-2 items-center justify-center bg-black/50 backdrop-blur-sm rounded-full p-1';

  const moveLeftButton = createControlButton({
    icon: getBackwardMoveIcon(),
    title: getBackwardMoveTooltip(),
    onClick: (e) => {
      e.stopPropagation();
      swapIframeWithNeighbor(iframeWrapper, 'left');
    },
  });

  const moveRightButton = createControlButton({
    icon: getForwardMoveIcon(),
    title: getForwardMoveTooltip(),
    onClick: (e) => {
      e.stopPropagation();
      swapIframeWithNeighbor(iframeWrapper, 'right');
    },
  });

  const layoutToggleButton = createControlButton({
    icon: currentLayout === 'horizontal' ? icons.bars : icons.columns,
    title:
      currentLayout === 'horizontal'
        ? 'Switch to vertical layout'
        : 'Switch to horizontal layout',
    className: 'layout-toggle-btn',
    onClick: (e) => {
      e.stopPropagation();
      toggleLayout();
    },
  });

  const reloadButton = createControlButton({
    icon: icons.reload,
    title: 'Reload iframe',
    onClick: (e) => {
      e.stopPropagation();
      // Get the current URL from iframe data
      const data = iframeData.get(iframe.name);
      const currentUrl = data ? data.url : iframe.src;
      // Clear any existing timeout
      clearIframeLoadTimeout(iframe.name);
      // Reset loaded state
      if (data) {
        data.loaded = false;
      }
      // Reload the iframe by setting src to current URL
      // This will trigger a new load event, which will set up new timeouts
      iframe.src = currentUrl;
    },
  });

  const restoreButton = createControlButton({
    icon: icons.arrowTopRight,
    title: 'Restore as browser tab',
    onClick: async (e) => {
      e.stopPropagation();
      const data = iframeData.get(iframe.name);
      const currentUrl = data ? data.url : iframe.src;
      await chrome.tabs.create({ url: currentUrl });
      removeIframeWrapper(iframeWrapper);
    },
  });

  const deleteButton = createControlButton({
    icon: icons.trash,
    title: 'Delete from split page',
    className: 'bg-red-500/70 hover:bg-red-600/90 text-white',
    onClick: (e) => {
      e.stopPropagation();
      removeIframeWrapper(iframeWrapper);
    },
  });

  // Update button states on hover to reflect current position
  iframeWrapper.addEventListener('mouseenter', () => {
    updateMoveButtonStates(
      iframeWrapper,
      moveLeftButton.btn,
      moveRightButton.btn,
    );
  });

  controlBar.appendChild(buttonsWrapper);
  buttonsWrapper.appendChild(moveLeftButton.tooltip);
  buttonsWrapper.appendChild(moveRightButton.tooltip);
  buttonsWrapper.appendChild(layoutToggleButton.tooltip);
  buttonsWrapper.appendChild(reloadButton.tooltip);
  buttonsWrapper.appendChild(restoreButton.tooltip);
  buttonsWrapper.appendChild(deleteButton.tooltip);

  // Set initial button states
  // Use setTimeout to ensure all iframes are in the DOM first
  setTimeout(() => {
    updateMoveButtonStates(
      iframeWrapper,
      moveLeftButton.btn,
      moveRightButton.btn,
    );
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
 * Apply stored iframe size percentages to the current layout
 * @param {number[]} sizes
 */
function applyStoredIframeSizes(sizes) {
  if (!iframeContainer) return;

  const wrappers = Array.from(document.querySelectorAll('.iframe-wrapper'));

  if (wrappers.length !== sizes.length) {
    rebalanceIframeSizes();
    return;
  }

  const sanitizedSizes = sizes.map((value) =>
    Number.isFinite(value) && value >= 0 ? value : 0,
  );
  const total = sanitizedSizes.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    rebalanceIframeSizes();
    return;
  }

  // Apply percentage-based flex values directly
  wrappers.forEach((wrapper, index) => {
    const percent = (sanitizedSizes[index] / total) * 100;
    /** @type {HTMLElement} */ (wrapper).style.flex = `${percent} 0 0`;
  });
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
    // No iframes left, remove from storage and close the split page tab
    void removeSplitPageUrl();
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

    // Check if we should show/hide embedded tab picker
    checkAndShowEmbeddedTabPicker();

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

/**
 * Check if we should show the embedded tab picker (only when there's one iframe)
 */
async function checkAndShowEmbeddedTabPicker() {
  const wrappers = document.querySelectorAll('.iframe-wrapper');

  if (wrappers.length === 1) {
    await showEmbeddedTabPickerPanel();
  } else {
    hideEmbeddedTabPickerPanel();
  }
}

/**
 * Show the embedded tab picker panel taking up 50% of the space
 */
async function showEmbeddedTabPickerPanel() {
  if (!iframeContainer) return;

  // Remove any existing embedded picker
  const existing = document.getElementById('nenya-embedded-tab-picker-wrapper');
  if (existing) {
    existing.remove();
  }

  // Create wrapper for the embedded picker with padding
  const pickerWrapper = document.createElement('div');
  pickerWrapper.id = 'nenya-embedded-tab-picker-wrapper';
  pickerWrapper.className =
    'flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 min-w-0';
  // Set to exactly 50% using flex-basis
  pickerWrapper.style.flex = '0 0 50%';
  pickerWrapper.style.order = '1000'; // Place it at the end

  // Create card container for the picker
  const cardContainer = document.createElement('div');
  cardContainer.className =
    'w-full h-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden';

  // Create the embedded picker
  const picker = await createEmbeddedTabPicker((tab) => {
    // When a tab is selected, add it as a new iframe
    insertIframeAtEdge('right', tab);
  });

  cardContainer.appendChild(picker);
  pickerWrapper.appendChild(cardContainer);
  iframeContainer.appendChild(pickerWrapper);

  // Adjust the single iframe to take up exactly 50% of the space
  const wrapper = document.querySelector('.iframe-wrapper');
  if (wrapper) {
    /** @type {HTMLElement} */ (wrapper).style.flex = '0 0 50%';
  }
}

/**
 * Hide the embedded tab picker panel
 */
function hideEmbeddedTabPickerPanel() {
  const existing = document.getElementById('nenya-embedded-tab-picker-wrapper');
  if (existing) {
    existing.remove();
  }
}
