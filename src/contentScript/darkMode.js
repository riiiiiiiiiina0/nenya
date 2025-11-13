

  const getdarkModeRules = async () => {
    const { darkModeRules } = await chrome.storage.sync.get('darkModeRules');
    return darkModeRules || [];
  };

  const initDarkMode = async () => {
    const rules = await getdarkModeRules();
    const enabledRules = rules.filter(rule => rule.enabled);

    if (enabledRules.length === 0) {
      return;
    }

    const currentUrl = window.location.href;

    for (const rule of enabledRules) {
      try {
        const pattern = new URLPattern(rule.pattern);
        if (pattern.test(currentUrl)) {
          DarkReader.enable({
            brightness: 100,
            contrast: 90,
            sepia: 10
          });
          break;
        }
      } catch (error) {
        console.error(`Invalid URL pattern: ${rule.pattern}`, error);
      }
    }
  };

  initDarkMode();
