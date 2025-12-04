# Auto Google Login Specification

## Purpose

Document the currently shipped experience for configuring URL-pattern rules that trigger an automated Google OAuth login, so future changes preserve the options workflow, rule storage guarantees, background notifications, and the multi-step automation that spans button detection, account selection, and OAuth confirmation.

## Requirements

### Requirement: Options UI MUST let users manage auto Google login rules stored in `chrome.storage.sync`

#### Scenario: Submit the form to add or edit a rule
- **GIVEN** the user opens `#auto-google-login-heading` inside `src/options/index.html`,
- **WHEN** they submit `autoGoogleLoginRuleForm` with a non-empty pattern accepted by the browser’s `URLPattern` constructor and an optional email that either passes `^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$` or stays blank,
- **THEN** `src/options/autoGoogleLogin.js` MUST trim inputs, reject invalid values via `autoGoogleLoginFormError`, and otherwise either update the editing rule or create a new rule with a generated ID (`crypto.randomUUID` fallback to timestamp), stamp `createdAt/updatedAt`, and persist the sorted array (pattern first, then email) to `chrome.storage.sync.autoGoogleLoginRules`,
- **AND** saving while editing MUST keep the same ID, refresh `updatedAt`, optionally remove the email field when cleared, change the submit button text to “Save changes”, surface the cancel button, and call `resetForm()` afterward so the form returns to “Add rule”.

#### Scenario: View, disable, or delete a saved rule
- **GIVEN** at least one rule exists and is rendered inside `autoGoogleLoginRulesList`,
- **WHEN** the user clicks “View”,
- **THEN** `autoGoogleLoginRuleDetails` MUST show the pattern, email (or `—`), and formatted timestamps using `Intl.DateTimeFormat`, remaining hidden when nothing is selected,
- **AND** toggling the “Enabled” switch MUST flip the rule’s `disabled` flag, keep other metadata untouched, persist immediately, and re-render with disabled rules dimmed,
- **AND** clicking “Delete” MUST confirm via `window.confirm`, remove the rule, clear any selected/editing references, update storage, and reveal `autoGoogleLoginRulesEmpty` if no rules remain.

#### Scenario: Normalize synced data and reflect remote changes
- **GIVEN** rules load or `chrome.storage.onChanged` fires for `autoGoogleLoginRules`,
- **WHEN** `normalizeRules` processes the payload,
- **THEN** it MUST drop entries without valid patterns, validate emails, mint IDs for missing ones, preserve `disabled/createdAt/updatedAt`, resort the list, and re-save when mutations were required,
- **AND** subsequent renders MUST clear the details panel or edit form if their referenced rule disappeared so the UI never points at stale IDs.

### Requirement: Content script MUST only attempt auto login on active tabs whose URL matches an enabled rule

#### Scenario: Detect eligible pages and Google login buttons
- **GIVEN** `src/contentScript/auto-google-login.js` loads on every page declared in `manifest.json`,
- **WHEN** `init()` runs,
- **THEN** it MUST fetch `chrome.storage.sync.autoGoogleLoginRules`, cache enabled entries, and for the current URL apply `URLPattern` matching to find the first rule whose `pattern` matches,
- **AND** it MUST throttle DOM scans to every ≥3 s, debounce mutation bursts by 2 s, schedule checks at 500 ms/2 s/5 s after load, and only proceed when `isCurrentTabActive()` confirms (via `document.hasFocus()` plus background message `auto-google-login:checkTabActive`) that the extension’s tab is the focused active tab,
- **AND** `findGoogleLoginButtons()` MUST inspect `button`, `a[href]`, `[role="button"]`, and submit inputs, counting matches when their text/value/aria/title/class/id include both login keywords (`login/log in/sign in/signin`) and `google` or `gmail`, plus common class patterns like `login-with-google` or `google-signin`,
- **AND** once a button is found, the script MUST guard with `loginInProgress` and `lastAlertedRuleId` so it does not re-trigger for the same rule until navigation changes.

### Requirement: Auto login initiation MUST persist the target account context and handle redirect vs popup flows

#### Scenario: Click the Google login entry point and monitor OAuth
- **GIVEN** `checkAndAlert()` located a button and the tab stayed active,
- **WHEN** `clickGoogleLoginButton()` runs,
- **THEN** it MUST store `{ autoGoogleLoginTempEmail: rule.email || 'configured account', autoGoogleLoginInitiated: { initiated: true, timestamp: Date.now() } }` inside `chrome.storage.local` before the page leaves the origin, send a background notification summarizing the action, and set `loginInProgress = true`,
- **AND** if the element has an `href` without a popup target it MUST navigate `window.location.href` to that URL, otherwise it MUST call `button.click()` (plus synthetic events), wait briefly for a popup, and call `monitorGoogleOAuthFlow(rule)` to watch subsequent navigations,
- **AND** `monitorGoogleOAuthFlow` MUST watch for URL changes every 500 ms (with a 30 s timeout), immediately react when the page is already on `accounts.google.com`, and defer to the account-selection or OAuth confirmation handlers described below.

### Requirement: Account chooser pages MUST auto-select the configured Google profile when auto login initiated

#### Scenario: Select the stored email on Google’s account picker
- **GIVEN** the browser lands on `accounts.google.com` with `oauthchooseaccount`, `oauth`, or `signin` in the URL and `autoGoogleLoginInitiated` is fresh (<10 s),
- **WHEN** `handleGoogleAccountSelection()` runs,
- **THEN** it MUST read `autoGoogleLoginTempEmail` from `chrome.storage.local` (falling back to the rule’s `email`), and attempt to click the account using multiple strategies in order: `div[role="link"][data-identifier]`, any `[data-identifier]`, `[data-email]`, partial identifier/email matches, elements whose `aria-label` contains the email, and finally `li` nodes whose text contains an email pattern,
- **AND** each candidate click MUST scroll into view and dispatch native, `MouseEvent`, and `PointerEvent` clicks to maximize compatibility,
- **AND** the handler MUST combine a MutationObserver (watching `data-email`/`data-identifier`) with a polling loop (15 retries, first wait 2 s then 500 ms intervals), clear the initiation flag + stored email within 5–15 s after success, and if no account matched it MUST push a notification asking the user to select the account manually.

### Requirement: OAuth confirmation pages MUST attempt to click the Continue button automatically

#### Scenario: Dismiss the consent confirmation on `accounts.google.com/signin/oauth/id`
- **GIVEN** navigation reaches the OAuth confirmation page within 10 s of `autoGoogleLoginInitiated` being set,
- **WHEN** `handleOAuthConfirmation()` runs,
- **THEN** it MUST search for an enabled, visible button whose text, nested span, `aria-label`, or `jsname="LgbsSe"` equals “Continue”, click it using `clickElement()`, and otherwise keep trying via a MutationObserver (10 s timeout observing `button` changes) and a polling loop (10 retries at 500 ms),
- **AND** after a successful click it MUST clear the initiation flag within ~5 s so subsequent navigations do not keep auto-clicking, while failures trigger a notification instructing the user to press Continue manually.

### Requirement: Background service MUST support notifications and focus checks for auto Google login

#### Scenario: Relay progress notifications
- **GIVEN** the content script calls `chrome.runtime.sendMessage({ type: 'auto-google-login-notification', ... })`,
- **WHEN** `src/background/index.js` receives it,
- **THEN** it MUST call `pushNotification('auto-google-login', title || 'Auto Google Login', message, targetUrl)` whenever `message` is non-empty so users see status updates for redirects, popups, account selection failures, or errors, otherwise respond with an error without emitting a notification.

#### Scenario: Confirm the tab is the focused active tab before automation
- **GIVEN** a content script needs to verify focus,
- **WHEN** it sends `{ type: 'auto-google-login:checkTabActive' }`,
- **THEN** the background page MUST resolve `sender.tab.windowId`, ensure the Chrome window is focused, query for the active tab in that window, and reply `{ isActive: true }` only when the sender tab matches, defaulting to `false` on errors so automation pauses whenever the tab is backgrounded.

### Requirement: Content script MUST stay in sync with rule changes

#### Scenario: React to `chrome.storage.sync` updates
- **GIVEN** any browser instance edits auto Google login rules,
- **WHEN** `chrome.storage.onChanged` fires for `autoGoogleLoginRules`,
- **THEN** the content script’s `setupStorageListener()` MUST reload the rules, reset `lastAlertedRuleId`, and invoke `debouncedCheck()` so newly added/disabled patterns take effect without requiring a page refresh.


