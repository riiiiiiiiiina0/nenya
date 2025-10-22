(function () {
  'use strict';

  const fixedTitle = 'Test';

  // Override document.title property
  try {
    Object.defineProperty(document, 'title', {
      get: function () {
        return fixedTitle;
      },
      set: function () {
        // Ignore all attempts to set the title
        return;
      },
      configurable: false,
    });
  } catch (e) {
    console.log('Could not override title property:', e);
  }

  // Also override the title element directly
  function setTitleElement() {
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleElement.textContent = fixedTitle;
    } else {
      // Create title element if it doesn't exist
      const title = document.createElement('title');
      title.textContent = fixedTitle;
      const head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        head.appendChild(title);
      }
    }
  }

  // Set initial title
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setTitleElement);
  } else {
    setTitleElement();
  }

  // Use MutationObserver to prevent title changes via DOM manipulation
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'childList') {
        const titleElement = document.querySelector('title');
        if (titleElement && titleElement.textContent !== fixedTitle) {
          titleElement.textContent = fixedTitle;
        }
      }
    });
  });

  // Start observing
  observer.observe(document.head || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
