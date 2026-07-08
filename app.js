const FEED_URL = "feed.json";

const STORAGE = {
  feed: "dodai:feed:v1",
  lastSeenLinks: "dodai:lastSeen:v1",
  bookmarks: "dodai:bookmarks:v1",
  disabledSources: "dodai:disabledSources:v1",
  notifOptIn: "dodai:notif:v1",
  priorityTerms: "dodai:priorityTerms:v1",
  customSources: "dodai:customSources:v1",
  customHealth: "dodai:customHealth:v1",
  activeTab: "dodai:activeTab:v1",
  youtube: "dodai:youtube:v1",
  xaccounts: "dodai:xaccounts:v1",
  savedSearches: "dodai:savedSearches:v1",
  opps: "dodai:opps:v1",
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

function loadSavedSearches() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE.savedSearches) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveSavedSearches(list) {
  localStorage.setItem(STORAGE.savedSearches, JSON.stringify(list));
}
function matchesSavedSearch(article, terms) {
  if (!terms || !terms.length) return false;
  const hay = (article.title + " " + (article.summary || "")).toLowerCase();
  return terms.some((t) => t && hay.includes(t.toLowerCase()));
}

async function fireSavedSearchNotifications(newItems) {
  if (localStorage.getItem(STORAGE.notifOptIn) !== "1") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  const list = (state.savedSearches || []).filter((s) => s.notify);
  if (!list.length) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  for (const s of list) {
    const hits = newItems.filter((a) => matchesSavedSearch(a, s.terms));
    if (!hits.length) continue;
    const body = hits
      .slice(0, 3)
      .map((a) => `• ${a.source}: ${a.title}`)
      .join("\n")
      .slice(0, 240);
    try {
      await reg.showNotification(`DoD AI News — ${s.name}`, {
        body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: `dodai-search-${s.id}`,
        renotify: true,
        data: { url: location.href, savedSearchId: s.id },
      });
    } catch {}
  }
}

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
  videos: [],
  xAccounts: [],
  xNote: "",
  opps: [],
  oppsPortals: [],
  oppsNote: "",
  activeTab: localStorage.getItem(STORAGE.activeTab) || "news",
  filter: "all",
  tag: null,
  query: "",
  meta: null,
  bookmarks: loadSet(STORAGE.bookmarks),
  disabledSources: loadSet(STORAGE.disabledSources),
  priorityTerms: loadPriorityTerms(),
  customSources: loadCustomSources(),
  customHealth: loadCustomHealth(),
  savedSearches: loadSavedSearches(),
};

function loadCustomHealth() {
  try { return JSON.parse(localStorage.getItem(STORAGE.customHealth) || "{}") || {}; }
  catch { return {}; }
}
function saveCustomHealth() {
  localStorage.setItem(STORAGE.customHealth, JSON.stringify(state.customHealth));
}
function recordCustomHealth(name, patch) {
  const prev = state.customHealth[name] || {};
  state.customHealth[name] = { ...prev, ...patch, lastAttempt: new Date().toISOString() };
  saveCustomHealth();
}

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
  topics: document.getElementById("topics"),
  healthList: document.getElementById("health-list"),
  tabs: document.querySelectorAll(".tab"),
  youtubeMain: document.getElementById("youtube"),
  xMain: document.getElementById("xfeed"),
  oppsMain: document.getElementById("opps"),
  filtersRow: document.querySelector(".filters"),
  searchWrap: document.querySelector(".search-wrap"),
  savedSearchesRow: document.getElementById("saved-searches-row"),
  ssName: document.getElementById("ss-name"),
  ssTerms: document.getElementById("ss-terms"),
  ssNotify: document.getElementById("ss-notify"),
  ssAdd: document.getElementById("ss-add"),
  ssStatus: document.getElementById("ss-status"),
  ssList: document.getElementById("saved-searches-list"),
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
  } else if (typeof state.filter === "string" && state.filter.startsWith("search:")) {
    const id = state.filter.slice("search:".length);
    const s = (state.savedSearches || []).find((x) => x.id === id);
    if (!s || !matchesSavedSearch(article, s.terms)) return false;
  } else if (state.filter !== "all") {
    if (article.category !== state.filter) return false;
  }
  if (state.tag) {
    if (!Array.isArray(article.tags) || !article.tags.includes(state.tag)) return false;
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
    .map((t) => `<button type="button" class="tag ${state.tag === t ? "active" : ""}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`)
    .join("");
  return `
    <article class="card ${priority ? "priority" : ""}">
      <div class="card-actions">
        <button class="card-action-btn share-btn"
                data-link="${escapeAttr(a.link)}"
                data-title="${escapeAttr(a.title)}"
                data-source="${escapeAttr(a.source)}"
                aria-label="Share" title="Share">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4L12 2zM5 12H3v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9h-2v8H5v-8z"/>
          </svg>
        </button>
        <button class="card-action-btn bookmark-btn ${saved ? "on" : ""}"
                data-link="${escapeAttr(a.link)}"
                aria-label="${saved ? "Remove bookmark" : "Bookmark"}"
                title="${saved ? "Saved" : "Save"}">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="${saved
              ? "M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.5l7.1-.6z"
              : "M12 4.2l2.2 5.2.4 1 1.1.1 5.5.4-4.2 3.6-.8.7.2 1 1.2 5.4-4.8-2.9-.9-.5-.9.5-4.8 2.9 1.2-5.4.2-1-.8-.7-4.2-3.6 5.5-.4 1.1-.1.4-1L12 4.2M12 2L9.1 8.9 2 9.5l5.4 4.7-1.6 7L12 17.4l6.2 3.8-1.6-7L22 9.5l-7.1-.6L12 2z"}"/>
          </svg>
        </button>
      </div>
      <div class="meta">
        <span class="source">${escapeHtml(a.source)}</span>
        <span>${fmtTime(a.published)}</span>
        ${priority ? '<span class="priority-badge">⚡ Priority</span>' : ""}
      </div>
      <a href="${escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
        <h2>${escapeHtml(a.title)}</h2>
        ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ""}
      </a>
      ${a.tldr || (a.whyItMatters && a.whyItMatters.length)
        ? `
        <div class="tldr-block">
          ${a.tldr ? `<div class="tldr-label">TL;DR</div><div class="tldr">${escapeHtml(a.tldr)}</div>` : ""}
          ${a.whyItMatters && a.whyItMatters.length
            ? `<div class="tldr-label" style="margin-top:6px">Why it matters</div>
               <ul class="why-list">${a.whyItMatters.slice(0, 2).map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
            : ""}
        </div>`
        : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </article>
  `;
}

async function shareArticle({ title, link, source }) {
  const text = `${source}: ${title}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: link });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast("Link copied");
  } catch {
    showToast(link);
  }
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
  el.feed.querySelectorAll(".share-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shareArticle({
        title: btn.dataset.title,
        link: btn.dataset.link,
        source: btn.dataset.source,
      });
    });
  });
  el.feed.querySelectorAll(".tag[data-tag]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = btn.dataset.tag;
      state.tag = state.tag === tag ? null : tag;
      renderTopics();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderTopics() {
  const counts = new Map();
  for (const a of state.articles) {
    if (state.disabledSources.has(a.source)) continue;
    for (const t of a.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (state.tag && !counts.has(state.tag)) counts.set(state.tag, 0);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) { el.topics.hidden = true; el.topics.innerHTML = ""; return; }
  el.topics.hidden = false;
  const chips = top.map(([t, n]) => {
    const active = state.tag === t;
    return `<button class="topic-chip ${active ? "active" : ""}" data-topic="${escapeAttr(t)}">
      ${escapeHtml(t)} <span style="opacity:.6">${n}</span>${active ? '<span class="x">✕</span>' : ""}
    </button>`;
  });
  el.topics.innerHTML = chips.join("");
  el.topics.querySelectorAll(".topic-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const t = chip.dataset.topic;
      state.tag = state.tag === t ? null : t;
      renderTopics();
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

  const newPriority = newItems.filter(isPriority);

  // App-icon badge: unread priority count. Works on installed PWAs on
  // macOS Dock, Chrome, iOS 16.4+. No-op elsewhere.
  if (newPriority.length && typeof navigator.setAppBadge === "function") {
    navigator.setAppBadge(newPriority.length).catch(() => {});
  }

  // Saved-search notifications (independent of priority).
  await fireSavedSearchNotifications(newItems);

  if (localStorage.getItem(STORAGE.notifOptIn) !== "1") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;

  const priorityNew = newPriority;
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
  let res;
  try {
    res = await fetch(proxied, { cache: "no-cache" });
  } catch (e) {
    recordCustomHealth(src.name, { ok: false, error: e.message || "network error", parsed: 0, kept: 0 });
    throw e;
  }
  if (!res.ok) {
    recordCustomHealth(src.name, { ok: false, error: `HTTP ${res.status}`, parsed: 0, kept: 0 });
    throw new Error(`HTTP ${res.status}`);
  }
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
  recordCustomHealth(src.name, {
    ok: true,
    error: null,
    parsed: items.length,
    kept: out.length,
    lastSuccess: new Date().toISOString(),
  });
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

async function fetchFeedMeta(force = false) {
  const url = force ? `feed-meta.json?t=${Date.now()}` : "feed-meta.json";
  const res = await fetch(url, { cache: force ? "no-cache" : "default" });
  if (!res.ok) return;
  state.meta = await res.json();
}

function renderHealthList() {
  if (!el.healthList) return;
  const rows = [];
  const fmt = (iso) => (iso ? fmtTime(iso) : "never");

  if (state.meta && Array.isArray(state.meta.sources)) {
    for (const s of state.meta.sources) {
      const status = s.ok ? "ok" : (s.lastSuccess ? "stale" : "fail");
      rows.push({
        kind: "server",
        name: s.name,
        url: s.url,
        ok: s.ok,
        status,
        kept: s.kept || 0,
        parsed: s.parsed || 0,
        error: s.error,
        lastSuccess: s.lastSuccess,
        lastAttempt: s.lastAttempt,
      });
    }
  }
  for (const cs of state.customSources) {
    const h = state.customHealth[cs.name] || {};
    const status = h.ok ? "ok" : (h.lastSuccess ? "stale" : (h.lastAttempt ? "fail" : "stale"));
    rows.push({
      kind: "custom",
      name: cs.name + " (custom)",
      url: cs.url,
      ok: !!h.ok,
      status,
      kept: h.kept || 0,
      parsed: h.parsed || 0,
      error: h.error,
      lastSuccess: h.lastSuccess,
      lastAttempt: h.lastAttempt,
    });
  }

  if (!rows.length) {
    el.healthList.innerHTML = '<div class="sheet-note">Source health appears here after the next refresh.</div>';
    return;
  }

  rows.sort((a, b) => {
    const order = (s) => (s === "fail" ? 0 : s === "stale" ? 1 : 2);
    return order(a.status) - order(b.status) || a.name.localeCompare(b.name);
  });

  el.healthList.innerHTML = rows
    .map((r) => {
      const sub = r.ok
        ? `${r.kept} kept of ${r.parsed} · ok ${fmt(r.lastSuccess)}`
        : r.error
          ? `${r.error} · last ok ${fmt(r.lastSuccess)}`
          : `last ok ${fmt(r.lastSuccess)}`;
      return `
        <button type="button" class="health-row" data-url="${escapeAttr(r.url || "")}">
          <span class="health-dot ${r.status}" aria-hidden="true"></span>
          <span>
            <div class="health-name">${escapeHtml(r.name)}</div>
            <div class="health-meta">${escapeHtml(sub)}</div>
          </span>
          <span class="health-count">${r.kept || 0}</span>
        </button>
      `;
    })
    .join("");

  el.healthList.querySelectorAll(".health-row").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        showToast("URL copied");
      } catch { showToast(url); }
    });
  });
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
    fetchFeedMeta(force).catch(() => {});
    await loadCustomArticles();
    mergeAndSortArticles();
    el.metaCount.textContent = String(state.articles.length);
    el.status.textContent = `${state.articles.length} stories`;
    rebuildSourcesList();
    renderTopics();
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
        renderTopics();
      } catch { el.status.textContent = "Failed to load feed"; }
    } else {
      el.status.textContent = "Failed to load feed";
    }
  } finally {
    el.refresh.classList.remove("spin");
    render();
  }
}

// ---------------- Tabs (News / YouTube / X / Opps) ----------------

function setActiveTab(tab) {
  state.activeTab = tab;
  localStorage.setItem(STORAGE.activeTab, tab);
  el.tabs.forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  // News-only chrome
  const newsActive = tab === "news";
  if (el.filtersRow) el.filtersRow.hidden = !newsActive;
  if (el.savedSearchesRow) {
    el.savedSearchesRow.hidden = !newsActive || !(state.savedSearches || []).length;
  }
  if (el.topics) el.topics.hidden = !newsActive || !el.topics.children.length;
  if (el.searchWrap) el.searchWrap.hidden = !newsActive;
  el.feed.hidden = !newsActive;
  el.youtubeMain.hidden = tab !== "youtube";
  el.xMain.hidden = tab !== "x";
  if (el.oppsMain) el.oppsMain.hidden = tab !== "opps";
  if (tab === "youtube") renderYouTube();
  else if (tab === "x") renderX();
  else if (tab === "opps") renderOpps();
}

async function loadOpps({ force = false } = {}) {
  try {
    const url = force ? `opps.json?t=${Date.now()}` : "opps.json";
    const res = await fetch(url, { cache: force ? "no-cache" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.opps = Array.isArray(data.live) ? data.live : [];
    state.oppsPortals = Array.isArray(data.portals) ? data.portals : [];
    state.oppsNote = data.note || "";
    try { localStorage.setItem(STORAGE.opps, JSON.stringify(data)); } catch {}
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE.opps) || "null");
      state.opps = cached?.live || [];
      state.oppsPortals = cached?.portals || [];
      state.oppsNote = cached?.note || "";
    } catch {
      state.opps = []; state.oppsPortals = []; state.oppsNote = "";
    }
  }
}

function fmtDaysLeft(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return "";
  const d = Math.round(ms / (24 * 3600 * 1000));
  if (d < 0) return "Closed";
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

function renderOpps() {
  const parts = [];
  if (state.oppsNote) {
    parts.push(`<div class="x-banner">${escapeHtml(state.oppsNote)}</div>`);
  }
  if (state.opps.length) {
    parts.push('<div class="opps-section-title">Open opportunities</div>');
    parts.push(
      state.opps
        .map((o) => {
          const deadline = fmtDaysLeft(o.deadline);
          const tags = (o.tags || [])
            .slice(0, 4)
            .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
            .join("");
          return `
            <a class="opp-card" href="${escapeAttr(o.url)}" target="_blank" rel="noopener noreferrer">
              <div class="opp-meta">
                <span class="opp-agency">${escapeHtml(o.agency || "Agency")}</span>
                ${deadline ? `<span class="opp-deadline">${escapeHtml(deadline)}</span>` : ""}
                <span>${fmtTime(o.postedAt || o.published)}</span>
              </div>
              <h2>${escapeHtml(o.title)}</h2>
              ${o.summary ? `<p>${escapeHtml(o.summary)}</p>` : ""}
              ${tags ? `<div class="tags">${tags}</div>` : ""}
            </a>
          `;
        })
        .join("")
    );
  }
  parts.push('<div class="opps-section-title">Portals</div>');
  parts.push(
    state.oppsPortals
      .map(
        (p) => `
          <a class="opp-portal" href="${escapeAttr(p.url)}" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="name">${escapeHtml(p.name)}</div>
              ${p.focus ? `<div class="focus">${escapeHtml(p.focus)}</div>` : ""}
            </div>
            <span class="go">Open</span>
          </a>
        `
      )
      .join("")
  );
  if (!state.opps.length && !state.oppsPortals.length) {
    parts.push('<div class="empty">No opportunities yet.<br/><small>Set SAM_API_KEY to enable SAM.gov search.</small></div>');
  }
  el.oppsMain.innerHTML = parts.join("");
}

async function loadYouTube({ force = false } = {}) {
  try {
    const url = force ? `youtube.json?t=${Date.now()}` : "youtube.json";
    const res = await fetch(url, { cache: force ? "no-cache" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.videos = Array.isArray(data.videos) ? data.videos : [];
    try { localStorage.setItem(STORAGE.youtube, JSON.stringify(data)); } catch {}
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE.youtube) || "null");
      state.videos = cached?.videos || [];
    } catch { state.videos = []; }
  }
}

async function loadX({ force = false } = {}) {
  try {
    const url = force ? `x.json?t=${Date.now()}` : "x.json";
    const res = await fetch(url, { cache: force ? "no-cache" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.xAccounts = Array.isArray(data.accounts) ? data.accounts : [];
    state.xNote = data.note || "";
    try { localStorage.setItem(STORAGE.xaccounts, JSON.stringify(data)); } catch {}
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE.xaccounts) || "null");
      state.xAccounts = cached?.accounts || [];
      state.xNote = cached?.note || "";
    } catch { state.xAccounts = []; }
  }
}

function renderYouTube() {
  if (!state.videos.length) {
    el.youtubeMain.innerHTML =
      '<div class="empty">No videos yet.<br/><small>The next workflow run will populate this. ' +
      'Edit YOUTUBE_SOURCES in scripts/fetch-feeds.js to add channels.</small></div>';
    return;
  }
  el.youtubeMain.innerHTML = state.videos
    .map((v) => {
      const tags = (v.tags || [])
        .slice(0, 3)
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("");
      return `
        <a class="video-card" href="${escapeAttr(v.link)}" target="_blank" rel="noopener noreferrer">
          <div class="thumb-wrap">
            ${v.thumbnail ? `<img loading="lazy" src="${escapeAttr(v.thumbnail)}" alt="">` : ""}
            <div class="play-overlay">
              <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
                <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.55)"/>
                <path d="M26 20l20 12-20 12V20z" fill="#fff"/>
              </svg>
            </div>
          </div>
          <div class="video-body">
            <div class="meta">
              <span class="source">${escapeHtml(v.channel || v.source || "YouTube")}</span>
              <span>${fmtTime(v.published)}</span>
            </div>
            <h2>${escapeHtml(v.title)}</h2>
            ${tags ? `<div class="tags">${tags}</div>` : ""}
          </div>
        </a>
      `;
    })
    .join("");
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0] || "")[0] || "?").toUpperCase() +
         ((parts[1] || "")[0] || "").toUpperCase();
}

function renderX() {
  const banner = state.xNote
    ? `<div class="x-banner">${escapeHtml(state.xNote)}</div>`
    : "";
  if (!state.xAccounts.length) {
    el.xMain.innerHTML = banner + '<div class="empty">No accounts curated.</div>';
    return;
  }
  el.xMain.innerHTML = banner + state.xAccounts.map((a) => `
    <a class="x-card" href="${escapeAttr(a.url || `https://x.com/${a.handle}`)}" target="_blank" rel="noopener noreferrer">
      <div class="x-avatar" aria-hidden="true">${escapeHtml(initials(a.name || a.handle))}</div>
      <div class="x-meta">
        <div class="x-name">${escapeHtml(a.name || a.handle)}</div>
        <div class="x-handle">@${escapeHtml(a.handle)}</div>
        ${a.focus ? `<div class="x-focus">${escapeHtml(a.focus)}</div>` : ""}
      </div>
      <span class="x-go">Open</span>
    </a>
  `).join("");
}

// ---------------- Settings sheet ----------------

function openSheet() {
  el.sheet.hidden = false;
  el.sheet.setAttribute("aria-hidden", "false");
  updateNotifUI();
  el.priorityInput.value = state.priorityTerms.join(", ");
  rebuildSourcesList();
  rebuildCustomSourcesList();
  rebuildSavedSearchesList();
  renderHealthList();
  updateSheetCounts();
  document.body.style.overflow = "hidden";
}

function renderSavedSearchChips() {
  if (!el.savedSearchesRow) return;
  const list = state.savedSearches || [];
  if (!list.length) {
    el.savedSearchesRow.hidden = true;
    el.savedSearchesRow.innerHTML = "";
    return;
  }
  el.savedSearchesRow.hidden = state.activeTab !== "news";
  el.savedSearchesRow.innerHTML = list
    .map((s) => {
      const active = state.filter === `search:${s.id}`;
      const bell = s.notify ? '<span class="ss-notify">🔔</span>' : "";
      return `<button class="chip ${active ? "active" : ""}" data-search-id="${escapeAttr(s.id)}">${escapeHtml(s.name)}${bell}</button>`;
    })
    .join("");
  el.savedSearchesRow.querySelectorAll("[data-search-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.searchId;
      const filter = `search:${id}`;
      if (state.filter === filter) {
        state.filter = "all";
      } else {
        state.filter = filter;
      }
      // Clear category-chip active state; sync
      el.chips.forEach((c) => {
        const on = c.dataset.filter === state.filter;
        c.classList.toggle("active", on);
        c.setAttribute("aria-selected", on ? "true" : "false");
      });
      renderSavedSearchChips();
      render();
    });
  });
}

function rebuildSavedSearchesList() {
  if (!el.ssList) return;
  const list = state.savedSearches || [];
  if (!list.length) {
    el.ssList.innerHTML = '<div class="sheet-note">No saved searches yet.</div>';
    return;
  }
  el.ssList.innerHTML = list
    .map((s, i) => `
      <label>
        <span>${escapeHtml(s.name)}</span>
        <span class="count">${escapeHtml((s.terms || []).slice(0, 3).join(", "))}${(s.terms || []).length > 3 ? "…" : ""}</span>
        <input type="checkbox" data-ss-notify="${escapeAttr(s.id)}" ${s.notify ? "checked" : ""} title="Notify on hit" />
        <button type="button" class="remove" data-ss-remove="${escapeAttr(s.id)}" aria-label="Remove ${escapeHtml(s.name)}">Remove</button>
      </label>
    `)
    .join("");
  el.ssList.querySelectorAll("[data-ss-notify]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.ssNotify;
      const s = state.savedSearches.find((x) => x.id === id);
      if (!s) return;
      s.notify = cb.checked;
      saveSavedSearches(state.savedSearches);
      renderSavedSearchChips();
    });
  });
  el.ssList.querySelectorAll("[data-ss-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.dataset.ssRemove;
      state.savedSearches = state.savedSearches.filter((x) => x.id !== id);
      saveSavedSearches(state.savedSearches);
      rebuildSavedSearchesList();
      renderSavedSearchChips();
      if (state.filter === `search:${id}`) {
        state.filter = "all";
        render();
      }
    });
  });
}

async function addSavedSearch() {
  const name = (el.ssName.value || "").trim();
  const termsRaw = (el.ssTerms.value || "").trim();
  const notify = !!el.ssNotify.checked;
  if (!name || !termsRaw) {
    el.ssStatus.textContent = "Name and terms are both required.";
    return;
  }
  const terms = termsRaw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  if (!terms.length) {
    el.ssStatus.textContent = "At least one term is required.";
    return;
  }
  const id = "s" + Math.random().toString(36).slice(2, 8);
  state.savedSearches.push({ id, name, terms, notify });
  saveSavedSearches(state.savedSearches);
  el.ssName.value = "";
  el.ssTerms.value = "";
  el.ssNotify.checked = false;
  el.ssStatus.textContent = `Added "${name}".`;
  rebuildSavedSearchesList();
  renderSavedSearchChips();
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

el.tabs.forEach((t) => {
  t.addEventListener("click", () => setActiveTab(t.dataset.tab));
});
el.refresh.addEventListener("click", async () => {
  if (state.activeTab === "youtube") {
    await loadYouTube({ force: true });
    renderYouTube();
  } else if (state.activeTab === "x") {
    await loadX({ force: true });
    renderX();
  } else if (state.activeTab === "opps") {
    await loadOpps({ force: true });
    renderOpps();
  } else {
    loadFeed({ force: true });
  }
});
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
    // Clear the app-icon badge whenever the user opens Priority — they
    // now know about the new items.
    if (chip.dataset.filter === "priority" && typeof navigator.clearAppBadge === "function") {
      navigator.clearAppBadge().catch(() => {});
    }
    renderSavedSearchChips();
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
if (el.ssAdd) el.ssAdd.addEventListener("click", (e) => { e.preventDefault(); addSavedSearch(); });
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
renderSavedSearchChips();
setActiveTab(state.activeTab);
loadFeed();
Promise.all([loadYouTube(), loadX(), loadOpps()]).then(() => {
  if (state.activeTab === "youtube") renderYouTube();
  else if (state.activeTab === "x") renderX();
  else if (state.activeTab === "opps") renderOpps();
});

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
