## Context
- Users want specific sites to launch Nenya's custom fullscreen without clicking the overlay each time.
- The options UI lacks any video-specific configuration area.
- The video controller already knows how to enter/exit fullscreen; we only need to trigger it when a rule matches.

## Goals / Non-Goals
- Goals: store per-site "video enhancement" rules, expose CRUD controls in the options UI, and have the content script honor `autoFullscreen` automatically.
- Non-Goals: expand the set of enhancements beyond `autoFullscreen`, change the PiP workflow, or overhaul storage/backup formats beyond adding a new key.

## Decisions
- **Data model**: each rule stores `{ id, pattern, patternType: 'url-pattern' | 'wildcard', enhancements: { autoFullscreen: boolean }, disabled, createdAt, updatedAt }` in `chrome.storage.sync.videoEnhancementRules`. Using nested `enhancements` allows future flags without migrations.
- **Matching**: prefer `URLPattern` when possible; fall back to wildcard substring matching (same approach as highlight rules) so users can paste `https://example.com/*`. Matching runs against `window.location.href`.
- **Dominant video selection**: reuse the existing "largest video wins" helper already used for PiP so automation targets the video the overlay would decorate.
- **Safety**: auto-enter only once per page load; rely on the existing `exitFullscreen` listener (Escape, click) to restore DOM. Add a timeout to give videos up to ~2 seconds for metadata.

## Risks / Trade-offs
- **Over-match URLs**: wildcard patterns may capture more pages than intended. Mitigate with clear preview text in the options UI and allow rules to be toggled off quickly.
- **Race with site scripts**: some players dynamically replace the video after load. Mitigate by re-checking matches when the MutationObserver discovers a new dominant video.

## Migration Plan
1. Ship options UI + storage key (safe default: empty array).
2. Update content script to read the new key and log (not throw) when parsing fails.
3. After release, encourage users to add rules manually; no automatic prepopulation required.

## Open Questions
- Should we surface per-rule delays before entering fullscreen? (Out of scope now.)
- Do we need per-device overrides? (Assume sync is desired; revisit if feedback suggests otherwise.)

