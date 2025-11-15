# Project Context

## Purpose
Nenya is a browser extension designed for users who utilize multiple browsers. It provides a comprehensive suite of tools to manage tabs, sessions, and bookmarks, enabling seamless data portability across different browsers. With Nenya, users can create "projects" of tabs, integrate with Raindrop.io, and enhance their browsing experience with various content interaction features, including:
- Auto-reloading pages periodically.
- Rendering any website in dark mode or bright mode based on the operating system's theme.
- Highlighting matching text on any website.
- Blocking selected elements (e.g., ads, distractions).
- Injecting custom JavaScript and CSS into any website for personalization.
- Sending page content to an LLM chat as context, eliminating the need for copy-pasting.
- Automatically performing Google OAuth login.
- Copying page title and URL in various formats.
- Taking screenshots of pages.
- Splitting pages for multi-view browsing.
- Picture-in-picture mode and global keyboard shortcuts.

## Tech Stack
Vanilla JavaScript Chrome extension (Manifest V3).

## Project Conventions

### Code Style
- Use vanilla JavaScript (no TypeScript).
- No build steps; plain source files only.
- Use JSDoc to type all JavaScript source code.
- Use single quotes for all string literals.
- Follow clear, readable code conventions (avoid unnecessary abstractions).
- Wrap all content scripts in IIFEs (Immediately Invoking Function Expressions) to prevent global variable pollution and ensure proper encapsulation.

### Architecture Patterns
The project follows a typical browser extension architecture, separating concerns into distinct directories within `src/`:
-   **`background/`**: Contains scripts that run in the background, handling persistent tasks, event listeners, and API communications, such as `auto-reload.js`, `clipboard.js`, `mirror.js`, `options-backup.js`, `projects.js`, and `tab-snapshots.js`.
-   **`contentScript/`**: Houses scripts injected into web pages to interact with their DOM and content, including `auto-google-login.js`, `block-elements.js`, `darkMode.js`, `epicker.js`, `highlight-text.js`, `llmPageInjector.js`, and `video-controller.js`.
-   **`libs/`**: Stores third-party JavaScript and CSS libraries, such as `ace.js`, `daisyui@5.css`, `darkreader.js`, `dayjs.min.js`, `readability.min.js`, and `tailwindcss@4.js`. These are typically browser-ready, standalone versions.
-   **`options/`**: Manages the extension's settings and configuration UI, with files like `autoGoogleLogin.js`, `bookmarks.js`, `customCode.js`, `darkMode.js`, `index.html`, and `options.js`.
-   **`popup/`**: Contains the HTML and JavaScript for the extension's browser action popup, including `chat.html`, `index.html`, `popup.js`, and `projects.js`.
-   **`shared/`**: Provides common utilities, helper functions, and shared constants used across different parts of the extension, such as `bookmarkFolders.js`, `icons.js`, `llmProviders.js`, and `urlProcessor.js`.
-   **`split/`**: Contains logic and UI components related to the "split page" feature, with files like `entry.js`, `iframe-monitor.js`, `split.html`, and `tab-picker.js`.

### Preferred Frameworks & Libraries
#### What to do when a framework/library is needed?
- When a JavaScript library is required, download the CDN (browser-ready) version and place it in `src/libs`.
  - Example: For `lodash`, download the minified CDN file (e.g., `lodash.min.js`) and save it as `src/libs/lodash.min.js`.
- Reference these local files in HTML or JavaScript as needed (e.g., via `<script src="./libs/lodash.min.js"></script>`).
- Do not use npm packages or require a build step for library usage.
- Always prefer the browser-ready, standalone version from a reputable CDN (such as jsDelivr or unpkg).

#### Preferred frameworks & libraries
- TailwindCSS for utility-first styling.
- DaisyUI for ready-made UI components.
- Day.js as needed for date and time manipulations.

### Testing Strategy
Currently, testing is performed manually by loading the extension into a browser. There is a desire to integrate automated testing in the future.

### Git Workflow
- Follow the Conventional Commits specification.
- All commit messages should be in lowercase.
- Branch out from `main` for new features or bug fixes.
- Always rebase to the latest `main` before merging.

## Domain Context
The core domain revolves around enhancing browser functionality and user productivity through various content manipulation and management tools. Key concepts include:
- **Tab/Session Management**: Organizing and saving groups of tabs ("projects").
- **Content Interaction**: Modifying how users view and interact with web page content (dark mode, element blocking, text highlighting).
- **Data Portability**: Features like Raindrop.io integration and copying URLs aim to make user data accessible and portable.
- **LLM Integration**: Sending page content to language models for summarization or analysis.

## Important Constraints
- Strict adherence to **vanilla JavaScript**, **no build steps**, and **no TypeScript**.

## External Dependencies
- Raindrop.io (for bookmark and collection management).