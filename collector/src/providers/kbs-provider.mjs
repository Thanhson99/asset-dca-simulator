import { isoToKbsDate } from '../support/dates.mjs';

const KBS_BASE_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment';
const USER_AGENT =
  'Mozilla/5.0 (compatible; asset-dca-simulator/0.1; +https://github.com/thanhson99/asset-dca-simulator)';
const STOCK_EXCHANGES = new Set(['HOSE', 'HNX', 'UPCOM']);

/**
 * Fetch and normalize the KBS stock universe.
 *
 * @returns {Promise<Array<object>>}
 */
export async function fetchKbsStockAssets() {
  const payload = await fetchJson(`${KBS_BASE_URL}/stock/search/data`);

  if (!Array.isArray(payload)) {
    throw new Error('KBS asset response is not an array');
  }

  return payload
    .filter((item) => item?.type === 'stock' && STOCK_EXCHANGES.has(item.exchange))
    .map((item) => ({
      id: `VN:${item.exchange}:${item.symbol}`,
      symbol: item.symbol,
      exchange: item.exchange,
      type: 'stock',
      name: item.name ?? null,
      nameEn: item.nameEn ?? null,
      source: 'kbs-public-poc',
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Fetch normalized daily OHLC rows for one stock.
 *
 * @param {string} symbol
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Promise<Array<object>>}
 */
export async function fetchKbsDailyRows(symbol, fromIso, toIso) {
  const url = new URL(`${KBS_BASE_URL}/stocks/${symbol}/data_day`);
  url.searchParams.set('sdate', isoToKbsDate(fromIso));
  url.searchParams.set('edate', isoToKbsDate(toIso));

  return normalizeDailyPayload(await fetchJson(url.toString()), symbol);
}

/**
 * Convert KBS provider rows into the repository stock row format.
 *
 * KBS has occasional OHLC rows where high/low do not wrap open/close. The DCA
 * simulator uses close price, so we repair the range and keep a visible flag.
 *
 * @param {object} payload
 * @param {string} expectedSymbol
 * @returns {Array<object>}
 */
function normalizeDailyPayload(payload, expectedSymbol) {
  if (!payload || payload.symbol?.toUpperCase() !== expectedSymbol) {
    throw new Error(`Unexpected symbol in provider response: ${payload?.symbol}`);
  }

  if (!Array.isArray(payload.data_day)) {
    throw new Error('Provider response is missing data_day array');
  }

  return payload.data_day
    .map((row) =>
      normalizeOhlcRow({
        date: parseProviderDate(row.t),
        open: toInteger(row.o, 'open'),
        high: toInteger(row.h, 'high'),
        low: toInteger(row.l, 'low'),
        close: toInteger(row.c, 'close'),
        volume: toInteger(row.v, 'volume'),
        value: row.va === undefined ? null : toInteger(row.va, 'value'),
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeOhlcRow(row) {
  const expectedLow = Math.min(row.open, row.high, row.low, row.close);
  const expectedHigh = Math.max(row.open, row.high, row.low, row.close);

  if (row.low === expectedLow && row.high === expectedHigh) {
    return row;
  }

  return {
    ...row,
    high: expectedHigh,
    low: expectedLow,
    flags: [...(row.flags ?? []), 'ohlc_range_repaired'],
  };
}

function parseProviderDate(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!match) {
    throw new Error(`Unsupported trading date format: ${value}`);
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return Math.round(number);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}
