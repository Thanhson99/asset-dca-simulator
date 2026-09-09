# Collector

Current collector is a Node.js proof of concept using KBS public endpoints.

## Sync Stock List

```bash
node collector/bin/market-data.mjs assets:sync
```

Writes:

```text
data/assets/stocks-kbs.json
```

## Update One Symbol

```bash
node collector/bin/market-data.mjs stocks:update --symbol=FPT
```

Default behavior:

- if the symbol already has data, refresh only the latest few days
- if the symbol has no data, fetch current year only
- merge by date
- write files atomically
- keep old files unchanged if fetch or validation fails

## Backfill One Symbol

```bash
node collector/bin/market-data.mjs stocks:update --symbol=FPT --mode=backfill --from=2000-01-01
```

Backfill fetches the requested range and writes one JSON file per year with real rows only.

## Run Multiple Symbols

```bash
node collector/bin/market-data.mjs stocks:update --symbols=FPT,HPG,MWG
```

## Run All Symbols Carefully

```bash
node collector/bin/market-data.mjs stocks:update --all=true --concurrency=2 --delay-ms=500
```

For the first historical load, run in batches instead of all at once:

```bash
node collector/bin/market-data.mjs stocks:update --all=true --mode=backfill --from=2000-01-01 --limit=20 --concurrency=1 --delay-ms=1000
```

Increase `--limit` only after the provider is stable.

## Useful Options

- `--dry-run=true`: show planned work without fetching/writing stock data
- `--refresh-days=3`: recheck recent rows in update mode
- `--to=YYYY-MM-DD`: override end date
- `--force=true`: rewrite existing historical years in backfill mode
