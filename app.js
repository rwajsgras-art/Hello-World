const FEED_URL = "feed.json";

const STORAGE = {
  feed: "dodai:feed:v1",
  lastSeenLinks: "dodai:lastSeen:v1",
  bookmarks: "dodai:bookmarks:v1",
  disabledSources: "dodai:disabledSources:v1",
  notifOptIn: "dodai:notif:v1",
  priorityTerms: "dodai:priorityTerms:v1",
  customSources: "dodai:customSources:v1",
};

// Public CORS proxy used for browser-side RSS fetches. Swap at your own risk.
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

const AI_TERMS_CLIENT = [
  /\bAI\b/i, /artificial intelligence/i, /machine learning/i, /\bML\b/,
  /large language model/i, /\bLLM\b/, /generative/i, /deep learning/i,
  /neural network/i, /computer vision/i, /autonomous/i, /autonomy/i,
  /robotic/i, /swarm/i, /unmanned/i, /Project Maven/i, /\bCDAO\b/,
  /\bJAIC\b/, /Replicator/i, /Task Force Lima/i, /algorithmic warfare/i,
  /JADC2/i, /CJADC2/i,
];
const DEFENSE_TERMS_CLIENT = [
  /\bDoD\b/, /Department of Defense/i, /Pentagon/i, /DARPA/i, /\bCDAO\b/,
  /Air Force/i, /\bArmy\b/, /\bNavy\b/, /Marine Corps/i, /Space Force/i,
  /\bmilitary\b/i, /\bdefense\b/i, /warfighter/i, /combatant command/i,
  /CENTCOM|NORTHCOM|INDOPACOM|EUCOM|AFRICOM|SOUTHCOM|SOCOM|STRATCOM|TRANSCOM/,
];
const AI_TAG_MAP = [
  [/\bAI\b|artificial intelligence/i, "AI"],
  [/machine learning|\bML\b/, "ML"],
  [/large language model|\bLLM\b/, "LLM"],
  [/generative/i, "GenAI"],
  [/autonom|unmanned|swarm/i, "Autonomy"],
  [/robotic/i, "Robotics"],
  [/computer vision/i, "Computer Vision"],
  [/Project Maven/i, "Project Maven"],
  [/\bCDAO\b/, "CDAO"],
  [/Replicator/i, "Replicator"],
  [/JADC2|CJADC2/i, "JADC2"],
];

function loadCustomSources() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE.customSources) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveCustomSources(list) {
  localStorage.setItem(STORAGE.customSources, JSON.stringify(list));
}

const DEFAULT_PRIORITY_TERMS = [
  "breaking",
  "exclusive",
  "urgent",
  "Replicator",
  "CDAO",
  "Project Maven",
  "Task Force Lima",
  "directive",
  "contract award",
  "JADC2",
  "autonomous weapons",
];

const state = {
  articles: [],
  serverArticles: [],
  customArticles: [],
  filter: "all",
  query: "",
  bookmarks: loadSet(STORAGE.bookmarks),
  disabledSources: loadSet(STORAGE.disabledSources),
  priorityTerms: loadPriorityTerms(),
  customSources: loadCustomSources(),
};

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}
function loadPriorityTerms() {
  try {
    const raw = localStorage.getItem(STORAGE.priorityTerms);
    if (!raw) return [...DEFAULT_PRIORITY_TERMS];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : [...DEFAULT_PRIORITY_TERMS];
  } catch { return [...DEFAULT_PRIORITY_TERMS]; }
}
function savePriorityTerms(terms) {
  localStorage.setItem(STORAGE.priorityTerms, JSON.stringify(terms));
}

const el = {
  feed: document.getElementById("feed"),
  status: document.getElementById("status"),
  updated: document.getElementById("updated"),
  search: document.getElementById("search"),
  refresh: document.getElementById("refresh"),
  chips: document.querySelectorAll(".chip"),
  toast: document.getElementById("toast"),
  settingsBtn: document.getElementById("settings-btn"),
  sheet: document.getElementById("sheet"),
  saveExit: document.getElementById("save-exit"),
  notifToggle: document.getElementById("notif-toggle"),
  notifStatus: document.getElementById("notif-status"),
  priorityInput: document.getElementById("priority-input"),
  priorityReset: document.getElementById("priority-reset"),
  sourcesList: document.getElementById("sources-list"),
  bookmarkCount: document.getElementById("bookmark-count"),
  bookmarksClear: document.getElementById("bookmarks-clear"),
  metaUpdated: document.getElementById("meta-updated"),
  metaCount: document.getElementById("meta-count"),
  csName: document.getElementById("cs-name"),
  csUrl: document.getElementById("cs-url"),
  csCategory: document.getElementById("cs-category"),
  csRequireDod: document.getElementById("cs-require-dod"),
  csAdd: document.getElementById("cs-add"),
  csStatus: document.getElementById("cs-status"),
  customSourcesList: document.getElementById("custom-sources-list"),
};

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function escapeHtml(s = "") {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s = "") { return escapeHtml(s); }

function isPriority(article) {
  const terms = state.priorityTerms;
  if (!terms.length) return false;
  const hay = (article.title + " " + (article.summary || "")).toLowerCase();
  return terms.some((t) => t && hay.includes(t.toLowerCase()));
}

function matchesFilter(article) {
  if (state.disabledSources.has(article.source)) return false;
  if (state.filter === "saved") {
    if (!state.bookmarks.has(article.link)) return false;
  } else if (state.filter === "priority") {
    if (!isPriority(article)) return false;
  } else if (state.filter !== "all") {
    if (article.category !== state.filter) return false;
  }
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = (article.title + " " + (article.summary || "")).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderSkeletons(n = 6) {
  el.feed.innerHTML = Array.from({ length: n })
    .map(() => '<div class="skeleton"></div>')
    .join("");
}

function cardHTML(a) {
  const priority = isPriority(a);
  const saved = state.bookmarks.has(a.link);
  const tags = (a.tags || [])
    .slice(0, 4)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  return `
    <article class="card ${priority ? "priority" : ""}">
      <button class="bookmark-btn ${saved ? "on" : ""}"
              data-link="${escapeAttr(a.link)}"
              aria-label="${saved ? "Remove bookmark" : "Bookmark"}"
              title="${saved ? "Saved" : "Save"}">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="${saved
            ? "M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.5l7.1-.6z"
            : "M12 4.2l2.2 5.2.4 1 1.1.1 5.5.4-4.2 3.6-.8.7.2 1 1.2 5.4-4.8-2.9-.9-.5-.9.5-4.8 2.9 1.2-5.4.2-1-.8-.7-4.2-3.6 5.5-.4 1.1-.1.4-1L12 4.2M12 2L9.1 8.9 2 9.5l5.4 4.7-1.6 7L12 17.4l6.2 3.8-1.6-7L22 9.5l-7.1-.6L12 2z"}"/>
        </svg>
      </button>
      <div class="meta">
        <span class="source">${escapeHtml(a.source)}</span>
        <span>${fmtTime(a.published)}</span>
        ${priority ? '<span class="priority-badge">⚡ Priority</span>' : ""}
      </div>
      <a href="${escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
        <h2>${escapeHtml(a.title)}</h2>
        ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ""}
      </a>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </article>
  `;
}

function render() {
  const items = state.articles.filter(matchesFilter);
  if (!items.length) {
    const msg = state.filter === "saved"
      ? "No bookmarks yet. Tap the ☆ on any story to save it."
      : "No matching stories yet.";
    el.feed.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  el.feed.innerHTML = items.map(cardHTML).join("");
  el.feed.querySelectorAll(".bookmark-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const link = btn.dataset.link;
      if (!link) return;
      if (state.bookmarks.has(link)) state.bookmarks.delete(link);
      else state.bookmarks.add(link);
      saveSet(STORAGE.bookmarks, state.bookmarks);
      updateSheetCounts();
      render();
    });
  });
}

let toastTimer = null;
function showToast(msg, ms = 3500) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

async function checkNewArticlesAndNotify() {
  const lastSeen = loadSet(STORAGE.lastSeenLinks);
  const isFirstVisit = lastSeen.size === 0;
  const newItems = state.articles.filter((a) => a.link && !lastSeen.has(a.link));
  const nextSeen = new Set(state.articles.map((a) => a.link).filter(Boolean));
  saveSet(STORAGE.lastSeenLinks, nextSeen);
  if (isFirstVisit || newItems.length === 0) return;

  showToast(`${newItems.length} new stor${newItems.length === 1 ? "y" : "ies"} since your last visit`);

  if (localStorage.getItem(STORAGE.notifOptIn) !== "1") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;

  const priorityNew = newItems.filter(isPriority);
  if (!priorityNew.length) return;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const top = priorityNew.slice(0, 3);
    const body = top.map((a) => `• ${a.source}: ${a.title}`).join("\n").slice(0, 240);
    await reg.showNotification("DoD AI News — Priority", {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "dodai-priority",
      renotify: true,
      data: { url: location.href },
    });
  } catch {}
}

// ---------------- Custom (client-side) sources ----------------

function stripHtmlClient(s) {
  if (!s) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = s;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

function parseFeedXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const nodes = Array.from(doc.querySelectorAll("item, entry"));
  return nodes.map((n) => {
    const pick = (sel) => n.querySelector(sel)?.textContent?.trim() || "";
    let link = pick("link");
    if (!link) {
      const l = n.querySelector("link[href]");
      if (l) link = l.getAttribute("href");
    }
    const description =
      pick("description") ||
      n.querySelector("content\\:encoded, encoded")?.textContent?.trim() ||
      pick("summary") ||
      pick("content") ||
      "";
    const pubDate =
      pick("pubDate") ||
      pick("published") ||
      pick("updated") ||
      n.querySelector("dc\\:date, date")?.textContent?.trim() ||
      "";
    return {
      title: stripHtmlClient(pick("title")),
      link,
      description: stripHtmlClient(description),
      pubDate,
    };
  });
}

function matchesAIClient(text) {
  return AI_TERMS_CLIENT.some((re) => re.test(text));
}
function matchesDefenseClient(text) {
  return DEFENSE_TERMS_CLIENT.some((re) => re.test(text));
}
function deriveTagsClient(text) {
  const tags = new Set();
  for (const [re, tag] of AI_TAG_MAP) if (re.test(text)) tags.add(tag);
  return Array.from(tags).slice(0, 5);
}

async function fetchCustomSource(src) {
  const proxied = CORS_PROXY + encodeURIComponent(src.url);
  const res = await fetch(proxied, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseFeedXML(xml);
  const out = [];
  for (const it of items) {
    if (!it.title || !it.link) continue;
    const text = `${it.title} ${it.description}`;
    if (!matchesAIClient(text)) continue;
    if (src.requireDod && !matchesDefenseClient(text)) continue;
    const published = new Date(it.pubDate || Date.now());
    out.push({
      title: it.title,
      summary: (it.description || "").slice(0, 320),
      link: it.link,
      source: src.name,
      category: src.category || "industry",
      published: isNaN(published) ? new Date().toISOString() : published.toISOString(),
      tags: deriveTagsClient(text),
      _custom: true,
    });
  }
  return out;
}

async function loadCustomArticles() {
  const sources = state.customSources;
  if (!sources.length) { state.customArticles = []; return; }
  const results = await Promise.all(
    sources.map((s) =>
      fetchCustomSource(s).catch((e) => {
        console.warn(`Custom source "${s.name}" failed:`, e.message);
        return [];
      })
    )
  );
  state.customArticles = results.flat();
}

function mergeAndSortArticles() {
  const seen = new Set();
  const all = [];
  for (const a of [...state.serverArticles, ...state.customArticles]) {
    const key = (a.link || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(a);
  }
  all.sort((a, b) => new Date(b.published) - new Date(a.published));
  state.articles = all;
}

async function loadFeed({ force = false, notify = true } = {}) {
  el.refresh.classList.add("spin");
  el.status.textContent = "Loading…";
  try {
    const url = force ? `${FEED_URL}?t=${Date.now()}` : FEED_URL;
    const res = await fetch(url, { cache: force ? "no-cache" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.serverArticles = data.articles || [];
    try { localStorage.setItem(STORAGE.feed, JSON.stringify(data)); } catch {}
    const updatedStr = data.generatedAt ? `Updated ${fmtTime(data.generatedAt)}` : "";
    el.updated.textContent = updatedStr;
    el.metaUpdated.textContent = data.generatedAt
      ? new Date(data.generatedAt).toLocaleString()
      : "—";
    await loadCustomArticles();
    mergeAndSortArticles();
    el.metaCount.textContent = String(state.articles.length);
    el.status.textContent = `${state.articles.length} stories`;
    rebuildSourcesList();
    if (notify) checkNewArticlesAndNotify();
  } catch {
    const cached = localStorage.getItem(STORAGE.feed);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        state.serverArticles = data.articles || [];
        mergeAndSortArticles();
        el.status.textContent = "Offline — showing cached";
        rebuildSourcesList();
      } catch { el.status.textContent = "Failed to load feed"; }
    } else {
      el.status.textContent = "Failed to load feed";
    }
  } finally {
    el.refresh.classList.remove("spin");
    render();
  }
}

// ---------------- Settings sheet ----------------

function openSheet() {
  el.sheet.hidden = false;
  el.sheet.setAttribute("aria-hidden", "false");
  updateNotifUI();
  el.priorityInput.value = state.priorityTerms.join(", ");
  rebuildSourcesList();
  rebuildCustomSourcesList();
  updateSheetCounts();
  document.body.style.overflow = "hidden";
}

function rebuildCustomSourcesList() {
  if (!state.customSources.length) {
    el.customSourcesList.innerHTML =
      '<div class="sheet-note">No custom sources yet.</div>';
    return;
  }
  el.customSourcesList.innerHTML = state.customSources
    .map((s, i) => `
      <label>
        <span>${escapeHtml(s.name)}</span>
        <span class="count">${escapeHtml(s.category)}${s.requireDod ? " · +DoD" : ""}</span>
        <button type="button" class="remove" data-idx="${i}" aria-label="Remove ${escapeHtml(s.name)}">Remove</button>
      </label>
    `)
    .join("");
  el.customSourcesList.querySelectorAll("button.remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(btn.dataset.idx);
      const removed = state.customSources.splice(idx, 1)[0];
      saveCustomSources(state.customSources);
      rebuildCustomSourcesList();
      if (removed) {
        state.customArticles = state.customArticles.filter((a) => a.source !== removed.name);
        mergeAndSortArticles();
        rebuildSourcesList();
        render();
        showToast(`Removed ${removed.name}`);
      }
    });
  });
}

async function addCustomSource() {
  const name = el.csName.value.trim();
  const url = el.csUrl.value.trim();
  const category = el.csCategory.value;
  const requireDod = el.csRequireDod.checked;

  if (!name || !url) {
    el.csStatus.textContent = "Name and URL are both required.";
    return;
  }
  try { new URL(url); }
  catch { el.csStatus.textContent = "That URL doesn't look valid."; return; }
  if (state.customSources.some((s) => s.name === name)) {
    el.csStatus.textContent = "A source with that name already exists.";
    return;
  }

  const src = { name, url, category, requireDod };
  el.csStatus.textContent = "Testing feed…";
  el.csAdd.disabled = true;

  try {
    const items = await fetchCustomSource(src);
    state.customSources.push(src);
    saveCustomSources(state.customSources);
    state.customArticles = state.customArticles.concat(items);
    mergeAndSortArticles();
    rebuildSourcesList();
    rebuildCustomSourcesList();
    render();
    el.csName.value = "";
    el.csUrl.value = "";
    el.csRequireDod.checked = false;
    el.csStatus.textContent =
      items.length > 0
        ? `Added — ${items.length} matching stor${items.length === 1 ? "y" : "ies"}.`
        : "Added — no matching stories right now (AI-keyword filter).";
  } catch (e) {
    el.csStatus.textContent = `Couldn't fetch feed: ${e.message}. Check the URL or CORS.`;
  } finally {
    el.csAdd.disabled = false;
  }
}
function closeSheet() {
  el.sheet.hidden = true;
  el.sheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function updateSheetCounts() {
  el.bookmarkCount.textContent = String(state.bookmarks.size);
}

function rebuildSourcesList() {
  const sources = Array.from(
    state.articles.reduce((m, a) => {
      m.set(a.source, (m.get(a.source) || 0) + 1);
      return m;
    }, new Map())
  ).sort((a, b) => a[0].localeCompare(b[0]));

  if (!sources.length) {
    el.sourcesList.innerHTML = '<div class="sheet-note">No sources loaded yet.</div>';
    return;
  }

  el.sourcesList.innerHTML = sources
    .map(([name, count]) => {
      const on = !state.disabledSources.has(name);
      return `
        <label>
          <input type="checkbox" data-source="${escapeAttr(name)}" ${on ? "checked" : ""} />
          <span>${escapeHtml(name)}</span>
          <span class="count">${count}</span>
        </label>
      `;
    })
    .join("");

  el.sourcesList.querySelectorAll("input[data-source]").forEach((input) => {
    input.addEventListener("change", () => {
      const name = input.dataset.source;
      if (input.checked) state.disabledSources.delete(name);
      else state.disabledSources.add(name);
      saveSet(STORAGE.disabledSources, state.disabledSources);
      render();
    });
  });
}

function updateNotifUI() {
  const supported =
    typeof Notification !== "undefined" && "serviceWorker" in navigator;
  const optedIn = localStorage.getItem(STORAGE.notifOptIn) === "1";
  el.notifToggle.checked = supported && optedIn && Notification.permission === "granted";
  el.notifToggle.disabled = !supported;

  if (!supported) {
    el.notifStatus.textContent = "Notifications aren't supported in this browser.";
  } else if (!isStandalone() && /iP(hone|ad|od)/.test(navigator.userAgent)) {
    el.notifStatus.textContent = "On iOS, add this app to your Home Screen first, then open it from there.";
  } else if (Notification.permission === "denied") {
    el.notifStatus.textContent = "Notifications are blocked. Enable them for this site in your browser settings.";
  } else if (el.notifToggle.checked) {
    el.notifStatus.textContent = "You'll get a notification when new priority stories arrive.";
  } else {
    el.notifStatus.textContent = "";
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

async function onNotifToggle() {
  if (!el.notifToggle.checked) {
    localStorage.setItem(STORAGE.notifOptIn, "0");
    updateNotifUI();
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      localStorage.setItem(STORAGE.notifOptIn, "1");
    } else {
      el.notifToggle.checked = false;
      localStorage.setItem(STORAGE.notifOptIn, "0");
    }
  } catch {
    el.notifToggle.checked = false;
  }
  updateNotifUI();
}

function onPriorityChange() {
  const terms = el.priorityInput.value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  state.priorityTerms = terms;
  savePriorityTerms(terms);
  render();
}

// ---------------- Events ----------------

el.refresh.addEventListener("click", () => loadFeed({ force: true }));
el.search.addEventListener("input", (e) => {
  state.query = e.target.value.trim();
  render();
});
el.chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    el.chips.forEach((c) => c.classList.remove("active"));
    el.chips.forEach((c) => c.setAttribute("aria-selected", "false"));
    chip.classList.add("active");
    chip.setAttribute("aria-selected", "true");
    state.filter = chip.dataset.filter;
    render();
  });
});

el.settingsBtn.addEventListener("click", openSheet);
el.sheet.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeSheet();
});
// Defensive: bind close directly on every [data-close] element too, in case
// the delegated handler misses (e.g. odd event targets on iOS).
el.sheet.querySelectorAll("[data-close]").forEach((node) => {
  node.addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.sheet.hidden) closeSheet();
});

el.notifToggle.addEventListener("change", onNotifToggle);
el.priorityInput.addEventListener("change", onPriorityChange);
el.priorityInput.addEventListener("blur", onPriorityChange);
el.priorityReset.addEventListener("click", () => {
  state.priorityTerms = [...DEFAULT_PRIORITY_TERMS];
  savePriorityTerms(state.priorityTerms);
  el.priorityInput.value = state.priorityTerms.join(", ");
  render();
});
el.saveExit.addEventListener("click", () => {
  // Commit any pending edits in the priority textarea before closing.
  onPriorityChange();
  closeSheet();
  showToast("Settings saved");
});
el.csAdd.addEventListener("click", (e) => { e.preventDefault(); addCustomSource(); });
el.bookmarksClear.addEventListener("click", () => {
  if (!state.bookmarks.size) return;
  if (!confirm("Remove all saved stories?")) return;
  state.bookmarks.clear();
  saveSet(STORAGE.bookmarks, state.bookmarks);
  updateSheetCounts();
  render();
});

// Pull-to-refresh
let touchStartY = 0;
let pulling = false;
window.addEventListener("touchstart", (e) => {
  if (window.scrollY === 0) {
    touchStartY = e.touches[0].clientY;
    pulling = true;
  }
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (pulling) {
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dy > 70) loadFeed({ force: true });
  }
  pulling = false;
}, { passive: true });

// Refresh when the app regains focus
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadFeed({ force: false });
});

renderSkeletons();
loadFeed();

if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  const activateWaiting = (reg) => {
    if (!reg) return;
    if (reg.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage("skipWaiting");
    }
  };

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      activateWaiting(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            nw.postMessage("skipWaiting");
          }
        });
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          reg.update().then(() => activateWaiting(reg)).catch(() => {});
        }
      });
    } catch {}
  });
}
