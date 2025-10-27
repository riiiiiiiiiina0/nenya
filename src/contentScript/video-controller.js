// src/contentScript/video-controller.js

const MIN_VIDEO_WIDTH = 320;
const MIN_VIDEO_HEIGHT = 180;

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
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
        const response = await chrome.runtime.sendMessage({ type: 'getCurrentTabId' });
        if (response && response.tabId) {
          await chrome.storage.local.set({ pipTabId: response.tabId });
        }
      }
    } catch (error) {
      console.error('PiP failed:', error);
      chrome.storage.local.remove('pipTabId');
    }
  });

  const fullscreenButton = document.createElement('button');
  fullscreenButton.textContent = 'Fullscreen';
  fullscreenButton.classList.add('video-controller-button');
  fullscreenButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.classList.contains('video-fullscreen')) {
      video.classList.remove('video-fullscreen');
    } else {
      video.classList.add('video-fullscreen');
    }
  });

  container.appendChild(pipButton);
  container.appendChild(fullscreenButton);

  video.addEventListener('leavepictureinpicture', () => {
    chrome.storage.local.remove('pipTabId');
    // Pause the video when exiting PiP
    if (!video.paused) {
      video.pause();
    }
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

/**
 * @param {Element} node
 */
function processNode(node) {
    if (node instanceof HTMLVideoElement) {
        const video = node;
        const onMetadataLoaded = () => {
            if (video.videoWidth >= MIN_VIDEO_WIDTH && video.videoHeight >= MIN_VIDEO_HEIGHT) {
                addControls(video);
            }
        };

        if (video.readyState >= 1) { // HAVE_METADATA
            onMetadataLoaded();
        } else {
            video.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
        }
    } else if (node.querySelectorAll) {
        const videos = node.querySelectorAll('video');
        videos.forEach(processNode);
    }
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach(processNode);
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

document.querySelectorAll('video').forEach(processNode);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const fullscreenVideo = document.querySelector('.video-fullscreen');
    if (fullscreenVideo) {
      fullscreenVideo.classList.remove('video-fullscreen');
    }
  }
});
