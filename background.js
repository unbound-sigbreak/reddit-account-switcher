const app = globalThis.RedditAccountSwitcher;
const SOURCE_TAB_GUARDS = new Map();
const CREATED_TAB_GUARDS = new Map();
const LOGIN_FLOW_GUARDS = new Map();
const GUARD_TTL_MS = 15000;
const LOGIN_FLOW_GUARD_TTL_MS = 5 * 60 * 1000;

const cleanupGuards = () => {
  const now = Date.now();

  for (const [tabId, entry] of SOURCE_TAB_GUARDS.entries()) {
    if (entry.expiresAt <= now) {
      SOURCE_TAB_GUARDS.delete(tabId);
    }
  }

  for (const [tabId, entry] of CREATED_TAB_GUARDS.entries()) {
    if (entry.expiresAt <= now) {
      CREATED_TAB_GUARDS.delete(tabId);
    }
  }

  for (const [tabId, entry] of LOGIN_FLOW_GUARDS.entries()) {
    if (entry.expiresAt <= now) {
      LOGIN_FLOW_GUARDS.delete(tabId);
    }
  }
};

const buildGuardFingerprint = ({ tab, targetContainerId }) =>
  targetContainerId + "::" + app.normalizeUrlForGuard({ rawUrl: tab.url });

const setSourceGuard = ({ tabId, fingerprint, normalizedUrl }) => {
  SOURCE_TAB_GUARDS.set(tabId, {
    fingerprint,
    normalizedUrl,
    expiresAt: Date.now() + GUARD_TTL_MS
  });
};

const getSourceGuard = ({ tabId }) => {
  cleanupGuards();
  return SOURCE_TAB_GUARDS.get(tabId) ?? null;
};

const hasSourceGuard = ({ tabId, fingerprint }) => {
  const guard = getSourceGuard({ tabId });
  return !!guard && guard.fingerprint === fingerprint;
};

const clearSourceGuardIfTabUrlChanged = ({ tab }) => {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  const guard = getSourceGuard({ tabId: tab.id });

  if (!guard) {
    return;
  }

  const currentUrl = app.getTabNavigationUrl({ tab });
  const normalizedUrl = app.normalizeUrlForGuard({ rawUrl: currentUrl });

  if (guard.normalizedUrl !== normalizedUrl) {
    SOURCE_TAB_GUARDS.delete(tab.id);
  }
};

const setCreatedGuard = ({ tabId, fingerprint }) => {
  CREATED_TAB_GUARDS.set(tabId, {
    fingerprint,
    expiresAt: Date.now() + GUARD_TTL_MS
  });
};

const consumeCreatedGuard = ({ tabId, fingerprint }) => {
  cleanupGuards();
  const guard = CREATED_TAB_GUARDS.get(tabId);

  if (!guard || guard.fingerprint !== fingerprint) {
    return false;
  }

  CREATED_TAB_GUARDS.delete(tabId);
  return true;
};

const setLoginFlowGuard = ({ tabId, containerId }) => {
  LOGIN_FLOW_GUARDS.set(tabId, {
    containerId,
    expiresAt: Date.now() + LOGIN_FLOW_GUARD_TTL_MS
  });
};

const getLoginFlowGuard = ({ tabId }) => {
  cleanupGuards();
  return LOGIN_FLOW_GUARDS.get(tabId) ?? null;
};

const shouldBypassLoginFlowRouting = ({ tab, parsed }) => {
  const guard = getLoginFlowGuard({ tabId: tab.id });

  if (!guard) {
    return false;
  }

  if (guard.containerId !== (tab?.cookieStoreId ?? "")) {
    LOGIN_FLOW_GUARDS.delete(tab.id);
    return false;
  }

  if (!parsed.isReddit) {
    return false;
  }

  if (parsed.subreddit) {
    LOGIN_FLOW_GUARDS.delete(tab.id);
    return false;
  }

  return true;
};

const requireOpenableContainerId = async ({ containerId }) => {
  const normalizedContainerId = typeof containerId === "string" ? containerId.trim() : "";

  if (!normalizedContainerId) {
    throw new Error("Choose or configure an account first.");
  }

  if (normalizedContainerId === app.NO_CONTAINER_ID) {
    return normalizedContainerId;
  }

  const containers = await app.Storage.listAllContainers();
  const targetExists = containers.some(
    (container) => container.cookieStoreId === normalizedContainerId
  );

  if (!targetExists) {
    throw new Error("That account's Firefox container is missing.");
  }

  return normalizedContainerId;
};

const openRedditLoginTab = async ({ containerId }) => {
  const normalizedContainerId = await requireOpenableContainerId({ containerId });
  const createDetails = {
    active: true
  };

  if (normalizedContainerId !== app.NO_CONTAINER_ID) {
    createDetails.cookieStoreId = normalizedContainerId;
  }

  const createdTab = await browser.tabs.create(createDetails);
  setLoginFlowGuard({
    tabId: createdTab.id,
    containerId: createdTab.cookieStoreId ?? normalizedContainerId
  });
  await browser.tabs.update(createdTab.id, {
    url: app.REDDIT_LOGIN_URL
  });

  return {
    ok: true,
    tabId: createdTab.id
  };
};

const requireOpenableUrl = ({ rawUrl }) => {
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";

  if (!url) {
    throw new Error("No current tab URL is available.");
  }

  if (!app.isReroutableUrl({ rawUrl: url })) {
    throw new Error("This page cannot be opened in an account tab.");
  }

  return url;
};

const openAccountUrlTab = async ({ containerId, url }) => {
  const normalizedContainerId = await requireOpenableContainerId({ containerId });
  const targetUrl = requireOpenableUrl({ rawUrl: url });
  await app.Storage.patchConfig({
    patch: {
      routingEnabled: false
    }
  });

  const createDetails = {
    active: true,
    url: targetUrl
  };

  if (normalizedContainerId !== app.NO_CONTAINER_ID) {
    createDetails.cookieStoreId = normalizedContainerId;
  }

  const createdTab = await browser.tabs.create(createDetails);

  return {
    ok: true,
    tabId: createdTab.id
  };
};

const ensureSeedConfig = async () => {
  const config = await app.Storage.getConfig();
  const containers = await app.Storage.listAllContainers();
  const managedContainers = containers.filter((container) =>
    app.isManagedContainer({ containerOrName: container })
  );
  let nextConfig = config;
  let changed = false;

  if (!config.accounts.length && managedContainers.length) {
    nextConfig = {
      ...nextConfig,
      accounts: app.Storage.buildSeedAccounts({ containers: managedContainers })
    };
    changed = true;
  }

  if (changed) {
    await app.Storage.saveConfig({ config: nextConfig });
  }
};

const buildRoutingInfoForTab = async ({ tab }) => {
  const routingTab = {
    ...tab,
    url: app.getTabNavigationUrl({ tab })
  };
  const [config, containers] = await Promise.all([
    app.Storage.getConfig(),
    app.Storage.listAllContainers()
  ]);

  return {
    config,
    containers,
    info: app.buildRoutingInfo({ tab: routingTab, config, containers }),
    tab: routingTab
  };
};

const restoreSourceTab = async ({ tab }) => {
  const parsed = app.parseRedditUrl({ rawUrl: tab.url });

  if (typeof browser.tabs.goBack === "function") {
    try {
      await browser.tabs.goBack(tab.id);
      return { restored: true, reason: "history-back" };
    } catch (error) {
      // Fall back to a safe non-subreddit page when there is no back entry.
    }
  }

  if (!parsed.isReddit || !parsed.host) {
    return { restored: false, reason: "no-fallback" };
  }

  await browser.tabs.update(tab.id, {
    url: "https://" + parsed.host + "/"
  });

  return { restored: true, reason: "host-root" };
};

const rerouteTab = async ({ tab, targetContainerId, doNotCloseTabs }) => {
  const fingerprint = buildGuardFingerprint({ tab, targetContainerId });

  if (hasSourceGuard({ tabId: tab.id, fingerprint })) {
    return { rerouted: false, reason: "guarded" };
  }

  setSourceGuard({
    tabId: tab.id,
    fingerprint,
    normalizedUrl: app.normalizeUrlForGuard({ rawUrl: tab.url })
  });

  try {
    const createDetails = {
      url: tab.url,
      windowId: tab.windowId,
      active: !!tab.active,
      pinned: !!tab.pinned
    };

    if (targetContainerId !== app.NO_CONTAINER_ID) {
      createDetails.cookieStoreId = targetContainerId;
    }

    if (typeof tab.index === "number") {
      createDetails.index = tab.index + 1;
    }

    const createdTab = await browser.tabs.create(createDetails);

    setCreatedGuard({ tabId: createdTab.id, fingerprint });

    if (doNotCloseTabs) {
      try {
        await restoreSourceTab({ tab });
        const restoredTab = await browser.tabs.get(tab.id).catch(() => null);

        if (restoredTab) {
          clearSourceGuardIfTabUrlChanged({ tab: restoredTab });
        }
      } catch (error) {
        logBackgroundError({ error });
      }
    } else {
      await browser.tabs.remove(tab.id);
    }

    return {
      rerouted: true,
      newTabId: createdTab.id
    };
  } catch (error) {
    SOURCE_TAB_GUARDS.delete(tab.id);
    throw error;
  }
};

const getOpenerChildTabTarget = async ({ tab, config, containers }) => {
  if (!tab || typeof tab.openerTabId !== "number") {
    return "";
  }

  let openerTab;

  try {
    openerTab = await browser.tabs.get(tab.openerTabId);
  } catch (error) {
    return "";
  }

  if ((tab.cookieStoreId ?? "") !== (openerTab.cookieStoreId ?? "")) {
    return "";
  }

  const openerRoutingInfo = app.buildRoutingInfo({ tab: openerTab, config, containers });

  if (!openerRoutingInfo.routingEligible) {
    return "";
  }

  if (!openerRoutingInfo.directRuleContainerId) {
    return "";
  }

  const targetContainerId = openerRoutingInfo.openLinksWithAssignedContainer
    ? openerRoutingInfo.directRuleContainerId
    : app.NO_CONTAINER_ID;

  if (!targetContainerId) {
    return "";
  }

  if (
    targetContainerId !== app.NO_CONTAINER_ID
    && !containers.some((container) => container.cookieStoreId === targetContainerId)
  ) {
    return "";
  }

  if ((tab.cookieStoreId ?? "") === targetContainerId) {
    return "";
  }

  return targetContainerId;
};

const maybeRouteTab = async ({ tab }) => {
  if (!tab || typeof tab.id !== "number") {
    return { routed: false, reason: "missing-tab-data" };
  }

  const tabUrl = app.getTabNavigationUrl({ tab });

  if (!tabUrl || !app.isReroutableUrl({ rawUrl: tabUrl })) {
    return { routed: false, reason: "unsupported-url" };
  }

  const routingTab = tab.url === tabUrl ? tab : { ...tab, url: tabUrl };
  clearSourceGuardIfTabUrlChanged({ tab: routingTab });
  const parsed = app.parseRedditUrl({ rawUrl: routingTab.url });
  const skipRedditUrlRouting =
    parsed.isReddit
    && (
      app.isRedditAuthPath({ pathname: parsed.pathname })
      || shouldBypassLoginFlowRouting({ tab: routingTab, parsed })
    );

  const { config, containers, info } = await buildRoutingInfoForTab({ tab: routingTab });

  if (!info.routingEnabled) {
    return { routed: false, reason: "routing-disabled" };
  }

  if (!skipRedditUrlRouting && info.routingEligible && info.targetContainerId && info.targetExists) {
    const fingerprint = buildGuardFingerprint({
      tab: routingTab,
      targetContainerId: info.targetContainerId
    });

    if (consumeCreatedGuard({ tabId: routingTab.id, fingerprint })) {
      return { routed: false, reason: "created-tab-guard" };
    }

    if (!info.needsReroute) {
      return { routed: false, reason: "already-correct" };
    }

    const result = await rerouteTab({
      tab: routingTab,
      targetContainerId: info.targetContainerId,
      doNotCloseTabs: config.doNotCloseTabs
    });
    return {
      routed: result.rerouted,
      reason: result.reason ?? "rerouted",
      targetContainerId: info.targetContainerId
    };
  }

  const openerTargetContainerId = await getOpenerChildTabTarget({
    tab: routingTab,
    config,
    containers
  });

  if (openerTargetContainerId) {
    const fingerprint = buildGuardFingerprint({
      tab: routingTab,
      targetContainerId: openerTargetContainerId
    });

    if (consumeCreatedGuard({ tabId: routingTab.id, fingerprint })) {
      return { routed: false, reason: "created-tab-guard" };
    }

    const result = await rerouteTab({
      tab: routingTab,
      targetContainerId: openerTargetContainerId,
      doNotCloseTabs: false
    });
    return {
      routed: result.rerouted,
      reason: result.reason ?? "rerouted-to-default-container",
      targetContainerId: openerTargetContainerId
    };
  }

  if (skipRedditUrlRouting) {
    return {
      routed: false,
      reason: app.isRedditAuthPath({ pathname: parsed.pathname })
        ? "auth-page"
        : "login-flow"
    };
  }

  if (!parsed.isReddit) {
    return { routed: false, reason: "not-reddit" };
  }

  if (!info.routingEligible) {
    return { routed: false, reason: "no-subreddit" };
  }

  if (!info.targetContainerId) {
    return { routed: false, reason: "no-target-container" };
  }

  if (!info.targetExists) {
    return { routed: false, reason: "missing-target-container" };
  }

  return { routed: false, reason: "already-correct" };
};

const rerouteOpenRedditTabs = async () => {
  const tabs = await browser.tabs.query({
    url: ["https://www.reddit.com/*", "https://old.reddit.com/*"]
  });

  await Promise.all(
    tabs.map((tab) =>
      maybeRouteTab({ tab }).catch((error) => {
        logBackgroundError({ error });
      })
    )
  );
};

const rerouteUsingMapping = async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  const { config, info, tab: routingTab } = await buildRoutingInfoForTab({ tab });

  if (!info.routingEnabled) {
    return { ok: false, reason: "routing-disabled" };
  }

  if (!info.isReddit) {
    return { ok: false, reason: "not-reddit" };
  }

  if (!info.routingEligible) {
    return { ok: false, reason: "no-subreddit" };
  }

  if (!info.targetContainerId) {
    return { ok: false, reason: "no-target-container" };
  }

  if (!info.targetExists) {
    return { ok: false, reason: "missing-target-container" };
  }

  if (!info.needsReroute) {
    return { ok: true, rerouted: false, reason: "already-correct" };
  }

  await rerouteTab({
    tab: routingTab,
    targetContainerId: info.targetContainerId,
    doNotCloseTabs: config.doNotCloseTabs
  });
  return { ok: true, rerouted: true };
};

const logBackgroundError = ({ error }) => {
  console.warn("Reddit Account Switcher:", error);
};

browser.runtime.onInstalled.addListener(() => {
  ensureSeedConfig().catch((error) => {
    logBackgroundError({ error });
  });
});

if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(() => {
    ensureSeedConfig().catch((error) => {
      logBackgroundError({ error });
    });
  });
}

browser.tabs.onCreated.addListener((tab) => {
  if (!tab.url && !tab.pendingUrl) {
    return;
  }

  maybeRouteTab({ tab }).catch((error) => {
    logBackgroundError({ error });
  });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") {
    return;
  }

  maybeRouteTab({ tab }).catch((error) => {
    logBackgroundError({ error });
  });
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  browser.tabs
    .get(tabId)
    .then((tab) => maybeRouteTab({ tab }))
    .catch((error) => {
      logBackgroundError({ error });
    });
});

browser.tabs.onRemoved.addListener((tabId) => {
  SOURCE_TAB_GUARDS.delete(tabId);
  CREATED_TAB_GUARDS.delete(tabId);
  LOGIN_FLOW_GUARDS.delete(tabId);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  if (message.type === "reddit-url-observed") {
    const observedTab = sender.tab
      ? {
        ...sender.tab,
        url: message.url || sender.tab.url
      }
      : null;

    return maybeRouteTab({ tab: observedTab })
      .then(() => ({ ok: true }))
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  if (message.type === "open-login-tab") {
    return openRedditLoginTab({ containerId: message.containerId })
      .then((result) => result)
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  if (message.type === "open-account-url-tab") {
    return openAccountUrlTab({
      containerId: message.containerId,
      url: message.url
    })
      .then((result) => result)
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  if (message.type === "reroute-tab-to-mapped") {
    return rerouteUsingMapping({ tabId: message.tabId })
      .then((result) => result)
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  if (message.type === "seed-config") {
    return ensureSeedConfig()
      .then(() => ({ ok: true }))
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  if (message.type === "reroute-open-reddit-tabs") {
    return rerouteOpenRedditTabs()
      .then(() => ({ ok: true }))
      .catch((error) => ({
        ok: false,
        error: error.message
      }));
  }

  return undefined;
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (
    !changes.defaultContainerId
    && !changes.subredditRules
    && !changes.accounts
  ) {
    return;
  }

  app.Storage.getConfig()
    .then((config) => {
      if (!config.routingEnabled) {
        return;
      }

      return rerouteOpenRedditTabs();
    })
    .catch((error) => {
      logBackgroundError({ error });
    });
});

ensureSeedConfig().catch((error) => {
  logBackgroundError({ error });
});
