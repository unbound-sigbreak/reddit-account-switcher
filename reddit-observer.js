(function () {
  if (window.top !== window) {
    return;
  }

  let lastUrl = "";

  const notifyBackground = () => {
    const nextUrl = location.href;

    if (!nextUrl || nextUrl === lastUrl) {
      return;
    }

    lastUrl = nextUrl;

    browser.runtime
      .sendMessage({
        type: "reddit-url-observed",
        url: nextUrl
      })
      .catch(() => {});
  };

  const wrapHistoryMethod = ({ methodName }) => {
    const original = history[methodName];

    if (typeof original !== "function") {
      return;
    }

    history[methodName] = function () {
      const result = original.apply(this, arguments);
      queueMicrotask(notifyBackground);
      return result;
    };
  };

  wrapHistoryMethod({ methodName: "pushState" });
  wrapHistoryMethod({ methodName: "replaceState" });

  window.addEventListener("popstate", notifyBackground, true);
  window.addEventListener("hashchange", notifyBackground, true);
  document.addEventListener("readystatechange", notifyBackground, true);

  notifyBackground();
})();
