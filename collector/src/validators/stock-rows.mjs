/**
 * Validate normalized stock rows before merge/write.
 *
 * @param {Array<object>} rows
 */
export function validateStockRows(rows) {
  const seen = new Set();

  for (const row of rows) {
    if (seen.has(row.date)) {
      throw new Error(`Duplicate trading date: ${row.date}`);
    }

    seen.add(row.date);
    validateOhlcRange(row);
  }
}

function validateOhlcRange(row) {
  if (row.low > row.open || row.low > row.close || row.high < row.open || row.high < row.close) {
    throw new Error(`Invalid OHLC range on ${row.date}`);
  }
}
