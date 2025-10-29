# Custom Filter Feature

## Overview

This feature adds a DOM element picker to the Nenya extension, inspired by uBlock Origin's element picker. Users can select elements on any webpage and generate CSS selectors for them.

## Implementation

### 1. User Interface

- Added a 🎯 button in the popup page (`src/popup/index.html`)
- The button is labeled "Create custom filter" in the tooltip

### 2. Architecture

The feature consists of three main components:

#### A. Popup Handler (`src/popup/popup.js`)

- `handleCustomFilter()` function sends a message to the background script to launch the picker
- Closes the popup after launching the picker

#### B. Background Script (`src/background/index.js`)

- `launchElementPicker(tabId)` function injects the picker content script into the active tab
- Listens for `launchElementPicker` messages from the popup

#### C. Content Script (`src/contentScript/epicker.js`)

- Main picker logic wrapped in an IIFE
- Handles element selection, highlighting, and selector generation
- Creates an iframe with the picker UI
- Uses MessageChannel for communication between the content script and UI

#### D. Picker UI (`src/contentScript/epicker-ui.html` and `epicker-ui.js`)

- Provides a floating dialog for displaying and editing the CSS selector
- Shows a semi-transparent overlay with highlighted elements
- SVG-based element highlighting with ocean/islands metaphor

### 3. Features

- **Hover Highlighting**: Elements are highlighted as you move your mouse over them
- **Click to Select**: Click an element to select it and open the selector editor
- **Optimized Short Selectors**: Automatically generates the shortest possible CSS selectors:
  - Tests for uniqueness at each step
  - Prioritizes: ID alone → single class → tag+class → multiple classes
  - Uses short parent-child paths (max 3 levels)
  - Prefers descendant selectors over child selectors for flexibility
  - Sorted by uniqueness first, then by length
  - Example: `.unique-class` instead of `body > div > section > ul.unique-class.other-classes`
- **Specificity Slider**: Adjust the slider to select from specific to generic selectors
- **Interactive Selector List**: Click any candidate in the list to select it
- **Real-time Match Count**: Shows how many elements match the current selector
- **Preview Mode**: Toggle preview to hide matching elements and see how the page looks without them
- **Pick Mode**: Return to picking mode to select a different element
- **Visual Feedback**: Selected elements are highlighted with a blue overlay
- **Scroll Lock**: Page scrolling is disabled while picker is active for better UX
- **Console Logging**: Final selector is logged to console when confirmed

### 4. Usage

1. Click the 🎯 "Create custom filter" button in the extension popup
2. Hover over elements on the page to see them highlighted
3. Click an element to select it
4. Review the selector candidates:
   - **Move the slider** to adjust specificity (left = more specific, right = less specific)
   - **Click candidates** in the list to select them directly
   - **Match count** shows how many elements the current selector matches
5. Test your selector:
   - Click **"Preview"** to hide matching elements (button turns red)
   - See how the page looks without those elements
   - Click **"Preview"** again to restore them
6. Finalize:
   - Click **"Pick"** to select a different element
   - Click **"Create"** to confirm and log the selector to console
   - Press **ESC** or click **✕** to quit the picker

### 5. Technical Details

- **Vanilla JavaScript**: No build steps or TypeScript
- **JSDoc**: All functions are documented with JSDoc comments
- **Single Quotes**: Follows project convention for string literals
- **IIFE Wrapped**: Content scripts are wrapped in IIFEs to prevent global pollution
- **MessageChannel**: Used for secure communication between iframe and content script
- **Web Accessible Resources**: Picker UI files are registered in manifest.json
- **Scroll Prevention**: Page overflow is set to hidden during picker session and restored on exit

### 6. Files Modified/Created

**Modified:**

- `src/popup/index.html` - Added custom filter button
- `src/popup/popup.js` - Added handleCustomFilter function
- `src/background/index.js` - Added launchElementPicker function and message handler
- `manifest.json` - Added picker UI files to web_accessible_resources

**Created:**

- `src/contentScript/epicker.js` - Main picker content script
- `src/contentScript/epicker-ui.html` - Picker UI HTML
- `src/contentScript/epicker-ui.js` - Picker UI JavaScript

## Output

When a selector is confirmed, it is logged to the browser console with optimized short selectors:

```javascript
[epicker] Final selector: .menu-level-1-buttons
// or
[epicker] Final selector: #main-nav
// or
[epicker] Final selector: ul.menu
```

Instead of long paths like:

```javascript
// OLD (not optimized):
body > div#main-container > nav.navigation > ul.menu.menu-level-1.menu-level-1-buttons.sm-gap-medium
```

## Future Enhancements

Possible improvements for future versions:

- Save selectors to storage
- Apply custom CSS to selected elements (hide, style, etc.)
- Support for procedural selectors and advanced patterns
- Export selectors to file
- Selector validation and testing tools
- Bulk selector creation from multiple elements
