#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, toNonNegativeInteger, toPositiveInteger } from '../src/support/args.mjs';
import { parseIsoDate, todayIsoDate } from '../src/support/dates.mjs';
import { readJsonIfExists, writeJsonAtomic } from '../src/support/fs-json.mjs';
import { runPool, sleep } from '../src/support/pool.mjs';
import { fetchKbsDailyRows, fetchKbsStockAssets } from '../src/providers/kbs-provider.mjs';
import { StockRepository } from '../src/repositories/stock-repository.mjs';
import { StockUpdateService } from '../src/services/stock-update-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), '..', '..');
const DEFAULT_START_DATE = '2000-01-01';

const [command, ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);

try {
  if (command === 'assets:sync') {
    await syncAssets();
  } else if (command === 'stocks:update') {
    await updateStocks();
  } else {
    printUsage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}

/**
 * Sync the stock universe used by `stocks:update --all=true`.
 */
async function syncAssets() {
  const assets = await fetchKbsStockAssets();

  await writeJsonAtomic(join(repoRoot, 'data', 'assets', 'stocks-kbs.json'), {
    version: 1,
    source: 'kbs-public-poc',
    generatedAt: new Date().toISOString(),
    count: assets.length,
    assets,
  });

  console.log(`Synced ${assets.length} stock assets.`);
}

/**
 * Resolve stock update options, then process symbols with bounded concurrency.
 */
async function updateStocks() {
  const options = parseStockUpdateOptions(args);
  const symbols = await resolveSymbols(args);
  const selectedSymbols = symbols.slice(0, options.limit ?? symbols.length);
  const service = new StockUpdateService({
    provider: { fetchDailyRows: fetchKbsDailyRows },
    repository: new StockRepository(repoRoot),
  });

  console.log(
    `Running stocks:update mode=${options.mode} symbols=${selectedSymbols.length} from=${options.startDate} to=${options.endDate}`,
  );

  await runPool(selectedSymbols, options.concurrency, async (symbol, index) => {
    if (index > 0 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    await updateSymbolSafely(service, symbol, options);
  });
}

/**
 * Update a symbol without letting one failed symbol stop the whole batch.
 *
 * @param {StockUpdateService} service
 * @param {string} symbol
 * @param {object} options
 */
async function updateSymbolSafely(service, symbol, options) {
  try {
    const result = await service.updateSymbol({ symbol, ...options });
    console.log(`[OK] ${symbol}: ${result}`);
  } catch (error) {
    console.error(`[FAIL] ${symbol}: ${error.message}`);
  }
}

/**
 * Parse and validate `stocks:update` options.
 *
 * @param {Record<string, string>} values
 * @returns {object}
 */
function parseStockUpdateOptions(values) {
  const mode = values.mode ?? 'update';
  const startDate = parseIsoDate(values.from ?? DEFAULT_START_DATE, 'from');
  const endDate = parseIsoDate(values.to ?? todayIsoDate(), 'to');

  if (!['update', 'backfill'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Use update or backfill.`);
  }

  if (startDate > endDate) {
    throw new Error(`from must be before to: ${startDate} > ${endDate}`);
  }

  return {
    mode,
    startDate,
    endDate,
    refreshDays: toPositiveInteger(values['refresh-days'] ?? '3', 'refresh-days'),
    concurrency: toPositiveInteger(values.concurrency ?? '2', 'concurrency'),
    delayMs: toNonNegativeInteger(values['delay-ms'] ?? '500', 'delay-ms'),
    limit: values.limit ? toPositiveInteger(values.limit, 'limit') : null,
    force: values.force === 'true',
    dryRun: values['dry-run'] === 'true',
  };
}

/**
 * Resolve symbol input from one symbol, comma-separated symbols, or synced list.
 *
 * @param {Record<string, string>} values
 * @returns {Promise<string[]>}
 */
async function resolveSymbols(values) {
  if (values.symbol) {
    return [values.symbol.toUpperCase()];
  }

  if (values.symbols) {
    return values.symbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  }

  if (values.all === 'true') {
    const assets = await readJsonIfExists(join(repoRoot, 'data', 'assets', 'stocks-kbs.json'));
    if (!assets?.assets?.length) {
      throw new Error('Missing data/assets/stocks-kbs.json. Run assets:sync first.');
    }

    return assets.assets.map((asset) => asset.symbol);
  }

  throw new Error('Choose --symbol=FPT, --symbols=FPT,HPG, or --all=true');
}

function printUsage() {
  console.log(`Usage:
  node collector/bin/market-data.mjs assets:sync

  node collector/bin/market-data.mjs stocks:update --symbol=FPT
  node collector/bin/market-data.mjs stocks:update --symbols=FPT,HPG
  node collector/bin/market-data.mjs stocks:update --all=true

Options:
  --mode=update|backfill       Default: update
  --from=YYYY-MM-DD            Default: 2000-01-01
  --to=YYYY-MM-DD              Default: today
  --refresh-days=3             Recheck recent rows in update mode
  --concurrency=2              Parallel symbols
  --delay-ms=500               Delay between symbol starts
  --limit=10                   Limit selected symbols
  --force=true                 Re-fetch existing historical years in backfill mode
  --dry-run=true               Show planned work only`);
}
