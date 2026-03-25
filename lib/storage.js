(function () {
  const app = (globalThis.RedditAccountSwitcher =
    globalThis.RedditAccountSwitcher || {});

  const sanitizeAccounts = ({ accounts }) => {
    const accountMap = new Map();

    if (!Array.isArray(accounts)) {
      return [];
    }

    for (const entry of accounts) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const containerId =
        typeof entry.containerId === "string" ? entry.containerId.trim() : "";
      const label =
        typeof entry.label === "string" ? entry.label.trim() : "";

      if (!containerId || !label) {
        continue;
      }

      accountMap.set(containerId, { containerId, label });
    }

    return Array.from(accountMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label)
    );
  };

  const sanitizeRules = ({ subredditRules }) => {
    const sanitizedRules = {};

    if (!subredditRules || typeof subredditRules !== "object") {
      return sanitizedRules;
    }

    for (const [rawSubreddit, rawContainerId] of Object.entries(
      subredditRules
    )) {
      const subreddit = app.normalizeSubreddit({ value: rawSubreddit });
      const containerId =
        typeof rawContainerId === "string" ? rawContainerId.trim() : "";

      if (!subreddit || !containerId) {
        continue;
      }

      sanitizedRules[subreddit] = containerId;
    }

    return Object.fromEntries(
      Object.entries(sanitizedRules).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
  };

  const sanitizeConfig = ({ rawConfig }) => {
    const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

    return {
      defaultContainerId:
        typeof source.defaultContainerId === "string"
          ? source.defaultContainerId.trim()
          : "",
      accounts: sanitizeAccounts({ accounts: source.accounts }),
      subredditRules: sanitizeRules({ subredditRules: source.subredditRules }),
      doNotCloseTabs: !!source.doNotCloseTabs,
      themePreference: app.normalizeThemePreference({
        value: source.themePreference
      })
    };
  };

  const getConfig = async () => {
    const rawConfig = await browser.storage.local.get(app.STORAGE_DEFAULTS);
    return sanitizeConfig({ rawConfig });
  };

  const saveConfig = async ({ config }) => {
    const sanitizedConfig = sanitizeConfig({ rawConfig: config });
    await browser.storage.local.set(sanitizedConfig);
    return sanitizedConfig;
  };

  const patchConfig = async ({ patch }) => {
    const config = await getConfig();
    return saveConfig({
      config: {
        defaultContainerId:
          patch.defaultContainerId !== undefined
            ? patch.defaultContainerId
            : config.defaultContainerId,
        accounts: patch.accounts !== undefined ? patch.accounts : config.accounts,
        subredditRules:
          patch.subredditRules !== undefined
            ? patch.subredditRules
            : config.subredditRules,
        doNotCloseTabs:
          patch.doNotCloseTabs !== undefined
            ? patch.doNotCloseTabs
            : config.doNotCloseTabs,
        themePreference:
          patch.themePreference !== undefined
            ? patch.themePreference
            : config.themePreference
      }
    });
  };

  const listAllContainers = async () => {
    try {
      const containers = await browser.contextualIdentities.query({});
      return containers.sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    } catch (error) {
      return [];
    }
  };

  const upsertAccount = ({ accounts, entry }) => {
    const nextAccounts = Array.isArray(accounts) ? accounts.slice() : [];
    const containerId =
      entry && typeof entry.containerId === "string"
        ? entry.containerId.trim()
        : "";
    const label =
      entry && typeof entry.label === "string" ? entry.label.trim() : "";

    if (!containerId || !label) {
      return sanitizeAccounts({ accounts: nextAccounts });
    }

    const existingIndex = nextAccounts.findIndex(
      (account) => account.containerId === containerId
    );

    if (existingIndex >= 0) {
      nextAccounts[existingIndex] = { containerId, label };
    } else {
      nextAccounts.push({ containerId, label });
    }

    return sanitizeAccounts({ accounts: nextAccounts });
  };

  const buildSeedAccounts = ({ containers }) =>
    sanitizeAccounts({
      accounts: containers.map((container) => ({
        containerId: container.cookieStoreId,
        label: app.getVisibleContainerName({ container })
      }))
    });

  const exportConfig = ({ config }) =>
    JSON.stringify(sanitizeConfig({ rawConfig: config }), null, 2);

  app.Storage = {
    buildSeedAccounts,
    exportConfig,
    getConfig,
    listAllContainers,
    listContainers: listAllContainers,
    patchConfig,
    sanitizeConfig,
    saveConfig,
    upsertAccount
  };
})();
