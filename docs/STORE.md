# Nenya: Your Universal Browser Companion

Nenya empowers you to seamlessly manage your browsing sessions, bookmarks, and data across all your browsers, so you're never locked into a single ecosystem.

Nenya is the ultimate browser extension for users who refuse to be tied down to a single browser. It provides a comprehensive suite of tools to manage your tabs, sessions, and bookmarks, and makes it easy to take your data with you, no matter which browser you're using. With Nenya, you can create "projects" of tabs, integrate with Raindrop.io, and enjoy a variety of content interaction features that enhance your browsing experience.

🌟 Features

🗂️ Tab & Project Management
• Save and restore entire browsing sessions as "projects"
• Automatic tab state preservation with snapshots
• Quick keyboard shortcuts to navigate between tabs
• Customize your popup toolbar with pinned shortcuts

🔄 Cross-Browser & Sync
• Seamlessly move projects and data between browsers
• Full Raindrop.io integration with two-way sync
✓ Pull collections from Raindrop
✓ Save tabs to Raindrop Unsorted
✓ Mirror Raindrop collections as bookmarks
✓ Automatic background synchronization
• Backup & restore all extension settings

🖥️ Advanced Tab Features
• Split Screen: View up to 4 web pages simultaneously in one tab
• Auto Reload: Automatically reload pages based on URL patterns
• Bookmark Search: Fast search with keyboard navigation

🤖 AI/LLM Integration
• Chat with LLM: Send content to ChatGPT, Claude, Gemini, or Perplexity
• Custom reusable prompts for AI interactions
• Smart content extraction:
✓ General web pages (Readability)
✓ YouTube (title, description, transcript)
✓ Notion pages (full content)
• Download pages as markdown files
• Automatic screenshot attachment for visual context

📋 Clipboard Tools
• Copy page title
• Copy title + URL
• Copy title - URL
• Copy markdown link [Title](URL)
• Copy page screenshot

✨ Content Enhancement
• Video Controller: Enhanced playback controls with keyboard shortcuts
• Picture-in-Picture: Quick PiP mode for any video
• Text Highlighting: Persistent highlights on web pages
• Bright Mode: Force light mode on any website
• Element Blocker: Visual picker to hide distracting elements
• Custom JavaScript: Inject JS code into specific sites
• Custom CSS: Inject custom styles into specific sites
• YouTube Enhancements: Special optimizations for YouTube

🔐 Auto Features
• Auto Google Login: Automatically select your preferred Google account

🔧 URL Processing
• Transform URLs when opening or saving
• Smart handling of split screen URLs

⚙️ Customization
• Theme support (adapts to system preferences)
• Comprehensive keyboard shortcuts
• Right-click context menu integration
• Desktop notifications for background operations
• Built-in debugging utilities

🔐 Permission justification

- **bookmarks**:
  Required for Raindrop.io integration to mirror collections and items as browser bookmarks. The extension creates, updates, and manages bookmark folders to sync with your Raindrop account. Also enables the built-in bookmark search functionality allowing seamless cross-platform bookmark management.

- **storage**:
  Essential for saving user projects, settings, and preferences. Uses both `chrome.storage.sync` for cross-device synchronization of settings (shortcuts, rules, configurations) and `chrome.storage.local` for tab snapshots, project data, and LLM prompts that don't need to sync.

- **tabs**:
  Core functionality for project management - creates, queries, updates, and manages browser tabs. Enables saving entire browsing sessions as "projects" and restoring them later, plus features like tab switching, screenshots, split-screen functionality, and auto-reload.

- **tabGroups**:
  Used in conjunction with tab management to organize related tabs into groups when saving and restoring projects. Helps maintain logical organization of browsing sessions and preserves tab group structure across project saves/restores.

- **notifications**:
  Provides user feedback for important actions like successful Raindrop synchronization, backup completion, auto-reload events, auto-login notifications, and error states. Keeps users informed about background operations without interrupting their browsing.

- **contextMenus**:
  Adds right-click menu options for quick access to extension features including clipboard tools (copy title/URL, screenshots), Raindrop save actions, split-screen toggle, and unsplit functionality. Provides convenient access to frequently used features.

- **alarms**:
  Enables scheduled background tasks including automatic Raindrop synchronization at regular intervals, and auto-reload functionality for specific tabs based on user-defined URL patterns and time intervals.

- **scripting**:
  Required for content script injection to implement features like element blocking, custom CSS/JS injection, video controls, picture-in-picture, text highlighting, bright mode, split-screen functionality, and LLM page content extraction across all websites.

- **activeTab**:
  Allows the extension to interact with the currently active tab for features like video controls, text highlighting, element picker, bright mode toggle, and clipboard operations without requiring broad host permissions. Used for popup-triggered actions on the current tab.

- **clipboardWrite**:
  Enables copying various content to clipboard including page titles, URLs (various formats), markdown links, and screenshots. Essential for the extension's productivity and sharing features.

- **declarativeNetRequest**:
  Used for two purposes: (1) implementing content filtering and blocking rules through the visual element picker interface, and (2) removing X-Frame-Options and CSP headers to enable split-screen iframe functionality across different websites.

- **webNavigation**:
  Required for monitoring page navigation events to implement several features: (1) auto-reload functionality based on URL patterns, (2) URL processing rules that transform URLs when opening in new tabs, (3) intercepting and converting nenya.local split URLs, and (4) tracking tab state changes for project management features.

- **host permissions** (`<all_urls>`, `https://api.raindrop.io/*`):
  - `<all_urls>`: Required for content script injection across all websites to provide universal features like element blocking, custom styling (CSS), custom code (JS), video controls, text highlighting, bright mode, split-screen functionality, auto Google login, and LLM page content extraction.
  - `https://api.raindrop.io/*`: Essential for Raindrop.io integration to sync bookmarks, collections, and user data with the cloud service. Used for pulling collections, pushing new bookmarks, and maintaining two-way synchronization.
