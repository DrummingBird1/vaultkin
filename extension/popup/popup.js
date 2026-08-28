/**
 * SecureVault — Popup UI
 * Status, search, copy-to-clipboard, fill (delegates to the active tab's
 * content script — see the SV_FILL_ENTRY handler in content.js), and lock.
 */
(function () {
  const lockedView = document.getElementById("lockedView");
  const unlockedView = document.getElementById("unlockedView");
  const searchInput = document.getElementById("searchInput");
  const entryList = document.getElementById("entryList");
  const emptyState = document.getElementById("emptyState");
  const lockBtn = document.getElementById("lockBtn");

  let allEntries = [];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
          <div class="sv-entry-title">${esc(entry.title || "(untitled)")}</div>
          <div class="sv-entry-user">${esc(entry.username || "")}</div>
        </div>
        <div class="sv-entry-actions">
          <button type="button" data-action="copy-user" title="Copy username">👤</button>
          <button type="button" data-action="copy-pass" title="Copy password">🔑</button>
          <button type="button" data-action="fill" title="Fill on this page">➜</button>
        </div>
      `;
      li.querySelector('[data-action="copy-user"]').addEventListener("click", () =>
        copy(entry.username),
      );
      li.querySelector('[data-action="copy-pass"]').addEventListener("click", () =>
        copy(entry.password),
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
  }

  function fillOnActiveTab(entry) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "SV_FILL_ENTRY", entry }, () => {
        // chrome.runtime.lastError is expected/ignored here — some pages
        // (chrome://, the Chrome Web Store, etc.) don't allow content
        // scripts at all, so there's nothing listening to respond.
        void chrome.runtime.lastError;
      });
    });
  }

  function loadEntries() {
    chrome.runtime.sendMessage({ type: "SV_GET_ALL" }, (resp) => {
      allEntries = resp?.entries ?? [];
      render(searchInput.value);
    });
  }

  function refreshStatus() {
    chrome.runtime.sendMessage({ type: "SV_GET_STATUS" }, (resp) => {
      const unlocked = !!resp?.unlocked;
      lockedView.hidden = unlocked;
      unlockedView.hidden = !unlocked;
      if (unlocked) loadEntries();
    });
  }

  searchInput.addEventListener("input", () => render(searchInput.value));
  lockBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SV_LOCK" }, () => refreshStatus());
  });

  refreshStatus();
})();
