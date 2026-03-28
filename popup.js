(function () {
  const app = globalThis.RedditAccountSwitcher;
  const elements = {
    assignButton: document.getElementById("assignButton"),
    currentContainer: document.getElementById("currentContainer"),
    currentSubreddit: document.getElementById("currentSubreddit"),
    loginButton: document.getElementById("loginButton"),
    mappedContainer: document.getElementById("mappedContainer"),
    mappingSelect: document.getElementById("mappingSelect"),
    optionsButton: document.getElementById("optionsButton"),
    popupStatus: document.getElementById("popupStatus"),
    popupSubtitle: document.getElementById("popupSubtitle"),
    reopenButton: document.getElementById("reopenButton")
  };

  const state = {
    activeTab: null,
    config: null,
    allContainers: [],
    managedContainers: [],
    routingInfo: null
  };

  const setStatus = ({ message, tone }) => {
    elements.popupStatus.textContent = message ?? "";
    elements.popupStatus.dataset.tone = tone ?? "neutral";
  };

  const fillSelectOptions = () => {
    const select = elements.mappingSelect;
    select.textContent = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Use default account";
    select.appendChild(defaultOption);

    const choices = app.getAccountChoices({
      containers: state.managedContainers,
      config: state.config,
      allContainers: state.allContainers
    });

    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = choice.containerId;
      option.textContent = choice.accountLabel;
      select.appendChild(option);
    }

    select.value = state.routingInfo && state.routingInfo.directRuleContainerId
      ? state.routingInfo.directRuleContainerId
      : "";
  };

  const render = () => {
    const info = state.routingInfo;

    if (!state.activeTab || !info) {
      elements.currentSubreddit.textContent = "No active tab";
      elements.currentContainer.textContent = "Unknown";
      elements.mappedContainer.textContent = "Unknown";
      elements.mappingSelect.disabled = true;
      elements.assignButton.disabled = true;
      elements.loginButton.disabled = true;
      elements.reopenButton.disabled = true;
      return;
    }

    if (!info.isReddit) {
      elements.currentSubreddit.textContent = "Not on Reddit";
      elements.currentContainer.textContent = info.currentAccountLabel;
      elements.mappedContainer.textContent = "Not applicable";
      elements.popupSubtitle.textContent = "Open a Reddit tab to view or change its account routing.";
      elements.mappingSelect.disabled = true;
      elements.assignButton.disabled = true;
      elements.loginButton.disabled = true;
      elements.reopenButton.disabled = true;
      fillSelectOptions();
      return;
    }

    if (!info.routingEligible) {
      elements.currentSubreddit.textContent = "No subreddit in URL";
      elements.currentContainer.textContent = info.currentAccountLabel;
      elements.mappedContainer.textContent = "No automatic routing";
      elements.popupSubtitle.textContent =
        "Only Reddit URLs with /r/... are routed automatically. This page stays in its current account.";
      fillSelectOptions();
      elements.mappingSelect.disabled = true;
      elements.assignButton.disabled = true;
      elements.loginButton.disabled = true;
      elements.reopenButton.disabled = true;
      return;
    }

    elements.currentSubreddit.textContent = "r/" + info.subreddit;
    elements.currentContainer.textContent = info.currentAccountLabel;
    elements.mappedContainer.textContent = info.targetExists
      ? info.targetAccountLabel
      : (
        info.targetContainerId
          ? info.targetAccountLabel + " (needs Firefox container)"
          : "Not configured"
      );
    elements.popupSubtitle.textContent = "Current account rule for r/" + info.subreddit + ".";

    fillSelectOptions();
    elements.mappingSelect.disabled = !info.subreddit;
    elements.assignButton.disabled = !info.canAssignToCurrentContainer;
    elements.loginButton.disabled = !info.targetExists;
    elements.reopenButton.disabled = !info.targetExists || !info.needsReroute;
  };

  const loadState = async () => {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    state.activeTab = activeTab ?? null;
    state.allContainers = await app.Storage.listAllContainers();
    state.managedContainers = state.allContainers.filter((container) =>
      app.isManagedContainer({ containerOrName: container })
    );
    state.config = await app.Storage.getConfig();
    state.routingInfo = activeTab
      ? app.buildRoutingInfo({
        tab: activeTab,
        config: state.config,
        containers: state.allContainers
      })
      : null;

    app.applyThemePreference({
      doc: document,
      value: state.config.themePreference
    });
    render();
  };

  const saveCurrentRule = async ({ containerId }) => {
    const info = state.routingInfo;

    if (!info || !info.subreddit) {
      return;
    }

    const nextRules = { ...state.config.subredditRules };
    const existingRule = app.getSubredditRule({
      config: state.config,
      subreddit: info.subreddit
    });

    if (containerId) {
      nextRules[info.subreddit] = {
        containerId,
        openLinksWithAssignedContainer:
          existingRule?.openLinksWithAssignedContainer ?? false
      };
    } else {
      delete nextRules[info.subreddit];
    }

    await app.Storage.patchConfig({ patch: { subredditRules: nextRules } });
    await loadState();
  };

  const openRedditLogin = async ({ containerId }) => {
    if (!containerId) {
      setStatus({
        message: "Choose or configure an account first.",
        tone: "warning"
      });
      return;
    }

    const result = await browser.runtime.sendMessage({
      type: "open-login-tab",
      containerId
    });

    if (!result || !result.ok) {
      throw new Error(result?.error ?? "Could not open Reddit login.");
    }
  };

  const assignToCurrentContainer = async () => {
    const info = state.routingInfo;

    if (!info || !info.subreddit || !info.canAssignToCurrentContainer) {
      setStatus({
        message: "This tab is not inside one of this extension's managed accounts.",
        tone: "warning"
      });
      return;
    }

    const liveContainer = state.allContainers.find(
      (container) => container.cookieStoreId === info.currentContainerId
    );
    const existingAccount = app.getAccountByContainerId({
      config: state.config,
      containerId: info.currentContainerId
    });
    const accountLabel =
      (existingAccount && existingAccount.label)
      || (liveContainer
        ? app.getVisibleContainerName({ container: liveContainer })
        : info.currentContainerLabel);
    const nextAccounts = app.Storage.upsertAccount({
      accounts: state.config.accounts,
      entry: {
        containerId: info.currentContainerId,
        label: accountLabel
      }
    });

    await app.Storage.patchConfig({
      patch: {
        accounts: nextAccounts,
        subredditRules: {
          ...state.config.subredditRules,
          [info.subreddit]: {
            containerId: info.currentContainerId,
            openLinksWithAssignedContainer:
              app.getSubredditRule({
                config: state.config,
                subreddit: info.subreddit
              })?.openLinksWithAssignedContainer ?? false
          }
        }
      }
    });

    await loadState();
    setStatus({
      message: "Saved r/" + info.subreddit + " to the current account.",
      tone: "success"
    });
  };

  const reopenInMappedContainer = async () => {
    if (!state.activeTab) {
      return;
    }

    const result = await browser.runtime.sendMessage({
      type: "reroute-tab-to-mapped",
      tabId: state.activeTab.id
    });

    if (!result || !result.ok) {
      setStatus({
        message: "Could not reopen the tab in the mapped account.",
        tone: "error"
      });
      return;
    }

    if (result.rerouted) {
      window.close();
      return;
    }

    setStatus({
      message: "The active tab is already in the mapped account.",
      tone: "neutral"
    });
  };

  elements.mappingSelect.addEventListener("change", async (event) => {
    const containerId = event.target.value;

    try {
      await saveCurrentRule({ containerId });
      const info = state.routingInfo;

      if (info && info.targetExists && info.needsReroute && state.activeTab) {
        const result = await browser.runtime.sendMessage({
          type: "reroute-tab-to-mapped",
          tabId: state.activeTab.id
        });

        if (result && result.ok && result.rerouted) {
          window.close();
          return;
        }
      }

      setStatus({
        message: containerId
          ? "Updated the current subreddit account."
          : "Current subreddit now uses the default account.",
        tone: "success"
      });
    } catch (error) {
      setStatus({ message: error.message, tone: "error" });
    }
  });

  elements.assignButton.addEventListener("click", () => {
    assignToCurrentContainer().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.reopenButton.addEventListener("click", () => {
    reopenInMappedContainer().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.loginButton.addEventListener("click", () => {
    const info = state.routingInfo;
    const containerId = info?.targetContainerId ?? "";

    openRedditLogin({ containerId })
      .then(() => {
        setStatus({
          message: "Opened Reddit login in the mapped account.",
          tone: "success"
        });
      })
      .catch((error) => {
        setStatus({ message: error.message, tone: "error" });
      });
  });

  elements.optionsButton.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.themePreference) {
      return;
    }

    const nextThemePreference = app.normalizeThemePreference({
      value: changes.themePreference.newValue
    });

    if (state.config) {
      state.config = {
        ...state.config,
        themePreference: nextThemePreference
      };
    }

    app.applyThemePreference({
      doc: document,
      value: nextThemePreference
    });
  });

  loadState().catch((error) => {
    setStatus({ message: error.message, tone: "error" });
  });
})();
