# Code Style

## General Rules

- Prefer small files with one clear responsibility.
- Prefer functions under roughly 40 lines. If a function needs multiple phases, split the phases into named helpers.
- Keep command files thin. Put business logic in `src/`.
- Use JSDoc on exported functions/classes and non-obvious internal functions.
- Do not comment obvious assignments. Comment decisions, edge cases, and safety behavior.
- Validate inputs at module boundaries.
- Never assume a file or folder exists before reading/deleting it.
- Write data atomically when possible: temporary file first, then rename.
- Batch jobs must keep going when one symbol fails.
- Network collectors must support `--dry-run`, low concurrency, and delay options.

## Frontend Rules

- Keep the GitHub Pages app static.
- Split HTML, CSS, and JS.
- Put shared visual styles in `assets/styles/`.
- Put reusable JS in `assets/scripts/`.
- Keep header, metrics, chart, loaders, and simulation logic separate.
- Do not add a build step until the static prototype proves the data flow.
- Do not hardcode one data file in app logic. Build file paths from symbol and selected date range.
- Chart axes should use readable rounded ticks, not raw min/max-derived labels.
- Chart animation should reveal data over time; it must not mutate the underlying rows.
- Chart high/low markers should use global extrema from the selected range: one highest close and one lowest close.
- Do not mark lower highs, higher lows, or points along the side of a trend unless a later feature explicitly asks for technical-analysis swing markers.
- The chart should not auto-play on initial load; draw static first, then animate only after user action.
- Keep UI sections isolated so header/footer/chart/control edits stay local to their files.
- Chart customization controls should pass a theme object into chart rendering instead of mutating global chart colors.
- Canvas charts must resize their backing pixels when the frame size changes.
