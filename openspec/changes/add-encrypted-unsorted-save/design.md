## Context
- New encrypt-and-save flow that lets users optionally password-protect a URL via `https://oh-auth.vercel.app/secret/encrypt` before saving to Raindrop Unsorted.
- Entry points span a pinned shortcut, a Chrome command, and a context menu item; all should fan into a single handler that targets one URL at a time (active tab or explicit link target).

## Goals / Non-Goals
- Goals: optional password-based encryption for a single URL; reuse the existing Unsorted save pipeline; keep UX parity across surfaces.
- Non-Goals: multi-tab encryption, storing passwords, or changing Raindrop collection targets.

## Decisions
- Normalize the target URL (including split-page conversion and URL processing used by Unsorted saves) before encryption to keep Raindrop entries consistent.
- Prompt once per trigger; treat empty input/cancel as an explicit choice to skip encryption and save the URL as-is.
- POST JSON `{url, password}` to the oh-auth endpoint; expect a JSON body with a `url` field containing the decrypt link to use as the saved URL.
- Generate a friendly 2–3 word title from a curated word list for encrypted saves; do not include the password or raw URL in the title.
- Do not persist the password; discard it immediately after the request, and avoid logging sensitive values.
- Send encrypted saves through the existing `saveUrlsToUnsorted` path without `pleaseParse` or additional flags.

## Risks / Trade-offs
- External service availability: if the encrypt endpoint is down, we surface an error and avoid saving encrypted entries (user can retry without encryption).
- Random title collisions: low impact because Raindrop deduplication is based on URL; collisions only affect display names.

## Migration Plan
- Introduce new entry points alongside existing Save to Unsorted surfaces.
- Reuse existing Unsorted save utilities; perform manual regression of standard save-to-unsorted after wiring the new flow.

## Open Questions
- None identified; scope assumes single-URL entry (active tab or right-clicked link).

