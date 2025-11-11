/* global chrome */

/**
 * Auto Google Login Content Script
 * Detects Google login buttons on pages matching auto Google login rules
 * and alerts the user with the configured email
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'autoGoogleLoginRules';
  const TEMP_EMAIL_STORAGE_KEY = 'autoGoogleLoginTempEmail';
  const AUTO_LOGIN_INITIATED_KEY = 'autoGoogleLoginInitiated';
  const DEBOUNCE_DELAY = 2000; // ms - debounce for DOM mutations
  const MIN_CHECK_INTERVAL = 3000; // ms - minimum time between checks

  /**
   * @typedef {Object} AutoGoogleLoginRule
   * @property {string} id
   * @property {string} pattern
   * @property {string} [email]
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  /** @type {AutoGoogleLoginRule[]} */
  let cachedRules = [];
  let debounceTimer = null;
  let mutationObserver = null;
  let lastAlertedRuleId = null;
  let lastCheckTime = 0;
  let loginInProgress = false;
  let oauthWindowId = null;

  /**
   * Get the current page URL
   * @returns {string}
   */
  function getCurrentUrl() {
    return window.location.href;
  }

  /**
   * Check if a URL pattern matches the current page URL
   * @param {string} pattern
   * @param {string} url
   * @returns {boolean}
   */
  function matchesPattern(pattern, url) {
    try {
      const urlPattern = new URLPattern(pattern);
      return urlPattern.test(url);
    } catch (error) {
      console.warn('[auto-google-login] Invalid URL pattern:', pattern, error);
      return false;
    }
  }

  /**
   * Find matching rule for the current URL
   * @param {string} url
   * @returns {AutoGoogleLoginRule | null}
   */
  function findMatchingRule(url) {
    for (const rule of cachedRules) {
      if (matchesPattern(rule.pattern, url)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if an element's text content contains both "login" and "google"
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  function isGoogleLoginButton(element) {
    if (!element) {
      return false;
    }

    // Check if it's an input element (button or submit type)
    const isInputButton =
      element.tagName === 'INPUT' &&
      (element.getAttribute('type') === 'button' ||
        element.getAttribute('type') === 'submit');

    // Get text content from the element and its children
    const text = (element.textContent || '').toLowerCase().trim();

    // For input buttons, also check the value attribute
    let valueText = '';
    if (isInputButton) {
      const inputElement = /** @type {HTMLInputElement} */ (element);
      valueText = (inputElement.value || '').toLowerCase().trim();
    }

    // Combine text and value for checking
    const combinedText = (text + ' ' + valueText).trim();

    // Check if text contains login-related keywords and google
    // Match "login", "log in", "sign in", "signin", etc.
    const loginPatterns = ['login', 'log in', 'sign in', 'signin'];
    const hasLogin = loginPatterns.some((pattern) =>
      combinedText.includes(pattern),
    );
    const hasGoogle = combinedText.includes('google');

    if (hasLogin && hasGoogle) {
      return true;
    }

    // Also check aria-label and title attributes
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const title = (element.getAttribute('title') || '').toLowerCase();

    const ariaHasLogin = loginPatterns.some((pattern) =>
      ariaLabel.includes(pattern),
    );
    const ariaHasGoogle = ariaLabel.includes('google');

    const titleHasLogin = loginPatterns.some((pattern) =>
      title.includes(pattern),
    );
    const titleHasGoogle = title.includes('google');

    if ((ariaHasLogin && ariaHasGoogle) || (titleHasLogin && titleHasGoogle)) {
      return true;
    }

    // Check class names for common Google login button patterns
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    // Check for common class patterns like "login-with-google", "google-login", etc.
    const googleLoginClassPatterns = [
      'login-with-google',
      'google-login',
      'google-signin',
      'signin-google',
      'btn-google',
      'google-btn',
    ];

    const hasGoogleLoginClass = googleLoginClassPatterns.some(
      (pattern) => className.includes(pattern) || id.includes(pattern),
    );

    // If element has Google login class and contains "google" in text/aria/title/value, consider it
    if (
      hasGoogleLoginClass &&
      (hasGoogle ||
        ariaHasGoogle ||
        titleHasGoogle ||
        valueText.includes('google'))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Find Google login buttons on the page
   * @returns {HTMLElement[]}
   */
  function findGoogleLoginButtons() {
    const buttons = [];

    // Find all button, anchor, and input button elements
    const candidates = document.querySelectorAll(
      'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
    );
    console.log(
      '[auto-google-login] Checking',
      candidates.length,
      'candidate elements',
    );

    for (const candidate of candidates) {
      const element = /** @type {HTMLElement} */ (candidate);
      const isMatch = isGoogleLoginButton(element);
      if (isMatch) {
        console.log('[auto-google-login] Found matching button:', element);
        buttons.push(element);
      }
    }

    return buttons;
  }

  /**
   * Send notification via background script
   * @param {string} title
   * @param {string} message
   * @param {string} [targetUrl]
   * @returns {Promise<void>}
   */
  async function sendNotification(title, message, targetUrl) {
    try {
      await chrome.runtime.sendMessage({
        type: 'auto-google-login-notification',
        title,
        message,
        targetUrl,
      });
    } catch (error) {
      console.warn('[auto-google-login] Failed to send notification:', error);
    }
  }

  /**
   * Click a Google login button and handle the OAuth flow
   * @param {HTMLElement} button
   * @param {AutoGoogleLoginRule} rule
   * @returns {Promise<void>}
   */
  async function clickGoogleLoginButton(button, rule) {
    if (loginInProgress) {
      console.log('[auto-google-login] Login already in progress');
      return;
    }

    loginInProgress = true;
    const email = rule.email || 'configured account';

    try {
      console.log('[auto-google-login] Clicking Google login button');

      // Check if button opens a popup or redirects
      const href = button.getAttribute('href');
      const onClick = button.getAttribute('onclick');
      const hasPopup =
        button.getAttribute('target') === '_blank' ||
        button.getAttribute('target') === '_new' ||
        (onClick && onClick.includes('window.open'));

      if (href && !hasPopup) {
        // Redirect-based login - navigate to the URL
        // Store email and flag before redirecting
        try {
          if (chrome?.storage?.local) {
            await chrome.storage.local.set({
              [TEMP_EMAIL_STORAGE_KEY]: email,
              [AUTO_LOGIN_INITIATED_KEY]: true,
            });
            console.log(
              '[auto-google-login] Stored email and auto login flag before redirect:',
              email,
            );
          }
        } catch (error) {
          console.warn(
            '[auto-google-login] Failed to store email before redirect:',
            error,
          );
        }
        window.location.href = href;
        await sendNotification(
          'Auto Google Login',
          `Redirecting to Google login for ${email}`,
          href,
        );
        return;
      }

      // Store email and flag in chrome.storage.local so we can retrieve it on Google's page
      // (sessionStorage won't work across different origins)
      // The flag indicates that auto login was initiated by a matching rule
      try {
        if (chrome?.storage?.local) {
          await chrome.storage.local.set({
            [TEMP_EMAIL_STORAGE_KEY]: email,
            [AUTO_LOGIN_INITIATED_KEY]: true,
          });
          console.log(
            '[auto-google-login] Stored email and auto login flag in chrome.storage.local:',
            email,
          );
        }
      } catch (error) {
        console.warn(
          '[auto-google-login] Failed to store email in chrome.storage.local:',
          error,
        );
      }

      // Click the button (handles both popup and redirect cases)
      button.click();

      // If it's a popup, monitor for the OAuth window
      if (hasPopup || onClick) {
        // Wait a bit for popup to open
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Try to find and interact with the OAuth popup
        // Note: We can't directly access popup windows from content scripts,
        // so we'll monitor the current page for redirects to Google OAuth
        await sendNotification(
          'Auto Google Login',
          `Google login popup opened. Please select account: ${email}`,
          window.location.href,
        );
      } else {
        // Monitor current page for Google OAuth redirect
        monitorGoogleOAuthFlow(rule);
      }
    } catch (error) {
      console.error('[auto-google-login] Failed to click button:', error);
      await sendNotification(
        'Auto Google Login Error',
        `Failed to initiate login: ${error.message}`,
        window.location.href,
      );
      loginInProgress = false;
    }
  }

  /**
   * Try to find and click the Continue button on OAuth confirmation page
   * @returns {boolean} True if button was clicked
   */
  function tryClickContinueButton() {
    console.log('[auto-google-login] Looking for Continue button...');

    // Strategy 1: Find button by text content "Continue"
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const htmlButton = /** @type {HTMLButtonElement} */ (button);
      const text = (htmlButton.textContent || '').trim().toLowerCase();
      if (
        text === 'continue' &&
        htmlButton.offsetParent !== null &&
        !htmlButton.disabled
      ) {
        console.log(
          '[auto-google-login] Found Continue button by text, clicking:',
          htmlButton,
        );
        return clickElement(htmlButton);
      }
    }

    // Strategy 2: Find button by jsname="LgbsSe" (Google's Continue button)
    const continueButton = document.querySelector('button[jsname="LgbsSe"]');
    if (continueButton) {
      const htmlButton = /** @type {HTMLButtonElement} */ (continueButton);
      if (htmlButton.offsetParent !== null && !htmlButton.disabled) {
        console.log(
          '[auto-google-login] Found Continue button by jsname, clicking:',
          htmlButton,
        );
        return clickElement(htmlButton);
      }
    }

    // Strategy 3: Find button with Continue in aria-label
    const ariaButtons = document.querySelectorAll('button[aria-label]');
    for (const button of ariaButtons) {
      const htmlButton = /** @type {HTMLButtonElement} */ (button);
      const ariaLabel = (
        htmlButton.getAttribute('aria-label') || ''
      ).toLowerCase();
      if (
        ariaLabel.includes('continue') &&
        htmlButton.offsetParent !== null &&
        !htmlButton.disabled
      ) {
        console.log(
          '[auto-google-login] Found Continue button by aria-label, clicking:',
          htmlButton,
        );
        return clickElement(htmlButton);
      }
    }

    // Strategy 4: Find button with Continue in span inside
    const buttonsWithSpans = document.querySelectorAll('button span');
    for (const span of buttonsWithSpans) {
      const text = (span.textContent || '').trim().toLowerCase();
      if (text === 'continue') {
        const button = span.closest('button');
        if (button) {
          const htmlButton = /** @type {HTMLButtonElement} */ (button);
          if (htmlButton.offsetParent !== null && !htmlButton.disabled) {
            console.log(
              '[auto-google-login] Found Continue button via span text, clicking:',
              htmlButton,
            );
            return clickElement(htmlButton);
          }
        }
      }
    }

    console.log('[auto-google-login] Could not find Continue button');
    return false;
  }

  /**
   * Check if auto login was initiated by a matching rule
   * @returns {Promise<boolean>}
   */
  async function wasAutoLoginInitiated() {
    try {
      if (!chrome?.storage?.local) {
        return false;
      }
      const result = await chrome.storage.local.get(AUTO_LOGIN_INITIATED_KEY);
      return result?.[AUTO_LOGIN_INITIATED_KEY] === true;
    } catch (error) {
      console.warn(
        '[auto-google-login] Failed to check auto login initiated flag:',
        error,
      );
      return false;
    }
  }

  /**
   * Clear the auto login initiated flag
   * @returns {Promise<void>}
   */
  async function clearAutoLoginFlag() {
    try {
      if (chrome?.storage?.local) {
        await chrome.storage.local.remove(AUTO_LOGIN_INITIATED_KEY);
        console.log('[auto-google-login] Cleared auto login initiated flag');
      }
    } catch (error) {
      console.warn(
        '[auto-google-login] Failed to clear auto login flag:',
        error,
      );
    }
  }

  /**
   * Handle OAuth confirmation page - click Continue button
   * @returns {Promise<void>}
   */
  async function handleOAuthConfirmation() {
    // Only proceed if auto login was initiated by a matching rule
    const initiated = await wasAutoLoginInitiated();
    if (!initiated) {
      console.log(
        '[auto-google-login] Skipping OAuth confirmation - auto login was not initiated by a matching rule',
      );
      return;
    }

    console.log(
      '[auto-google-login] On OAuth confirmation page, attempting to click Continue',
    );

    // Try immediately
    let clicked = tryClickContinueButton();
    if (clicked) {
      console.log(
        '[auto-google-login] Successfully clicked Continue button immediately',
      );
      return;
    }

    // Set up MutationObserver to watch for Continue button appearing
    /** @type {MutationObserver | null} */
    let mutationObserver = null;
    const observerPromise = new Promise((resolve) => {
      if (typeof MutationObserver === 'undefined') {
        resolve(false);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = tryClickContinueButton();
        if (found) {
          console.log(
            '[auto-google-login] Found and clicked Continue button via MutationObserver',
          );
          resolve(true);
          observer.disconnect();
        }
      });

      mutationObserver = observer;

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-label'],
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 10000);
    });

    // Wait and retry multiple times (page might still be loading)
    const maxRetries = 10;
    const retryDelay = 500;

    const pollingPromise = (async () => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        console.log(
          `[auto-google-login] Attempt ${
            attempt + 1
          }/${maxRetries} to click Continue button`,
        );

        clicked = tryClickContinueButton();
        if (clicked) {
          console.log(
            '[auto-google-login] Successfully clicked Continue button',
          );
          return true;
        }
      }
      return false;
    })();

    // Wait for either approach to succeed
    const results = await Promise.all([pollingPromise, observerPromise]);
    clicked = results[0] || results[1];

    // Clean up observer
    if (mutationObserver) {
      try {
        // @ts-ignore - MutationObserver type checking issue
        mutationObserver.disconnect();
      } catch (error) {
        // Ignore errors
      }
    }

    if (!clicked) {
      await sendNotification(
        'Auto Google Login',
        'Please manually click Continue to complete login',
        window.location.href,
      );
    } else {
      // Clear the flag after successful Continue click
      setTimeout(() => {
        void clearAutoLoginFlag();
      }, 5000);
    }
  }

  /**
   * Monitor the current page for Google OAuth flow and try to select account
   * @param {AutoGoogleLoginRule} rule
   * @returns {Promise<void>}
   */
  async function monitorGoogleOAuthFlow(rule) {
    // Check if we're on a Google OAuth page
    const currentUrl = getCurrentUrl();
    const isGoogleOAuthPage =
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('oauth') ||
      currentUrl.includes('signin');

    // Check if we're on the OAuth confirmation page
    const isOAuthConfirmationPage = currentUrl.includes(
      'accounts.google.com/signin/oauth/id',
    );

    if (isOAuthConfirmationPage) {
      // Only handle if auto login was initiated by a matching rule
      const initiated = await wasAutoLoginInitiated();
      if (initiated) {
        void handleOAuthConfirmation();
      } else {
        console.log(
          '[auto-google-login] Skipping OAuth confirmation in monitorGoogleOAuthFlow - auto login was not initiated by a matching rule',
        );
      }
      return;
    }

    // Helper function to attempt account selection with email from storage
    const attemptAccountSelection = async () => {
      // Only proceed if auto login was initiated by a matching rule
      const initiated = await wasAutoLoginInitiated();
      if (!initiated) {
        console.log(
          '[auto-google-login] Skipping account selection - auto login was not initiated by a matching rule',
        );
        return;
      }

      try {
        if (chrome?.storage?.local) {
          const result = await chrome.storage.local.get(TEMP_EMAIL_STORAGE_KEY);
          const storedEmail = result?.[TEMP_EMAIL_STORAGE_KEY];
          if (storedEmail) {
            console.log(
              '[auto-google-login] Found stored email in monitorGoogleOAuthFlow, attempting account selection:',
              storedEmail,
            );
            void handleGoogleAccountSelection(storedEmail);
            return;
          }
        }
      } catch (error) {
        console.warn(
          '[auto-google-login] Failed to read email from storage in monitorGoogleOAuthFlow:',
          error,
        );
      }
      // Fallback to rule email if storage doesn't have it (only if we have a rule)
      if (rule && rule.email) {
        console.log(
          '[auto-google-login] Using rule email as fallback:',
          rule.email,
        );
        void handleGoogleAccountSelection(rule);
      }
    };

    if (!isGoogleOAuthPage) {
      // Monitor URL changes
      let lastUrl = currentUrl;
      const urlCheckInterval = setInterval(() => {
        const newUrl = getCurrentUrl();
        if (newUrl !== lastUrl) {
          lastUrl = newUrl;
          // Check for OAuth confirmation page
          if (newUrl.includes('accounts.google.com/signin/oauth/id')) {
            clearInterval(urlCheckInterval);
            // Only handle if auto login was initiated by a matching rule
            void (async () => {
              const initiated = await wasAutoLoginInitiated();
              if (initiated) {
                void handleOAuthConfirmation();
              } else {
                console.log(
                  '[auto-google-login] Skipping OAuth confirmation in monitorGoogleOAuthFlow URL check - auto login was not initiated by a matching rule',
                );
              }
            })();
          } else if (
            newUrl.includes('accounts.google.com') ||
            newUrl.includes('oauth') ||
            newUrl.includes('signin')
          ) {
            clearInterval(urlCheckInterval);
            // Wait a bit for page to load, then attempt account selection
            setTimeout(() => {
              void attemptAccountSelection();
            }, 1000);
          }
        }
      }, 500);

      // Clear interval after 30 seconds
      setTimeout(() => {
        clearInterval(urlCheckInterval);
        loginInProgress = false;
      }, 30000);
    } else {
      // Already on Google OAuth page - wait a bit for it to load, then attempt account selection
      setTimeout(() => {
        void attemptAccountSelection();
      }, 1000);
    }
  }

  /**
   * Scroll element into view and click it
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  function clickElement(element) {
    try {
      // Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Try multiple click methods
      // Method 1: Direct click
      element.click();

      // Method 2: Dispatch mouse events (more reliable for some sites)
      const mouseEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(mouseEvent);

      // Method 3: Dispatch pointer events
      const pointerEvent = new PointerEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(pointerEvent);

      return true;
    } catch (error) {
      console.warn('[auto-google-login] Failed to click element:', error);
      return false;
    }
  }

  /**
   * Try to find and click the matching Google account element
   * @param {string} email
   * @returns {boolean} True if account was clicked
   */
  function tryClickAccount(email) {
    const emailLower = email.toLowerCase().trim();
    console.log('[auto-google-login] Searching for account:', emailLower);

    // Debug: Log all elements with data-email or data-identifier
    const allDataEmail = document.querySelectorAll('[data-email]');
    const allDataIdentifier = document.querySelectorAll('[data-identifier]');
    console.log(
      `[auto-google-login] Found ${allDataEmail.length} elements with data-email, ${allDataIdentifier.length} with data-identifier`,
    );

    if (allDataEmail.length > 0) {
      console.log(
        '[auto-google-login] Sample data-email values:',
        Array.from(allDataEmail)
          .slice(0, 3)
          .map((el) => el.getAttribute('data-email')),
      );
    }
    if (allDataIdentifier.length > 0) {
      console.log(
        '[auto-google-login] Sample data-identifier values:',
        Array.from(allDataIdentifier)
          .slice(0, 3)
          .map((el) => el.getAttribute('data-identifier')),
      );
    }

    // Strategy 1: Find div[role="link"] with data-identifier (most common clickable element)
    const linkElements = document.querySelectorAll(
      'div[role="link"][data-identifier]',
    );
    for (const element of linkElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const identifier = (htmlElement.getAttribute('data-identifier') || '')
        .toLowerCase()
        .trim();
      if (identifier === emailLower && htmlElement.offsetParent !== null) {
        console.log(
          '[auto-google-login] Found account via div[role="link"][data-identifier] (exact match), clicking:',
          htmlElement,
          'identifier:',
          identifier,
        );
        return clickElement(htmlElement);
      }
    }

    // Strategy 2: Find by data-identifier on any element - exact match
    const identifierElements = document.querySelectorAll('[data-identifier]');
    for (const element of identifierElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const identifier = (htmlElement.getAttribute('data-identifier') || '')
        .toLowerCase()
        .trim();
      if (identifier === emailLower && htmlElement.offsetParent !== null) {
        // Prefer clicking div[role="link"] if it exists
        const roleLink = /** @type {HTMLElement | null} */ (
          htmlElement.closest('div[role="link"]')
        );
        if (roleLink && roleLink.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-identifier, clicking parent div[role="link"]:',
            roleLink,
            'identifier:',
            identifier,
          );
          return clickElement(roleLink);
        }
        console.log(
          '[auto-google-login] Found account via data-identifier (exact match), clicking:',
          htmlElement,
          'identifier:',
          identifier,
        );
        return clickElement(htmlElement);
      }
    }

    // Strategy 3: Find by data-email - exact match
    const emailElements = document.querySelectorAll('[data-email]');
    for (const element of emailElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const dataEmail = (htmlElement.getAttribute('data-email') || '')
        .toLowerCase()
        .trim();
      if (dataEmail === emailLower) {
        // First try to find parent div[role="link"] (the actual clickable element)
        const roleLink = /** @type {HTMLElement | null} */ (
          htmlElement.closest('div[role="link"]')
        );
        if (roleLink && roleLink.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-email (exact match), clicking parent div[role="link"]:',
            roleLink,
            'email:',
            dataEmail,
          );
          return clickElement(roleLink);
        }

        // Fallback: try parent li element
        const parentLi = htmlElement.closest('li');
        if (parentLi && parentLi.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-email (exact match), clicking parent li:',
            parentLi,
            'email:',
            dataEmail,
          );
          return clickElement(parentLi);
        }

        // Fallback: try to find closest clickable element
        const clickable =
          /** @type {HTMLElement | null} */ (
            htmlElement.closest('li, button, a, [role="button"], [role="link"]')
          ) || htmlElement;
        if (clickable && clickable.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-email, clicking closest:',
            clickable,
          );
          return clickElement(clickable);
        }
      }
    }

    // Strategy 4: Find div[role="link"] with data-identifier - partial match
    for (const element of linkElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const identifier = (htmlElement.getAttribute('data-identifier') || '')
        .toLowerCase()
        .trim();
      // Check if identifier contains the email or vice versa
      if (
        (identifier.includes(emailLower) || emailLower.includes(identifier)) &&
        identifier.length > 0 &&
        htmlElement.offsetParent !== null
      ) {
        console.log(
          '[auto-google-login] Found account via div[role="link"][data-identifier] (partial match), clicking:',
          htmlElement,
          'identifier:',
          identifier,
        );
        return clickElement(htmlElement);
      }
    }

    // Strategy 5: Find by data-identifier - partial match (in case of encoding issues)
    for (const element of identifierElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const identifier = (htmlElement.getAttribute('data-identifier') || '')
        .toLowerCase()
        .trim();
      // Check if identifier contains the email or vice versa
      if (
        (identifier.includes(emailLower) || emailLower.includes(identifier)) &&
        identifier.length > 0 &&
        htmlElement.offsetParent !== null
      ) {
        // Prefer clicking div[role="link"] if it exists
        const roleLink = /** @type {HTMLElement | null} */ (
          htmlElement.closest('div[role="link"]')
        );
        if (roleLink && roleLink.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-identifier (partial match), clicking parent div[role="link"]:',
            roleLink,
            'identifier:',
            identifier,
          );
          return clickElement(roleLink);
        }
        console.log(
          '[auto-google-login] Found account via data-identifier (partial match), clicking:',
          htmlElement,
          'identifier:',
          identifier,
        );
        return clickElement(htmlElement);
      }
    }

    // Strategy 6: Find by data-email - partial match
    for (const element of emailElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const dataEmail = (htmlElement.getAttribute('data-email') || '')
        .toLowerCase()
        .trim();
      if (
        (dataEmail.includes(emailLower) || emailLower.includes(dataEmail)) &&
        dataEmail.length > 0
      ) {
        // First try to find parent div[role="link"]
        const roleLink = /** @type {HTMLElement | null} */ (
          htmlElement.closest('div[role="link"]')
        );
        if (roleLink && roleLink.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-email (partial match), clicking parent div[role="link"]:',
            roleLink,
            'email:',
            dataEmail,
          );
          return clickElement(roleLink);
        }
        const parentLi = htmlElement.closest('li');
        if (parentLi && parentLi.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via data-email (partial match), clicking parent li:',
            parentLi,
            'email:',
            dataEmail,
          );
          return clickElement(parentLi);
        }
      }
    }

    // Strategy 5: Find by aria-label containing email
    const ariaElements = document.querySelectorAll('[aria-label]');
    for (const element of ariaElements) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const ariaLabel = (
        htmlElement.getAttribute('aria-label') || ''
      ).toLowerCase();
      if (ariaLabel.includes(emailLower)) {
        const clickable =
          /** @type {HTMLElement | null} */ (
            htmlElement.closest('li, button, a, [role="button"]')
          ) || htmlElement;
        if (clickable && clickable.offsetParent !== null) {
          console.log(
            '[auto-google-login] Found account via aria-label, clicking:',
            clickable,
          );
          return clickElement(clickable);
        }
      }
    }

    // Strategy 6: Search all li elements for matching email in text
    const allLis = document.querySelectorAll('li');
    for (const element of allLis) {
      const htmlElement = /** @type {HTMLElement} */ (element);
      const text = (htmlElement.textContent || '').toLowerCase();
      if (
        text.includes(emailLower) &&
        text.length < 200 && // Avoid matching long text
        htmlElement.offsetParent !== null
      ) {
        // Check if this looks like an account item (has email-like structure)
        const hasEmailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(
          text,
        );
        if (hasEmailPattern) {
          console.log(
            '[auto-google-login] Found account via text content in li, clicking:',
            htmlElement,
            'text:',
            text.substring(0, 100),
          );
          return clickElement(htmlElement);
        }
      }
    }

    console.log('[auto-google-login] Could not find matching account element');
    return false;
  }

  /**
   * Try to select the matching Google account
   * @param {AutoGoogleLoginRule | string} ruleOrEmail
   * @returns {Promise<void>}
   */
  async function handleGoogleAccountSelection(ruleOrEmail) {
    const email =
      typeof ruleOrEmail === 'string' ? ruleOrEmail : ruleOrEmail.email || '';
    if (!email) {
      await sendNotification(
        'Auto Google Login',
        'Please select your Google account to continue',
        window.location.href,
      );
      loginInProgress = false;
      return;
    }

    console.log('[auto-google-login] Attempting to select account:', email);

    // Try to click immediately if elements are already loaded
    let accountSelected = tryClickAccount(email);
    if (accountSelected) {
      console.log(
        '[auto-google-login] Successfully clicked account immediately',
      );
      setTimeout(() => {
        loginInProgress = false;
      }, 5000);
      return;
    }

    // Wait for page to load and retry multiple times
    // Google's account selection page loads dynamically
    accountSelected = false;
    const maxRetries = 15;
    const retryDelay = 500; // ms

    // Also set up a MutationObserver to watch for account list appearing
    /** @type {MutationObserver | null} */
    let mutationObserver = null;
    const observerPromise = new Promise((resolve) => {
      if (typeof MutationObserver === 'undefined') {
        resolve(false);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = tryClickAccount(email);
        if (found) {
          console.log(
            '[auto-google-login] Found and clicked account via MutationObserver',
          );
          resolve(true);
          observer.disconnect();
        }
      });

      mutationObserver = observer;

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-email', 'data-identifier'],
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 10000);
    });

    // Try both approaches: polling and MutationObserver
    const pollingPromise = (async () => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Wait before each attempt (longer wait on first attempt)
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        console.log(
          `[auto-google-login] Attempt ${
            attempt + 1
          }/${maxRetries} to select account`,
        );

        accountSelected = tryClickAccount(email);
        if (accountSelected) {
          console.log('[auto-google-login] Successfully clicked account');
          return true;
        }

        // Log what we found for debugging
        const allDataEmail = document.querySelectorAll('[data-email]');
        const allDataIdentifier =
          document.querySelectorAll('[data-identifier]');
        console.log(
          `[auto-google-login] Found ${allDataEmail.length} data-email and ${allDataIdentifier.length} data-identifier elements`,
        );
      }
      return false;
    })();

    // Wait for either approach to succeed
    const results = await Promise.all([pollingPromise, observerPromise]);
    accountSelected = results[0] || results[1];

    if (!accountSelected) {
      await sendNotification(
        'Auto Google Login',
        `Please manually select account: ${email}`,
        window.location.href,
      );
    } else {
      // Clear the flag after successful account selection
      setTimeout(() => {
        void clearAutoLoginFlag();
      }, 5000);
    }

    // Clean up observer
    if (mutationObserver) {
      try {
        // @ts-ignore - MutationObserver type checking issue
        mutationObserver.disconnect();
      } catch (error) {
        // Ignore errors
      }
    }

    // Reset after some time
    setTimeout(() => {
      loginInProgress = false;
    }, 10000);
  }

  /**
   * Check if the current tab is active in the focused window
   * @returns {Promise<boolean>}
   */
  async function isCurrentTabActive() {
    try {
      // First check if the window has focus
      if (!document.hasFocus()) {
        console.log('[auto-google-login] Window does not have focus');
        return false;
      }

      // Then verify with the background script that this tab is active
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'auto-google-login:checkTabActive' },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                '[auto-google-login] Failed to check tab active status:',
                chrome.runtime.lastError,
              );
              resolve(false);
              return;
            }
            const isActive =
              response && typeof response.isActive === 'boolean'
                ? response.isActive
                : false;
            if (!isActive) {
              console.log('[auto-google-login] Tab is not active');
            }
            resolve(isActive);
          },
        );
      });
    } catch (error) {
      console.warn(
        '[auto-google-login] Error checking if tab is active:',
        error,
      );
      return false;
    }
  }

  /**
   * Check for Google login buttons and initiate login if found
   * @returns {Promise<void>}
   */
  async function checkAndAlert() {
    const url = getCurrentUrl();
    const matchingRule = findMatchingRule(url);

    console.log('[auto-google-login] Checking page:', url);
    console.log('[auto-google-login] Matching rule:', matchingRule);
    console.log('[auto-google-login] Cached rules:', cachedRules);

    if (!matchingRule) {
      // No matching rule, reset alert state
      lastAlertedRuleId = null;
      loginInProgress = false;
      return;
    }

    // If we already processed this rule, don't process again
    if (lastAlertedRuleId === matchingRule.id && loginInProgress) {
      console.log('[auto-google-login] Already processing login for this rule');
      return;
    }

    // Check if the current tab is active before proceeding
    const tabIsActive = await isCurrentTabActive();
    if (!tabIsActive) {
      console.log(
        '[auto-google-login] Skipping auto login - tab is not active in focused window',
      );
      return;
    }

    const googleLoginButtons = findGoogleLoginButtons();
    console.log(
      '[auto-google-login] Found Google login buttons:',
      googleLoginButtons.length,
    );

    if (googleLoginButtons.length > 0) {
      const email = matchingRule.email || 'configured account';
      lastAlertedRuleId = matchingRule.id;

      console.log(
        '[auto-google-login] Found Google login button on',
        url,
        'for rule:',
        matchingRule.pattern,
        'email:',
        email,
      );

      // Click the first matching button
      await clickGoogleLoginButton(googleLoginButtons[0], matchingRule);
    } else {
      console.log('[auto-google-login] No Google login buttons found on page');
    }
  }

  /**
   * Debounced check function with throttling
   * @returns {void}
   */
  function debouncedCheck() {
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheckTime;

    // Throttle: don't check if we checked recently
    if (timeSinceLastCheck < MIN_CHECK_INTERVAL) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      const timeSinceLastCheck2 = Date.now() - lastCheckTime;
      // Double-check throttling before actually running
      if (timeSinceLastCheck2 >= MIN_CHECK_INTERVAL) {
        lastCheckTime = Date.now();
        void checkAndAlert();
      }
    }, DEBOUNCE_DELAY);
  }

  /**
   * Load rules from storage
   * @returns {Promise<void>}
   */
  async function loadRules() {
    if (!chrome?.storage?.sync) {
      cachedRules = [];
      return;
    }

    try {
      const result = await chrome.storage.sync.get(STORAGE_KEY);
      const rules = result?.[STORAGE_KEY];

      if (Array.isArray(rules)) {
        cachedRules = rules;
        console.log(
          '[auto-google-login] Loaded',
          cachedRules.length,
          'auto Google login rule(s)',
        );
      } else {
        cachedRules = [];
      }
    } catch (error) {
      console.warn('[auto-google-login] Failed to load rules:', error);
      cachedRules = [];
    }
  }

  /**
   * Initialize the content script
   * @returns {Promise<void>}
   */
  async function init() {
    await loadRules();

    // Check if we're on a Google OAuth page
    const currentUrl = getCurrentUrl();
    const isOAuthConfirmationPage = currentUrl.includes(
      'accounts.google.com/signin/oauth/id',
    );

    if (isOAuthConfirmationPage) {
      console.log('[auto-google-login] Already on OAuth confirmation page');
      // Only handle if auto login was initiated by a matching rule
      const initiated = await wasAutoLoginInitiated();
      if (initiated) {
        void handleOAuthConfirmation();
      } else {
        console.log(
          '[auto-google-login] Skipping OAuth confirmation - auto login was not initiated by a matching rule',
        );
      }
    }

    const isGoogleAccountSelectionPage =
      currentUrl.includes('accounts.google.com') &&
      (currentUrl.includes('oauthchooseaccount') ||
        currentUrl.includes('oauth') ||
        currentUrl.includes('signin')) &&
      !isOAuthConfirmationPage;

    if (isGoogleAccountSelectionPage) {
      console.log(
        '[auto-google-login] Already on Google account selection page',
      );
      // Wait a bit for the page to load before attempting account selection
      setTimeout(async () => {
        // Only proceed if auto login was initiated by a matching rule
        const initiated = await wasAutoLoginInitiated();
        if (!initiated) {
          console.log(
            '[auto-google-login] Skipping account selection - auto login was not initiated by a matching rule',
          );
          return;
        }

        // Try to get email from chrome.storage.local (stored when login was initiated)
        try {
          if (chrome?.storage?.local) {
            const result = await chrome.storage.local.get(
              TEMP_EMAIL_STORAGE_KEY,
            );
            const storedEmail = result?.[TEMP_EMAIL_STORAGE_KEY];
            if (storedEmail) {
              console.log(
                '[auto-google-login] Found stored email, attempting account selection:',
                storedEmail,
              );
              void handleGoogleAccountSelection(storedEmail);
              // Clear the stored email and flag after using it (with delay to allow retries)
              setTimeout(() => {
                void chrome.storage.local.remove(TEMP_EMAIL_STORAGE_KEY);
                void clearAutoLoginFlag();
              }, 15000);
            } else {
              console.log(
                '[auto-google-login] No stored email found in chrome.storage.local',
              );
            }
          }
        } catch (error) {
          console.warn(
            '[auto-google-login] Failed to read email from chrome.storage.local:',
            error,
          );
        }
      }, 1000);
    }

    // Schedule multiple checks with increasing delays to catch async-loaded buttons
    // Many modern web apps load login buttons dynamically
    const delays = [500, 2000, 5000]; // ms - check at 0.5s, 2s, and 5s after page load

    delays.forEach((delay, index) => {
      setTimeout(() => {
        console.log(
          `[auto-google-login] Scheduled check #${index + 1} after ${delay}ms`,
        );
        lastCheckTime = Date.now();
        void checkAndAlert();
      }, delay);
    });

    // Set up mutation observer to watch for dynamically added buttons
    // Use a more selective observer that only watches for button-related changes
    if (typeof MutationObserver !== 'undefined') {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }

      let mutationCount = 0;
      mutationObserver = new MutationObserver((mutations) => {
        // Only trigger if mutations involve button-like elements
        const hasRelevantMutation = mutations.some((mutation) => {
          const target = mutation.target;
          if (!target || !(target instanceof HTMLElement)) {
            return false;
          }
          // Check if the mutation target or added nodes are buttons/links
          const isButtonLike =
            target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            target.getAttribute('role') === 'button' ||
            target.closest('button, a[href], [role="button"]') !== null;

          if (isButtonLike) {
            return true;
          }

          // Check added nodes
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node instanceof HTMLElement) {
                const isButtonLikeNode =
                  node.tagName === 'BUTTON' ||
                  node.tagName === 'A' ||
                  node.getAttribute('role') === 'button' ||
                  node.querySelector('button, a[href], [role="button"]') !==
                    null;
                if (isButtonLikeNode) {
                  return true;
                }
              }
            }
          }

          return false;
        });

        // Only debounce check if mutation is relevant
        if (hasRelevantMutation) {
          mutationCount++;
          // Further throttle: only check every 5th relevant mutation
          if (mutationCount % 5 === 0) {
            debouncedCheck();
          }
        }
      });

      mutationObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });
    }

    // Reset alert state when URL changes (e.g., navigation)
    let lastUrl = getCurrentUrl();
    const urlCheckInterval = setInterval(() => {
      const currentUrl = getCurrentUrl();
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;

        // Check if we navigated to OAuth confirmation page
        if (currentUrl.includes('accounts.google.com/signin/oauth/id')) {
          console.log(
            '[auto-google-login] Navigated to OAuth confirmation page',
          );
          // Only handle if auto login was initiated by a matching rule
          void (async () => {
            const initiated = await wasAutoLoginInitiated();
            if (initiated) {
              void handleOAuthConfirmation();
            } else {
              console.log(
                '[auto-google-login] Skipping OAuth confirmation - auto login was not initiated by a matching rule',
              );
            }
          })();
        }

        // Check if we navigated to account selection page
        if (
          currentUrl.includes('accounts.google.com') &&
          (currentUrl.includes('oauthchooseaccount') ||
            currentUrl.includes('oauth') ||
            currentUrl.includes('signin')) &&
          !currentUrl.includes('accounts.google.com/signin/oauth/id')
        ) {
          // Wait a bit for the page to load, then try to get email from chrome.storage.local
          setTimeout(async () => {
            // Only proceed if auto login was initiated by a matching rule
            const initiated = await wasAutoLoginInitiated();
            if (!initiated) {
              console.log(
                '[auto-google-login] Skipping account selection - auto login was not initiated by a matching rule',
              );
              return;
            }

            try {
              if (chrome?.storage?.local) {
                const result = await chrome.storage.local.get(
                  TEMP_EMAIL_STORAGE_KEY,
                );
                const storedEmail = result?.[TEMP_EMAIL_STORAGE_KEY];
                if (storedEmail) {
                  console.log(
                    '[auto-google-login] Found stored email after navigation, attempting account selection:',
                    storedEmail,
                  );
                  void handleGoogleAccountSelection(storedEmail);
                  // Clear the flag after use (with delay to allow retries)
                  setTimeout(() => {
                    void clearAutoLoginFlag();
                  }, 15000);
                }
              }
            } catch (error) {
              console.warn(
                '[auto-google-login] Failed to read email after navigation:',
                error,
              );
            }
          }, 1000);
        }

        lastAlertedRuleId = null;
        // Schedule delayed checks again on URL change
        const delays = [500, 2000, 5000];
        delays.forEach((delay, index) => {
          setTimeout(() => {
            console.log(
              `[auto-google-login] Scheduled check #${
                index + 1
              } after URL change (${delay}ms)`,
            );
            lastCheckTime = Date.now();
            void checkAndAlert();
          }, delay);
        });
      }
    }, 500);
  }

  /**
   * Set up storage change listener
   */
  function setupStorageListener() {
    if (!chrome?.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        return;
      }

      console.log('[auto-google-login] Rules updated, reloading...');
      void loadRules().then(() => {
        lastAlertedRuleId = null;
        debouncedCheck();
      });
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
      setupStorageListener();
    });
  } else {
    void init();
    setupStorageListener();
  }
})();
