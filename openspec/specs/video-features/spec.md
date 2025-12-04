# Video Features Specification

## Purpose

Capture the currently shipped behavior of the Picture-in-Picture (PiP) and custom in-page fullscreen helpers so future work does not regress Nenya's injected video controller, popup action, or keyboard shortcut experience.

## Requirements

### Requirement: Popup MUST toggle Picture-in-Picture for the dominant video in the active tab

The popup exposes a PiP control that targets the largest playable video element without requiring users to interact with the page.

#### Scenario: Trigger PiP from the popup

- **GIVEN** the user clicks the popup's "Picture-in-Picture" action,
- **THEN** the popup MUST query the active tab, inject `handlePictureInPicture`, and scan all `<video>` elements,
- **AND** it MUST wait for metadata when needed, compute the video area using actual `videoWidth × videoHeight`, and select the largest candidate,
- **AND** if no video exists it MUST surface "No video elements found on this page." (or the injected error) and keep the popup open,
- **AND** when PiP is not active it MUST call `requestPictureInPicture()` on the largest video, store `{ pipTabId: currentTab.id }` in `chrome.storage.local`, show a success status, and close the popup,
- **AND** when PiP is already active for that video it MUST call `document.exitPictureInPicture()`, remove `pipTabId`, and report the toggle result to the user,
- **AND** when PiP is active for a different video it MUST exit the current PiP instance before entering PiP for the newly selected video so only one session exists at a time.

#### Scenario: Handle script injection or PiP failures gracefully

- **GIVEN** the popup attempted to inject the PiP script or call PiP APIs,
- **WHEN** Chrome rejects the script or `requestPictureInPicture()` throws,
- **THEN** the popup MUST show the returned error (e.g., "Unable to trigger Picture-in-Picture. Make sure the page has loaded."),
- **AND** it MUST clear `pipTabId` if a PiP session was not successfully established so global commands never point at a stale tab.

### Requirement: Every video element MUST register PiP ownership automatically

The content script tracks PiP state even when users start PiP via built-in site buttons or keyboard shortcuts.

#### Scenario: Record tab ownership whenever PiP starts

- **GIVEN** a `<video>` element fires `enterpictureinpicture`,
- **THEN** the injected controller MUST ensure `setupPipTracking` ran for that video (adding the `data-pip-tracking` marker),
- **AND** it MUST message the background (`getCurrentTabId`) to learn the tab ID, then write `{ pipTabId: tabId }` to `chrome.storage.local`,
- **AND** this MUST happen regardless of whether PiP was started through the popup, Nenya's custom PiP button, or the site's native UI so the keyboard shortcut can always find the right tab.

#### Scenario: Clean up and pause when PiP closes

- **GIVEN** the tracked video fires `leavepictureinpicture`,
- **THEN** the controller MUST remove `pipTabId` from storage,
- **AND** it MUST pause the video if it was still playing so audio does not continue in the background,
- **AND** it MUST ignore subsequent `leavepictureinpicture` events until another `enterpictureinpicture` fires to avoid unnecessary writes.

### Requirement: The global "Quit PiP" shortcut MUST terminate the tracked session

#### Scenario: Exit PiP via keyboard command

- **GIVEN** the user presses the `pip-quit` command (default `Alt+Q`),
- **WHEN** `chrome.storage.local.pipTabId` exists,
- **THEN** the background script MUST inject code into that tab, call `document.exitPictureInPicture()`, pause the PiP video if it is still playing, and clear `pipTabId`,
- **AND** errors MUST be logged but not crash the service worker,
- **AND** if `pipTabId` is missing the command MUST log a warning (`[commands] ⚠️ No pipTabId found…`) and return without attempting injection.

### Requirement: Large videos MUST render inline PiP and fullscreen controls

Only sizable players get Nenya's overlay so the UI remains unobtrusive.

#### Scenario: Detect and decorate large videos without duplication

- **GIVEN** the content script initializes or `MutationObserver` notices new DOM nodes,
- **THEN** it MUST run `setupPipTrackingForAllVideos` so every `<video>` has PiP listeners,
- **AND** it MUST await `loadedmetadata`, filter videos with `videoWidth ≥ 640` and `videoHeight ≥ 360` that lack `data-video-controller`, and call `addControls`,
- **AND** `addControls` MUST append a `.video-controller-container` to the video's parent (forcing `position: relative` when it was `static`) and ensure each video only receives one control set.

#### Scenario: Inline PiP button toggles PiP state safely

- **GIVEN** the user clicks the injected "PiP" button,
- **THEN** the handler MUST call `e.stopPropagation()`, check `document.pictureInPictureElement`, and either exit PiP or call `video.requestPictureInPicture()` accordingly,
- **AND** the `enterpictureinpicture` listener MUST handle tab ID persistence,
- **AND** failures MUST be logged and cause `pipTabId` to be removed so stale entries are not left behind.

#### Scenario: Inline Fullscreen button toggles custom fullscreen mode

- **GIVEN** the user clicks "Fullscreen,"
- **THEN** the handler MUST toggle `video-fullscreen` state by invoking `enterFullscreen`/`exitFullscreen`,
- **AND** it MUST stop propagation so it never clashes with the site's own keyboard shortcuts.

### Requirement: Custom in-page fullscreen MUST isolate the video and survive host page mutations

Nenya provides a fixed-position fullscreen mode that does not rely on the browser's native fullscreen API.

#### Scenario: Enter fullscreen by reparenting and styling the video

- **GIVEN** `enterFullscreen(video)` is called,
- **THEN** the controller MUST store the original parent, sibling, inline style, and controls flag in a `WeakMap`,
- **AND** it MUST append the video to `document.body`, add the `video-fullscreen` class, disable controls, and apply the following inline styles: `position: fixed`, `top: 0`, `left: 0`, `width: 100vw`, `height: 100vh`, `z-index: 2147483647`, `background-color: black`, `object-fit: contain`, `object-position: center`, `isolation: isolate`, and `transform: translateZ(0)`.

#### Scenario: Maintain fullscreen when sites mutate the element

- **GIVEN** a fullscreen video is active,
- **WHEN** the host page changes its `style`, `controls`, or `class` attributes (or moves it out of `document.body`),
- **THEN** the controller's `MutationObserver` MUST debounce for ~50 ms, temporarily disconnect, and call `restoreFullscreenState` to reapply the fullscreen styles, ensure controls stay hidden, and reattach the video to `document.body`.

#### Scenario: Exit fullscreen restores the original DOM and listeners

- **GIVEN** the user clicks "Fullscreen" again or presses `Escape` while a `.video-fullscreen` element exists,
- **THEN** `exitFullscreen` MUST remove the class, clear inline styles, restore the original style string (when one existed), reinstate the prior `controls` value, disconnect the observer, clear pending restoration timeouts, and reinsert the video ahead of its recorded sibling (or append it back to the parent),
- **AND** the stored metadata MUST be deleted so subsequent fullscreen toggles take fresh snapshots.

#### Scenario: Escape key MUST always exit custom fullscreen

- **GIVEN** the controller attached a document-level `keydown` listener,
- **WHEN** the user presses `Escape` and a `.video-fullscreen` element is present,
- **THEN** the listener MUST call `exitFullscreen` for that video and `stopPropagation()` so pages cannot cancel the exit.

### Requirement: Video instrumentation MUST keep up with dynamic pages

#### Scenario: Mutation observers continuously process new videos

- **GIVEN** the page adds or removes videos after load,
- **THEN** the controller's `MutationObserver` on `document.body` MUST rerun both `setupPipTrackingForAllVideos` and `findAllLargeUnprocessedVideos`,
- **AND** it MUST process the resulting list with `processVideoElement`, ensuring newly inserted large videos immediately gain the overlay while smaller videos still receive PiP tracking only.
