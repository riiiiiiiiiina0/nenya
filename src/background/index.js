import { MIRROR_ALARM_NAME, MIRROR_PULL_INTERVAL_MINUTES, resetAndPull, runMirrorPull } from './mirror.js';

const MANUAL_PULL_MESSAGE = 'mirror:pull';
const RESET_PULL_MESSAGE = 'mirror:resetPull';

/**
 * Ensure the repeating alarm is scheduled.
 * @returns {Promise<void>}
 */
async function scheduleMirrorAlarm() {
  chrome.alarms.create(MIRROR_ALARM_NAME, {
    periodInMinutes: MIRROR_PULL_INTERVAL_MINUTES
  });
}

/**
 * Handle one-time initialization tasks.
 * @param {string} trigger
 * @returns {void}
 */
function handleLifecycleEvent(trigger) {
  void scheduleMirrorAlarm();
  void runMirrorPull(trigger).catch((error) => {
    console.warn('[mirror] Initial pull skipped:', error instanceof Error ? error.message : error);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  handleLifecycleEvent('install');
});

chrome.runtime.onStartup.addListener(() => {
  handleLifecycleEvent('startup');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== MIRROR_ALARM_NAME) {
    return;
  }

  void runMirrorPull('alarm').catch((error) => {
    console.error('[mirror] Scheduled pull failed:', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === MANUAL_PULL_MESSAGE) {
    runMirrorPull('manual').then((result) => {
      sendResponse(result);
    }).catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
    return true;
  }

  if (message.type === RESET_PULL_MESSAGE) {
    resetAndPull().then((result) => {
      sendResponse(result);
    }).catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
    return true;
  }

  return false;
});
