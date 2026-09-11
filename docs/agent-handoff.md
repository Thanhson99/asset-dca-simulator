# Agent Handoff

Read this file first when continuing work in a new chat.

## Project Goal

Build `asset-dca-simulator`: a static GitHub Pages web app that simulates DCA strategies across Vietnamese stocks, and later other assets such as gold or savings.

## Current Structure

- Root frontend: `index.html`, `assets/styles/`, `assets/scripts/`
- Market data: `data/stocks/{SYMBOL}/{YEAR}.json`
- Frontend stock selector manifest: `data/stocks/index.json`
- Resumable stock download queue: `data/stocks/download-queue.json`
- Collector CLI: `collector/bin/market-data.mjs`

Removed experimental `apps/` and `schemas/` folders are not part of the active structure.

## Current Status

Done:

- Static frontend works without a backend or build step.
- Canvas chart supports price mode and monthly DCA mode.
- UI supports symbol suggestions, typed/picker dates, monthly amount presets via datalist, buy strategies, theme/color controls, tooltip, fullscreen, and validation.
- Advanced chart controls support an existing primary holding, inferred portfolio fields, multiple comparison symbols, per-symbol colors, per-symbol visibility, and a clear-form action.
- Multi-symbol charts use calendar-based X positions, carry forward the nearest previous price for symbols that do not trade on a date, show per-symbol high/low price markers, and group tooltip values by symbol.
- Data freshness warning is text-only and appears only when a selected symbol has not been synced through the latest completed local date.
- Form state is saved in `localStorage`; after reload, valid inputs and chart can be restored.
- Chart heading uses full symbol metadata from `data/stocks/index.json`, for example `ACB - Ngân hàng TMCP Á Châu - HOSE`.
- Date picker allows `01/01/2000` through today and disables out-of-range days.
- Status warns only when the selected start date is before available data, for example `Dữ liệu có từ 15/06/2016`.
- Collector can sync KBS stock universe, update symbols, backfill from `2000-01-01`, and write yearly JSON atomically.
- Cross-platform full-data update wrapper is available with `node scripts/update-data.mjs`; use `--dry-run=true` to inspect planned writes.
- `data/stocks/download-queue.json` contains 500 symbols and currently all 500 are marked `done`.
- `data/stocks/index.json` contains 500 runnable symbols for the frontend.

## Collector Commands

Sync provider universe:

```bash
node collector/bin/market-data.mjs assets:sync
```

Create a 500-symbol queue:

```bash
node collector/bin/market-data.mjs stocks:queue:init --limit=500
```

Run or resume the queue:

```bash
node collector/bin/market-data.mjs stocks:queue:run --delay-ms=500
```

Update one symbol:

```bash
node collector/bin/market-data.mjs stocks:update --symbol=FPT
```

## Data Rules

- Use ISO dates in data files: `YYYY-MM-DD`.
- Use VND integer values, not formatted strings.
- Split data by symbol and year.
- If the selected buy date is not a trading day, use the next available market row.
- Collector writes must remain non-destructive: fetch, normalize, validate, merge, validate again, temp write, atomic replace.

## Known Limits

- KBS is still a proof-of-concept public endpoint, not a final licensed market-data decision.
- Corporate actions are not yet modeled separately.
- Gold/savings asset support is documented direction only; current runnable dataset is stocks.
- Some local `data/stocks` files may be dirty after manual sync runs. Do not stage bulk data changes unless the user explicitly wants to publish the refreshed dataset.

## Next Steps

- Add a new comparison tab for non-stock return tracks such as bank savings, MoMo Túi Thần Tài, and similar cash/yield products.
- Model bank/savings inputs separately from stock inputs: principal, periodic contribution, annual rate, compounding cadence, tax/fee assumptions, and effective date range.
- Compare those yield products against the stock DCA chart using the same date range and summary/tooltip patterns.
- Add a validation command that scans all stock JSON files.
- Add automated GitHub Actions for scheduled provider sync/update.
- Add corporate-action support before treating long-term stock returns as production-grade.
- Decide final licensed provider before broad public usage.
