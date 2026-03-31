# Reddit Account Switcher

Reddit Account Switcher is a Firefox WebExtension for people who keep different Reddit accounts for different communities and want Firefox to open each subreddit in the right account automatically.

Instead of logging out and back in, the extension uses Firefox containers as the session boundary. You assign subreddits like `r/privacy`, `r/politics`, or `r/gaming` to specific accounts, and the extension reopens Reddit tabs in the matching account when needed.

## Why It Is Useful

- Keeps topic-specific Reddit accounts separated without manual switching all day.
- Reduces the chance of posting, commenting, or browsing from the wrong account.
- Uses normal Firefox containers and normal Reddit logins, so the model stays simple and auditable.
- Avoids brittle account-switching tricks like password storage, login automation, or cookie rewriting.

## How It Works

- Each account in the extension is backed by a Firefox container.
- You choose a default account and optional per-subreddit rules.
- When a Reddit tab opens or changes URL to a path containing `/r/<subreddit>`, the extension checks which account should handle it.
- If the tab is already in the right account, nothing happens.
- If the tab is in the wrong account, the extension reopens the same URL in the correct account.
- Other Reddit pages such as profiles, inbox, and notifications stay in their current account unless you move them manually.

## Features

- Route `www.reddit.com` and `old.reddit.com` tabs by subreddit.
- Use one Firefox container per already logged-in Reddit account.
- Create and delete Firefox-backed accounts directly from the extension options page.
- Mark extension-managed Firefox containers with the `ras-` prefix while hiding that prefix in the extension UI.
- Reopen a Reddit tab in the correct account when it lands in the wrong account.
- Fall back to a default account when a subreddit has no explicit rule.
- Leave child tabs in Firefox's default tab context by default, or opt a subreddit into keeping them in its assigned container.
- Ignore Reddit URLs that do not include `/r/<subreddit>/`, so profiles and notification pages are not forced back to the default account.
- Optionally keep the original tab open and send it back instead of closing it after a reroute.
- Pause or resume automatic account routing globally from the popup.
- Handle Reddit URL changes that happen without a full page reload.
- Prevent reroute loops with short-lived tab guards.
- Show current subreddit, current account, and mapped account in the popup.
- Assign the current subreddit to the current account from the popup.
- Override the current subreddit's mapped account from the popup and switch the tab immediately.
- Open a Reddit login tab directly in any account so sign-in still happens manually on Reddit.
- Keep those extension-opened login tabs in the chosen account while Reddit finishes its non-subreddit login redirects.
- Manage the default account, account labels, and subreddit rules from the options page.
- Import and export configuration as JSON.
- Choose Dark, Warm, Cool, Light, or System from the options page.

## Scope Boundaries

- This extension is a privacy convenience tool only.
- It does not create Reddit accounts.
- It does not store passwords or credentials.
- It does not automate Reddit login.
- It does not rewrite cookies or switch containers in place.
- It does not implement VPN, proxy, spoofing, anti-fingerprinting, or bypass behavior.

## Suggested Listing Links

- Firefox Add-on: [https://addons.mozilla.org/en-CA/firefox/addon/reddit-account-switcher/](https://addons.mozilla.org/en-CA/firefox/addon/reddit-account-switcher/)
- Homepage: [https://github.com/unbound-sigbreak/reddit-account-switcher](https://github.com/unbound-sigbreak/reddit-account-switcher)
- Support site: [https://github.com/unbound-sigbreak/reddit-account-switcher/issues](https://github.com/unbound-sigbreak/reddit-account-switcher/issues)

## Manual Setup

You can clone this repository or download a release zip from the GitHub releases page: [https://github.com/unbound-sigbreak/reddit-account-switcher/releases](https://github.com/unbound-sigbreak/reddit-account-switcher/releases)

1. In Firefox, open `about:debugging#/runtime/this-firefox`.
2. Choose `Load Temporary Add-on`.
3. Select the `manifest.json` file from this repo or from the extracted release zip.
4. Open the extension options page.
5. Create accounts directly in the extension, or use existing Firefox containers if you already have them.
6. Use `Open Reddit login` for an account and sign into Reddit manually in that account.
7. Choose a default account, or leave it as `No default account` to keep unmapped subreddits in the current account.
8. Add subreddit rules or use the popup to assign the current subreddit to the current account.
9. Leave `Open with assigned container` off if links from that subreddit should open in Firefox's default tab context. Turn it on only when those child tabs should stay in the assigned container.

## Configuration Shape

```json
{
  "routingEnabled": true,
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
  },
  "doNotCloseTabs": false,
  "themePreference": "system"
}
```

## Current Architecture

- `manifest.json`
  Firefox MV3 manifest with narrow permissions and Reddit-only host access.
- `background.js`
  Firefox MV3 background script for routing logic, loop prevention, storage seeding, and reroute actions.
- `reddit-observer.js`
  Lightweight Reddit page observer for SPA-style URL changes.
- `lib/shared.js`
  Shared URL parsing and routing helpers.
- `lib/storage.js`
  Storage sanitization, config loading, config saving, and account/container helpers.
- `popup.html` + `popup.js`
  Quick view and controls for the active tab.
- `options.html` + `options.js`
  Rule management, default account selection, routing behavior, account labels, and import/export.
- `styles.css`
  Shared extension styling.

## Validation

This repo is expected to run in WSL2. Before `node` or `npm` commands, bootstrap `nvm` in non-interactive shells:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Then run:

```bash
npm run check
```

## Testing

1. Create at least two Firefox containers and sign into different Reddit accounts in each.
2. Set one as the default account in the extension options page.
3. Add a rule such as `privacy -> privacy account`.
4. Open `https://www.reddit.com/r/privacy/` in the wrong account container.
5. Confirm the extension reopens the tab in the mapped account and closes the old tab.
6. Open an unmapped subreddit and confirm it routes to the default account.
7. Open a Reddit profile, inbox, or notifications page and confirm it stays in the current account.
8. Turn on `Do not close tabs`, open a subreddit in the wrong account, and confirm the extension opens the mapped account in a new tab while the original tab goes back or lands on Reddit home.
9. Use Reddit's in-page navigation and confirm the route still updates after URL changes.
10. Confirm the popup shows the current subreddit and lets you update the rule.
11. For a rule with `Open with assigned container` turned off, open a link in a new tab from that subreddit and confirm the new tab reopens outside the originating account unless the new tab has its own subreddit route.
12. Turn `Open with assigned container` on for a subreddit rule and confirm links opened from that subreddit stay in the assigned container unless the new tab has its own subreddit route.

## Notes

- Only `ras-` prefixed Firefox containers are treated as extension-managed accounts in the UI and delete flow.
- Firefox requires the `cookies` permission for the contextual identities API; this extension still does not read or rewrite Reddit cookies.
- If a stored mapping points to a missing container, the UI keeps that reference visible so it can be corrected.
- On first run, the extension seeds account labels from live Firefox containers and uses the first detected container as the default if none is set.
- Firefox currently loads this extension via `background.scripts` in Manifest V3 instead of `background.service_worker`.
