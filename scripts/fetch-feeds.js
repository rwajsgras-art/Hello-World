#!/usr/bin/env node
// Fetches RSS/Atom feeds, filters for DoD + AI relevance, writes feed.json.
// Zero external dependencies. Requires Node 18+ (global fetch).

const fs = require("fs");
const path = require("path");

const SOURCES = [
  // Pentagon / OSD
  {
    name: "DoD News",
    url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945",
    category: "pentagon",
    alreadyDefense: true,
  },
  {
    name: "DoD Contracts",
    url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=800&Site=945",
    category: "pentagon",
    alreadyDefense: true,
  },
  // Services
  {
    name: "Air Force",
    url: "https://www.af.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=343",
    category: "services",
    alreadyDefense: true,
  },
  {
    name: "Army",
    url: "https://www.army.mil/rss/static/2.xml",
    category: "services",
    alreadyDefense: true,
  },
  {
    name: "Navy",
    url: "https://www.navy.mil/Press-Office/News-Stories/rss/",
    category: "services",
    alreadyDefense: true,
  },
  {
    name: "Space Force",
    url: "https://www.spaceforce.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=1060",
    category: "services",
    alreadyDefense: true,
  },
  // Research
  {
    name: "DARPA",
    url: "https://www.darpa.mil/news.xml",
    category: "research",
    alreadyDefense: true,
  },
  {
    name: "AFRL",
    url: "https://www.afrl.af.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=392",
    category: "research",
    alreadyDefense: true,
  },
  // Industry / Trade
  {
    name: "Breaking Defense",
    url: "https://breakingdefense.com/feed/",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "DefenseScoop",
    url: "https://defensescoop.com/feed/",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "Defense News",
    url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "C4ISRNET",
    url: "https://www.c4isrnet.com/arc/outboundfeeds/rss/?outputType=xml",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "Nextgov",
    url: "https://www.nextgov.com/rss/all/",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "FedScoop",
    url: "https://fedscoop.com/feed/",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "The War Zone",
    url: "https://www.twz.com/feed",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "Defense One",
    url: "https://www.defenseone.com/rss/all/",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "Air & Space Forces Magazine",
    url: "https://www.airandspaceforces.com/feed/",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "SpaceNews",
    url: "https://spacenews.com/feed/",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "Aviation Week",
    url: "https://aviationweek.com/rss.xml",
    category: "industry",
    alreadyDefense: false,
  },
  // Government oversight + reporting
  {
    name: "GAO Reports",
    url: "https://www.gao.gov/rss/reports.xml",
    category: "pentagon",
    alreadyDefense: false,
  },
  // National labs / research
  {
    name: "MIT Lincoln Lab",
    url: "https://www.ll.mit.edu/news.xml",
    category: "research",
    alreadyDefense: true,
  },
  {
    name: "JHU APL",
    url: "https://www.jhuapl.edu/rss/news.xml",
    category: "research",
    alreadyDefense: true,
  },
  {
    name: "NRL",
    url: "https://www.nrl.navy.mil/Media/News/rss/",
    category: "research",
    alreadyDefense: true,
  },
  {
    name: "Sandia News",
    url: "https://newsreleases.sandia.gov/feed/",
    category: "research",
    alreadyDefense: true,
  },
  // Think tanks
  {
    name: "CSIS",
    url: "https://www.csis.org/analysis/rss.xml",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "RAND",
    url: "https://www.rand.org/topics/national-defense.feed",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "CNAS",
    url: "https://www.cnas.org/publications/rss",
    category: "industry",
    alreadyDefense: true,
  },
  {
    name: "Atlantic Council",
    url: "https://www.atlanticcouncil.org/feed/",
    category: "industry",
    alreadyDefense: false,
  },
  {
    name: "Hudson Institute",
    url: "https://www.hudson.org/feed",
    category: "industry",
    alreadyDefense: false,
  },
];

// YouTube channels — these use the Atom feed at
// https://www.youtube.com/feeds/videos.xml?channel_id=<UC...>
// Only include channels whose UC ids you've verified; the source-health
// panel will surface any that 404.
const YOUTUBE_SOURCES = [
  { name: "DARPAtv",          channelId: "UCs6OBspz3-uTjTXmCnGQt5g", alreadyDefense: true },
  { name: "U.S. Department of Defense", channelId: "UCmNPsoTMGdSVaPGiSqKtttg", alreadyDefense: true },
  { name: "U.S. Air Force",   channelId: "UCB1iC3Mo3lClmXoxIvxF8gQ", alreadyDefense: true },
  { name: "U.S. Army",        channelId: "UCH4Bc-NmcOgPwpa-LR-IIFA", alreadyDefense: true },
  { name: "U.S. Navy",        channelId: "UCT8d6VwQEHX_mp7ts2cRz6w", alreadyDefense: true },
  { name: "U.S. Space Force", channelId: "UC59z40Wc_t8HmiU8b6OhvyA", alreadyDefense: true },
  { name: "CSIS",             channelId: "UCwHRdxFxpmIfWvJaBxXLi6w", alreadyDefense: false },
  { name: "RAND Corporation", channelId: "UCK7tptUDHh-RYDsdxO1-5QQ", alreadyDefense: false },
];

// Curated list of X / Twitter accounts relevant to DoD AI. X removed public
// RSS years ago and the API is paid, so the X tab links to profiles rather
// than fetching posts. Add or remove handles freely.
const X_ACCOUNTS = [
  { handle: "DeptofDefense",   name: "U.S. Dept of Defense", focus: "Pentagon top-line news" },
  { handle: "DARPA",           name: "DARPA",                focus: "Advanced research, AI, autonomy" },
  { handle: "DoD_CDAO",        name: "DoD CDAO",             focus: "Chief Digital & AI Office" },
  { handle: "USAirForce",      name: "U.S. Air Force",       focus: "Air operations, ABMS, autonomy" },
  { handle: "USArmy",          name: "U.S. Army",            focus: "Land power, Project Convergence" },
  { handle: "USNavy",          name: "U.S. Navy",            focus: "Maritime ops, autonomous vessels" },
  { handle: "SpaceForceDoD",   name: "U.S. Space Force",     focus: "Space domain, satellites, AI" },
  { handle: "BreakingDefense", name: "Breaking Defense",     focus: "Defense-tech reporting" },
  { handle: "DefenseScoop",    name: "DefenseScoop",         focus: "Pentagon tech reporting" },
  { handle: "DefenseOne",      name: "Defense One",          focus: "Defense policy & tech" },
  { handle: "DefenseNews",     name: "Defense News",         focus: "Programs, contracts, policy" },
  { handle: "valeriei",        name: "Valerie Insinna",      focus: "Air-Force / acquisition reporter" },
  { handle: "MikkiBrunett",    name: "Mikayla Easley",       focus: "AI, autonomy reporter (DefScoop)" },
  { handle: "PaulMcLeary",     name: "Paul McLeary",         focus: "National-security correspondent" },
  { handle: "CSIS",            name: "CSIS",                 focus: "Think tank — defense & AI" },
  { handle: "RANDCorporation", name: "RAND",                 focus: "Defense research" },
  { handle: "CNASdc",          name: "CNAS",                 focus: "National-security think tank" },
];

// Keywords — case-insensitive. Word boundaries matter for short acronyms.
const AI_TERMS = [
  { t: "\\bAI\\b", tag: "AI", wb: true },
  { t: "artificial intelligence", tag: "AI" },
  { t: "machine learning", tag: "ML" },
  { t: "\\bML\\b", tag: "ML", wb: true },
  { t: "large language model", tag: "LLM" },
  { t: "\\bLLM\\b", tag: "LLM", wb: true },
  { t: "generative", tag: "GenAI" },
  { t: "deep learning", tag: "Deep Learning" },
  { t: "neural network", tag: "Neural Net" },
  { t: "computer vision", tag: "Computer Vision" },
  { t: "autonomous", tag: "Autonomy" },
  { t: "autonomy", tag: "Autonomy" },
  { t: "robotic", tag: "Robotics" },
  { t: "swarm", tag: "Swarm" },
  { t: "unmanned", tag: "Unmanned" },
  { t: "Project Maven", tag: "Project Maven" },
  { t: "\\bCDAO\\b", tag: "CDAO", wb: true },
  { t: "\\bJAIC\\b", tag: "JAIC", wb: true },
  { t: "Replicator", tag: "Replicator" },
  { t: "Task Force Lima", tag: "TF Lima" },
  { t: "algorithmic warfare", tag: "Algorithmic Warfare" },
  { t: "JADC2", tag: "JADC2" },
  { t: "CJADC2", tag: "CJADC2" },
];

const DEFENSE_TERMS = [
  "\\bDoD\\b", "Department of Defense", "Pentagon", "DARPA", "CDAO",
  "Air Force", "\\bArmy\\b", "\\bNavy\\b", "Marine Corps", "Space Force",
  "\\bmilitary\\b", "\\bdefense\\b", "warfighter", "combatant command",
  "CENTCOM", "NORTHCOM", "INDOPACOM", "EUCOM", "AFRICOM", "SOUTHCOM",
  "SOCOM", "STRATCOM", "TRANSCOM", "Joint Chiefs", "service branch",
];

function buildRegex(terms) {
  const parts = terms.map(tm => {
    const raw = typeof tm === "string" ? tm : tm.t;
    return raw;
  });
  return new RegExp("(" + parts.join("|") + ")", "i");
}
const DEFENSE_RE = buildRegex(DEFENSE_TERMS);

function matchesAI(text) {
  for (const k of AI_TERMS) {
    const re = new RegExp(k.t, "i");
    if (re.test(text)) return true;
  }
  return false;
}

function deriveTags(text) {
  const tags = new Set();
  for (const k of AI_TERMS) {
    const re = new RegExp(k.t, "i");
    if (re.test(text)) tags.add(k.tag);
  }
  return Array.from(tags).slice(0, 5);
}

async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DoDAINewsBot/1.0; +https://github.com/) Feed Aggregator",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stripHtml(s) {
  if (!s) return "";
  return decodeEntities(
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getCData(raw) {
  if (!raw) return "";
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdata ? cdata[1] : raw;
}

function firstTag(block, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[2] : "";
}

function firstTagAttrs(block, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?\\s*/?>`, "i");
  const m = block.match(re);
  if (!m) return null;
  const attrs = {};
  (m[1] || "").replace(/([a-zA-Z:]+)\s*=\s*"([^"]*)"/g, (_, k, v) => {
    attrs[k] = v;
    return "";
  });
  return attrs;
}

// Pull all attribute pairs out of an opening tag (handles single & double quotes).
function tagAttrs(tag) {
  const attrs = {};
  tag.replace(/([a-zA-Z:]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, _q, v1, v2) => {
    attrs[k] = v1 != null ? v1 : v2;
    return "";
  });
  return attrs;
}

function parseYouTubeAtom(xml) {
  const items = [];
  const entryRe = /<entry(\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml))) {
    const block = m[2];
    const videoId = stripHtml(getCData(firstTag(block, "yt:videoId")));
    let link = "";
    const linkAttrsMatch = block.match(/<link[^>]*\srel=["']alternate["'][^>]*>/i);
    if (linkAttrsMatch) link = (tagAttrs(linkAttrsMatch[0]).href) || "";
    if (!link && videoId) link = `https://www.youtube.com/watch?v=${videoId}`;
    let thumbnail = "";
    const thumbMatch = block.match(/<media:thumbnail[^>]*>/i);
    if (thumbMatch) thumbnail = tagAttrs(thumbMatch[0]).url || "";
    if (!thumbnail && videoId) {
      thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    items.push({
      videoId,
      title: stripHtml(getCData(firstTag(block, "title"))),
      link,
      thumbnail,
      description: stripHtml(getCData(firstTag(block, "media:description") || firstTag(block, "summary"))),
      author: stripHtml(getCData(firstTag(firstTag(block, "author"), "name"))),
      pubDate: stripHtml(getCData(firstTag(block, "published") || firstTag(block, "updated"))),
    });
  }
  return items;
}

function parseFeed(xml) {
  const items = [];
  // RSS 2.0 items
  const rssItemRe = /<item(\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rssItemRe.exec(xml))) {
    const block = m[2];
    items.push({
      title: stripHtml(getCData(firstTag(block, "title"))),
      link: stripHtml(getCData(firstTag(block, "link"))),
      description: stripHtml(
        getCData(firstTag(block, "content:encoded") || firstTag(block, "description"))
      ),
      pubDate: stripHtml(getCData(firstTag(block, "pubDate") || firstTag(block, "dc:date"))),
    });
  }
  if (items.length) return items;

  // Atom entries
  const atomEntryRe = /<entry(\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  while ((m = atomEntryRe.exec(xml))) {
    const block = m[2];
    let link = "";
    const linkAttrs = firstTagAttrs(block, "link");
    if (linkAttrs && linkAttrs.href) link = linkAttrs.href;
    if (!link) link = stripHtml(getCData(firstTag(block, "link")));
    items.push({
      title: stripHtml(getCData(firstTag(block, "title"))),
      link,
      description: stripHtml(
        getCData(firstTag(block, "summary") || firstTag(block, "content"))
      ),
      pubDate: stripHtml(
        getCData(firstTag(block, "published") || firstTag(block, "updated"))
      ),
    });
  }
  return items;
}

function normalizeDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function matchesRelevance(article, source) {
  const text = `${article.title} ${article.summary}`;
  if (!matchesAI(text)) return false;
  if (!source.alreadyDefense && !DEFENSE_RE.test(text)) return false;
  return true;
}

async function main() {
  const all = [];
  const metaPath = path.join(__dirname, "..", "feed-meta.json");
  let prevMeta = {};
  try {
    const prev = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (prev && Array.isArray(prev.sources)) {
      for (const s of prev.sources) prevMeta[s.name] = s;
    }
  } catch {}

  const sourceReports = [];
  for (const src of SOURCES) {
    const startedAt = new Date().toISOString();
    let report = {
      name: src.name,
      url: src.url,
      category: src.category,
      ok: false,
      parsed: 0,
      kept: 0,
      lastAttempt: startedAt,
      lastSuccess: prevMeta[src.name]?.lastSuccess || null,
      error: null,
    };
    try {
      console.log(`[${src.name}] fetching…`);
      const xml = await fetchText(src.url);
      const items = parseFeed(xml);
      report.parsed = items.length;
      console.log(`[${src.name}] parsed ${items.length} items`);
      let kept = 0;
      for (const it of items) {
        if (!it.title || !it.link) continue;
        const article = {
          title: it.title,
          summary: truncate(it.description, 320),
          link: it.link,
          source: src.name,
          category: src.category,
          published: normalizeDate(it.pubDate) || new Date().toISOString(),
          tags: [],
        };
        if (!matchesRelevance(article, src)) continue;
        article.tags = deriveTags(`${article.title} ${article.summary}`);
        all.push(article);
        kept++;
      }
      report.kept = kept;
      report.ok = true;
      report.lastSuccess = startedAt;
      console.log(`[${src.name}] kept ${kept}`);
    } catch (e) {
      report.error = e.message || String(e);
      console.warn(`[${src.name}] ERROR: ${report.error}`);
    }
    sourceReports.push(report);
  }

  // Dedupe by link (and fallback by title)
  const seen = new Set();
  const deduped = [];
  for (const a of all) {
    const key = (a.link || "").toLowerCase() || a.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  // Drop items older than 90 days
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const recent = deduped.filter(a => new Date(a.published).getTime() >= cutoff);

  recent.sort((a, b) => new Date(b.published) - new Date(a.published));
  const articles = recent.slice(0, 250);

  const outPath = path.join(__dirname, "..", "feed.json");

  // If everything failed, preserve the previous good feed rather than blanking it.
  if (articles.length === 0 && fs.existsSync(outPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
      if (prev && Array.isArray(prev.articles) && prev.articles.length > 0) {
        console.warn("No new articles fetched; preserving previous feed.json.");
        return;
      }
    } catch {}
  }

  const out = {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`wrote ${outPath} with ${articles.length} articles`);

  // ---- YouTube ----
  const ytPath = path.join(__dirname, "..", "youtube.json");
  const ytVideos = [];
  for (const ch of YOUTUBE_SOURCES) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`;
    const startedAt = new Date().toISOString();
    const report = {
      name: ch.name,
      url,
      category: "youtube",
      ok: false,
      parsed: 0,
      kept: 0,
      lastAttempt: startedAt,
      lastSuccess: prevMeta[ch.name]?.lastSuccess || null,
      error: null,
    };
    try {
      console.log(`[YT ${ch.name}] fetching…`);
      const xml = await fetchText(url);
      const items = parseYouTubeAtom(xml);
      report.parsed = items.length;
      let kept = 0;
      for (const it of items) {
        if (!it.title || !it.link) continue;
        const text = `${it.title} ${it.description || ""}`;
        if (!matchesAI(text)) continue;
        if (!ch.alreadyDefense && !DEFENSE_RE.test(text)) continue;
        ytVideos.push({
          videoId: it.videoId,
          title: it.title,
          channel: it.author || ch.name,
          source: ch.name,
          link: it.link,
          thumbnail: it.thumbnail,
          summary: truncate(it.description, 280),
          published: normalizeDate(it.pubDate) || new Date().toISOString(),
          tags: deriveTags(text),
        });
        kept++;
      }
      report.kept = kept;
      report.ok = true;
      report.lastSuccess = startedAt;
      console.log(`[YT ${ch.name}] kept ${kept} of ${items.length}`);
    } catch (e) {
      report.error = e.message || String(e);
      console.warn(`[YT ${ch.name}] ERROR: ${report.error}`);
    }
    sourceReports.push(report);
  }

  // Dedupe + sort + cap
  const seenYt = new Set();
  const uniqYt = [];
  for (const v of ytVideos) {
    const key = (v.link || "").toLowerCase();
    if (!key || seenYt.has(key)) continue;
    seenYt.add(key);
    uniqYt.push(v);
  }
  uniqYt.sort((a, b) => new Date(b.published) - new Date(a.published));
  const yt = {
    generatedAt: new Date().toISOString(),
    count: uniqYt.length,
    videos: uniqYt.slice(0, 200),
  };
  if (uniqYt.length === 0 && fs.existsSync(ytPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(ytPath, "utf8"));
      if (prev && Array.isArray(prev.videos) && prev.videos.length > 0) {
        console.warn("No YouTube videos fetched; preserving previous youtube.json.");
      } else {
        fs.writeFileSync(ytPath, JSON.stringify(yt, null, 2));
      }
    } catch { fs.writeFileSync(ytPath, JSON.stringify(yt, null, 2)); }
  } else {
    fs.writeFileSync(ytPath, JSON.stringify(yt, null, 2));
  }
  console.log(`wrote ${ytPath} with ${yt.videos.length} videos`);

  // ---- X / Twitter (curated accounts only — no posts) ----
  const xPath = path.join(__dirname, "..", "x.json");
  const xOut = {
    generatedAt: new Date().toISOString(),
    note:
      "X removed public RSS and the API is paid; this list links to profiles. " +
      "Edit X_ACCOUNTS in scripts/fetch-feeds.js to curate.",
    accounts: X_ACCOUNTS.map((a) => ({
      ...a,
      url: `https://x.com/${a.handle}`,
    })),
  };
  fs.writeFileSync(xPath, JSON.stringify(xOut, null, 2));
  console.log(`wrote ${xPath} with ${xOut.accounts.length} accounts`);

  const meta = {
    generatedAt: new Date().toISOString(),
    sources: sourceReports,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`wrote feed-meta.json with ${sourceReports.length} source reports`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
