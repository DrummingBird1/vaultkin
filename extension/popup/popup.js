/**
 * Vaultkin — Popup UI
 *
 * Desktop mode (preferred): talks to the Vaultkin app over the encrypted
 * native-messaging bridge via the background worker. Shows connection state,
 * the pairing code to compare with the app, and the logins for the current
 * site only.
 *
 * Legacy mode (web build): the snapshot pushed with "Send to extension".
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const desktopView = $("desktopView");
  const desktopMessage = $("desktopMessage");
  const desktopAction = $("desktopAction");
  const pairCode = $("pairCode");
  const lockedView = $("lockedView");
  const unlockedView = $("unlockedView");
  const searchInput = $("searchInput");
  const entryList = $("entryList");
  const emptyState = $("emptyState");
  const siteLabel = $("siteLabel");
  const lockBtn = $("lockBtn");

  let allEntries = [];
  let activeTab = null;

  const t = (key, sub) => chrome.i18n.getMessage(key, sub) || key;
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.documentElement.dir = chrome.i18n.getUILanguage().startsWith("he") ? "rtl" : "ltr";
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-placeholder]"))
    el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll("[data-i18n-title]"))
    el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute("aria-label", t(el.dataset.i18nAria));

  // state → [message key, action key or null]
  const MESSAGES = {
    "not-installed": ["popupNotInstalled", null],
    "app-not-running": ["popupAppNotRunning", null],
    connecting: ["popupConnecting", null],
    disconnected: ["popupDisconnected", "popupRetry"],
    locked: ["popupLockedTitle", "popupRetry"],
    unpaired: ["popupUnpaired", "popupConnect"],
    rejected: ["popupRejected", "popupTryAgain"],
    pairing: ["popupPairing", null],
  };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function show(view) {
    desktopView.hidden = view !== "desktop";
    lockedView.hidden = view !== "locked";
    unlockedView.hidden = view !== "unlocked";
  }

  function render(query) {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? allEntries
      : allEntries.filter(
          (e) =>
            (e.title || "").toLowerCase().includes(q) ||
            (e.username || "").toLowerCase().includes(q) ||
            (e.url || "").toLowerCase().includes(q),
        );
    entryList.innerHTML = "";
    emptyState.hidden = filtered.length > 0;
    for (const entry of filtered) {
      const li = document.createElement("li");
      li.className = "sv-entry";
      li.innerHTML = `
        <div class="sv-entry-info">
          <div class="sv-entry-title">${esc(entry.title || t("untitled"))}</div>
          <div class="sv-entry-user">${esc(entry.username || "")}</div>
        </div>
        <div class="sv-entry-actions">
          <button type="button" data-action="copy-user" title="${esc(t("copyUser"))}" aria-label="${esc(t("copyUser"))}">👤</button>
          <button type="button" data-action="copy-pass" title="${esc(t("copyPass"))}" aria-label="${esc(t("copyPass"))}">🔑</button>
          ${entry.hasTotp ? `<button type="button" data-action="copy-code" title="${esc(t("copyCode"))}" aria-label="${esc(t("copyCode"))}">⏱</button>` : ""}
          <button type="button" data-action="fill" title="${esc(t("fill"))}" aria-label="${esc(t("fill"))}">➜</button>
        </div>`;
      li.querySelector('[data-action="copy-user"]').addEventListener("click", () =>
        copy(entry.username),
      );
      li.querySelector('[data-action="copy-pass"]').addEventListener("click", () =>
        copy(entry.password),
      );
      li.querySelector('[data-action="copy-code"]')?.addEventListener("click", () =>
        chrome.runtime.sendMessage(
          { type: "SV_DESKTOP_TOTP", id: entry.id, url: activeTab?.url ?? "" },
          (r) => copy(r?.code),
        ),
      );
      li.querySelector('[data-action="fill"]').addEventListener("click", () =>
        fillOnActiveTab(entry),
      );
      entryList.appendChild(li);
    }
  }

  function copy(value) {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    // Clear after 30 s, like the app does.
    setTimeout(() => navigator.clipboard?.writeText("").catch(() => {}), 30_000);
  }

  function fillOnActiveTab(entry) {
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(
      activeTab.id,
      { type: "SV_FILL_ENTRY", entry },
      () => void chrome.runtime.lastError,
    );
  }

  let pendingAction = null;
  function showDesktop(state) {
    show("desktop");
    const [msgKey, actionKey] = MESSAGES[state.kind] ?? ["popupDisconnected", "popupRetry"];
    desktopMessage.textContent = t(msgKey);
    pairCode.hidden = state.kind !== "pairing";
    if (state.kind === "pairing")
      pairCode.textContent = `${state.code.slice(0, 3)} ${state.code.slice(3)}`;
    pendingAction = actionKey;
    desktopAction.hidden = !actionKey;
    desktopAction.textContent = actionKey ? t(actionKey) : "";
  }

  function loadDesktopEntries() {
    chrome.runtime.sendMessage({ type: "SV_FIND_FOR_URL", url: activeTab?.url ?? "" }, (resp) => {
      allEntries = resp?.matches ?? [];
      siteLabel.textContent = activeTab?.url ? new URL(activeTab.url).hostname : "";
      show("unlocked");
      render(searchInput.value);
    });
  }

  function refreshDesktop() {
    chrome.runtime.sendMessage({ type: "SV_DESKTOP_STATUS" }, (state) => {
      if (!state) return refreshLegacy();
      if (state.kind === "ready") return loadDesktopEntries();
      showDesktop(state);
      // Pairing finishes in the app; poll until it does.
      if (state.kind === "pairing") setTimeout(refreshDesktop, 1000);
    });
  }

  function refreshLegacy() {
    chrome.runtime.sendMessage({ type: "SV_GET_STATUS" }, (resp) => {
      if (!resp?.unlocked) return show("locked");
      chrome.runtime.sendMessage({ type: "SV_GET_ALL" }, (r) => {
        allEntries = r?.entries ?? [];
        show("unlocked");
        render(searchInput.value);
      });
    });
  }

  desktopAction.addEventListener("click", () => {
    if (pendingAction === "popupConnect" || pendingAction === "popupTryAgain") {
      chrome.runtime.sendMessage({ type: "SV_DESKTOP_PAIR" }, (r) => {
        if (r?.ok) showDesktop({ kind: "pairing", code: r.code });
        setTimeout(refreshDesktop, 1000);
      });
    } else {
      refreshDesktop();
    }
  });

  searchInput.addEventListener("input", () => render(searchInput.value));
  lockBtn.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "SV_LOCK" }, () => refreshDesktop()),
  );

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    activeTab = tabs[0] ?? null;
    refreshDesktop();
  });
})();
