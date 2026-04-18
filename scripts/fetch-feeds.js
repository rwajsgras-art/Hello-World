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
  for (const src of SOURCES) {
    try {
      console.log(`[${src.name}] fetching…`);
      const xml = await fetchText(src.url);
      const items = parseFeed(xml);
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
      console.log(`[${src.name}] kept ${kept}`);
    } catch (e) {
      console.warn(`[${src.name}] ERROR: ${e.message}`);
    }
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
