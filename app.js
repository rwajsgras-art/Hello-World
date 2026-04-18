const FEED_URL = "feed.json";
const CACHE_KEY = "dodai:feed:v1";

const state = {
  articles: [],
  filter: "all",
  query: "",
};

const el = {
  feed: document.getElementById("feed"),
  status: document.getElementById("status"),
  updated: document.getElementById("updated"),
  search: document.getElementById("search"),
  refresh: document.getElementById("refresh"),
  chips: document.querySelectorAll(".chip"),
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

function renderSkeletons(n = 6) {
  el.feed.innerHTML = Array.from({ length: n })
    .map(() => '<div class="skeleton"></div>')
    .join("");
}

function matchesFilter(article) {
  if (state.filter !== "all" && article.category !== state.filter) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = (article.title + " " + (article.summary || "")).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function render() {
  const items = state.articles.filter(matchesFilter);
  if (!items.length) {
    el.feed.innerHTML = `<div class="empty">No matching stories yet.<br/><small>Try a different filter or check back soon.</small></div>`;
    return;
  }
  el.feed.innerHTML = items
    .map((a) => {
      const tags = (a.tags || [])
        .slice(0, 4)
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("");
      return `
        <a class="card" href="${escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
          <div class="meta">
            <span class="source">${escapeHtml(a.source)}</span>
            <span>${fmtTime(a.published)}</span>
          </div>
          <h2>${escapeHtml(a.title)}</h2>
          ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ""}
          ${tags ? `<div class="tags">${tags}</div>` : ""}
        </a>
      `;
    })
    .join("");
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

async function loadFeed({ force = false } = {}) {
  el.refresh.classList.add("spin");
  el.status.textContent = "Loading…";
  try {
    const url = force ? `${FEED_URL}?t=${Date.now()}` : FEED_URL;
    const res = await fetch(url, { cache: force ? "no-cache" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.articles = (data.articles || []).sort(
      (a, b) => new Date(b.published) - new Date(a.published)
    );
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    el.updated.textContent = data.generatedAt
      ? `Updated ${fmtTime(data.generatedAt)}`
      : "";
    el.status.textContent = `${state.articles.length} stories`;
  } catch (err) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        state.articles = (data.articles || []).sort(
          (a, b) => new Date(b.published) - new Date(a.published)
        );
        el.status.textContent = "Offline — showing cached";
      } catch {
        el.status.textContent = "Failed to load feed";
      }
    } else {
      el.status.textContent = "Failed to load feed";
    }
  } finally {
    el.refresh.classList.remove("spin");
    render();
  }
}

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

renderSkeletons();
loadFeed();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
