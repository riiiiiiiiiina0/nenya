# Auto Google Login Logic Summary

## Overview

The `auto-google-login.js` content script automatically detects Google login buttons on web pages matching configured URL patterns and automates the Google OAuth login flow, including account selection and OAuth confirmation.

## Core Concepts

### Storage Keys

- `autoGoogleLoginRules`: Stores URL pattern rules with associated email addresses
- `autoGoogleLoginTempEmail`: Temporary storage for email during OAuth flow (stored in `chrome.storage.local`)

### Constants

- `DEBOUNCE_DELAY`: 2000ms - Debounce delay for DOM mutations
- `MIN_CHECK_INTERVAL`: 3000ms - Minimum time between checks

### State Variables

- `cachedRules`: Array of configured rules
- `debounceTimer`: Timer for debounced checks
- `mutationObserver`: Watches for DOM changes
- `lastAlertedRuleId`: Tracks which rule was last processed
- `lastCheckTime`: Timestamp of last check (for throttling)
- `loginInProgress`: Flag indicating if login is currently in progress
- `oauthWindowId`: ID of OAuth popup window (if applicable)

## Main Flow

### 1. Initialization (`init()`)

1. Loads rules from `chrome.storage.sync`
2. Checks if already on Google OAuth pages:
   - **OAuth Confirmation Page**: Calls `handleOAuthConfirmation()`
   - **Account Selection Page**: Retrieves stored email and calls `handleGoogleAccountSelection()`
3. Schedules multiple delayed checks (500ms, 2s, 5s) to catch dynamically loaded buttons
4. Sets up `MutationObserver` to watch for button-related DOM changes
5. Monitors URL changes for navigation to Google OAuth pages

### 2. Rule Matching (`findMatchingRule()`)

- Uses `URLPattern` API to match current URL against configured patterns
- Returns the first matching rule or `null`

### 3. Button Detection (`findGoogleLoginButtons()`)

Searches for Google login buttons using `isGoogleLoginButton()` which checks:

**Text Content:**

- Contains both "login"/"log in"/"sign in" AND "google" (case-insensitive)
- Checks `textContent`, `value` attribute (for input buttons), `aria-label`, and `title`

**Class/ID Patterns:**

- Common patterns: `login-with-google`, `google-login`, `google-signin`, `signin-google`, `btn-google`, `google-btn`

**Element Types:**

- `button`, `a[href]`, `[role="button"]`, `input[type="button"]`, `input[type="submit"]`

### 4. Login Initiation (`clickGoogleLoginButton()`)

1. Sets `loginInProgress = true`
2. Stores email in `chrome.storage.local` for cross-origin access
3. Determines if button opens popup or redirects:
   - **Redirect**: Navigates to `href` directly
   - **Popup**: Clicks button and monitors for OAuth window
4. Calls `monitorGoogleOAuthFlow()` for redirect-based flows

### 5. OAuth Flow Monitoring (`monitorGoogleOAuthFlow()`)

Monitors the page for Google OAuth flow:

1. **OAuth Confirmation Page** (`accounts.google.com/signin/oauth/id`):

   - Calls `handleOAuthConfirmation()` to click Continue button

2. **Account Selection Page** (`accounts.google.com` with `oauth`/`signin`):

   - Calls `handleGoogleAccountSelection()` to select account

3. **URL Change Monitoring**:
   - Sets up interval to watch for navigation to Google OAuth pages
   - Timeout after 30 seconds

### 6. Account Selection (`handleGoogleAccountSelection()`)

Attempts to automatically select the configured Google account:

**Immediate Attempt:**

- Tries `tryClickAccount()` immediately if elements are loaded

**Retry Strategies:**

- **Polling**: Retries up to 15 times with 500ms delay (2s delay on first attempt)
- **MutationObserver**: Watches for `data-email` and `data-identifier` attributes appearing

**Account Finding Strategies** (`tryClickAccount()`):

1. **Exact Match - `div[role="link"][data-identifier]`**: Most common clickable element
2. **Exact Match - `[data-identifier]`**: Any element with matching identifier
3. **Exact Match - `[data-email]`**: Any element with matching email
4. **Partial Match - `div[role="link"][data-identifier]`**: Handles encoding issues
5. **Partial Match - `[data-identifier]`**: Fallback for partial matches
6. **Partial Match - `[data-email]`**: Fallback for email partial matches
7. **Aria-label**: Searches elements with `aria-label` containing email
8. **Text Content**: Searches `li` elements with email in text content

**Click Handling:**

- Scrolls element into view
- Tries multiple click methods: direct `click()`, `MouseEvent`, `PointerEvent`
- Prefers clicking parent `div[role="link"]` or `li` elements when found

### 7. OAuth Confirmation (`handleOAuthConfirmation()`)

Attempts to click the "Continue" button on Google's OAuth confirmation page:

**Immediate Attempt:**

- Tries `tryClickContinueButton()` immediately

**Retry Strategies:**

- **Polling**: Retries up to 10 times with 500ms delay
- **MutationObserver**: Watches for Continue button appearing (10s timeout)

**Continue Button Finding Strategies** (`tryClickContinueButton()`):

1. **Text Content**: Button with text "continue" (case-insensitive)
2. **JS Name**: Button with `jsname="LgbsSe"` (Google's Continue button)
3. **Aria-label**: Button with `aria-label` containing "continue"
4. **Span Text**: Button containing a `span` with text "continue"

**Click Handling:**

- Checks element is visible (`offsetParent !== null`) and not disabled
- Uses `clickElement()` helper

### 8. Periodic Checking (`checkAndAlert()`)

Main check function called periodically:

1. Gets current URL and finds matching rule
2. Resets state if no matching rule
3. Prevents duplicate processing for same rule
4. Finds Google login buttons
5. If buttons found, clicks the first one via `clickGoogleLoginButton()`

### 9. Debouncing & Throttling (`debouncedCheck()`)

- **Throttling**: Prevents checks if less than `MIN_CHECK_INTERVAL` (3s) since last check
- **Debouncing**: Waits `DEBOUNCE_DELAY` (2s) after last mutation before checking
- **Mutation Throttling**: Only checks every 5th relevant mutation

## Storage Change Listener

Listens for changes to `autoGoogleLoginRules` in `chrome.storage.sync`:

- Reloads rules when changed
- Resets alert state
- Triggers debounced check

## Error Handling

- Catches and logs errors for storage operations
- Sends notifications via background script for errors
- Falls back gracefully when elements aren't found
- Cleans up observers and timers on errors

## Notifications

Sends notifications via `chrome.runtime.sendMessage()` to background script:

- Login initiation
- Account selection success/failure
- OAuth confirmation progress
- Errors

## Key Design Decisions

1. **Cross-Origin Email Storage**: Uses `chrome.storage.local` instead of `sessionStorage` to share email across different origins during OAuth flow

2. **Multiple Detection Strategies**: Uses multiple fallback strategies for finding buttons and accounts to handle various Google UI implementations

3. **Delayed Checks**: Schedules checks at multiple intervals (500ms, 2s, 5s) to catch dynamically loaded content

4. **MutationObserver Filtering**: Only watches for button-related mutations to reduce performance impact

5. **State Management**: Tracks `loginInProgress` and `lastAlertedRuleId` to prevent duplicate processing

6. **URL Monitoring**: Continuously monitors URL changes to detect navigation to Google OAuth pages

## Limitations

- Cannot directly access popup windows (relies on page monitoring)
- Depends on Google's DOM structure (may break if Google changes UI)
- Requires exact or partial email match for account selection
- Timeout-based (may miss slow-loading elements)
