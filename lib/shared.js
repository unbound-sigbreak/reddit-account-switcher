(function () {
  const app = (globalThis.RedditAccountSwitcher =
    globalThis.RedditAccountSwitcher || {});
  const DEFAULT_THEME_PREFERENCE = "system";
  const THEME_PREFERENCES = Object.freeze([
    DEFAULT_THEME_PREFERENCE,
    "dark",
    "light"
  ]);

  app.REDDIT_HOSTS = new Set(["www.reddit.com", "old.reddit.com"]);
  app.REDDIT_LOGIN_URL = "https://www.reddit.com/login/";
  app.MANAGED_CONTAINER_PREFIX = "ras-";
  app.NO_CONTAINER_ID = "firefox-default";
  app.THEME_PREFERENCES = THEME_PREFERENCES;
  app.STORAGE_DEFAULTS = Object.freeze({
    defaultContainerId: "",
    accounts: [],
    subredditRules: {},
    doNotCloseTabs: false,
    themePreference: DEFAULT_THEME_PREFERENCE
  });

  app.normalizeThemePreference = ({ value }) => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

    return THEME_PREFERENCES.includes(normalized)
      ? normalized
      : DEFAULT_THEME_PREFERENCE;
  };

  app.applyThemePreference = ({ doc, value }) => {
    const normalized = app.normalizeThemePreference({ value });
    const targetDocument = doc && doc.documentElement
      ? doc
      : (typeof document !== "undefined" ? document : null);

    if (!targetDocument || !targetDocument.documentElement) {
      return normalized;
    }

    const root = targetDocument.documentElement;

    if (normalized === DEFAULT_THEME_PREFERENCE) {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", normalized);
    }

    return normalized;
  };

  app.normalizeSubreddit = ({ value }) => {
    if (!value) {
      return "";
    }

    let normalized = String(value).trim().toLowerCase();
    normalized = normalized.replace(/^\/?r\//, "");
    normalized = normalized.replace(/^\/+|\/+$/g, "");
    normalized = normalized.replace(/\s+/g, "");
    normalized = normalized.replace(/[^a-z0-9_]/g, "");
    return normalized;
  };

  app.parseRedditUrl = ({ rawUrl }) => {
    if (!rawUrl) {
      return {
        isReddit: false,
        host: "",
        pathname: "",
        subreddit: "",
        url: ""
      };
    }

    try {
      const url = new URL(rawUrl);

      if (!app.REDDIT_HOSTS.has(url.hostname)) {
        return {
          isReddit: false,
          host: url.hostname,
          pathname: url.pathname,
          subreddit: "",
          url: url.toString()
        };
      }

      const parts = url.pathname.split("/").filter(Boolean);
      let subreddit = "";

      if (parts[0] && parts[0].toLowerCase() === "r" && parts[1]) {
        subreddit = app.normalizeSubreddit({ value: parts[1] });
      }

      return {
        isReddit: true,
        host: url.hostname,
        pathname: url.pathname,
        subreddit,
        url: url.toString()
      };
    } catch (error) {
      return {
        isReddit: false,
        host: "",
        pathname: "",
        subreddit: "",
        url: String(rawUrl)
      };
    }
  };

  app.isRedditAuthPath = ({ pathname }) => {
    const normalizedPath = typeof pathname === "string" ? pathname.trim().toLowerCase() : "";
    const trimmedPath = normalizedPath.replace(/\/+$/g, "") || "/";

    return (
      trimmedPath === "/login"
      || trimmedPath === "/register"
      || trimmedPath === "/account/register"
    );
  };

  app.normalizeUrlForGuard = ({ rawUrl }) => {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.toString();
    } catch (error) {
      return String(rawUrl ?? "");
    }
  };

  app.getAccountByContainerId = ({ config, containerId }) => {
    return (config.accounts ?? []).find(
      (account) => account.containerId === containerId
    );
  };

  app.isManagedContainer = ({ containerOrName }) => {
    const name = typeof containerOrName === "string"
      ? containerOrName
      : (
        containerOrName && typeof containerOrName.name === "string"
          ? containerOrName.name
          : ""
      );

    return name.toLowerCase().startsWith(app.MANAGED_CONTAINER_PREFIX);
  };

  app.stripManagedPrefix = ({ name }) => {
    if (!name) {
      return "";
    }

    const normalizedName = String(name).trim();

    if (
      normalizedName
        .toLowerCase()
        .startsWith(app.MANAGED_CONTAINER_PREFIX.toLowerCase())
    ) {
      return normalizedName.slice(app.MANAGED_CONTAINER_PREFIX.length);
    }

    return normalizedName;
  };

  app.buildManagedContainerName = ({ label }) => {
    const cleanLabel = app.stripManagedPrefix({ name: label }).trim();
    return app.MANAGED_CONTAINER_PREFIX + cleanLabel;
  };

  app.getVisibleContainerName = ({ container }) => {
    if (!container || typeof container.name !== "string") {
      return "";
    }

    return app.isManagedContainer({ containerOrName: container })
      ? app.stripManagedPrefix({ name: container.name })
      : container.name;
  };

  app.getContainerChoices = ({ containers, config, allContainers }) => {
    const liveContainers = Array.isArray(containers) ? containers : [];
    const lookupContainers = Array.isArray(allContainers)
      ? allContainers
      : liveContainers;
    const choiceMap = new Map();

    for (const container of liveContainers) {
      choiceMap.set(container.cookieStoreId, {
        containerId: container.cookieStoreId,
        name: app.getVisibleContainerName({ container }),
        rawName: container.name,
        color: container.color ?? "",
        icon: container.icon ?? "",
        exists: true,
        managed: app.isManagedContainer({ containerOrName: container })
      });
    }

    const referencedIds = new Set();

    if (config.defaultContainerId) {
      referencedIds.add(config.defaultContainerId);
    }

    for (const containerId of Object.values(config.subredditRules ?? {})) {
      if (containerId) {
        referencedIds.add(containerId);
      }
    }

    for (const containerId of referencedIds) {
      if (!choiceMap.has(containerId)) {
        const liveContainer = lookupContainers.find(
          (container) => container.cookieStoreId === containerId
        );

        choiceMap.set(containerId, {
          containerId,
          name: liveContainer
            ? app.getVisibleContainerName({ container: liveContainer })
            : "Missing account (" + containerId + ")",
          rawName: liveContainer ? liveContainer.name : "",
          color: liveContainer ? (liveContainer.color ?? "") : "",
          icon: liveContainer ? (liveContainer.icon ?? "") : "",
          exists: !!liveContainer,
          managed: !!liveContainer && app.isManagedContainer({ containerOrName: liveContainer })
        });
      }
    }

    return Array.from(choiceMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  };

  app.getAccountChoices = ({ containers, config, allContainers }) => {
    return app.getContainerChoices({ containers, config, allContainers }).map((choice) => {
      const accountLabel = app.resolveContainerLabel({
        containerId: choice.containerId,
        config,
        containers: Array.isArray(allContainers) ? allContainers : containers
      });

      return {
        ...choice,
        accountLabel: choice.exists
          ? accountLabel
          : accountLabel + " (missing Firefox container)"
      };
    });
  };

  app.resolveContainerLabel = ({ containerId, config, containers }) => {
    if (!containerId) {
      return "Not configured";
    }

    if (containerId === app.NO_CONTAINER_ID) {
      return "No account";
    }

    const account = app.getAccountByContainerId({ config, containerId });

    if (account && account.label) {
      return account.label;
    }

    const liveContainer = containers.find(
      (container) => container.cookieStoreId === containerId
    );

    if (liveContainer) {
      return app.getVisibleContainerName({ container: liveContainer });
    }

    return "Unknown account (" + containerId + ")";
  };

  app.buildRoutingInfo = ({ tab, config, containers }) => {
    const parsed = app.parseRedditUrl({ rawUrl: tab?.url });
    const currentContainerId = tab?.cookieStoreId ?? "";
    const currentLiveContainer = containers.find(
      (container) => container.cookieStoreId === currentContainerId
    );
    const routingEligible = parsed.isReddit && !!parsed.subreddit;
    const directRuleContainerId = parsed.subreddit
      ? (config.subredditRules[parsed.subreddit] ?? "")
      : "";
    const targetContainerId = routingEligible
      ? directRuleContainerId || config.defaultContainerId || ""
      : "";
    const targetExists =
      !!targetContainerId
      && (
        targetContainerId === app.NO_CONTAINER_ID
        || containers.some((container) => container.cookieStoreId === targetContainerId)
      );

    return {
      isReddit: parsed.isReddit,
      host: parsed.host,
      pathname: parsed.pathname,
      subreddit: parsed.subreddit,
      routingEligible,
      currentContainerId,
      currentAccountLabel: app.resolveContainerLabel({ containerId: currentContainerId, config, containers }),
      currentContainerLabel: app.resolveContainerLabel({ containerId: currentContainerId, config, containers }),
      directRuleContainerId,
      targetContainerId,
      targetAccountLabel: app.resolveContainerLabel({ containerId: targetContainerId, config, containers }),
      targetContainerLabel: app.resolveContainerLabel({ containerId: targetContainerId, config, containers }),
      usesDefault:
        routingEligible
        && !directRuleContainerId
        && !!config.defaultContainerId,
      targetExists,
      currentContainerManaged:
        !!currentLiveContainer
        && app.isManagedContainer({ containerOrName: currentLiveContainer }),
      canAssignToCurrentContainer:
        !!parsed.subreddit
        && !!currentLiveContainer
        && app.isManagedContainer({ containerOrName: currentLiveContainer }),
      needsReroute:
        routingEligible
        && targetExists
        && currentContainerId !== targetContainerId,
      tabUrl: tab?.url ?? ""
    };
  };

  app.colorToCss = ({ color }) => {
    const colorMap = {
      blue: "#3d78f0",
      turquoise: "#1b9a94",
      green: "#5f9f3c",
      yellow: "#d19a00",
      orange: "#d76623",
      red: "#c44343",
      pink: "#d95f8e",
      purple: "#7557d9",
      toolbar: "#596273"
    };

    return colorMap[color] ?? "#596273";
  };
})();
