# Asset DCA Simulator Architecture

## Decision

Build the project as a static GitHub Pages web app plus a local/CI market-data collector:

```text
collector -> data -> static frontend
```

The frontend has no backend and no build step. GitHub Pages serves `index.html`, files under `assets/`, and market data under `data/`.

## Main Parts

### Root Frontend

The hosted app lives at the repository root:

- `index.html`
- `assets/styles/`
- `assets/scripts/`

Browser code loads yearly JSON files from `data/stocks/{SYMBOL}/{YEAR}.json`, runs DCA simulations client-side, and renders the chart on Canvas.

### `collector/`

Node.js command-line tools that fetch, normalize, validate, merge, and write market data.

The collector is not part of the hosted website. It can run locally or in automation.

### `data/`

Canonical JSON database committed to the repository:

- `data/assets/stocks-kbs.json`: synced provider universe
- `data/stocks/download-queue.json`: resumable 500-symbol download queue
- `data/stocks/index.json`: runnable symbols shown by the frontend
- `data/stocks/{SYMBOL}/{YEAR}.json`: daily stock data

## Data Flow

```text
fetch
  -> normalize
  -> validate
  -> merge with existing data
  -> validate again
  -> write temp file
  -> atomic replace
  -> rebuild data/stocks/index.json
```

If a provider fails or returns suspicious data, keep the old yearly data unchanged.

## Current Technical Direction

- Frontend: plain HTML/CSS/JavaScript modules, Canvas chart, no build step
- Collector: Node.js using the KBS public endpoint proof of concept
- Storage: static yearly JSON files
- Hosting: GitHub Pages
- Automation: GitHub Actions can call the collector later

Folder initialization scripts only create the active root frontend, collector, data, scripts, and docs folders. Removed experimental `apps/` and `schemas/` folders are no longer part of the project structure.
