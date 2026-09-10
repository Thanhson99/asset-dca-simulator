#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

const FEATURED_SYMBOLS = [
  'ACB',
  'BCM',
  'BID',
  'BVH',
  'CTG',
  'FPT',
  'GAS',
  'GVR',
  'HDB',
  'HPG',
  'LPB',
  'MBB',
  'MSN',
  'MWG',
  'PLX',
  'SAB',
  'SHB',
  'SSB',
  'SSI',
  'STB',
  'TCB',
  'TPB',
  'VCB',
  'VHM',
  'VIB',
  'VIC',
  'VJC',
  'VNM',
  'VPB',
  'VRE',
];

const EXCHANGE_PRIORITY = new Map([
  ['HOSE', 0],
  ['HNX', 1],
  ['UPCOM', 2],
]);

const [command, ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);

try {
  if (command === 'assets:sync') {
    await syncAssets();
  } else if (command === 'stocks:update') {
    await updateStocks();
  } else if (command === 'stocks:queue:init') {
    await initStockQueue();
  } else if (command === 'stocks:queue:run') {
    await runStockQueue();
  } else {
    printUsage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}

/**
 * Create a resumable download queue from the synced stock universe.
 */
async function initStockQueue() {
  const limit = toPositiveInteger(args.limit ?? '500', 'limit');
  const assets = await readSyncedAssets();
  const selectedAssets = pickQueueAssets(assets).slice(0, limit);
  const generatedAt = new Date().toISOString();

  await writeJsonAtomic(stockQueuePath(), {
    version: 1,
    source: 'kbs-public-poc',
    generatedAt,
    updatedAt: generatedAt,
    defaultFrom: args.from ?? DEFAULT_START_DATE,
    count: selectedAssets.length,
    items: selectedAssets.map((asset, index) => ({
      order: index + 1,
      symbol: asset.symbol,
      exchange: asset.exchange,
      name: asset.name ?? null,
      status: 'pending',
      attempts: 0,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastResult: null,
      lastError: null,
    })),
  });

  console.log(`Created ${stockQueuePath()} with ${selectedAssets.length} symbol(s).`);
}

/**
 * Run the resumable stock download queue one symbol at a time.
 */
async function runStockQueue() {
  const queue = await readStockQueue();
  const options = parseStockUpdateOptions({
    ...args,
    mode: args.mode ?? 'backfill',
    from: args.from ?? queue.defaultFrom ?? DEFAULT_START_DATE,
  });
  const maxSymbols = args.limit ? toPositiveInteger(args.limit, 'limit') : null;
  const delayMs = toNonNegativeInteger(args['delay-ms'] ?? String(options.delayMs), 'delay-ms');
  const service = new StockUpdateService({
    provider: { fetchDailyRows: fetchKbsDailyRows },
    repository: new StockRepository(repoRoot),
  });
  const candidates = queue.items.filter((item) => item.status !== 'done');
  const selectedItems = candidates.slice(0, maxSymbols ?? candidates.length);

  console.log(
    `Running stocks:queue:run symbols=${selectedItems.length} from=${options.startDate} to=${options.endDate}`,
  );

  if (options.dryRun) {
    for (const item of selectedItems) {
      const result = await service.updateSymbol({ symbol: item.symbol, ...options });
      console.log(`[OK] ${item.symbol}: ${result}`);
    }

    return;
  }

  for (let index = 0; index < selectedItems.length; index += 1) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    await runQueuedSymbol(queue, selectedItems[index], service, options);
  }

  await rebuildRunnableStockIndex();
  console.log(`Queue done=${countQueueStatus(queue, 'done')} failed=${countQueueStatus(queue, 'failed')} total=${queue.items.length}.`);
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

  if (!options.dryRun) {
    await rebuildRunnableStockIndex();
  }
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

/**
 * Read the synced KBS asset universe.
 *
 * @returns {Promise<Array<object>>}
 */
async function readSyncedAssets() {
  const data = await readJsonIfExists(join(repoRoot, 'data', 'assets', 'stocks-kbs.json'));
  if (!data?.assets?.length) {
    throw new Error('Missing data/assets/stocks-kbs.json. Run assets:sync first.');
  }

  return data.assets;
}

/**
 * Pick a practical default queue: featured symbols first, then HOSE, HNX, UPCOM.
 *
 * KBS does not expose market cap in the synced universe, so this keeps the
 * blue-chip set first and then falls back to exchange priority.
 *
 * @param {Array<object>} assets
 * @returns {Array<object>}
 */
function pickQueueAssets(assets) {
  const bySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
  const featured = FEATURED_SYMBOLS.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
  const featuredSet = new Set(featured.map((asset) => asset.symbol));
  const remaining = assets
    .filter((asset) => !featuredSet.has(asset.symbol))
    .sort((left, right) => {
      const exchangeDiff = (EXCHANGE_PRIORITY.get(left.exchange) ?? 99) - (EXCHANGE_PRIORITY.get(right.exchange) ?? 99);
      return exchangeDiff || left.symbol.localeCompare(right.symbol);
    });

  return [...featured, ...remaining];
}

/**
 * Process one queued symbol and persist its status before and after network work.
 *
 * @param {object} queue
 * @param {object} item
 * @param {StockUpdateService} service
 * @param {object} options
 */
async function runQueuedSymbol(queue, item, service, options) {
  const startedAt = new Date().toISOString();
  Object.assign(item, {
    status: 'running',
    attempts: item.attempts + 1,
    lastStartedAt: startedAt,
    lastFinishedAt: null,
    lastResult: null,
    lastError: null,
  });
  await writeStockQueue(queue);

  try {
    const result = await service.updateSymbol({ symbol: item.symbol, ...options });
    Object.assign(item, {
      status: 'done',
      lastFinishedAt: new Date().toISOString(),
      lastResult: result,
      lastError: null,
    });
    console.log(`[OK] ${item.symbol}: ${result}`);
  } catch (error) {
    Object.assign(item, {
      status: 'failed',
      lastFinishedAt: new Date().toISOString(),
      lastResult: null,
      lastError: error.message,
    });
    console.error(`[FAIL] ${item.symbol}: ${error.message}`);
  } finally {
    await writeStockQueue(queue);
  }
}

/**
 * Read the stock queue JSON.
 *
 * @returns {Promise<object>}
 */
async function readStockQueue() {
  const queue = await readJsonIfExists(stockQueuePath());
  if (!queue?.items?.length) {
    throw new Error(`Missing ${stockQueuePath()}. Run stocks:queue:init first.`);
  }

  return queue;
}

/**
 * Persist the stock queue JSON.
 *
 * @param {object} queue
 */
async function writeStockQueue(queue) {
  queue.updatedAt = new Date().toISOString();
  await writeJsonAtomic(stockQueuePath(), {
    ...queue,
    count: queue.items.length,
  });
}

/**
 * Count queue items with a given status.
 *
 * @param {object} queue
 * @param {string} status
 * @returns {number}
 */
function countQueueStatus(queue, status) {
  return queue.items.filter((item) => item.status === status).length;
}

/**
 * Path to the resumable stock queue.
 *
 * @returns {string}
 */
function stockQueuePath() {
  return join(repoRoot, 'data', 'stocks', 'download-queue.json');
}

/**
 * Rebuild the frontend symbol list from symbols that have local year files.
 */
async function rebuildRunnableStockIndex() {
  const stockRoot = join(repoRoot, 'data', 'stocks');
  if (!existsSync(stockRoot)) {
    return;
  }

  const syncedAssets = await readJsonIfExists(join(repoRoot, 'data', 'assets', 'stocks-kbs.json'));
  const assetsBySymbol = new Map((syncedAssets?.assets ?? []).map((asset) => [asset.symbol, asset]));
  const entries = await readdir(stockRoot, { withFileTypes: true });
  const assets = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const years = (await readdir(join(stockRoot, entry.name)))
      .map((file) => file.match(/^(\d{4})\.json$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((left, right) => left - right);

    if (years.length === 0) {
      continue;
    }

    const asset = assetsBySymbol.get(entry.name);
    assets.push({
      symbol: entry.name,
      name: asset?.name ?? null,
      exchange: asset?.exchange ?? null,
      years,
    });
  }

  assets.sort((left, right) => left.symbol.localeCompare(right.symbol));
  await writeJsonAtomic(join(stockRoot, 'index.json'), { assets });
  console.log(`Updated data/stocks/index.json with ${assets.length} runnable symbol(s).`);
}

function printUsage() {
  console.log(`Usage:
  node collector/bin/market-data.mjs assets:sync

  node collector/bin/market-data.mjs stocks:update --symbol=FPT
  node collector/bin/market-data.mjs stocks:update --symbols=FPT,HPG
  node collector/bin/market-data.mjs stocks:update --all=true
  node collector/bin/market-data.mjs stocks:queue:init --limit=500
  node collector/bin/market-data.mjs stocks:queue:run --limit=10

Options:
  --mode=update|backfill       Default: update
  --from=YYYY-MM-DD            Default: 2000-01-01
  --to=YYYY-MM-DD              Default: today
  --refresh-days=3             Recheck recent rows in update mode
  --concurrency=2              Parallel symbols
  --delay-ms=500               Delay between symbol starts
  --limit=10                   Limit selected symbols
  --force=true                 Re-fetch existing historical years in backfill mode
  --dry-run=true               Show planned work only

Queue:
  stocks:queue:init creates data/stocks/download-queue.json
  stocks:queue:run defaults to backfill from 2000-01-01, marks each symbol done/failed, and can be resumed`);
}
