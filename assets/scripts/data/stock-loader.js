/**
 * Load stock rows across all year files touched by the requested range.
 *
 * Missing year files are ignored because a symbol may not have listed yet. A
 * range like 2000-01-01 -> 2026-01-01 can therefore work even when the first
 * real rows only start years later.
 *
 * @param {object} input
 * @param {string} input.symbol
 * @param {string} input.fromDate
 * @param {string} input.toDate
 * @returns {Promise<object>}
 */
export async function loadStockRange({ symbol, fromDate, toDate }) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const datasets = await loadYearFiles(normalizedSymbol, fromDate, toDate);
  const rows = datasets
    .flatMap((dataset) => dataset.rows)
    .filter((row) => row.date >= fromDate && row.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    throw new Error(`Không có dữ liệu cho ${normalizedSymbol} trong khoảng đã chọn`);
  }

  return {
    symbol: normalizedSymbol,
    source: datasets[0]?.source ?? "unknown",
    rows,
  };
}

/**
 * Load every available year file touched by a date range.
 *
 * @param {string} symbol
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<object[]>}
 */
async function loadYearFiles(symbol, fromDate, toDate) {
  const yearFiles = yearsBetween(fromDate, toDate).map((year) => loadStockYearIfExists(symbol, year));
  return (await Promise.all(yearFiles)).filter(Boolean);
}

/**
 * Load one stock-year JSON file, returning null for missing files.
 *
 * @param {string} symbol
 * @param {number} year
 * @returns {Promise<object|null>}
 */
async function loadStockYearIfExists(symbol, year) {
  const response = await fetch(`data/stocks/${symbol}/${year}.json`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Không tải được ${symbol} ${year}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  validateStockYear(data, symbol, year);
  return data;
}

/**
 * Validate the minimum shape used by the demo chart.
 *
 * @param {object} data
 * @param {string} symbol
 * @param {number} year
 */
function validateStockYear(data, symbol, year) {
  if (data?.assetId !== symbol || data.year !== year || !Array.isArray(data.rows)) {
    throw new Error(`Dữ liệu ${symbol} ${year} không đúng định dạng`);
  }
}

/**
 * List all years touched by an ISO date range.
 *
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {number[]}
 */
function yearsBetween(fromDate, toDate) {
  const years = [];

  for (let year = Number(fromDate.slice(0, 4)); year <= Number(toDate.slice(0, 4)); year += 1) {
    years.push(year);
  }

  return years;
}
