# Asset DCA Simulator Architecture

## Decision

Build the project as a static web app plus a local/CI data collector:

```text
collector -> data -> apps/web
```

The frontend must not require a backend. GitHub Pages can serve the web app and the JSON files under `data/`.

## Main Parts

### `collector/`

Local command-line tools that fetch, normalize, validate, merge, and write market data.

The collector is not part of the hosted website. It can run on a developer machine or GitHub Actions.

### `data/`

Canonical database stored as versioned JSON files.

Do not use Excel or Google Sheet as the canonical database. They are useful for manual review or export, but the app should read stable JSON files from the repository.

### `apps/web/`

Static frontend. It loads assets and yearly price files from `data/`, runs DCA simulations in the browser, and renders charts.

## Data Flow

```text
fetch
  -> normalize
  -> validate
  -> merge with existing data
  -> validate again
  -> write temp file
  -> atomic replace
```

If a provider fails or returns suspicious data, keep the old data unchanged.

## First Technical Direction

- Frontend: TypeScript, Vite, Apache ECharts
- Collector: decide after provider proof of concept
- Storage: static JSON
- Automation: GitHub Actions
- Hosting: GitHub Pages

Folder initialization does not require Node.js or PHP. Use the native scripts in `scripts/`:

- `scripts/init.sh` for macOS/Linux
- `scripts/init.ps1` for Windows PowerShell
- `scripts/init.bat` for Windows CMD

The real collector can still use Node.js later if that gives the best tradeoff, because the frontend will likely use the JavaScript/TypeScript ecosystem. Another option is a compiled Go binary if local machines must run the collector without installing a runtime. The collector choice should be made after testing the data provider.

## Why Not Start With Charts

The chart is only the output. The hard part is having clean daily price data with a stable schema. Build the data pipeline first, then the simulation engine, then the UI.
