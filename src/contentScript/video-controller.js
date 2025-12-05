(function () {
  'use strict';

  const MIN_VIDEO_WIDTH = 640;
  const MIN_VIDEO_HEIGHT = 360;
  const VIDEO_ENHANCEMENT_RULES_KEY = 'videoEnhancementRules';

  /**
   * @typedef {Object} VideoEnhancementRule
   * @property {string} id
   * @property {string} pattern
   * @property {'url-pattern' | 'wildcard'} patternType
   * @property {{ autoFullscreen?: boolean }} enhancements
   * @property {boolean} [disabled]
   */

  /** @type {VideoEnhancementRule[]} */
  let videoEnhancementRules = [];

  const autoFullscreenState = {
    /** @type {string | null} */
    lockedRuleId: null,
    /** @type {HTMLVideoElement | null} */
    activeVideo: null,
    /** @type {HTMLVideoElement | null} */
    lastTargetVideo: null,
    /** @type {string} */
    url: '',
  };

  let autoFullscreenEvaluationInProgress = false;
  let autoFullscreenEvaluationPending = false;
  let lastObservedUrl = window.location.href;

  /**
   * @param {unknown} value
   * @returns {VideoEnhancementRule[]}
   */
  function normalizeVideoEnhancementRules(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    /** @type {VideoEnhancementRule[]} */
    const sanitized = [];
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, pattern?: unknown, patternType?: unknown, enhancements?: { autoFullscreen?: unknown }, disabled?: unknown }} */ (
          entry
        );
      const id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      const pattern =
        typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      if (!id || !pattern) {
        return;
      }

      /** @type {'url-pattern' | 'wildcard'} */
      const patternType =
        raw.patternType === 'wildcard' ? 'wildcard' : 'url-pattern';

      sanitized.push({
        id,
        pattern,
        patternType,
        enhancements: {
          autoFullscreen: Boolean(raw.enhancements?.autoFullscreen),
        },
        disabled: Boolean(raw.disabled),
      });
    });
    return sanitized;
  }

  /**
   * @returns {Promise<VideoEnhancementRule[]>}
   */
  async function loadVideoEnhancementRulesFromStorage() {
    if (!chrome?.storage?.local) {
      return [];
    }
    try {
      const stored = await chrome.storage.local.get(
        VIDEO_ENHANCEMENT_RULES_KEY,
      );
      return normalizeVideoEnhancementRules(
        stored?.[VIDEO_ENHANCEMENT_RULES_KEY],
      );
    } catch (error) {
      console.warn(
        '[video-controller] Failed to load video enhancement rules:',
        error,
      );
      return [];
    }
  }

  /**
   * @param {string} pattern
   * @param {string} url
   * @returns {boolean}
   */
  function matchesWildcardPattern(pattern, url) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      const regex = new RegExp('^' + escaped + '$');
      return regex.test(url);
    } catch (error) {
      const fallbackNeedle = pattern.replace(/\*/g, '').trim();
      return fallbackNeedle ? url.includes(fallbackNeedle) : false;
    }
  }

  /**
   * @param {string} pattern
   * @param {string} url
   * @returns {boolean}
   */
  function matchesUrlPatternWithFallback(pattern, url) {
    try {
      const urlPattern = new URLPattern(pattern);
      return urlPattern.test(url);
    } catch (error) {
      if (pattern.includes('*')) {
        return matchesWildcardPattern(pattern, url);
      }
      return url.includes(pattern);
    }
  }

  /**
   * @param {string} url
   * @returns {VideoEnhancementRule | undefined}
   */
  function getMatchingRule(url) {
    return videoEnhancementRules.find((rule) => {
      if (
        rule.disabled ||
        !rule.enhancements?.autoFullscreen ||
        !rule.pattern
      ) {
        return false;
      }
      if (rule.patternType === 'wildcard') {
        return matchesWildcardPattern(rule.pattern, url);
      }
      return matchesUrlPatternWithFallback(rule.pattern, url);
    });
  }

  /**
   * Reset all tracking so automation can run again.
   */
  function releaseAutoFullscreenLock() {
    autoFullscreenState.lockedRuleId = null;
    autoFullscreenState.lastTargetVideo = null;
    autoFullscreenState.activeVideo = null;
    autoFullscreenState.url = '';
  }

  /**
   * Mark the currently tracked fullscreen video as inactive.
   * @param {HTMLVideoElement} video
   */
  function markAutoFullscreenInactive(video) {
    if (autoFullscreenState.lastTargetVideo === video) {
      autoFullscreenState.activeVideo = null;
    }
  }

  /**
   * Ensure state reflects current URL and DOM.
   */
  function ensureAutoStateForCurrentUrl() {
    const currentUrl = window.location.href;
    if (
      autoFullscreenState.url &&
      autoFullscreenState.url !== currentUrl
    ) {
      releaseAutoFullscreenLock();
      return;
    }
    if (
      autoFullscreenState.lastTargetVideo &&
      !autoFullscreenState.lastTargetVideo.isConnected
    ) {
      releaseAutoFullscreenLock();
    }
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} [timeoutMs=2000]
   * @returns {Promise<void>}
   */
  function waitForVideoMetadata(video, timeoutMs = 2000) {
    if (video.readyState >= 1) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const onLoaded = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      }, timeoutMs);
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
  }

  /**
   * @returns {Promise<HTMLVideoElement | null>}
   */
  async function findDominantVideo() {
    const candidates = Array.from(document.querySelectorAll('video')).filter(
      (element) => element instanceof HTMLVideoElement,
    );
    if (candidates.length === 0) {
      return null;
    }

    await Promise.all(
      candidates.map((video) => waitForVideoMetadata(video)),
    );

    const scored = candidates
      .map((video) => {
        const width = video.videoWidth || video.clientWidth || 0;
        const height = video.videoHeight || video.clientHeight || 0;
        const area = width * height;
        return {
          video,
          area,
          meetsThreshold:
            width >= MIN_VIDEO_WIDTH && height >= MIN_VIDEO_HEIGHT,
        };
      })
      .sort((a, b) => b.area - a.area);

    const preferred =
      scored.find((entry) => entry.meetsThreshold) || scored[0];
    return preferred ? preferred.video : null;
  }

  /**
   * @param {string} reason
   */
  function scheduleAutoFullscreenEvaluation(reason) {
    if (autoFullscreenEvaluationInProgress) {
      autoFullscreenEvaluationPending = true;
      return;
    }
    autoFullscreenEvaluationInProgress = true;
    void (async () => {
      try {
        await evaluateAutoFullscreen(reason);
      } finally {
        autoFullscreenEvaluationInProgress = false;
        if (autoFullscreenEvaluationPending) {
          autoFullscreenEvaluationPending = false;
          scheduleAutoFullscreenEvaluation('retry');
        }
      }
    })();
  }

  /**
   * @param {string} reason
   */
  async function evaluateAutoFullscreen(reason) {
    ensureAutoStateForCurrentUrl();

    const url = window.location.href;
    if (!videoEnhancementRules.length) {
      if (autoFullscreenState.activeVideo) {
        exitFullscreen(autoFullscreenState.activeVideo);
      }
      releaseAutoFullscreenLock();
      return;
    }

    const matchingRule = getMatchingRule(url);
    if (!matchingRule) {
      if (autoFullscreenState.activeVideo) {
        exitFullscreen(autoFullscreenState.activeVideo);
      }
      releaseAutoFullscreenLock();
      return;
    }

    const existingFullscreen = document.querySelector('.video-fullscreen');
    if (
      existingFullscreen &&
      existingFullscreen instanceof HTMLVideoElement &&
      existingFullscreen !== autoFullscreenState.activeVideo &&
      existingFullscreen !== autoFullscreenState.lastTargetVideo
    ) {
      return;
    }

    const dominantVideo = await findDominantVideo();
    if (!dominantVideo) {
      return;
    }

    if (
      autoFullscreenState.lockedRuleId === matchingRule.id &&
      autoFullscreenState.lastTargetVideo &&
      autoFullscreenState.lastTargetVideo.isConnected &&
      autoFullscreenState.lastTargetVideo === dominantVideo
    ) {
      return;
    }

    if (dominantVideo.classList.contains('video-fullscreen')) {
      autoFullscreenState.lockedRuleId = matchingRule.id;
      autoFullscreenState.activeVideo = dominantVideo;
      autoFullscreenState.lastTargetVideo = dominantVideo;
      autoFullscreenState.url = url;
      return;
    }

    try {
      enterFullscreen(dominantVideo);
      autoFullscreenState.lockedRuleId = matchingRule.id;
      autoFullscreenState.activeVideo = dominantVideo;
      autoFullscreenState.lastTargetVideo = dominantVideo;
      autoFullscreenState.url = url;
    } catch (error) {
      console.warn('[video-controller] Failed to enter fullscreen:', error);
    }
  }

  // Store original video data for restoration
  const originalVideoData = new WeakMap();

  // Store fullscreen video observers
  const fullscreenObservers = new WeakMap();

  // Store restoration timeouts to prevent infinite loops
  const restorationTimeouts = new WeakMap();

  /**
   * @param {HTMLVideoElement} video
   */
  function createFullscreenObserver(video) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const attributeName = mutation.attributeName;

          if (attributeName === 'style' || attributeName === 'class') {
            const existingTimeout = restorationTimeouts.get(video);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }

            // Debounce restoration to prevent infinite loops
            const timeout = setTimeout(() => {
              restoreFullscreenState(video);
              restorationTimeouts.delete(video);
            }, 50); // 50ms debounce

            restorationTimeouts.set(video, timeout);
          }
        }
      });
    });

    // Observe the video element for attribute and child changes
    observer.observe(video, {
      attributes: true,
      attributeFilter: ['style', 'controls', 'class'],
      childList: true,
      subtree: false,
    });

    // Also observe document.body to detect if video is moved
    observer.observe(document.body, {
      childList: true,
      subtree: false,
    });

    return observer;
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function restoreFullscreenState(video) {
    // Only restore if video is actually in fullscreen mode
    if (!video.classList.contains('video-fullscreen')) {
      return;
    }

    // Temporarily disable the observer to prevent loops
    const observer = fullscreenObservers.get(video);
    if (observer) {
      observer.disconnect();
    }

    try {
      // Re-apply fullscreen styles only if they're actually missing
      video.style.position = 'fixed';

      if (
        video.style.top !== '0' &&
        video.style.top !== '0px' &&
        video.style.left !== '0%'
      ) {
        video.style.top = '0';
      }
      if (
        video.style.left !== '0' &&
        video.style.left !== '0px' &&
        video.style.left !== '0%'
      ) {
        video.style.left = '0';
      }
      if (video.style.width !== '100vw' && video.style.width !== '100%') {
        video.style.width = '100vw';
      }
      if (video.style.height !== '100vh' && video.style.height !== '100%') {
        video.style.height = '100vh';
      }
      video.style.zIndex = '2147483647';
      video.style.backgroundColor = 'black';
      video.style.objectFit = 'contain';
      video.style.objectPosition = 'center';
      video.style.isolation = 'isolate';

      // Ensure video is in document.body
      if (!document.body.contains(video)) {
        document.body.appendChild(video);
      }

      // Ensure controls stay hidden in fullscreen
      if (video.controls) {
        video.controls = false;
      }

      // Ensure fullscreen class is present
      if (!video.classList.contains('video-fullscreen')) {
        video.classList.add('video-fullscreen');
      }
    } finally {
      // Re-enable the observer
      if (observer) {
        observer.observe(video, {
          attributes: true,
          attributeFilter: ['style', 'controls', 'class'],
          childList: true,
          subtree: false,
        });

        observer.observe(document.body, {
          childList: true,
          subtree: false,
        });
      }
    }
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function enterFullscreen(video) {
    // Store original video data
    const originalParent = video.parentElement;
    const originalNextSibling = video.nextSibling;
    const originalStyle = video.getAttribute('style') || '';
    const originalControls = video.controls;

    originalVideoData.set(video, {
      parent: originalParent,
      nextSibling: originalNextSibling,
      style: originalStyle,
      controls: originalControls,
    });

    // Move video to document body to avoid parent container constraints
    document.body.appendChild(video);

    // Apply fullscreen styles
    video.classList.add('video-fullscreen');
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100vw';
    video.style.height = '100vh';
    video.style.zIndex = '2147483647';
    video.style.backgroundColor = 'black';
    video.style.objectFit = 'contain';
    video.style.objectPosition = 'center';
    video.style.isolation = 'isolate';
    video.style.transform = 'translateZ(0)';

    // Hide video controls in fullscreen for cleaner experience
    video.controls = false;

    // Start monitoring for changes
    const observer = createFullscreenObserver(video);
    fullscreenObservers.set(video, observer);
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function exitFullscreen(video) {
    const originalData = originalVideoData.get(video);
    if (!originalData) return;

    // Remove fullscreen class and reset styles
    video.classList.remove('video-fullscreen');
    video.removeAttribute('style');

    // Restore original style if it existed
    if (originalData.style) {
      video.setAttribute('style', originalData.style);
    }

    // Restore original controls state
    video.controls = originalData.controls;

    // Clear any pending restoration timeout
    const timeout = restorationTimeouts.get(video);
    if (timeout) {
      clearTimeout(timeout);
      restorationTimeouts.delete(video);
    }

    // Stop monitoring for changes
    const observer = fullscreenObservers.get(video);
    if (observer) {
      observer.disconnect();
      fullscreenObservers.delete(video);
    }

    // Move video back to original position
    if (originalData.nextSibling) {
      originalData.parent.insertBefore(video, originalData.nextSibling);
    } else {
      originalData.parent.appendChild(video);
    }

    // Clean up stored data
    originalVideoData.delete(video);
    markAutoFullscreenInactive(video);
  }

  /**
   * Set up PiP tracking event listeners on a video element
   * This should be called for ALL videos to track PiP state, regardless of size
   * @param {HTMLVideoElement} video
   */
  function setupPipTracking(video) {
    // Only set up once per video
    if (video.hasAttribute('data-pip-tracking')) {
      return;
    }
    video.setAttribute('data-pip-tracking', 'true');

    // Track when PiP is entered (via any method - native button or custom button)
    video.addEventListener('enterpictureinpicture', () => {
      // Use callback-style messaging to ensure response is received
      chrome.runtime.sendMessage(
        { type: 'getCurrentTabId' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[video-controller] Runtime error:', chrome.runtime.lastError);
            return;
          }
          
          if (response && response.tabId) {
            chrome.storage.local.set({ pipTabId: response.tabId });
          } else {
            console.error('[video-controller] No tabId in response!');
          }
        }
      );
    });

    video.addEventListener('leavepictureinpicture', () => {
      chrome.storage.local.remove('pipTabId');
      if (!video.paused) {
        video.pause();
      }
    });
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function addControls(video) {
    if (video.hasAttribute('data-video-controller')) {
      return;
    }

    video.setAttribute('data-video-controller', 'true');

    // Ensure PiP tracking is set up for this video
    setupPipTracking(video);

    const container = document.createElement('div');
    container.classList.add('video-controller-container');

    const pipButton = document.createElement('button');
    pipButton.textContent = 'PiP';
    pipButton.classList.add('video-controller-button');
    pipButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          // Just request PiP - the enterpictureinpicture event listener will handle storing the tab ID
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error('[video-controller] PiP failed:', error);
        chrome.storage.local.remove('pipTabId');
      }
    });

    const fullscreenButton = document.createElement('button');
    fullscreenButton.textContent = 'Fullscreen';
    fullscreenButton.classList.add('video-controller-button');
    fullscreenButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video.classList.contains('video-fullscreen')) {
        exitFullscreen(video);
      } else {
        enterFullscreen(video);
      }
    });

    container.appendChild(pipButton);
    container.appendChild(fullscreenButton);

    const parent = video.parentElement;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(container);
    }
  }

  async function findAllLargeUnprocessedVideos() {
    const videos = [...document.querySelectorAll('video')];

    const videosWithMetadata = await Promise.all(
      videos.map(async (video) => {
        /** @type {() => void} */
        await new Promise((resolve) => {
          if (video.readyState >= 1) {
            resolve(void 0);
          }
          video.addEventListener('loadedmetadata', resolve, { once: true });
        });
        return video;
      }),
    );

    const filteredVideos = videosWithMetadata.filter(
      (video) =>
        video.videoWidth >= MIN_VIDEO_WIDTH &&
        video.videoHeight >= MIN_VIDEO_HEIGHT &&
        !video.hasAttribute('data-video-controller'),
    );

    return filteredVideos;
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function processVideoElement(video) {
    addControls(video);
  }

  /**
   * Find and set up PiP tracking for all videos
   */
  function setupPipTrackingForAllVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (video instanceof HTMLVideoElement) {
        setupPipTracking(video);
      }
    });
  }

  const observer = new MutationObserver(async (_mutations) => {
    // Set up PiP tracking for all videos (including new ones)
    setupPipTrackingForAllVideos();
    
    // Add custom controls only for large videos
    const videos = await findAllLargeUnprocessedVideos();
    videos.forEach(processVideoElement);
    scheduleAutoFullscreenEvaluation('mutation');
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // attributes: true,
  });

  // Initial setup
  setupPipTrackingForAllVideos();
  findAllLargeUnprocessedVideos()
    .then((videos) => {
      videos.forEach(processVideoElement);
    })
    .finally(() => {
      scheduleAutoFullscreenEvaluation('initial-dom-scan');
    });

  void (async () => {
    videoEnhancementRules = await loadVideoEnhancementRulesFromStorage();
    scheduleAutoFullscreenEvaluation('rules-loaded');
  })();

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, VIDEO_ENHANCEMENT_RULES_KEY)) {
        return;
      }
      void (async () => {
        videoEnhancementRules = await loadVideoEnhancementRulesFromStorage();
        releaseAutoFullscreenLock();
        scheduleAutoFullscreenEvaluation('rules-updated');
      })();
    });
  }

  window.addEventListener('popstate', () => {
    releaseAutoFullscreenLock();
    scheduleAutoFullscreenEvaluation('history');
  });

  setInterval(() => {
    if (window.location.href !== lastObservedUrl) {
      lastObservedUrl = window.location.href;
      releaseAutoFullscreenLock();
      scheduleAutoFullscreenEvaluation('url-changed');
    }
  }, 1000);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const fullscreenVideo = document.querySelector('.video-fullscreen');
      if (fullscreenVideo && fullscreenVideo instanceof HTMLVideoElement) {
        exitFullscreen(fullscreenVideo);
        e.stopPropagation();
      }
    }
  });
})();
