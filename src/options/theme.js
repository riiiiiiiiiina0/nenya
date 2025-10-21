/**
 * DaisyUI theme identifiers.
 * @type {{ light: 'light', dark: 'dark' }}
 */
const THEMES = {
  light: 'light',
  dark: 'dark',
};

/**
 * Update the root element with the provided theme.
 * @param {'light' | 'dark'} themeId
 * @returns {void}
 */
function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
}

/**
 * Sync the current theme to the user's system preference.
 * @returns {void}
 */
function initializeAutoTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * Apply theme whenever the preference changes.
   * @param {MediaQueryListEvent | MediaQueryList} event
   * @returns {void}
   */
  const handlePreferenceChange = (event) => {
    applyTheme(event.matches ? THEMES.dark : THEMES.light);
  };

  handlePreferenceChange(prefersDark);
  if (typeof prefersDark.addEventListener === 'function') {
    prefersDark.addEventListener('change', handlePreferenceChange);
  } else if (typeof prefersDark.addListener === 'function') {
    prefersDark.addListener(handlePreferenceChange);
  }
}

initializeAutoTheme();
