# Block Elements Feature

## Overview

This feature adds a "Block Elements" section to the options page where users can manage CSS selectors to block specific elements on web pages based on URL patterns.

## Implementation

### 1. User Interface

- Added a 🚫 "Block Elements" section in the options page
- Navigation link added to the sidebar
- Users can view, edit, and delete blocking rules

### 2. Architecture

The feature consists of four main components:

#### A. Options Page UI (`src/options/index.html`)

- New section with:
  - Rules list showing URL patterns and selector counts
  - Details panel for viewing and editing individual rules
  - Ability to modify URL patterns
  - Ability to delete individual selectors or entire rules

#### B. Options Page Module (`src/options/blockElements.js`)

- Manages blocking rules in chrome.storage.sync
- Provides UI for viewing and editing rules
- Features:
  - Load/save rules to storage
  - Display rules list with pattern and selector count
  - Show rule details with editable URL pattern
  - Delete individual selectors from a rule
  - Delete entire rules
  - Real-time sync across tabs

#### C. Content Script (`src/contentScript/epicker.js`)

- Modified to send selector to background script when confirmed
- Sends message type `blockElement:addSelector` with:
  - `selector`: The CSS selector to block
  - `url`: The current page URL

#### D. Background Script (`src/background/index.js`)

- Handles `blockElement:addSelector` messages
- Automatically extracts URL pattern from the page URL (protocol://hostname/\*)
- Creates or updates blocking rules:
  - If a rule exists for the URL pattern, adds the selector to it
  - If no rule exists, creates a new one
  - Prevents duplicate selectors in the same rule
- Stores rules in chrome.storage.sync

### 3. Data Structure

Each blocking rule has the following structure:

```javascript
{
  id: 'unique-rule-id',
  urlPattern: 'https://example.com/*',
  selectors: ['.ad-banner', '#popup', '.tracking-pixel'],
  createdAt: '2025-10-29T12:00:00.000Z',
  updatedAt: '2025-10-29T12:30:00.000Z'
}
```

### 4. Usage

1. **Add a blocking rule:**

   - Click the 🎯 "Create custom filter" button in the extension popup
   - Use the element picker to select an element on the page
   - Click "Create" to confirm the selector
   - The selector is automatically saved to a blocking rule for that domain

2. **View blocking rules:**

   - Open the extension options page
   - Navigate to the "Block Elements" section
   - Click "View" on any rule to see details

3. **Edit URL pattern:**

   - View a rule's details
   - Click "Edit pattern" button
   - Modify the URL pattern
   - Click "Save" or "Cancel"

4. **Delete a selector:**

   - View a rule's details
   - Click the ✕ button next to any selector
   - Confirm deletion

5. **Delete entire rule:**
   - Click "Delete" button in the rule list, or
   - View rule details and click "Delete rule"
   - Confirm deletion

### 5. Technical Details

- **Storage**: Rules are stored in `chrome.storage.sync` under the key `blockElementRules`
- **URL Pattern**: Automatically generated as `protocol://hostname/*` from the current page URL
- **Sync**: Changes sync across all tabs in real-time using chrome.storage.onChanged
- **Validation**: URL patterns are validated using the URLPattern API
- **Empty Rule Cleanup**: If all selectors are deleted from a rule, the rule itself is automatically deleted

### 6. Files Modified/Created

**Modified:**

- `src/options/index.html` - Added Block Elements section with navigation link
- `src/options/options.js` - Imported blockElements.js module
- `src/contentScript/epicker.js` - Added message sending to background script on selector confirmation
- `src/background/index.js` - Added message handler for saving blocking rules
- `manifest.json` - Added block-elements.js content script

**Created:**

- `src/options/blockElements.js` - Complete management module for blocking rules
- `src/contentScript/block-elements.js` - Content script that applies blocking rules to web pages

### 7. Automatic Element Blocking

The extension now automatically hides elements on web pages based on the stored blocking rules:

#### Implementation (`src/contentScript/block-elements.js`)

**Features:**

- **Page Load**: Applies blocking rules immediately when a page loads
- **SPA Navigation**: Detects URL changes via `pushState`, `replaceState`, `popstate`, and `hashchange` events
- **Dynamic Content**: Uses MutationObserver to detect new elements added to the page
- **Performance**: Debounces DOM mutation checks (300ms interval) to reduce overhead
- **Real-time Updates**: Listens to storage changes and applies new rules immediately

**How it Works:**

1. Loads all blocking rules from `chrome.storage.sync` on initialization
2. Matches the current page URL against rule patterns using the URLPattern API
3. Creates a `<style>` element with CSS to hide all matching selectors
4. Re-applies rules when:
   - URL changes (for SPAs)
   - DOM mutations occur (new elements added)
   - Storage rules are updated (from options page)

**CSS Injection:**

- Injects a style element with ID `nenya-block-elements-style`
- Uses `display: none !important;` to hide matching elements
- Runs at `document_start` for early blocking

## Integration with Import/Export and Backup

### Import/Export

Block elements rules are fully integrated with the extension's import/export system:

- **Export**: When you export your options, block elements rules are included in the export file (version 6+)
- **Import**: When you import options from a file, block elements rules are restored
- **Compatibility**: Old export files (without block elements rules) can still be imported
- **Validation**: All rules are validated during import to ensure data integrity

### Raindrop Backup/Restore

Block elements rules are automatically backed up to your Raindrop account:

- **Auto-backup**: Rules are automatically backed up whenever they change
- **Manual backup**: Use the "Backup now" button in Options to force a backup
- **Auto-restore**: Rules are synced across devices when you log in
- **Manual restore**: Use the "Restore from backup" button to restore rules from Raindrop
- **Reset**: Resetting to defaults will clear all block elements rules

The backup system creates a special item in your Raindrop "Options backup" collection with the title "block-element-rules". This item contains all your blocking rules in JSON format.

## Future Enhancements

Possible improvements for future versions:

- Apply blocking rules automatically on matching pages (inject CSS to hide elements)
- Custom URL pattern editing when adding rules (not just auto-generated)
- Bulk selector operations
- Test blocking rules on current page
- Support for advanced CSS selectors and patterns
- Statistics on blocked elements
- Whitelist specific pages from blocking rules
