## 1. Implementation

- [x] 1.1 Add manifest command, pinned shortcut config, and popup button wiring for the encrypt-and-save entrypoint; expose a context menu item targeting page/link.
- [x] 1.2 Implement a shared handler that prompts for a password, derives the target URL (active tab or right-click link) with existing normalization, and branches: blank/cancel → plain Unsorted save; provided password → POST to `https://oh-auth.vercel.app/secret/encrypt`.
- [x] 1.3 On POST success, generate a friendly multi-word title and send the encrypted URL into the existing Unsorted save pipeline without `pleaseParse`; on API failure, return a user-visible error without saving.
- [x] 1.4 Document the flow in design, add/update tests or manual checks as needed, and run `openspec validate add-encrypted-unsorted-save --strict`.
