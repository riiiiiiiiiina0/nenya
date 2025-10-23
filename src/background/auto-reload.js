/* global chrome, URLPattern */

/**
 * @typedef {Object} AutoReloadRule
 * @property {string} id
 * @property {string} pattern
 * @property {number} intervalSec
 * @property {boolean} enabled
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} [description]
 */

/** @type {string} */
export const AUTO_RELOAD_RULES_KEY = 'autoReloadRules';
/** @type {string} */
const ALARM_PREFIX = 'nenya-auto-reload-';

/** @type {Map<number, { deadlineMs: number, timerId: number | null, lastText: string | null }>} */
const countdownByTabId = new Map();

/**
 * Read rules from chrome.storage.sync.
 * @returns {Promise<AutoReloadRule[]>}
 */
export async function loadAutoReloadRules() {
  try {
    const result = await chrome.storage.sync.get(AUTO_RELOAD_RULES_KEY);
    const raw = /** @type {unknown} */ (result?.[AUTO_RELOAD_RULES_KEY]);
    if (!Array.isArray(raw)) {
      return [];
    }
    /** @type {AutoReloadRule[]} */
    const rules = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rule = /** @type {any} */ (item);
      const id = typeof rule.id === 'string' && rule.id ? rule.id : generateId();
      const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
      const interval = Number(rule.intervalSec);
      const enabled = Boolean(rule.enabled);
      if (!pattern || !Number.isFinite(interval) || interval <= 0) continue;
      rules.push({
        id,
        pattern,
        intervalSec: Math.max(60, Math.round(interval)),
        enabled,
        createdAt: Number.isFinite(rule.createdAt) ? Number(rule.createdAt) : Date.now(),
        updatedAt: Number.isFinite(rule.updatedAt) ? Number(rule.updatedAt) : Date.now(),
        description: typeof rule.description === 'string' ? rule.description : undefined,
      });
    }
    return rules;
  } catch (error) {
    console.warn('[auto-reload] Failed to load rules:', error);
    return [];
  }
}

/**
 * Persist the provided rules to chrome.storage.sync.
 * @param {AutoReloadRule[]} rules
 * @returns {Promise<void>}
 */
export async function saveAutoReloadRules(rules) {
  /** @type {AutoReloadRule[]} */
  const sanitized = Array.isArray(rules)
    ? rules.map((r) => ({
        id: String(r.id || generateId()),
        pattern: String(r.pattern || '').trim(),
        intervalSec: Math.max(60, Math.round(Number(r.intervalSec) || 60)),
        enabled: Boolean(r.enabled),
        createdAt: Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : Date.now(),
        updatedAt: Date.now(),
        description: typeof r.description === 'string' ? r.description : undefined,
      }))
    : [];

  await chrome.storage.sync.set({ [AUTO_RELOAD_RULES_KEY]: sanitized });
}

/**
 * Generate a simple unique id.
 * @returns {string}
 */
function generateId() {
  return 'rule-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Determine the shortest enabled interval (in seconds) among rules matching the URL.
 * @param {string} url
 * @param {AutoReloadRule[]} rules
 * @returns {number | null}
 */
export function findMatchingIntervalSec(url, rules) {
  if (!Array.isArray(rules) || rules.length === 0 || typeof url !== 'string') {
    return null;
  }
  /** @type {number | null} */
  let minSec = null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const patternStr = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
    if (!patternStr) continue;
    try {
      const pattern = new URLPattern(patternStr);
      if (pattern.test(url)) {
        const sec = Math.max(60, Math.round(Number(rule.intervalSec) || 60));
        if (minSec === null || sec < minSec) {
          minSec = sec;
        }
      }
    } catch (error) {
      // Ignore invalid rule patterns
      continue;
    }
  }
  return minSec;
}

/**
 * Compose the alarm name for a tab.
 * @param {number} tabId
 * @returns {string}
 */
function alarmName(tabId) {
  return ALARM_PREFIX + String(tabId);
}

/**
 * Clear the reload alarm for a specific tab.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function clearReloadAlarmForTab(tabId) {
  try {
    await chrome.alarms.clear(alarmName(tabId));
  } catch (error) {
    // ignore
  }
  stopCountdown(tabId);
}

/**
 * Schedule or update a reload alarm for the given tab.
 * @param {number} tabId
 * @param {number} intervalSec
 * @param {string} [url]
 * @returns {Promise<void>}
 */
export async function scheduleReloadForTab(tabId, intervalSec, url) {
  const seconds = Math.max(60, Math.round(Number(intervalSec) || 60));
  const when = Date.now() + seconds * 1000;
  try {
    await chrome.alarms.create(alarmName(tabId), {
      when,
      periodInMinutes: seconds / 60,
    });
  } catch (error) {
    console.warn('[auto-reload] Failed to create alarm:', error);
  }
  // If this tab is active, start the countdown badge
  tryStartCountdownIfActive(tabId, when);
}

/**
 * Handle when a tab's URL is finalized or changed.
 * @param {number} tabId
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function evaluateTabForReload(tabId, url) {
  const rules = await loadAutoReloadRules();
  const interval = findMatchingIntervalSec(url, rules);
  if (!interval) {
    await clearReloadAlarmForTab(tabId);
    return;
  }

  // Check existing alarm to avoid rescheduling if identical
  try {
    const existing = await chrome.alarms.get(alarmName(tabId));
    const existingPeriodMin = Number(existing?.periodInMinutes);
    const desiredMin = interval / 60;
    if (
      existing &&
      Number.isFinite(existingPeriodMin) &&
      Math.abs(existingPeriodMin - desiredMin) < 1e-6
    ) {
      // Keep countdown aligned to current scheduledTime
      tryStartCountdownIfActive(tabId, Number(existing?.scheduledTime) || Date.now() + interval * 1000);
      return;
    }
  } catch (error) {
    // proceed to (re)schedule
  }

  await scheduleReloadForTab(tabId, interval, url);
}

/**
 * Handle alarms for auto-reload. If matches our prefix, reload tab and reschedule.
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<void>}
 */
export async function handleAutoReloadAlarm(alarm) {
  if (!alarm?.name || !alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }
  const tabId = Number(alarm.name.slice(ALARM_PREFIX.length));
  if (!Number.isFinite(tabId)) return;

  try {
    await reloadTabById(tabId);
  } catch (error) {
    // ignore
  }

  // Reschedule using current rules and new URL
  try {
    const tab = await getTab(tabId);
    const url = typeof tab?.url === 'string' ? tab.url : '';
    await evaluateTabForReload(tabId, url);
  } catch (error) {
    // tab may be gone
    await clearReloadAlarmForTab(tabId);
  }
}

/**
 * Respond to storage rule changes by re-evaluating all tabs.
 * @returns {Promise<void>}
 */
export async function reevaluateAllTabs() {
  try {
    const tabs = await queryAllTabs();
    for (const tab of tabs) {
      const id = Number(tab?.id);
      const url = typeof tab?.url === 'string' ? tab.url : '';
      if (!Number.isFinite(id) || !url) continue;
      await evaluateTabForReload(id, url);
    }
  } catch (error) {
    console.warn('[auto-reload] Failed to reevaluate tabs:', error);
  }
}

/**
 * Called when tab becomes active to begin or update the countdown for that tab.
 * Stops countdowns for other tabs.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function handleTabActivated(tabId) {
  // Stop other countdowns
  Array.from(countdownByTabId.keys()).forEach((id) => {
    if (id !== tabId) stopCountdown(id);
  });

  try {
    const alarm = await chrome.alarms.get(alarmName(tabId));
    if (!alarm) {
      stopCountdown(tabId);
      return;
    }
    const deadline = Number(alarm.scheduledTime);
    tryStartCountdownIfActive(tabId, deadline);
  } catch (error) {
    stopCountdown(tabId);
  }
}

/**
 * Get tab by id.
 * @param {number} tabId
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
async function getTab(tabId) {
  try {
    const maybe = chrome.tabs.get(tabId);
    if (isPromiseLike(maybe)) {
      return await /** @type {Promise<chrome.tabs.Tab>} */ (maybe);
    }
  } catch (error) {
    // fallback
  }
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

/**
 * Reload a tab by id.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function reloadTabById(tabId) {
  try {
    const maybe = chrome.tabs.reload(tabId, { bypassCache: false });
    if (isPromiseLike(maybe)) {
      await /** @type {Promise<void>} */ (maybe);
      return;
    }
  } catch (error) {
    // use callback form
  }
  await new Promise((resolve) => {
    chrome.tabs.reload(tabId, { bypassCache: false }, () => resolve(undefined));
  });
}

/**
 * Query all normal tabs.
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function queryAllTabs() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({}, (tabs) => resolve(tabs));
    } catch (error) {
      resolve([]);
    }
  });
}

/**
 * Attempt to start countdown if the given tab is active in its window.
 * @param {number} tabId
 * @param {number} deadlineMs
 * @returns {Promise<void>}
 */
async function tryStartCountdownIfActive(tabId, deadlineMs) {
  try {
    const tab = await getTab(tabId);
    if (!tab || !tab.active) {
      stopCountdown(tabId);
      return;
    }
  } catch (error) {
    // ignore; continue
  }
  startCountdown(tabId, deadlineMs);
}

/**
 * Start or update a countdown badge for a tab.
 * @param {number} tabId
 * @param {number} deadlineMs
 * @returns {void}
 */
function startCountdown(tabId, deadlineMs) {
  const existing = countdownByTabId.get(tabId);
  if (existing && existing.timerId !== null) {
    clearInterval(existing.timerId);
  }

  const handle = { deadlineMs, timerId: null, lastText: null };
  countdownByTabId.set(tabId, handle);

  const tick = async () => {
    const now = Date.now();
    let remaining = Math.max(0, Math.floor((deadlineMs - now) / 1000));
    // Ensure at least 1 second visible tick
    if (remaining <= 0) {
      remaining = 0;
    }

    if (remaining >= 60) {
      const minutes = Math.ceil(remaining / 60);
      await setBadgeIfIdle(String(minutes), [255, 235, 59, 255], [0, 0, 0, 255]);
      handle.lastText = String(minutes);
    } else {
      const seconds = Math.max(0, remaining);
      await setBadgeIfIdle(String(seconds), [211, 47, 47, 255], [255, 255, 255, 255]);
      handle.lastText = String(seconds);
    }
  };

  // Initial tick and interval
  void tick();
  handle.timerId = setInterval(() => void tick(), 1000);
}

/**
 * Stop an active countdown for a tab.
 * @param {number} tabId
 * @returns {void}
 */
function stopCountdown(tabId) {
  const existing = countdownByTabId.get(tabId);
  if (existing && existing.timerId !== null) {
    clearInterval(existing.timerId);
  }
  countdownByTabId.delete(tabId);
}

/**
 * Determine whether a value is promise-like.
 * @param {unknown} value
 * @returns {value is PromiseLike<any>}
 */
function isPromiseLike(value) {
  return Boolean(value && typeof value === 'object' && 'then' in value && typeof value.then === 'function');
}

/**
 * Set badge text and colors only if there is no higher-priority badge currently showing.
 * This checks current badge text to avoid overriding emojis/animations.
 * @param {string} text
 * @param {[number, number, number, number]} backgroundColor
 * @param {[number, number, number, number]} textColor
 * @returns {Promise<void>}
 */
async function setBadgeIfIdle(text, backgroundColor, textColor) {
  if (!chrome?.action) return;

  const currentText = await new Promise((resolve) => {
    try {
      chrome.action.getBadgeText({}, (value) => resolve(typeof value === 'string' ? value : ''));
    } catch (error) {
      resolve('');
    }
  });

  // If another badge content is showing (non-numeric or different than our text), skip update
  const numericText = String(text);
  const isNumeric = /^\d+$/.test(String(currentText));
  if (currentText && (!isNumeric || currentText !== numericText)) {
    return;
  }

  try {
    const maybeBg = chrome.action.setBadgeBackgroundColor({ color: backgroundColor });
    if (isPromiseLike(maybeBg)) await /** @type {Promise<void>} */ (maybeBg);
  } catch (error) {
    // ignore
  }

  // Optional text color (not supported in all Chrome versions)
  try {
    const setter = /** @type {any} */ (chrome.action).setBadgeTextColor;
    if (typeof setter === 'function') {
      const maybeColor = setter.call(chrome.action, { color: textColor });
      if (isPromiseLike(maybeColor)) await /** @type {Promise<void>} */ (maybeColor);
    }
  } catch (error) {
    // ignore
  }

  try {
    const maybeText = chrome.action.setBadgeText({ text: numericText });
    if (isPromiseLike(maybeText)) await /** @type {Promise<void>} */ (maybeText);
  } catch (error) {
    // ignore
  }
}

// Event wiring helpers

/**
 * Initialize auto-reload runtime listeners.
 * @returns {void}
 */
export function initializeAutoReload() {
  // Tab updates: schedule or clear
  if (chrome?.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const urlChanged = typeof changeInfo?.url === 'string';
      const statusComplete = changeInfo?.status === 'complete';
      if (!urlChanged && !statusComplete) return;
      const url = typeof tab?.url === 'string' ? tab.url : changeInfo?.url || '';
      if (!url) return;
      void evaluateTabForReload(tabId, url);
    });
  }

  // Tab activation: update countdown for active tab
  if (chrome?.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const id = Number(activeInfo?.tabId);
      if (!Number.isFinite(id)) return;
      void handleTabActivated(id);
    });
  }

  // Tab removal: clear alarms and countdown
  if (chrome?.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      void clearReloadAlarmForTab(tabId);
    });
  }

  // Alarms
  if (chrome?.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      void handleAutoReloadAlarm(alarm);
    });
  }

  // Storage rule changes
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (AUTO_RELOAD_RULES_KEY in changes) {
        void reevaluateAllTabs();
      }
    });
  }

  // On startup/installed: evaluate all tabs
  void reevaluateAllTabs();
}
