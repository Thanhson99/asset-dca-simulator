/**
 * Build a monthly DCA simulation from daily market rows.
 *
 * The default buy rule uses the first available market row on or after the
 * selected day of month. Other rules are benchmarks and are explicit in UI.
 *
 * @param {Array<object>} rows
 * @param {object} options
 * @param {number} options.monthlyAmount
 * @param {string} options.fromDate
 * @param {string} options.buyStrategy
 * @param {{units: number, investedValue: number}} [options.initialPosition]
 * @returns {Array<object>}
 */
export function buildMonthlyDcaRows(rows, { monthlyAmount, fromDate, buyStrategy, initialPosition = null }) {
  if (rows.length === 0) {
    return [];
  }

  const buyEvents = createMonthlyBuyEvents(rows, {
    monthlyAmount,
    fromDate,
    buyStrategy,
  });
  const eventsByIndex = groupEventsByIndex(buyEvents);
  let units = initialPosition?.units ?? 0;
  let investedValue = initialPosition?.investedValue ?? 0;

  return rows.map((row, index) => {
    const events = eventsByIndex.get(index) || [];

    for (const event of events) {
      units += event.amount / event.price;
      investedValue += event.amount;
    }

    return {
      ...row,
      investmentValue: units * row.close,
      investedValue,
      bought: events.length > 0,
      units,
    };
  });
}

/**
 * Add a chart value field for price-only mode.
 *
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
export function buildPriceRows(rows) {
  return rows.map((row) => ({
    ...row,
    investmentValue: 0,
    investedValue: 0,
    units: 0,
  }));
}

/**
 * Merge comparison datasets on a shared calendar timeline.
 *
 * Thinly traded symbols can miss dates that the main symbol has. In that case
 * the chart carries the latest known row for that symbol instead of dropping
 * the whole date from every line.
 *
 * @param {Array<object>} primaryRows
 * @param {Array<{id: string, rows: Array<object>}>} comparisons
 * @returns {Array<object>}
 */
export function buildMultiComparisonRows(primaryRows, comparisons) {
  if (comparisons.length === 0) {
    return primaryRows;
  }

  const primaryIndex = createForwardFillIndex(primaryRows);
  const compareIndexes = comparisons.map((comparison) => ({
    id: comparison.id,
    index: createForwardFillIndex(comparison.rows),
  }));
  const dates = uniqueSortedDates([primaryRows, ...comparisons.map((comparison) => comparison.rows)]);

  return dates.map((date) => {
    const primaryRow = primaryIndex.rowForDate(date);
    const merged = { ...primaryRow, date, sourceDate: primaryRow.date };

    for (const comparison of compareIndexes) {
      const compareRow = comparison.index.rowForDate(date);

      merged[`${comparison.id}Date`] = compareRow.date;
      merged[`${comparison.id}Close`] = compareRow.close;
      merged[`${comparison.id}InvestmentValue`] = compareRow.investmentValue;
      merged[`${comparison.id}InvestedValue`] = compareRow.investedValue;
      merged[`${comparison.id}Units`] = compareRow.units;
    }

    return merged;
  });
}

/**
 * Create a small date lookup that returns the latest row at or before a date.
 *
 * @param {Array<object>} rows
 * @returns {{rowForDate: (date: string) => object}}
 */
function createForwardFillIndex(rows) {
  const sortedRows = [...rows].sort((left, right) => left.date.localeCompare(right.date));
  let cursor = 0;

  return {
    rowForDate(date) {
      while (cursor + 1 < sortedRows.length && sortedRows[cursor + 1].date <= date) {
        cursor += 1;
      }

      return sortedRows[cursor];
    },
  };
}

/**
 * Create sorted unique dates across every visible series.
 *
 * @param {Array<Array<object>>} rowGroups
 * @returns {Array<string>}
 */
function uniqueSortedDates(rowGroups) {
  return [...new Set(rowGroups.flatMap((rows) => rows.map((row) => row.date)))].sort();
}

/**
 * Create buy events for every month touched by the selected range.
 *
 * @param {Array<object>} rows
 * @param {object} options
 * @param {number} options.monthlyAmount
 * @param {string} options.fromDate
 * @param {string} options.buyStrategy
 * @returns {Array<object>}
 */
function createMonthlyBuyEvents(rows, { monthlyAmount, fromDate, buyStrategy }) {
  const monthGroups = groupRowsByMonth(rows);
  const events = [];

  for (const monthRows of monthGroups.values()) {
    events.push(...createBuyEventsForMonth(monthRows, { monthlyAmount, fromDate, buyStrategy }));
  }

  return events.sort((left, right) => left.index - right.index);
}

/**
 * Create buy events for one month according to the selected strategy.
 *
 * @param {Array<object>} monthRows
 * @param {object} options
 * @param {number} options.monthlyAmount
 * @param {string} options.fromDate
 * @param {string} options.buyStrategy
 * @returns {Array<object>}
 */
function createBuyEventsForMonth(monthRows, { monthlyAmount, fromDate, buyStrategy }) {
  if (buyStrategy === "first_trading_day") {
    return [createBuyEvent(monthRows[0], monthlyAmount, monthRows[0].close)];
  }

  if (buyStrategy === "last_trading_day") {
    const row = monthRows.at(-1);
    return [createBuyEvent(row, monthlyAmount, row.close)];
  }

  if (buyStrategy === "average_first_5") {
    return createSplitBuyEvents(monthRows.slice(0, 5), monthlyAmount);
  }

  if (buyStrategy === "monthly_average") {
    return [createBuyEvent(monthRows[0], monthlyAmount, averageClose(monthRows))];
  }

  if (buyStrategy === "monthly_low") {
    return [createBuyEvent(monthRows[0], monthlyAmount, lowestClose(monthRows))];
  }

  const row = findFixedDayRow(monthRows, fromDate);
  return [createBuyEvent(row, monthlyAmount, row.close)];
}

/**
 * Group daily rows by `YYYY-MM`.
 *
 * @param {Array<object>} rows
 * @returns {Map<string, Array<object>>}
 */
function groupRowsByMonth(rows) {
  const groups = new Map();

  rows.forEach((row, index) => {
    const monthKey = row.date.slice(0, 7);
    const group = groups.get(monthKey) || [];

    group.push({ ...row, rowIndex: index });
    groups.set(monthKey, group);
  });

  return groups;
}

/**
 * Find the first available trading row on or after the selected day of month.
 *
 * @param {Array<object>} monthRows
 * @param {string} fromDate
 * @returns {object}
 */
function findFixedDayRow(monthRows, fromDate) {
  const targetDay = new Date(`${fromDate}T00:00:00`).getDate();
  return monthRows.find((row) => Number(row.date.slice(8, 10)) >= targetDay) || monthRows.at(-1);
}

/**
 * Split monthly capital equally across several real trading rows.
 *
 * @param {Array<object>} rows
 * @param {number} monthlyAmount
 * @returns {Array<object>}
 */
function createSplitBuyEvents(rows, monthlyAmount) {
  const amount = monthlyAmount / rows.length;
  return rows.map((row) => createBuyEvent(row, amount, row.close));
}

/**
 * Create one normalized buy event.
 *
 * @param {object} row
 * @param {number} amount
 * @param {number} price
 * @returns {object}
 */
function createBuyEvent(row, amount, price) {
  return {
    index: row.rowIndex,
    amount,
    price,
  };
}

/**
 * Calculate average close for one month.
 *
 * @param {Array<object>} rows
 * @returns {number}
 */
function averageClose(rows) {
  return rows.reduce((total, row) => total + row.close, 0) / rows.length;
}

/**
 * Find the lowest close for one month.
 *
 * @param {Array<object>} rows
 * @returns {number}
 */
function lowestClose(rows) {
  return Math.min(...rows.map((row) => row.close));
}

/**
 * Group multiple split purchases by chart row index.
 *
 * @param {Array<object>} events
 * @returns {Map<number, Array<object>>}
 */
function groupEventsByIndex(events) {
  const groups = new Map();

  for (const event of events) {
    const group = groups.get(event.index) || [];
    group.push(event);
    groups.set(event.index, group);
  }

  return groups;
}
