# Auto Reload Specification

## Purpose

Document the currently shipped behavior for defining URL-pattern-based auto reload rules, surfacing countdown status in the popup and badge, and executing scheduled reloads so future changes preserve the existing workflow.

## Requirements

### Requirement: Options UI MUST let users create, edit, disable, and remove auto reload rules stored in sync

#### Scenario: Add or edit a rule through the form
- **GIVEN** the user opens `src/options/index.html` and scrolls to the Auto Reload section,
- **WHEN** they submit `autoReloadRuleForm` with a URL pattern validated by the browser’s `URLPattern` constructor and a positive minutes value,
- **THEN** the script MUST normalize the interval to at least 5 seconds (`Math.round(minutes * 60)`), assign or preserve a rule ID, stamp `createdAt/updatedAt`, persist the array to `chrome.storage.sync.autoReloadRules`, and resort the list by pattern + interval,
- **AND** invalid patterns or non-positive minutes MUST keep the form in-place with `autoReloadFormError` explaining what needs to be fixed,
- **AND** entering edit mode via the “Edit” button MUST swap the submit button text to “Save changes”, show the cancel button, and repopulate the inputs with the selected rule before saving back to storage.

#### Scenario: Toggle, view, or delete a rule
- **GIVEN** at least one rule exists,
- **WHEN** the user flips the “Enabled” toggle in the list,
- **THEN** the script MUST update that rule’s `disabled` flag in storage without altering other metadata and re-render the list with disabled rules dimmed,
- **AND** clicking “View” MUST populate `autoReloadRuleDetails` with the pattern, interval summary (`Every N seconds/minutes`), and formatted timestamps or `—` when missing,
- **AND** clicking “Delete” MUST prompt for confirmation, remove the rule, clear any selected/editing state that references it, persist the pruned array, and refresh the empty-state if no rules remain.

#### Scenario: Reflect remote sync changes and sanitize invalid entries
- **GIVEN** another browser or backup process changes `chrome.storage.sync.autoReloadRules`,
- **WHEN** `chrome.storage.onChanged` fires for that key,
- **THEN** the options script MUST call `normalizeRules`, drop entries lacking valid `URLPattern` strings, coerce intervals to integers ≥5 seconds, mint IDs for missing ones, and re-render the UI,
- **AND** if a remotely deleted rule was being viewed or edited locally, the panel/form MUST reset to its default state to avoid referencing stale IDs.

### Requirement: Popup MUST integrate with auto reload by prefilling rules and showing countdowns

#### Scenario: Open options prefilled with the current tab’s URL
- **GIVEN** the user clicks the popup’s auto reload quick action,
- **THEN** `handleAutoReload` MUST read the active tab, store `{ autoReloadPrefillUrl: currentUrl }` in `chrome.storage.local`, and call `chrome.runtime.openOptionsPage`,
- **AND** once `options/autoReload.js` loads it MUST grab that value, navigate to `#auto-reload-heading` via `window.navigationManager`, focus the pattern input, write the URL, and clear the local storage key so repeated opens do not reuse stale data,
- **AND** if no active tab or URL exists the popup MUST surface an error status instead of opening options.

#### Scenario: Display the active countdown inside the popup
- **GIVEN** the popup is open and `autoReloadStatusElement` exists,
- **WHEN** the polling loop runs every second,
- **THEN** it MUST message the background with `type: 'autoReload:getStatus'`, hide the element when no schedule is returned, and otherwise format the remaining milliseconds into `MM:SS` (minutes when ≥60s, seconds otherwise),
- **AND** errors (e.g., service worker asleep) MUST be logged and force the element hidden so stale countdowns are never shown.

### Requirement: Background service MUST schedule reload alarms for the shortest matching URLPattern rule

#### Scenario: Match eligible tabs and create alarms
- **GIVEN** `initializeAutoReloadFeature` loaded rules from `chrome.storage.sync`,
- **WHEN** `evaluateTab` runs (triggered by tab updates, activations, replacements, service worker start, or focus changes),
- **THEN** it MUST ignore `chrome://` and `chrome-extension://` URLs, run compiled `URLPattern` tests for each enabled rule, pick the rule with the smallest interval, and call `chrome.alarms.create('autoReload:<tabId>')` with `when = now + intervalSeconds * 1000`,
- **AND** `scheduledTabs` MUST remember both the interval and next run so the tab can be rehydrated after a service worker restart.

#### Scenario: Clear schedules when no rule applies
- **GIVEN** a tab was previously scheduled,
- **WHEN** its URL no longer matches any enabled rule, the user disables the rule, or it navigates to an ineligible URL,
- **THEN** `evaluateTab` MUST remove the tab from `scheduledTabs`, clear the corresponding alarm, and stop any badge countdown for that tab.

### Requirement: Extension badge MUST show a live countdown for the active scheduled tab

#### Scenario: Acquire badge ownership and render countdown colors
- **GIVEN** the active tab has an entry in `scheduledTabs`,
- **THEN** `startCountdown` MUST claim `chrome.action` badge control when it is unused, poll every second, and call `setBadgeAppearance`,
- **AND** `formatCountdownAppearance` MUST render minutes with amber background + black text when ≥60 s remain and render seconds with red background + white text otherwise,
- **AND** when the active tab changes or loses its schedule the feature MUST call `stopCountdown` to clear the text and restore any prior badge colors so other features can reuse it.

### Requirement: Auto reload alarms MUST reload matching tabs and reschedule future runs

#### Scenario: Handle alarm ticks idempotently
- **GIVEN** a Chrome alarm named `autoReload:<tabId>` fires,
- **THEN** the background script MUST verify the tab still exists, confirm its current URL still matches an enabled rule, call `chrome.tabs.reload(tabId)`, and immediately schedule the next alarm using the rule’s interval,
- **AND** if the tab disappeared or no matching rule remains it MUST instead clear local state for that tab so alarms stop firing on orphaned IDs.

### Requirement: Rule storage MUST stay sanitized and keep schedules in sync across devices

#### Scenario: Normalize persisted rules and propagate updates to running schedules
- **GIVEN** rules are loaded on startup or `chrome.storage.sync` reports a change,
- **WHEN** `normalizeStoredRules` runs,
- **THEN** it MUST drop invalid objects, trim patterns, ensure each rule has an ID, coerce `intervalSeconds` to integers ≥5, preserve `disabled/createdAt/updatedAt`, and write the sanitized array back to storage when mutations were required,
- **AND** after rules change, the feature MUST refresh the compiled `URLPattern` list, call `evaluateAllTabs()` to rebuild alarms, and `refreshActiveCountdown()` so the popup badge reflects the latest schedule without requiring a browser restart.

