# Agent Handoff

Read this file first when continuing work in a new chat.

## Project Goal

Build `asset-dca-simulator`: a static GitHub Pages web app that compares DCA strategies across assets such as Vietnamese stocks and gold.

Example target use case:

- invest `1,000,000 VND` into `FPT` every month from `2026-01`
- invest `1,000,000 VND` into `SJC_1L_HCM` every month from `2026-01`
- compare invested value, current value, profit/loss, and animated chart progress over time

## Current Status

Done:

- repository name and direction are decided
- docs created for architecture, data format, providers, and this handoff
- MIT license added for `Thanh Son 99`
- folder init scripts created:
  - `scripts/init.sh`
  - `scripts/init.ps1`
  - `scripts/init.bat`
- init scripts only create folders and do not create data files
- collector proof of concept created for FPT via KBS public endpoint
- real FPT 2026 JSON generated at `data/stocks/FPT/2026.json`
- KBS stock list sync created at `data/assets/stocks-kbs.json`
- FPT backfill generated yearly files from 2016 to 2026
- static root `index.html` demo created for FPT 2026 data check
- static demo now has inputs for symbol, from date, to date, and animation seconds
- chart demo now supports price mode and monthly DCA mode with configurable monthly amount

Not done:

- no full frontend app yet
- no JSON schema files yet
- no final market data provider decision yet
- GitHub Pages link is documented but not live until frontend/deploy exists

## Hard Rules

- Do not start with UI/chart before data format and collector proof of concept are stable.
- Keep frontend static. No backend requirement for GitHub Pages.
- Treat `data/` as canonical database, but only after real collector data exists.
- Do not create fake market data JSON just to fill folders.
- Google Sheet/Excel may be export or manual review only, not the primary database.
- Do not scrape Google search results as a main provider.
- Collector must be non-destructive by default.
- If fetch/validate fails, keep old data unchanged.
- Any write to market data must follow: fetch -> normalize -> validate -> merge -> validate again -> temp write -> atomic replace.
- Update this file briefly after meaningful progress so a new chat can continue without guessing.

## Technical Decisions

- Architecture: `collector -> data -> apps/web`
- Frontend direction: TypeScript + Vite + Apache ECharts
- Hosting: GitHub Pages
- Automation direction: GitHub Actions
- Data format direction: yearly JSON per asset, for example `data/stocks/FPT/2026.json`
- Collector runtime is not final. Options:
  - Node.js: likely simplest because frontend already uses JS tooling
  - Go: best if collector must become standalone binaries later
- native shell/bat/ps1: OK for folder init only, not enough for real provider/data logic
- static demo site uses root `index.html`, `assets/styles/`, and `assets/scripts/` without a build step
- frontend loader builds stock year paths from selected symbol/date range; no hardcoded single data file

## Provider Direction

Stocks:

- first proof of concept should use `FPT`
- preferred provider to investigate first: SSI FastConnect Data / SSI Developer OHLC APIs
- current proof of concept uses KBS public endpoint via `collector/bin/fetch-stock-kbs.mjs`
- current main collector command is `collector/bin/market-data.mjs`
- required stock fields: `date`, `open`, `high`, `low`, `close`, `volume`

Gold:

- first symbol idea: `SJC_1L_HCM`
- provider not finalized
- first version can support manual CSV import if no stable provider is confirmed
- required gold fields: `date`, `buy`, `sell`
- DCA buy uses sell price; liquidation/current value uses buy price

## Data Rules

- Use ISO dates: `YYYY-MM-DD`
- Use VND integer values, not formatted strings
- Split data by year and asset
- If a monthly buy date is not a trading day, use the next available market date
- Corporate actions for stocks must be handled later before serious result claims:
  - stock split
  - bonus shares
  - cash dividend
  - rights issue

## Next Step

Recommended next task:

1. Polish frontend UI before adding more product features:
   - refine text sizes, spacing, shadows, borders, and chart colors
   - improve chart label placement so latest/high/low labels never look crowded
   - verify date picker interaction visually on desktop and mobile
   - verify loading overlay, tooltip, and fullscreen states
2. Fill/backfill more stock data after UI prototype is acceptable:
   - keep FPT as the known-good test asset
   - run more symbols in small batches, not all at once
   - preserve existing yearly JSON files and update only missing/recent rows
3. Then continue data hardening:
   - create JSON schema files under `schemas/`
   - add validation command for all stock JSON files
   - add batch cursor support so all-symbol backfill can resume across runs
4. Investigate SSI credentials/license before using SSI data in public repo.

## Last Progress Note

2026-09-09:

- Replaced PHP/Node init direction with native init scripts for macOS/Linux and Windows.
- Removed placeholder JSON data files.
- Added README, docs, gitignore, editorconfig, and MIT license.
- Simplified README to focus on product goal, live link, setup, and handoff docs only.
- Added `collector/bin/fetch-stock-kbs.mjs`.
- Generated real FPT 2026 data from KBS public endpoint: 166 rows from `2026-01-05` to `2026-09-08`.
- Added `collector/bin/market-data.mjs` with `assets:sync` and `stocks:update`.
- Synced 1523 KBS stock assets.
- Backfilled FPT yearly data files from 2016 through 2026; one row had `ohlc_range_repaired` flag.
- Refactored collector into provider/repository/service/support modules with JSDoc on exported APIs.
- Added `docs/code-style.md`.
- Added static FPT 2026 data-check UI at root for GitHub Pages.
- Reworked chart demo with input-driven date range, 10s default animation, rounded price ticks, multiple date ticks, latest marker, and global high/low markers.
- Fixed marker logic to show only the selected range's highest close, lowest close, and latest point; no lower-high/higher-low markers.
- Made only the latest point visually larger, disabled auto-play on initial load, fixed X-axis text alignment, and refreshed green/red palette.
- Added color controls for line/text/high/low, responsive canvas resizing, and chart fullscreen support.
- Moved fullscreen into the chart as an icon button, added hover tooltip, widened desktop chart layout, and improved fullscreen canvas sizing.
- Added `assets/scripts/simulation/dca.js` for frontend-only monthly DCA calculation.
- Added chart mode input: `Price` or `Monthly DCA`; DCA draws portfolio value as the main line and total invested cash as a dashed secondary line.
- Fixed tooltip targeting to use the chart plot area instead of full canvas width.
- Added hover crosshair with X/Y guide lines and a focused point on the active line.
- Added `Value line` and `Invested line` toggles; DCA defaults to showing both, and the Y-axis scale follows visible series.
- Added `VNĐ` suffix to latest/high/low labels and tooltip money values.
- Changed default chart mode to `Monthly DCA` so the investment value line is visible on first load.
- Monthly amount input is text-formatted as VND, for example `1.000.000`, and parsed by stripping non-digit characters.
- Mode and monthly amount changes redraw from already-loaded market rows without fetching data again.
- Reworked DCA chart semantics: green line is FPT close price on the left Y-axis, blue line is investment current value on the right Y-axis.
- Total invested cash is shown in the summary cards, not as a chart line.
- High/low markers are only for FPT price; investment value line has no min/max markers.
- Current DCA buy rule is first available market row in each month on or after the selected start day; average/lowest buy rules are intentionally not default because they use hindsight.
- Added Vietnamese UI labels for the current static demo.
- Added `Cách mua` / `buyStrategy` option for DCA:
  - `fixed_day`: first trading row on or after selected start day in each month
  - `first_trading_day`: first trading row of month
  - `last_trading_day`: last trading row of month
  - `average_first_5`: split monthly amount across first 5 trading rows
  - `monthly_average`: benchmark using monthly average close
  - `monthly_low`: benchmark using monthly lowest close
- Crosshair focuses the FPT price line when it is visible; if FPT price is hidden, it follows the investment value line. Tooltip still shows both values for the hovered date.
- Replaced native date inputs with `assets/scripts/ui/date-picker.js`; visible format is `dd/mm/yyyy`, while `dataset.iso` keeps `YYYY-MM-DD` for data loading.
- UI now prevents unchecking both chart lines at the same time.
- Default colors updated per request: FPT `#459ef2`, investment `#e042ff`, text `#000000`, high/low `#f13b3b`.
- Latest labels now use each line's own color instead of using low/high marker color.
- Date picker now supports direct month/year selection instead of only previous/next month.
- Symbol input uses a searchable `datalist` filled from `data/stocks/index.json`, so it only suggests symbols with local runnable price data.
- Chart loading overlay added inside the chart frame; `Xem biểu đồ` disables while data is loading.
- Summary cards are intended to render as 6 columns on desktop: monthly amount, buy rule, invested, current value, share units, P/L.
- Price and investment lines both have subtle area fills; canvas line glow is available but defaults off.
- UI polish pass continued:
  - header copy was simplified and restyled as a raised surface over a brighter layered background
  - footer was reduced to a red investment-disclaimer note
  - chart heading now uses a larger title such as `Biểu đồ mô phỏng FPT`; selected date range is metadata on the right
  - symbol search now reads available runnable symbols from `data/stocks/index.json`; currently only `FPT`
  - always-visible chart option is only `Tông màu biểu đồ` with an animated Vietnamese `Sáng/Tối` switch
  - detailed color/line controls are hidden under the closed-by-default `Tùy chỉnh nâng cao` dropdown
  - advanced chart controls include colors for FPT, investment, text, chart background, high, low, visible line toggles, and `Làm nổi đường`
  - `Làm nổi đường` now defaults off; enabling it adds canvas line glow
  - both FPT price and investment value lines have subtle area fills
  - chart X-axis and tooltip dates are formatted as `dd/mm/yyyy`
  - left price-axis labels use the same text color as the bottom date axis
  - DCA summary now has 6 cards including `Số cổ phiếu`
  - money formatter keeps smaller/exact amounts like `70.200 VNĐ`, compacts clean 100k increments above 1m like `5,4 tr VNĐ`, and keeps detailed amounts like `5.440.000 VNĐ`
  - share formatter uses Vietnamese decimals, for example `124,123 cổ phiếu`

## Current UI Status

Prototype is functionally acceptable for now, but not final visually.

Known UI follow-up for next chat:

- polish overall spacing, typography, shadows, borders, and color balance
- refine chart aesthetics, especially text label placement, area fill balance, and line glow when enabled
- make the date picker feel smoother and visually cleaner if needed
- review all Vietnamese copy for consistency
- visually test the advanced dropdown, Sáng/Tối switch, dark chart preset, and customized chart background colors
- keep the current data/calculation behavior while polishing UI
- after UI looks acceptable, start adding/backfilling more stock symbols beyond FPT
