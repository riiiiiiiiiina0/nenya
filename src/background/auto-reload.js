/* global chrome */

/**
 * @typedef {Object} AutoReloadRule
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSeconds
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

/**
 * @typedef {Object} CompiledAutoReloadRule
 * @property {AutoReloadRule} rule
 * @property {URLPattern | null} pattern
 */

/**
 * @typedef {Object} ScheduledReload
 * @property {number} intervalSeconds
 * @property {number} nextRunAt
 */

const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
const ALARM_PREFIX = 'autoReload:';
const MIN_INTERVAL_SECONDS = 5;
const BADGE_UPDATE_INTERVAL_MS = 1000;

/** @type {AutoReloadRule[]} */
let rules = [];
/** @type {CompiledAutoReloadRule[]} */
let compiledRules = [];
/** @type {Map<number, ScheduledReload>} */
const scheduledTabs = new Map();

let activeTabId = null;
let countdownTabId = null;
let countdownTimerId = null;

/** @type {{ owned: boolean, text: string, previousBackground: number[] | null, previousTextColor: number[] | null }} */
const badgeState = {
  owned: false,
  text: '',
  previousBackground: null,
  previousTextColor: null,
};

let synchronizingRules = false;

/**
 * Generate an identifier for rules lacking one.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Determine whether the provided value is a positive integer.
 * @param {number} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return Number.isFinite(value) && value > 0 && Math.floor(value) === value;
}

/**
 * Attempt to create a URLPattern from a pattern string.
 * @param {string} value
 * @returns {URLPattern | null}
 */
function compilePattern(value) {
  if (typeof URLPattern !== 'function') {
    console.warn('[auto-reload] URLPattern API is unavailable.');
    return null;
  }

  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }

  try {
    return new URLPattern(trimmed);
  } catch (error) {
    console.warn('[auto-reload] Invalid URL pattern skipped:', trimmed, error);
    return null;
  }
}

/**
 * Sanitize stored rule data.
 * @param {unknown} value
 * @returns {{ rules: AutoReloadRule[], mutated: boolean }}
 */
function normalizeStoredRules(value) {
  const normalized = [];
  let mutated = false;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const raw = /** @type {{ id?: unknown, pattern?: unknown, intervalSeconds?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (entry);
      const pattern =
        typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
      const interval = Math.max(
        MIN_INTERVAL_SECONDS,
        Math.floor(Number(raw.intervalSeconds)),
      );

      if (!pattern) {
        return;
      }

      const compiled = compilePattern(pattern);
      if (!compiled) {
        return;
      }

      let id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : '';
      if (!id) {
        id = generateRuleId();
        mutated = true;
      }

      /** @type {AutoReloadRule} */
      const rule = {
        id,
        pattern,
        intervalSeconds: interval,
      };

      if (typeof raw.createdAt === 'string') {
        rule.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        rule.updatedAt = raw.updatedAt;
      }

      normalized.push(rule);
    });
  }

  return { rules: normalized, mutated };
}

/**
 * Compile the current rules for faster matching.
 * @returns {void}
 */
function refreshCompiledRules() {
  compiledRules = rules.map((rule) => ({
    rule,
    pattern: compilePattern(rule.pattern),
  }));
}

/**
 * Persist sanitized rules if needed.
 * @param {AutoReloadRule[]} nextRules
 * @returns {Promise<void>}
 */
async function persistRules(nextRules) {
  if (!chrome?.storage?.sync) {
    return;
  }

  synchronizingRules = true;
  try {
    await chrome.storage.sync.set({
      [AUTO_RELOAD_RULES_KEY]: nextRules,
    });
  } catch (error) {
    console.warn('[auto-reload] Failed to persist sanitized rules:', error);
  } finally {
    synchronizingRules = false;
  }
}

/**
 * Load rules from storage and update local cache.
 * @returns {Promise<void>}
 */
async function loadRulesFromStorage() {
  if (!chrome?.storage?.sync) {
    rules = [];
    compiledRules = [];
    return;
  }

  try {
    const stored = await chrome.storage.sync.get(AUTO_RELOAD_RULES_KEY);
    const { rules: sanitized, mutated } = normalizeStoredRules(
      stored?.[AUTO_RELOAD_RULES_KEY],
    );
    rules = sanitized;
    refreshCompiledRules();
    if (mutated) {
      await persistRules(sanitized);
    }
  } catch (error) {
    console.warn('[auto-reload] Failed to load rules:', error);
    rules = [];
    compiledRules = [];
  }
}

/**
 * Determine whether the URL should be considered for matching.
 * @param {string} url
 * @returns {boolean}
 */
function isUrlEligible(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return false;
  }
  return true;
}

/**
 * Find the shortest interval rule matching the provided URL.
 * @param {string} url
 * @returns {AutoReloadRule | null}
 */
function findMatchingRule(url) {
  if (!isUrlEligible(url)) {
    return null;
  }

  let bestRule = null;
  let bestInterval = Number.POSITIVE_INFINITY;

  compiledRules.forEach((entry) => {
    if (!entry?.pattern) {
      return;
    }
    if (!entry.pattern.test(url)) {
      return;
    }
    const interval = Number(entry.rule.intervalSeconds);
    if (!Number.isFinite(interval)) {
      return;
    }
    if (interval < bestInterval) {
      bestInterval = interval;
      bestRule = entry.rule;
    }
  });

  return bestRule;
}

/**
 * Build the alarm name for a tab.
 * @param {number} tabId
 * @returns {string}
 */
function buildAlarmName(tabId) {
  return ALARM_PREFIX + tabId;
}

/**
 * Stop the countdown timer and release badge control.
 * @returns {Promise<void>}
 */
async function stopCountdown() {
  countdownTabId = null;
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  await releaseBadge();
}

/**
 * Attempt to claim badge ownership.
 * @returns {Promise<boolean>}
 */
async function ensureBadgeOwnership() {
  if (!chrome?.action) {
    return false;
  }

  try {
    const currentText = await chrome.action.getBadgeText({});
    if (badgeState.owned) {
      if (currentText === badgeState.text) {
        return true;
      }
      badgeState.owned = false;
      badgeState.text = '';
      badgeState.previousBackground = null;
      badgeState.previousTextColor = null;
      return false;
    }

    if (currentText && currentText.length > 0) {
      return false;
    }

    if (typeof chrome.action.getBadgeBackgroundColor === 'function') {
      try {
        const previous = await chrome.action.getBadgeBackgroundColor({});
        badgeState.previousBackground = Array.isArray(previous)
          ? previous
          : null;
      } catch (error) {
        console.warn('[auto-reload] Failed to read badge background color:', error);
        badgeState.previousBackground = null;
      }
    }

    if (typeof chrome.action.getBadgeTextColor === 'function') {
      try {
        const previous = await chrome.action.getBadgeTextColor({});
        badgeState.previousTextColor = Array.isArray(previous)
          ? previous
          : null;
      } catch (error) {
        console.warn('[auto-reload] Failed to read badge text color:', error);
        badgeState.previousTextColor = null;
      }
    }

    badgeState.owned = true;
    badgeState.text = '';
    return true;
  } catch (error) {
    console.warn('[auto-reload] Failed to read badge text:', error);
    return false;
  }
}

/**
 * Update badge colors and text for countdown display.
 * @param {string} text
 * @param {string | number[] | undefined} backgroundColor
 * @param {string | number[] | undefined} textColor
 * @returns {Promise<void>}
 */
async function setBadgeAppearance(text, backgroundColor, textColor) {
  if (!chrome?.action) {
    return;
  }

  const ownershipGranted = await ensureBadgeOwnership();
  if (!ownershipGranted) {
    return;
  }

  try {
    if (backgroundColor && typeof chrome.action.setBadgeBackgroundColor === 'function') {
      await chrome.action.setBadgeBackgroundColor({ color: backgroundColor });
    }
  } catch (error) {
    console.warn('[auto-reload] Failed to set badge background color:', error);
  }

  try {
    if (textColor && typeof chrome.action.setBadgeTextColor === 'function') {
      await chrome.action.setBadgeTextColor({ color: textColor });
    }
  } catch (error) {
    // Some Chrome versions might not support this API; ignore failures.
  }

  try {
    await chrome.action.setBadgeText({ text });
    badgeState.text = text;
  } catch (error) {
    console.warn('[auto-reload] Failed to set badge text:', error);
  }
}

/**
 * Release control of the badge if currently owned.
 * @returns {Promise<void>}
 */
async function releaseBadge() {
  if (!badgeState.owned || !chrome?.action) {
    badgeState.owned = false;
    badgeState.text = '';
    badgeState.previousBackground = null;
    badgeState.previousTextColor = null;
    return;
  }

  try {
    const current = await chrome.action.getBadgeText({});
    if (current === badgeState.text) {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.warn('[auto-reload] Failed to clear badge text:', error);
  }

  try {
    if (
      badgeState.previousBackground &&
      typeof chrome.action.setBadgeBackgroundColor === 'function'
    ) {
      await chrome.action.setBadgeBackgroundColor({
        color: badgeState.previousBackground,
      });
    }
  } catch (error) {
    // ignore restore errors
  }

  try {
    if (
      badgeState.previousTextColor &&
      typeof chrome.action.setBadgeTextColor === 'function'
    ) {
      await chrome.action.setBadgeTextColor({
        color: badgeState.previousTextColor,
      });
    }
  } catch (error) {
    // ignore restore errors
  }

  badgeState.owned = false;
  badgeState.text = '';
  badgeState.previousBackground = null;
  badgeState.previousTextColor = null;
}

/**
 * Format remaining time for badge text and colors.
 * @param {number} remainingMs
 * @returns {{ text: string, background: string, textColor: string }}
 */
function formatCountdownAppearance(remainingMs) {
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);
  if (safeRemaining >= 60000) {
    const minutes = Math.max(1, Math.ceil(safeRemaining / 60000));
    return {
      text: minutes + 'm',
      background: '#facc15', // Tailwind amber-400
      textColor: '#000000',
    };
  }

  const seconds = Math.max(0, Math.ceil(safeRemaining / 1000));
  return {
    text: String(seconds),
    background: '#ef4444', // Tailwind red-500
    textColor: '#ffffff',
  };
}

/**
 * Periodically update the badge countdown for the active tab.
 * @returns {Promise<void>}
 */
async function updateBadgeCountdown() {
  if (
    countdownTabId === null ||
    !scheduledTabs.has(countdownTabId)
  ) {
    await stopCountdown();
    return;
  }

  const schedule = scheduledTabs.get(countdownTabId);
  if (!schedule) {
    await stopCountdown();
    return;
  }

  const remainingMs = schedule.nextRunAt - Date.now();
  if (remainingMs <= 0) {
    await stopCountdown();
    return;
  }

  const appearance = formatCountdownAppearance(remainingMs);
  await setBadgeAppearance(
    appearance.text,
    appearance.background,
    appearance.textColor,
  );
}

/**
 * Start the badge countdown for a tab.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function startCountdown(tabId) {
  if (!scheduledTabs.has(tabId)) {
    await stopCountdown();
    return;
  }

  countdownTabId = tabId;
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
  }
  countdownTimerId = setInterval(() => {
    void updateBadgeCountdown();
  }, BADGE_UPDATE_INTERVAL_MS);
  await updateBadgeCountdown();
}

/**
 * Update badge countdown state depending on the currently active tab.
 * @returns {Promise<void>}
 */
async function refreshActiveCountdown() {
  if (activeTabId !== null && scheduledTabs.has(activeTabId)) {
    await startCountdown(activeTabId);
    return;
  }
  await stopCountdown();
}

/**
 * Schedule a reload alarm for the given tab.
 * @param {number} tabId
 * @param {number} intervalSeconds
 * @returns {Promise<void>}
 */
async function scheduleTabReload(tabId, intervalSeconds) {
  if (!chrome?.alarms || intervalSeconds < MIN_INTERVAL_SECONDS) {
    return;
  }

  const normalizedInterval = Math.max(
    MIN_INTERVAL_SECONDS,
    Math.floor(intervalSeconds),
  );
  const nextRunAt = Date.now() + normalizedInterval * 1000;
  const alarmName = buildAlarmName(tabId);

  try {
    await chrome.alarms.create(alarmName, { when: nextRunAt });
    scheduledTabs.set(tabId, {
      intervalSeconds: normalizedInterval,
      nextRunAt,
    });
    if (tabId === activeTabId) {
      await startCountdown(tabId);
    }
  } catch (error) {
    console.warn('[auto-reload] Failed to schedule alarm:', alarmName, error);
  }
}

/**
 * Clear any scheduled reload for the provided tab.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function clearTabSchedule(tabId) {
  scheduledTabs.delete(tabId);
  if (chrome?.alarms) {
    try {
      await chrome.alarms.clear(buildAlarmName(tabId));
    } catch (error) {
      console.warn('[auto-reload] Failed to clear alarm for tab', tabId, error);
    }
  }
  if (countdownTabId === tabId) {
    await stopCountdown();
  }
}

/**
 * Evaluate a tab against current rules.
 * @param {number} tabId
 * @param {string | undefined} url
 * @returns {Promise<void>}
 */
async function evaluateTab(tabId, url) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return;
  }
  const tabUrl = typeof url === 'string' && url ? url : null;

  if (!tabUrl || !isUrlEligible(tabUrl)) {
    await clearTabSchedule(tabId);
    return;
  }

  const rule = findMatchingRule(tabUrl);
  if (!rule) {
    await clearTabSchedule(tabId);
    return;
  }

  const existing = scheduledTabs.get(tabId);
  if (existing) {
    const alarmName = buildAlarmName(tabId);
    try {
      const alarm = await chrome.alarms.get(alarmName);
      if (
        alarm &&
        Math.abs(existing.intervalSeconds - rule.intervalSeconds) < 1
      ) {
        scheduledTabs.set(tabId, {
          intervalSeconds: existing.intervalSeconds,
          nextRunAt: alarm.scheduledTime,
        });
        if (tabId === activeTabId) {
          await startCountdown(tabId);
        }
        return;
      }
    } catch (error) {
      console.warn('[auto-reload] Failed to read existing alarm:', error);
    }
  }

  await scheduleTabReload(tabId, rule.intervalSeconds);
}

/**
 * Evaluate all open tabs.
 * @returns {Promise<void>}
 */
async function evaluateAllTabs() {
  if (!chrome?.tabs || typeof chrome.tabs.query !== 'function') {
    return;
  }

  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (typeof tab?.id === 'number' && tab.id > 0) {
          const url = typeof tab.url === 'string' ? tab.url : undefined;
          await evaluateTab(tab.id, url);
        }
      }),
    );
  } catch (error) {
    console.warn('[auto-reload] Failed to evaluate tabs:', error);
  }
}

/**
 * Handle updated rule sets from storage changes.
 * @param {AutoReloadRule[]} nextRules
 * @returns {Promise<void>}
 */
async function applyRulesUpdate(nextRules) {
  rules = nextRules;
  refreshCompiledRules();
  await evaluateAllTabs();
  await refreshActiveCountdown();
}

/**
 * Handle tab updates.
 * @param {number} tabId
 * @param {{ url?: string, status?: string }} changeInfo
 * @param {{ url?: string }} tab
 * @returns {void}
 */
function handleTabUpdated(tabId, changeInfo, tab) {
  const changedUrl =
    typeof changeInfo?.url === 'string' && changeInfo.url
      ? changeInfo.url
      : undefined;

  if (changedUrl) {
    void evaluateTab(tabId, changedUrl);
    return;
  }

  if (changeInfo?.status === 'loading') {
    const currentUrl = typeof tab?.url === 'string' ? tab.url : undefined;
    if (currentUrl) {
      void evaluateTab(tabId, currentUrl);
    }
  }
}

/**
 * Handle tab activation events.
 * @param {number} tabId
 * @returns {void}
 */
function handleTabActivated(tabId) {
  activeTabId = Number.isFinite(tabId) ? tabId : null;
  void refreshActiveCountdown();
}

/**
 * Handle window focus changes to refresh the active tab info.
 * @param {number} windowId
 * @returns {void}
 */
function handleWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activeTabId = null;
    void refreshActiveCountdown();
    return;
  }

  if (!chrome?.tabs || typeof chrome.tabs.query !== 'function') {
    return;
  }

  void chrome.tabs
    .query({ active: true, windowId })
    .then((tabs) => {
      if (Array.isArray(tabs) && tabs.length > 0) {
        const tab = tabs[0];
        if (typeof tab?.id === 'number') {
          activeTabId = tab.id;
        }
      }
    })
    .catch(() => {
      activeTabId = null;
    })
    .finally(() => {
      void refreshActiveCountdown();
    });
}

/**
 * Handle removal of tabs to clean alarms.
 * @param {number} tabId
 * @returns {void}
 */
function handleTabRemoved(tabId) {
  void clearTabSchedule(tabId);
  if (activeTabId === tabId) {
    activeTabId = null;
    void refreshActiveCountdown();
  }
}

/**
 * Handle alarms raised for auto reload.
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<boolean>}
 */
async function handleAutoReloadAlarmInternal(alarm) {
  if (!alarm?.name || !alarm.name.startsWith(ALARM_PREFIX)) {
    return false;
  }

  const tabId = Number(alarm.name.slice(ALARM_PREFIX.length));
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return true;
  }

  if (!chrome?.tabs || typeof chrome.tabs.get !== 'function') {
    return true;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    await clearTabSchedule(tabId);
    return true;
  }

  const currentUrl = typeof tab?.url === 'string' ? tab.url : '';
  const rule = findMatchingRule(currentUrl);
  if (!rule) {
    await clearTabSchedule(tabId);
    return true;
  }

  try {
    await chrome.tabs.reload(tabId);
  } catch (error) {
    console.warn('[auto-reload] Failed to reload tab:', tabId, error);
  }

  await scheduleTabReload(tabId, rule.intervalSeconds);
  return true;
}

/**
 * Initialize storage, listeners, and existing schedules.
 * @returns {Promise<void>}
 */
export async function initializeAutoReloadFeature() {
  await loadRulesFromStorage();

  if (chrome?.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
  }
  if (chrome?.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
  }
  if (chrome?.tabs?.onReplaced) {
    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      void clearTabSchedule(removedTabId);
      void evaluateTab(addedTabId, undefined);
    });
  }
  if (chrome?.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (activeInfo && typeof activeInfo.tabId === 'number') {
        handleTabActivated(activeInfo.tabId);
      }
    });
  }
  if (chrome?.windows?.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
  }
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, AUTO_RELOAD_RULES_KEY)) {
        return;
      }
      if (synchronizingRules) {
        return;
      }
      const { rules: sanitized } = normalizeStoredRules(
        changes[AUTO_RELOAD_RULES_KEY]?.newValue,
      );
      void applyRulesUpdate(sanitized);
    });
  }

  await evaluateAllTabs();

  if (chrome?.tabs && typeof chrome.tabs.query === 'function') {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && typeof tabs[0]?.id === 'number') {
        activeTabId = tabs[0].id;
      }
    } catch (error) {
      activeTabId = null;
    }
  }

  await refreshActiveCountdown();
}

/**
 * External handler for alarms to integrate with other listeners.
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<boolean>}
 */
export async function handleAutoReloadAlarm(alarm) {
  return handleAutoReloadAlarmInternal(alarm);
}
