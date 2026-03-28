(function () {
  const app = globalThis.RedditAccountSwitcher;
  const OPTIONS_UI_DEFAULTS = Object.freeze({
    optionsRiskWarningDismissed: false
  });
  const elements = {
    accountList: document.getElementById("accountList"),
    addRuleButton: document.getElementById("addRuleButton"),
    configPreview: document.getElementById("configPreview"),
    createAccountButton: document.getElementById("createAccountButton"),
    createAccountPanel: document.getElementById("createAccountPanel"),
    createAccountColor: document.getElementById("createAccountColor"),
    createAccountIcon: document.getElementById("createAccountIcon"),
    createAccountName: document.getElementById("createAccountName"),
    defaultContainerSelect: document.getElementById("defaultContainerSelect"),
    dismissWarningButton: document.getElementById("dismissWarningButton"),
    doNotCloseTabsCheckbox: document.getElementById("doNotCloseTabsCheckbox"),
    exportButton: document.getElementById("exportButton"),
    importInput: document.getElementById("importInput"),
    noDefaultAccountHint: document.getElementById("noDefaultAccountHint"),
    optionsStatus: document.getElementById("optionsStatus"),
    riskWarning: document.getElementById("riskWarning"),
    rulesList: document.getElementById("rulesList"),
    saveAccountsButton: document.getElementById("saveAccountsButton"),
    saveDefaultButton: document.getElementById("saveDefaultButton"),
    saveRulesButton: document.getElementById("saveRulesButton"),
    showWarningButton: document.getElementById("showWarningButton"),
    themeSelect: document.getElementById("themeSelect"),
    toggleCreateAccountButton: document.getElementById("toggleCreateAccountButton")
  };

  const state = {
    config: null,
    allContainers: [],
    managedContainers: [],
    createAccountFormOpen: false,
    warningDismissed: false
  };

  const CONTAINER_COLORS = [
    "blue",
    "turquoise",
    "green",
    "yellow",
    "orange",
    "red",
    "pink",
    "purple",
    "toolbar"
  ];

  const CONTAINER_ICONS = [
    "fingerprint",
    "briefcase",
    "dollar",
    "cart",
    "circle",
    "gift",
    "vacation",
    "food",
    "fruit",
    "pet",
    "tree",
    "chill",
    "fence"
  ];

  const setStatus = ({ message, tone }) => {
    elements.optionsStatus.textContent = message ?? "";
    elements.optionsStatus.dataset.tone = tone ?? "neutral";
  };

  const createOption = ({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  };

  const populateStaticChoices = ({ select, values, selectedValue }) => {
    select.textContent = "";

    for (const value of values) {
      select.appendChild(createOption({ value, label: value }));
    }

    select.value = selectedValue;
  };

  const populateAccountSelect = ({ select, selectedValue, includeEmptyOption }) => {
    select.textContent = "";

    if (includeEmptyOption) {
      const emptyLabel =
        select === elements.defaultContainerSelect
          ? "No default account"
          : "Choose an account";
      select.appendChild(createOption({ value: "", label: emptyLabel }));
    }

    for (const choice of app.getAccountChoices({
      containers: state.managedContainers,
      config: state.config,
      allContainers: state.allContainers
    })) {
      select.appendChild(createOption({
        value: choice.containerId,
        label: choice.accountLabel
      }));
    }

    select.value = selectedValue ?? "";
  };

  const updateNoDefaultAccountHint = () => {
    elements.noDefaultAccountHint.hidden = !!elements.defaultContainerSelect.value;
  };

  const getVisibleAccountChoices = () =>
    app.getAccountChoices({
      containers: state.managedContainers,
      config: state.config,
      allContainers: state.allContainers
    });

  const buildAccountRow = ({ choice }) => {
    const container = state.allContainers.find(
      (entry) => entry.cookieStoreId === choice.containerId
    );
    const row = document.createElement("div");
    row.className = "list-row";

    const marker = document.createElement("span");
    marker.className = "container-marker";
    marker.style.setProperty("--container-accent", app.colorToCss({ color: choice.color }));

    const text = document.createElement("div");
    text.className = "list-copy";

    const title = document.createElement("strong");
    title.textContent = choice.accountLabel;

    const meta = document.createElement("span");
    if (choice.exists && choice.managed) {
      meta.textContent = "Managed Firefox container • " + choice.containerId;
    } else if (choice.exists && container) {
      meta.textContent = "External Firefox container: " + container.name + " • " + choice.containerId;
    } else {
      meta.textContent = "Missing Firefox container • " + choice.containerId;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "inline-input";
    input.dataset.containerId = choice.containerId;
    input.placeholder = "Account name";
    input.setAttribute("aria-label", "Account name for " + (choice.accountLabel || choice.containerId));
    input.value = choice.accountLabel;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const loginButton = document.createElement("button");
    loginButton.type = "button";
    loginButton.className = "button-secondary";
    loginButton.textContent = "Open Reddit login";
    loginButton.disabled = !choice.exists;
    loginButton.addEventListener("click", () => {
      openRedditLogin({ containerId: choice.containerId }).catch((error) => {
        setStatus({ message: error.message, tone: "error" });
      });
    });

    actions.appendChild(loginButton);

    if (choice.managed) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button-ghost";
      deleteButton.textContent = "Delete account";
      deleteButton.addEventListener("click", () => {
        deleteAccount({ containerId: choice.containerId }).catch((error) => {
          setStatus({ message: error.message, tone: "error" });
        });
      });
      actions.appendChild(deleteButton);
    }

    text.appendChild(title);
    text.appendChild(meta);
    row.appendChild(marker);
    row.appendChild(text);
    row.appendChild(input);
    row.appendChild(actions);
    return row;
  };

  const buildRuleRow = ({ subreddit, rule }) => {
    const normalizedRule = app.normalizeSubredditRule({ value: rule });
    const row = document.createElement("div");
    row.className = "rules-grid rule-row";

    const subredditInput = document.createElement("input");
    subredditInput.type = "text";
    subredditInput.className = "inline-input";
    subredditInput.placeholder = "privacy";
    subredditInput.value = subreddit ?? "";
    subredditInput.dataset.role = "subreddit";

    const containerSelect = document.createElement("select");
    containerSelect.dataset.role = "container";
    populateAccountSelect({
      select: containerSelect,
      selectedValue: normalizedRule.containerId,
      includeEmptyOption: true
    });

    const childTabsLabel = document.createElement("label");
    childTabsLabel.className = "rule-checkbox";

    const childTabsCheckbox = document.createElement("input");
    childTabsCheckbox.type = "checkbox";
    childTabsCheckbox.dataset.role = "open-links-with-assigned-container";
    childTabsCheckbox.checked = normalizedRule.openLinksWithAssignedContainer;

    const childTabsCopy = document.createElement("span");
    childTabsCopy.textContent = "Open with assigned container";

    childTabsLabel.appendChild(childTabsCheckbox);
    childTabsLabel.appendChild(childTabsCopy);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button-ghost";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      row.remove();
    });

    row.appendChild(subredditInput);
    row.appendChild(containerSelect);
    row.appendChild(childTabsLabel);
    row.appendChild(deleteButton);
    return row;
  };

  const renderRules = () => {
    elements.rulesList.textContent = "";

    const entries = Object.entries(state.config.subredditRules);

    if (!entries.length) {
      elements.rulesList.appendChild(buildRuleRow({ subreddit: "", rule: null }));
      return;
    }

    for (const [subreddit, rule] of entries) {
      elements.rulesList.appendChild(buildRuleRow({ subreddit, rule }));
    }
  };

  const renderAccounts = () => {
    elements.accountList.textContent = "";
    const choices = getVisibleAccountChoices().filter((choice) => choice.exists);

    if (!choices.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No managed accounts exist yet. Use Add new account above to create one.";
      elements.accountList.appendChild(empty);
      return;
    }

    for (const choice of choices) {
      elements.accountList.appendChild(buildAccountRow({ choice }));
    }
  };

  const resetCreateAccountForm = () => {
    elements.createAccountName.value = "";
    elements.createAccountColor.value = "blue";
    elements.createAccountIcon.value = "circle";
  };

  const updateCreateAccountUi = () => {
    elements.createAccountPanel.hidden = !state.createAccountFormOpen;
    elements.toggleCreateAccountButton.textContent = state.createAccountFormOpen ? "Cancel" : "Add new account";
    elements.toggleCreateAccountButton.setAttribute("aria-expanded", String(state.createAccountFormOpen));
  };

  const render = () => {
    populateStaticChoices({
      select: elements.createAccountColor,
      values: CONTAINER_COLORS,
      selectedValue: elements.createAccountColor.value || "blue"
    });
    populateStaticChoices({
      select: elements.createAccountIcon,
      values: CONTAINER_ICONS,
      selectedValue: elements.createAccountIcon.value || "circle"
    });
    populateAccountSelect({
      select: elements.defaultContainerSelect,
      selectedValue: state.config.defaultContainerId,
      includeEmptyOption: true
    });
    updateNoDefaultAccountHint();
    elements.doNotCloseTabsCheckbox.checked = !!state.config.doNotCloseTabs;
    elements.riskWarning.hidden = state.warningDismissed;
    elements.showWarningButton.disabled = !state.warningDismissed;
    elements.themeSelect.value = app.normalizeThemePreference({
      value: state.config.themePreference
    });
    updateCreateAccountUi();
    renderAccounts();
    renderRules();
    elements.configPreview.textContent = app.Storage.exportConfig({
      config: state.config
    });
  };

  const loadState = async () => {
    const [allContainers, config, optionsUi] = await Promise.all([
      app.Storage.listAllContainers(),
      app.Storage.getConfig(),
      browser.storage.local.get(OPTIONS_UI_DEFAULTS)
    ]);

    state.allContainers = allContainers;
    state.managedContainers = state.allContainers.filter((container) =>
      app.isManagedContainer({ containerOrName: container })
    );
    state.config = config;
    state.warningDismissed = !!optionsUi.optionsRiskWarningDismissed;
    app.applyThemePreference({
      doc: document,
      value: state.config.themePreference
    });
    render();
  };

  const dismissRiskWarning = async () => {
    state.warningDismissed = true;
    render();
    await browser.storage.local.set({
      optionsRiskWarningDismissed: true
    });
  };

  const showRiskWarning = async () => {
    state.warningDismissed = false;
    render();
    await browser.storage.local.set({
      optionsRiskWarningDismissed: false
    });
    elements.riskWarning.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const saveThemePreference = async ({ themePreference }) => {
    state.config = await app.Storage.patchConfig({ patch: { themePreference } });
    app.applyThemePreference({
      doc: document,
      value: state.config.themePreference
    });
    render();
    setStatus({ message: "Saved the theme preference.", tone: "success" });
  };

  const saveRoutingSettings = async () => {
    state.config = await app.Storage.patchConfig({
      patch: {
        defaultContainerId: elements.defaultContainerSelect.value,
        doNotCloseTabs: elements.doNotCloseTabsCheckbox.checked
      }
    });
    render();
    setStatus({ message: "Saved the routing settings.", tone: "success" });
  };

  const saveAccountLabels = async () => {
    const inputs = elements.accountList.querySelectorAll("input[data-container-id]");
    const nextAccounts = [];
    const visibleChoiceMap = new Map(
      getVisibleAccountChoices().map((choice) => [choice.containerId, choice])
    );

    for (const input of inputs) {
      const label = input.value.trim();

      if (!label) {
        continue;
      }

      nextAccounts.push({
        containerId: input.dataset.containerId,
        label
      });

      const choice = visibleChoiceMap.get(input.dataset.containerId);

      if (choice && choice.managed) {
        await browser.contextualIdentities.update(input.dataset.containerId, {
          name: app.buildManagedContainerName({ label }),
          color: choice.color,
          icon: choice.icon
        });
      }
    }

    await app.Storage.patchConfig({ patch: { accounts: nextAccounts } });
    await loadState();
    setStatus({ message: "Saved account labels.", tone: "success" });
  };

  const openRedditLogin = async ({ containerId }) => {
    const result = await browser.runtime.sendMessage({
      type: "open-login-tab",
      containerId
    });

    if (!result || !result.ok) {
      throw new Error(result?.error ?? "Could not open Reddit login.");
    }

    setStatus({ message: "Opened Reddit login in that account.", tone: "success" });
  };

  const createAccount = async () => {
    const name = elements.createAccountName.value.trim();
    const color = elements.createAccountColor.value;
    const icon = elements.createAccountIcon.value;

    if (!name) {
      throw new Error("Enter an account name first.");
    }

    const context = await browser.contextualIdentities.create({
      name: app.buildManagedContainerName({ label: name }),
      color,
      icon
    });

    const nextAccounts = app.Storage.upsertAccount({
      accounts: state.config.accounts,
      entry: {
        containerId: context.cookieStoreId,
        label: app.stripManagedPrefix({ name })
      }
    });
    const nextConfig = {
      ...state.config,
      accounts: nextAccounts,
      defaultContainerId: state.config.defaultContainerId || context.cookieStoreId
    };

    await app.Storage.saveConfig({ config: nextConfig });
    state.createAccountFormOpen = false;
    resetCreateAccountForm();
    await loadState();
    setStatus({ message: "Created account \"" + name + "\".", tone: "success" });
    await openRedditLogin({ containerId: context.cookieStoreId });
  };

  const deleteAccount = async ({ containerId }) => {
    const liveContainer = state.allContainers.find(
      (container) => container.cookieStoreId === containerId
    );

    if (!liveContainer || !app.isManagedContainer({ containerOrName: liveContainer })) {
      throw new Error("Only extension-managed accounts can be deleted here.");
    }

    const accountLabel = app.resolveContainerLabel({
      containerId,
      config: state.config,
      containers: state.allContainers
    });
    const confirmed = window.confirm(
      "Delete account \"" +
        accountLabel +
        "\"? This removes its Firefox container and clears any subreddit rules that point to it."
    );

    if (!confirmed) {
      return;
    }

    await browser.contextualIdentities.remove(containerId);

    const nextRules = {};

    for (const [subreddit, mappedRule] of Object.entries(
      state.config.subredditRules
    )) {
      const ruleContainerId = app.normalizeSubredditRule({
        value: mappedRule
      }).containerId;

      if (ruleContainerId !== containerId) {
        nextRules[subreddit] = mappedRule;
      }
    }

    const nextAccounts = state.config.accounts.filter(
      (account) => account.containerId !== containerId
    );

    await app.Storage.patchConfig({
      patch: {
        defaultContainerId:
          state.config.defaultContainerId === containerId
            ? ""
            : state.config.defaultContainerId,
        accounts: nextAccounts,
        subredditRules: nextRules
      }
    });

    await loadState();
    setStatus({ message: "Deleted account \"" + accountLabel + "\".", tone: "success" });
  };

  const saveRules = async () => {
    const nextRules = {};
    const rows = elements.rulesList.querySelectorAll(".rule-row");

    for (const row of rows) {
      const subredditInput = row.querySelector("[data-role='subreddit']");
      const containerSelect = row.querySelector("[data-role='container']");
      const childTabsCheckbox = row.querySelector(
        "[data-role='open-links-with-assigned-container']"
      );
      const subreddit = app.normalizeSubreddit({ value: subredditInput.value });
      const containerId = containerSelect.value;

      if (!subreddit && !containerId) {
        continue;
      }

      if (!subreddit || !containerId) {
        throw new Error("Each saved rule needs both a subreddit and an account.");
      }

      if (nextRules[subreddit]) {
        throw new Error("Duplicate rule for r/" + subreddit + ".");
      }

      nextRules[subreddit] = {
        containerId,
        openLinksWithAssignedContainer: !!childTabsCheckbox?.checked
      };
    }

    await app.Storage.patchConfig({ patch: { subredditRules: nextRules } });
    await loadState();
    setStatus({ message: "Saved subreddit rules.", tone: "success" });
  };

  const exportConfig = () => {
    const blob = new Blob([app.Storage.exportConfig({ config: state.config })], {
      type: "application/json"
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "reddit-account-switcher.json";
    link.click();
    URL.revokeObjectURL(downloadUrl);
    setStatus({ message: "Exported the current configuration.", tone: "success" });
  };

  const importConfig = async ({ file }) => {
    const text = await file.text();
    const parsedConfig = JSON.parse(text);
    const sanitized = app.Storage.sanitizeConfig({ rawConfig: parsedConfig });
    await app.Storage.saveConfig({ config: sanitized });
    await loadState();
    elements.importInput.value = "";
    setStatus({ message: "Imported configuration from JSON.", tone: "success" });
  };

  elements.saveDefaultButton.addEventListener("click", () => {
    saveRoutingSettings().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.doNotCloseTabsCheckbox.addEventListener("change", () => {
    saveRoutingSettings().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.defaultContainerSelect.addEventListener("change", () => {
    updateNoDefaultAccountHint();
  });

  elements.themeSelect.addEventListener("change", (event) => {
    saveThemePreference({ themePreference: event.target.value }).catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.dismissWarningButton.addEventListener("click", () => {
    dismissRiskWarning().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.showWarningButton.addEventListener("click", () => {
    showRiskWarning().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.saveAccountsButton.addEventListener("click", () => {
    if (
      state.createAccountFormOpen
      && elements.createAccountName.value.trim()
    ) {
      setStatus({
        message: "Use Create account below to add the new account, or Cancel to close that form. Save labels only updates the accounts already listed below.",
        tone: "warning"
      });
      return;
    }

    saveAccountLabels().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.toggleCreateAccountButton.addEventListener("click", () => {
    if (state.createAccountFormOpen) {
      state.createAccountFormOpen = false;
      resetCreateAccountForm();
      updateCreateAccountUi();
      return;
    }

    state.createAccountFormOpen = true;
    updateCreateAccountUi();
    elements.createAccountName.focus();
  });

  elements.createAccountButton.addEventListener("click", () => {
    createAccount().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.addRuleButton.addEventListener("click", () => {
    elements.rulesList.appendChild(buildRuleRow({ subreddit: "", rule: null }));
  });

  elements.saveRulesButton.addEventListener("click", () => {
    saveRules().catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  elements.exportButton.addEventListener("click", exportConfig);

  elements.importInput.addEventListener("change", (event) => {
    const [file] = event.target.files ?? [];

    if (!file) {
      return;
    }

    importConfig({ file }).catch((error) => {
      setStatus({ message: error.message, tone: "error" });
    });
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.themePreference) {
      const nextThemePreference = app.normalizeThemePreference({
        value: changes.themePreference.newValue
      });

      if (state.config) {
        state.config = {
          ...state.config,
          themePreference: nextThemePreference
        };
        render();
      }

      app.applyThemePreference({
        doc: document,
        value: nextThemePreference
      });
    }

    if (changes.optionsRiskWarningDismissed) {
      state.warningDismissed = !!changes.optionsRiskWarningDismissed.newValue;
      if (state.config) {
        render();
      }
    }
  });

  browser.runtime
    .sendMessage({ type: "seed-config" })
    .catch(() => {});

  loadState().catch((error) => {
    setStatus({ message: error.message, tone: "error" });
  });
})();
