# DoD AI News

An installable iPhone (and Android / desktop) Progressive Web App that aggregates news on **U.S. Department of Defense AI programs and initiatives** — DoD News, DARPA, CDAO, the service branches, and defense-tech trade press — filtered for AI / autonomy / ML relevance.

No app store, no backend. A scheduled GitHub Action fetches RSS/Atom feeds every hour, filters for DoD + AI keywords, and publishes a static `feed.json` next to the PWA on GitHub Pages.

## Install on iPhone

1. Open the deployed URL (e.g. `https://<user>.github.io/<repo>/`) in **Safari**.
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch from the home-screen icon — it runs full-screen, caches for offline, and pulls fresh headlines on open.

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

```bash
# any static server works; a zero-dep option:
python3 -m http.server 8000
# then open http://localhost:8000
```

To refresh the feed locally:

```bash
node scripts/fetch-feeds.js
```

To regenerate the icons:

```bash
node scripts/generate-icons.js
```

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
├── scripts/
│   ├── fetch-feeds.js    # RSS/Atom fetch + filter + write feed.json
│   └── generate-icons.js # pure-Node PNG icon generator
└── .github/workflows/
    └── deploy.yml        # hourly feed refresh + Pages deploy
```

## Customization

- **Add a source:** append an object to `SOURCES` in `scripts/fetch-feeds.js` with `{ name, url, category, alreadyDefense }`. Set `alreadyDefense: false` for general-government or tech outlets so the DoD keyword filter is applied in addition to the AI filter.
- **Tune keywords:** edit `AI_TERMS` and `DEFENSE_TERMS` in the same file. Tags shown on cards derive from `AI_TERMS` matches.
- **Change branding:** edit `icons/icon.svg` and re-run `node scripts/generate-icons.js`, then update `manifest.webmanifest` and the `theme-color` in `index.html`.
