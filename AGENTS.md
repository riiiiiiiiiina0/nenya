# AGENTS.md

## Setup

- Run `npm i` to install dependencies.

## Code Style

- Use **vanilla JavaScript** (no TypeScript).
- **No build steps**; plain source files only.
- Use **JSDoc** to type all JavaScript source code.
- Use **single quotes** for all string literals.
- Follow clear, readable code conventions (avoid unnecessary abstractions).

## Preferred Frameworks & Libraries

### What to do when a framework/library is needed?

- When you need to use a JavaScript library, **download the CDN (browser-ready) version** of the library and place it in `src/libs`.
  - Example: For `lodash`, download the minified CDN file (e.g., `lodash.min.js`) and save it as `src/libs/lodash.min.js`.
- Reference these local files in your HTML or JS as needed (e.g., via `<script src="./libs/lodash.min.js"></script>`).
- Do **not** use npm packages or require a build step for library usage.
- Always prefer the **browser-ready, standalone** version from a reputable CDN (such as jsDelivr or unpkg).

### Prefered frameworks & libraries

- **TailwindCSS** for utility-first styling.
- **DaisyUI** for ready-made UI components.
- **daijs** as needed for UI enhancements.

## Folder Structure

- Place all source code files in the `src` directory.
  - Example structure:
    ```
    /src
      /background
      /content
      /popup
      /options
    ```

## Additional Notes

- Do **not** include TypeScript, bundlers, or transpilation steps.
- All configurations (if needed) must support a zero-build, plain-JS workflow.
- This is a Chrome extension project; never use inline JavaScript as this violates Chrome's content policy.
- Relevant documents (OAuth, Raindrop API, etc.) are available in the `references` folder.
- Reference and update this file if project conventions change.
