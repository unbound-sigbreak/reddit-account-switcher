# Reddit Account Switcher Spec

## Summary

`Reddit Account Switcher` is a Firefox extension that routes Reddit URLs into the correct Firefox container based on subreddit. Each container corresponds to a Reddit account the user already created and already signed into manually. The extension does not manage Reddit authentication. It only maps subreddit traffic to containers.

## Problem

Users who separate Reddit activity by topic often want different communities to use different already-logged-in accounts. Manual switching is annoying and easy to get wrong. Firefox containers provide the right isolation boundary, but the browser does not natively route specific subreddits into specific containers.

## Goals

- Route Reddit URLs by subreddit to the correct Firefox container.
- Keep one Firefox container per Reddit account.
- Support an optional default container for unmapped subreddits.
- Make routing visible and adjustable from a popup.
- Make container and subreddit mappings manageable from an options page.
- Keep the implementation simple, explicit, and auditable.
- Use account-first wording in the UI even though Firefox containers are the underlying implementation detail.

## Non-Goals

- Automatic Reddit account creation.
- CAPTCHA solving or human verification handling.
- Password or credential storage.
- Reddit login automation.
- Cookie rewriting or cookie copying between containers.
- Browser spoofing or anti-fingerprinting features.
- Proxy, VPN, or network identity control.
- Ban evasion, vote manipulation, sockpuppeting, or stealth features.

## Supported URLs

- `https://www.reddit.com/*`
- `https://old.reddit.com/*`

The MVP should detect subreddit names from URLs shaped like:

- `/r/<subreddit>/`
- `/r/<subreddit>/comments/...`
- `/r/<subreddit>/about/...`

URLs without a subreddit can fall back to the default container.

## Primary User Flow

1. The user creates Firefox containers manually.
2. The user logs into a different Reddit account inside each container manually.
3. The user configures a default container and subreddit rules in the extension.
4. The user opens a Reddit URL.
5. The extension extracts the subreddit, finds the target container, and compares it to the tab's current `cookieStoreId`.
6. If the tab is already in the right container, nothing happens.
7. If the tab is in the wrong container, the extension opens the same URL in the target container and closes the original tab.

## Functional Requirements

### Routing

- Watch Reddit tabs on creation and update.
- Parse subreddit names case-insensitively and store rules in a normalized form.
- Use `subredditRules[subreddit]` when a mapping exists.
- Use `defaultContainerId` when no mapping exists, or keep the current account when no default is configured.
- Let each subreddit rule choose whether child tabs stay in the assigned container or reopen in Firefox's default tab context when the child tab does not already have its own subreddit route.
- If no valid target container is configured, do nothing and fail safely.
- Reopen the current URL in the target container instead of trying to mutate the current tab's container.

### Loop Prevention

- Maintain a per-tab guard so the extension does not repeatedly reopen the same URL.
- Skip rerouting when the current tab was just created by the extension for the same target container and URL.
- Clear stale guard entries when tabs close.

### Reddit Navigation

- Handle standard page loads.
- Handle client-side URL changes that surface through tab update events or web navigation events.
- Avoid rerouting on transient intermediate states such as blank or unsupported URLs.

## UI Requirements

### Popup

Show:

- Current subreddit.
- Current account label.
- Mapped account label.

Allow:

- Assigning the current subreddit to the current account.
- Reopening the current tab in the mapped account.
- Quickly overriding the mapping for the current subreddit.

### Options Page

Allow:

- Viewing detected Firefox-backed accounts and any saved account labels.
- Choosing the default account.
- Adding, editing, and deleting subreddit mappings.
- Importing and exporting the mapping configuration as JSON.

## Data Model

Store configuration in `browser.storage.local`:

```json
{
  "defaultContainerId": "firefox-container-1",
  "accounts": [
    { "label": "main", "containerId": "firefox-container-1" },
    { "label": "privacy", "containerId": "firefox-container-2" },
    { "label": "gaming", "containerId": "firefox-container-3" }
  ],
  "subredditRules": {
    "privacy": {
      "containerId": "firefox-container-2",
      "openLinksWithAssignedContainer": true
    },
    "gaming": {
      "containerId": "firefox-container-3",
      "openLinksWithAssignedContainer": false
    }
  }
}
```

### Data Rules

- `containerId` values must match Firefox contextual identity `cookieStoreId` values.
- Subreddit keys should be normalized to lowercase.
- Older string-only subreddit rule values should continue to import as `{ containerId, openLinksWithAssignedContainer: false }`.
- Older object values using `openLinksInDefaultContainer` should continue to import by being translated to `openLinksWithAssignedContainer`.
- Import should validate structure before replacing stored data.
- Export should serialize only the config needed to restore behavior.

## Technical Constraints

- Use Firefox WebExtensions Manifest V3.
- Keep permissions narrow:
  - `tabs`
  - `storage`
  - `contextualIdentities`
  - Reddit-only host permissions
- Use plain JavaScript, no framework.
- Keep code readable and modular.
- Add comments only where they materially help.

## Proposed File Set

- `manifest.json`
- `background.js` or equivalent MV3 background/service worker script
- `popup.html`
- `popup.js`
- `options.html`
- `options.js`
- Optional shared JS modules for storage, Reddit URL parsing, and routing
- `README.md`

## Acceptance Criteria

- A Reddit URL under `/r/privacy/...` can be routed to the privacy container.
- A Reddit URL under `/r/gaming/...` can be routed to the gaming container.
- An unmapped subreddit uses the default container.
- A Reddit tab already in the correct container is left untouched.
- A Reddit tab in the wrong container is reopened in the correct container and the old tab is closed.
- The extension does not enter a reopen loop.
- The popup surfaces the current subreddit and routing decision.
- The options page can edit rules and choose the default container.
- Import and export work with the documented JSON shape.

## Notes For Implementation

- Firefox containers are the session boundary. Treat them as the source of truth for account separation.
- In user-facing UI copy, prefer "account" over "container" unless the Firefox implementation detail matters.
- Do not attempt to switch accounts inside a single container.
- Do not attempt to copy or merge cookies across containers.
- If Firefox MV3 background behavior introduces limitations, prefer the cleanest documented fallback and note it in `README.md`.
