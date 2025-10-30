# Notion Content Extraction Implementation

## Overview

This document describes the implementation of Notion page content extraction for the Nenya extension, following the Bear Talk extension pattern.

## What Was Implemented

### 1. New Content Script: `getContent-notion.js`

**Location:** `/src/contentScript/getContent-notion.js`

**Features:**
- Uses Notion's internal API (`/api/v3/loadPageChunk` and `/api/v3/getRecordValues`) to fetch page content
- Extracts page ID from the URL and formats it correctly
- Recursively fetches all nested blocks (handles missing blocks across multiple iterations)
- Converts Notion block types to markdown format

**Supported Block Types:**
- **Text Blocks:** paragraph, text
- **Headings:** heading_1, heading_2, heading_3
- **Lists:** bulleted_list, numbered_list, to_do (with checkboxes)
- **Formatting:** bold, italic, code, strikethrough, underline, links, highlights
- **Special Blocks:** quote, code blocks (with language syntax), callout (with icons), toggle (as HTML details)
- **Media:** image, video, file, pdf
- **Links:** bookmark, link_to_page, embed
- **Layout:** column_list, column
- **Tables:** table, table_row (with proper markdown table formatting)
- **Advanced:** equation (LaTeX), table_of_contents, breadcrumb, synced_block, template
- **Divider:** horizontal rule

**Key Technical Details:**
- Rich text processing with inline formatting support
- Recursive block traversal with visited set to avoid infinite loops
- Automatic fetching of missing/lazy-loaded blocks (up to 3 iterations)
- Proper page title extraction and placement
- IIFE wrapper to prevent global scope pollution

### 2. Background Script Updates

**Location:** `/src/background/index.js`

**Changes:**
1. Added `isNotionPage()` function to detect Notion URLs:
   ```javascript
   function isNotionPage(url) {
     return /^https?:\/\/(?:www\.)?notion\.so\//.test(url);
   }
   ```

2. Updated `injectContentScripts()` function:
   - Detects Notion pages using the new function
   - Injects `getContent-notion.js` for Notion pages (without Readability/Turndown libraries)
   - Maintains existing behavior for YouTube and general pages

**Injection Flow:**
```
Notion Page Detected
    ↓
Inject getContent-notion.js
    ↓
Inject pageContentCollector.js
    ↓
Content collected and sent to background script
```

## Architecture Pattern (Following Bear Talk)

### Strategy Pattern
Different content extraction strategies for different website types:
- **General pages:** Readability + Turndown
- **YouTube pages:** Custom video/caption extraction
- **Notion pages:** Notion API-based extraction (NEW)

### Registration Pattern
Each content script registers its extractor function:
```javascript
window['getContent'] = getNotionPageContent;
```

The shared `pageContentCollector.js` calls this registered function.

### Observer Pattern
Message passing between content scripts and background script:
1. Content script extracts content
2. Sends message with type `'page-content-collected'`
3. Background script receives and processes the content

## How to Use

### For Users
1. Navigate to any Notion page (e.g., `https://notion.so/...`)
2. Use the Nenya extension's content collection feature (e.g., keyboard shortcut or popup action)
3. The extension will automatically detect it's a Notion page and use the specialized extractor
4. Notion content will be converted to clean markdown format

### For Developers Testing
```javascript
// In browser console on a Notion page after script injection:
window['getContent']().then(markdown => console.log(markdown));
```

## Advantages Over Generic Extraction

1. **Structure Preservation:** Maintains Notion's hierarchical block structure
2. **Rich Formatting:** Preserves bold, italic, code, highlights, etc.
3. **Special Blocks:** Properly handles callouts, toggles, tables, equations
4. **Complete Content:** Fetches lazy-loaded and nested blocks
5. **No Clutter:** Uses API data instead of DOM scraping, avoiding UI elements

## Comparison with General Extractor

| Feature | General Extractor | Notion Extractor |
|---------|------------------|------------------|
| Method | DOM scraping + Readability | Notion API |
| Formatting | Basic markdown | Rich markdown with all formatting |
| Nested content | Limited | Full recursive fetch |
| Tables | May miss structure | Proper markdown tables |
| Special blocks | Lost or converted poorly | Preserved correctly |
| Performance | Fast | Slightly slower (API calls) |

## Testing Checklist

- [ ] Open a Notion page with various block types
- [ ] Trigger content collection
- [ ] Verify all block types are correctly converted
- [ ] Check nested blocks are included
- [ ] Verify tables render properly
- [ ] Test pages with lazy-loaded content
- [ ] Confirm formatting (bold, italic, code) is preserved
- [ ] Test with pages containing images, videos, files
- [ ] Verify callouts, toggles, and quotes work correctly

## Known Limitations

1. **Authentication Required:** Only works on Notion pages where the user is logged in
2. **API Rate Limits:** Notion's internal API may have undocumented rate limits
3. **API Changes:** Relies on Notion's private API which may change without notice
4. **Database Views:** Complex database views may not render perfectly
5. **Embedded Content:** Some embedded content types may show as links only

## Future Enhancements

- [ ] Add support for Notion database views
- [ ] Improve table formatting for complex tables
- [ ] Add caching to reduce API calls
- [ ] Support for Notion's new block types as they're released
- [ ] Better handling of large pages (pagination)

## References

- Bear Talk implementation guide (reference document)
- Notion API documentation (unofficial/reverse-engineered)
- Chrome Extension Scripting API
- Markdown specification (CommonMark + GFM)

