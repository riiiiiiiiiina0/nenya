# Nenya: Your Universal Browser Companion

Nenya empowers you to seamlessly manage your browsing sessions, bookmarks, and data across all your browsers, so you're never locked into a single ecosystem.

Nenya is the ultimate browser extension for users who refuse to be tied down to a single browser. It provides a comprehensive suite of tools to manage your tabs, sessions, and bookmarks, and makes it easy to take your data with you, no matter which browser you're using. With Nenya, you can create "projects" of tabs, integrate with Raindrop.io, and enjoy a variety of content interaction features that enhance your browsing experience.

🌟 Features

- 🗂️ Project Management: Save and restore entire browsing sessions as "projects."
- 🔄 Cross-Browser Sync: Easily move your projects and data between different browsers.
- 📑 Raindrop.io Integration: Sync your bookmarks with the popular bookmarking service.
- 🖥️ Split Screen: View multiple web pages in a single tab with a resizable split-screen view.
- 📋 Clipboard Tools: A variety of tools to copy URLs, titles, and even screenshots to your clipboard.
- ✨ Content Enhancement: Features like custom titles, video controller, and text highlighting to improve your browsing experience.
- 🚫 Element Blocker: Block distracting elements on web pages.

🔐 Permission justification

- **bookmarks**:
  Required for Raindrop.io integration to mirror collections and items as browser bookmarks. The extension creates, updates, and manages bookmark folders to sync with your Raindrop account, allowing seamless cross-platform bookmark management.

- **storage**:
  Essential for saving user projects, settings, and preferences. Uses both `chrome.storage.sync` for cross-device synchronization of settings and `chrome.storage.local` for tab snapshots, custom titles, and project data that doesn't need to sync.

- **tabs**:
  Core functionality for project management - creates, queries, updates, and manages browser tabs. Enables saving entire browsing sessions as "projects" and restoring them later, plus features like tab switching, screenshots, and split-screen functionality.

- **tabGroups**:
  Used in conjunction with tab management to organize related tabs into groups when saving and restoring projects. Helps maintain logical organization of browsing sessions.

- **notifications**:
  Provides user feedback for important actions like successful Raindrop synchronization, backup completion, and error states. Keeps users informed about background operations without interrupting their browsing.

- **contextMenus**:
  Adds right-click menu options for quick access to extension features including clipboard tools (copy title/URL, screenshots), split-screen toggle, and project management actions.

- **alarms**:
  Enables scheduled background tasks including automatic Raindrop synchronization, periodic backups, and auto-reload functionality for specific tabs based on user-defined rules.

- **scripting**:
  Required for content script injection to implement features like element blocking, custom CSS/JS injection, video controls, text highlighting, and split-screen functionality across all websites.

- **activeTab**:
  Allows the extension to interact with the currently active tab for features like custom titles, video controls, text highlighting, and clipboard operations without requiring broad host permissions.

- **clipboardWrite**:
  Enables copying various content to clipboard including page titles, URLs, markdown links, and screenshots. Essential for the extension's productivity and sharing features.

- **declarativeNetRequest**:
  Used for implementing content filtering and blocking rules. Allows users to block distracting elements on websites through a visual element picker interface.

- **webNavigation**:
  Required for monitoring page navigation events to implement auto-reload functionality and track tab state changes for project management features.

- **host permissions** (`<all_urls>`, `https://api.raindrop.io/*`):
  - `<all_urls>`: Required for content script injection across all websites to provide universal features like element blocking, custom styling, video controls, and split-screen functionality.
  - `https://api.raindrop.io/*`: Essential for Raindrop.io integration to sync bookmarks, collections, and user data with the cloud service.
