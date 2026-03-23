## Repo Goal

Build `Reddit Account Switcher`, a Firefox WebExtension (Manifest V3) that routes Reddit tabs into the correct Firefox container based on subreddit. The user manually creates Reddit accounts and manually signs into each account inside its own Firefox container. The extension only decides which container a Reddit URL should use.

## Scope Boundaries

- This project is a privacy convenience tool only.
- Do not implement Reddit account creation.
- Do not store passwords, credentials, session tokens, or recovery data.
- Do not automate Reddit login, logout, or authentication flows.
- Do not rewrite cookies or attempt in-place account switching.
- Do not implement CAPTCHA handling.
- Do not add browser spoofing, anti-fingerprinting, stealth, proxy/VPN control, or any bypass/evasion features.
- Do not build ban evasion, vote manipulation, sockpuppeting, or multi-account automation features.

## Product Rules

- Support `https://www.reddit.com/*` and `https://old.reddit.com/*`.
- Parse subreddit names from URLs shaped like `/r/<subreddit>/...`.
- Maintain a mapping of `subreddit -> containerId`.
- Maintain a default container for unmapped subreddits.
- When a Reddit tab is opened or updated, detect the desired target container.
- If the tab is already in the correct `cookieStoreId`, do nothing.
- If the tab is in the wrong container, open the same URL in the target container and close the original tab.
- Never try to move a tab between containers in place.
- Prevent reroute loops with a per-tab or per-navigation guard.
- Handle Reddit navigation that changes URL without a full page reload.

## Technical Defaults

- This repository is run in WSL2.
- Non-interactive shells may not load `~/.bashrc` and may not load `nvm`.
- Before `node` or `npm` commands, initialize `nvm` explicitly:
  `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`
- Use Firefox WebExtensions Manifest V3.
- For Firefox, prefer `background.scripts` over `background.service_worker` unless service worker support is explicitly verified in the target browser.
- Prefer plain JavaScript with small, readable modules.
- Prefer account-first wording in the UI; reserve "container" for Firefox API details and implementation notes.
- Keep permissions narrow:
  - `tabs`
  - `storage`
  - `contextualIdentities`
  - Reddit-only host permissions
- Use extension local storage for:
  - account/container metadata
  - default container
  - subreddit routing rules
- Favor documented Firefox APIs and document any Firefox-specific limitations in `README.md`.

## Expected UI

- Popup:
  - Show current subreddit.
  - Show current account label.
  - Show mapped account.
  - Allow assigning the current subreddit to the current account.
  - Allow reopening the current tab in the mapped account.
  - Allow a quick override for the current subreddit mapping.
- Options page:
  - List saved accounts and their backing Firefox containers.
  - Choose the default account.
  - Add, edit, and delete subreddit mappings.
  - Import and export mapping JSON.

## Suggested Storage Shape

```json
{
  "defaultContainerId": "firefox-container-1",
  "accounts": [
    { "label": "main", "containerId": "firefox-container-1" },
    { "label": "privacy", "containerId": "firefox-container-2" },
    { "label": "gaming", "containerId": "firefox-container-3" }
  ],
  "subredditRules": {
    "privacy": "firefox-container-2",
    "gaming": "firefox-container-3"
  }
}
```

## Delivery Priorities

1. Scaffold the extension and manifest.
2. Implement routing logic and loop prevention.
3. Add popup UI.
4. Add options UI.
5. Add setup and testing instructions in `README.md`.
