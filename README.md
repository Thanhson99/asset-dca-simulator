# Asset DCA Simulator

[![Open demo](https://img.shields.io/badge/Open-Demo-459EF2?style=for-the-badge&logo=githubpages&logoColor=white)](https://thanhson99.github.io/asset-dca-simulator/)
[![Static app](https://img.shields.io/badge/Frontend-Static_HTML%2FCSS%2FJS-176B4D?style=for-the-badge&logo=javascript&logoColor=white)](docs/architecture.md)
[![Market data](https://img.shields.io/badge/Data-500_VN_stocks-F13B3B?style=for-the-badge&logo=json&logoColor=white)](data/stocks/index.json)

Static web app for simulating monthly DCA on Vietnamese stocks with local JSON market data.

## Features

- Search/select stock symbols from local data.
- Pick a date range and simulate monthly investing.
- Compare close price and portfolio value on an animated Canvas chart.
- Compare multiple stock symbols with per-symbol chart colors, grouped tooltips, high/low markers, and calendar-based spacing.
- Add an existing holding to the main DCA simulation and let related portfolio fields be inferred where possible.
- Try buy strategies such as fixed day, first/last trading day, monthly average, and monthly low.
- Customize chart colors, visible lines, light/dark chart background, tooltip, and fullscreen.
- See stale local data warnings when a symbol has not been synced through the latest completed date.

## Data

The app currently includes 500 Vietnamese stock symbols under `data/stocks/`.

- Frontend manifest: [`data/stocks/index.json`](data/stocks/index.json)
- Download queue/checkpoint: [`data/stocks/download-queue.json`](data/stocks/download-queue.json)
- Yearly price files: `data/stocks/{SYMBOL}/{YEAR}.json`

## Collector

Sync provider symbols:

```bash
node collector/bin/market-data.mjs assets:sync
```

Create or reset the 500-symbol queue:

```bash
node collector/bin/market-data.mjs stocks:queue:init --limit=500
```

Run or resume downloads:

```bash
node collector/bin/market-data.mjs stocks:queue:run --delay-ms=500
```

Update all existing stock data on macOS, Windows, or Ubuntu:

```bash
node scripts/update-data.mjs
```

Useful safe checks:

```bash
node scripts/update-data.mjs --dry-run=true --limit=5
```

## Docs

- [Architecture](docs/architecture.md)
- [Collector](docs/collector.md)
- [Data format](docs/data-format.md)
- [Agent handoff](docs/agent-handoff.md)

## Roadmap Notes

- Add a new chart comparison tab for bank savings, MoMo Túi Thần Tài, and similar cash/yield products.
- Keep the stock chart as the main flow, then compare cash/yield tracks over the same date range.

## License

MIT
