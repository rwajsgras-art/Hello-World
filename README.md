# DoD AI News

An installable iPhone (and Android / desktop) Progressive Web App that aggregates news on **U.S. Department of Defense AI programs and initiatives** — DoD News, DARPA, CDAO, the service branches, and defense-tech trade press — filtered for AI / autonomy / ML relevance.

No app store, no backend. A scheduled GitHub Action fetches RSS/Atom feeds every hour, filters for DoD + AI keywords, and publishes a static `feed.json` next to the PWA on GitHub Pages.

## Install on iPhone

1. Open the deployed URL (e.g. `https://<user>.github.io/<repo>/`) in **Safari**.
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch from the home-screen icon — it runs full-screen, caches for offline, and pulls fresh headlines on open.

## Run on macOS

Two options — pick whichever fits.

### A. Run locally from source (full control, hourly refresh on your machine)

Requires Node 18+ (check with `node -v`; install via `brew install node` if missing).

```bash
git clone https://github.com/<user>/<repo>.git
cd <repo>
npm start            # serves on http://localhost:3000 and opens it
```

`npm start` does three things:

1. Spins up a zero-dependency static server on port 3000 (override with `PORT=4000 npm start`).
2. Runs `scripts/fetch-feeds.js` once so `feed.json` is fresh.
3. Re-runs the fetcher every 60 minutes (`REFRESH_MIN=15 npm start` to change).

Other scripts:

```bash
npm run serve        # serve without opening the browser
npm run fetch        # fetch feeds once and write feed.json
npm run icons        # regenerate PNG icons from icons/icon.svg
```

### B. Install the live site as a Mac app

The deployed PWA can be added to the Dock so it runs in its own window like a native app, syncing with the same hourly GitHub Actions feed as your iPhone install.

- **Safari 17+** (macOS Sonoma or later): open the URL in Safari → menu **File → Add to Dock…** → confirm. The app gets its own Dock icon and window.
- **Chrome / Edge / Arc**: open the URL → click the **Install** icon in the address bar (or **⋮ → Cast, save, and share → Install DoD AI News…**). Same standalone window.

Bookmarks and settings are per-browser — installing in Safari is independent of Chrome.

## Sources (current set)

| Category  | Source |
|-----------|--------|
| Pentagon  | DoD News, DoD Contracts |
| Services  | Air Force, Army, Navy, Space Force |
| Research  | DARPA, AFRL |
| Industry  | Breaking Defense, DefenseScoop, Defense News, C4ISRNET, Nextgov, FedScoop, The War Zone |

Each article is kept only if it matches an AI / autonomy / ML keyword (plus, for general-government outlets, a DoD/military keyword). See `scripts/fetch-feeds.js` to edit the list or the filters.

## Deploying

This repo is wired up for **GitHub Pages via GitHub Actions**.

1. Push the branch to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The `Build & Deploy` workflow (`.github/workflows/deploy.yml`) runs on push, on manual dispatch, and on a **1-hour schedule** to refresh `feed.json`.

### Local preview

See [Run on macOS](#run-on-macos) above (`npm start`). Any static server also works (e.g. `python3 -m http.server 8000`).

## File layout

```
.
├── index.html            # PWA shell
├── styles.css
├── app.js                # loads feed.json, renders, search/filter, pull-to-refresh
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # service worker (offline cache + stale-while-revalidate for feed)
├── feed.json             # generated aggregated feed
├── icons/                # SVG source + generated PNGs
├── package.json          # npm scripts (start / serve / fetch / icons)
├── scripts/
│   ├── fetch-feeds.js    # RSS/Atom fetch + filter + write feed.json
│   ├── generate-icons.js # pure-Node PNG icon generator
│   └── dev-server.js     # zero-dep local static server with periodic feed refresh
└── .github/workflows/
    └── deploy.yml        # hourly feed refresh + Pages deploy
```

## Optional: enable YouTube search

By default the YouTube tab is populated from the channels listed in
`YOUTUBE_SOURCES` (`scripts/fetch-feeds.js`). To **also** auto-discover
fresh DoD-AI videos beyond those channels, give the aggregator a YouTube
Data API v3 key:

1. In [Google Cloud Console](https://console.cloud.google.com/), create
   a project, enable **YouTube Data API v3**, and create an **API key**.
2. In your GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret**. Name: `YOUTUBE_API_KEY`. Paste the key.
3. The next workflow run runs the queries listed in `YT_SEARCH_QUERIES`
   (e.g. "DoD artificial intelligence", "Pentagon AI", "DARPA AI",
   "CDAO", "Replicator initiative", "JADC2", "Project Maven", …),
   filters by AI + DoD keywords and last-60-days, and merges results
   into `youtube.json`.

To run locally with search enabled:

```bash
YOUTUBE_API_KEY=AIza... npm start
```

The free tier is 10,000 quota units/day; each search costs ~100 units,
so the default 9 queries cost 900/day — plenty of headroom.

## Optional: enable SAM.gov opportunity search

The **Opps** tab always shows a portals list (SAM.gov searches, DARPA
opportunities, DIU Open Projects, AFWERX, GAO AI reports, CRS reports).
Add a free SAM.gov key to also list matching live opportunities.

1. Register at [sam.gov](https://sam.gov/), go to **Account Details →
   Request Public API Key**.
2. Add it as `SAM_API_KEY` under repo Secrets (same place as the
   YouTube key above).
3. Next workflow run pulls opportunities matching "artificial
   intelligence", "autonomy", and "machine learning" from the last 90
   days and filters them through the same AI keyword pass.

## Optional: enable AI TL;DR + "Why it matters"

Adds a one-sentence TL;DR and two "Why it matters" bullets under every
news card. Generated during the hourly build via the Anthropic API and
persisted in `summaries.json` so summaries are only paid for once per
article.

1. Get an Anthropic API key at
   [console.anthropic.com](https://console.anthropic.com/).
2. Add it as `ANTHROPIC_API_KEY` under repo Secrets.
3. The next build generates summaries for up to 40 new articles per
   run using the Claude Haiku 4.5 model. At ~$0.001 per summary and
   ~50 new articles/hour, expect single-digit dollars per month.

## Customization

- **Add a source:** append an object to `SOURCES` in `scripts/fetch-feeds.js` with `{ name, url, category, alreadyDefense }`. Set `alreadyDefense: false` for general-government or tech outlets so the DoD keyword filter is applied in addition to the AI filter.
- **Tune keywords:** edit `AI_TERMS` and `DEFENSE_TERMS` in the same file. Tags shown on cards derive from `AI_TERMS` matches.
- **Change branding:** edit `icons/icon.svg` and re-run `node scripts/generate-icons.js`, then update `manifest.webmanifest` and the `theme-color` in `index.html`.
