(function () {
  'use strict';

  const MIN_VIDEO_WIDTH = 640;
  const MIN_VIDEO_HEIGHT = 360;

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
  }

  /**
   * @param {HTMLVideoElement} video
   */
  function addControls(video) {
    if (video.hasAttribute('data-video-controller')) {
      return;
    }

    video.setAttribute('data-video-controller', 'true');

    const container = document.createElement('div');
    container.classList.add('video-controller-container');

    const pipButton = document.createElement('button');
    pipButton.textContent = 'PiP';
    pipButton.classList.add('video-controller-button');
    pipButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      console.log('[video-controller] PiP button clicked');
      try {
        if (document.pictureInPictureElement) {
          console.log('[video-controller] Exiting Picture-in-Picture');
          await document.exitPictureInPicture();
        } else {
          console.log(
            '[video-controller] Requesting Picture-in-Picture for video',
          );
          await video.requestPictureInPicture();
          const response = await chrome.runtime.sendMessage({
            type: 'getCurrentTabId',
          });
          if (response && response.tabId) {
            console.log('[video-controller] Storing pipTabId:', response.tabId);
            await chrome.storage.local.set({ pipTabId: response.tabId });
          }
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

    video.addEventListener('enterpictureinpicture', async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'getCurrentTabId',
        });
        if (response && response.tabId) {
          await chrome.storage.local.set({ pipTabId: response.tabId });
        }
      } catch (error) {
        console.error(
          '[video-controller] Failed to set pipTabId on enter:',
          error,
        );
      }
    });

    video.addEventListener('leavepictureinpicture', () => {
      chrome.storage.local.remove('pipTabId');
      video.pause();
    });

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

  const observer = new MutationObserver(async (_mutations) => {
    const videos = await findAllLargeUnprocessedVideos();
    videos.forEach(processVideoElement);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // attributes: true,
  });

  findAllLargeUnprocessedVideos().then((videos) =>
    videos.forEach(processVideoElement),
  );

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
