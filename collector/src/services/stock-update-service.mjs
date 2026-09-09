import { maxDate, minDate, shiftIsoDate, yearFromIso, yearsBetween } from '../support/dates.mjs';
import { validateStockRows } from '../validators/stock-rows.mjs';

/**
 * Coordinates stock backfill/update without knowing provider or file details.
 */
export class StockUpdateService {
  /**
   * @param {object} params
   * @param {{fetchDailyRows(symbol: string, fromIso: string, toIso: string): Promise<Array<object>>}} params.provider
   * @param {import('../repositories/stock-repository.mjs').StockRepository} params.repository
   */
  constructor({ provider, repository }) {
    this.provider = provider;
    this.repository = repository;
  }

  /**
   * Update one symbol according to the selected mode.
   *
   * @param {object} input
   * @returns {Promise<string>}
   */
  async updateSymbol(input) {
    if (input.mode === 'backfill') {
      return this.backfillSymbol(input);
    }

    return this.refreshSymbol(input);
  }

  async backfillSymbol({ symbol, startDate, endDate, force, dryRun }) {
    const existingYears = await this.repository.listYears(symbol);
    const yearsToWrite = yearsBetween(startDate, endDate).filter(
      (year) => force || !existingYears.includes(year) || year === yearFromIso(endDate),
    );

    if (dryRun) {
      for (const year of yearsToWrite) {
        console.log(`[DRY] ${symbol} ${year}: backfill ${startDate} -> ${endDate}`);
      }

      return `${yearsToWrite.length} planned file(s)`;
    }

    if (yearsToWrite.length === 0) {
      return 'up to date';
    }

    const fetchedRows = await this.provider.fetchDailyRows(symbol, startDate, endDate);
    const rowsByYear = groupRowsByYear(fetchedRows);
    let changedFiles = 0;

    for (const [year, rows] of rowsByYear) {
      if (!yearsToWrite.includes(year)) {
        continue;
      }

      const existing = await this.repository.readYear(symbol, year);
      await this.repository.writeYear(symbol, year, existing, mergeRows(existing?.rows ?? [], rows));
      changedFiles += 1;
    }

    return `${changedFiles} written file(s)`;
  }

  async refreshSymbol({ symbol, startDate, endDate, refreshDays, dryRun }) {
    const existingYears = await this.repository.listYears(symbol);
    const plans = await this.createRefreshPlans(symbol, existingYears, startDate, endDate, refreshDays);

    if (plans.length === 0) {
      return 'up to date';
    }

    let changedFiles = 0;
    for (const plan of plans) {
      if (dryRun) {
        console.log(`[DRY] ${symbol} ${plan.year}: ${plan.from} -> ${plan.to}`);
        continue;
      }

      const fetchedRows = await this.provider.fetchDailyRows(symbol, plan.from, plan.to);
      const mergedRows = mergeRows(plan.existing?.rows ?? [], fetchedRows);
      if (mergedRows.length === 0) {
        continue;
      }

      await this.repository.writeYear(symbol, plan.year, plan.existing, mergedRows);
      changedFiles += 1;
    }

    return dryRun ? `${plans.length} planned file(s)` : `${changedFiles} written file(s)`;
  }

  async createRefreshPlans(symbol, existingYears, startDate, endDate, refreshDays) {
    if (existingYears.length === 0) {
      const currentYear = yearFromIso(endDate);
      return [
        {
          year: currentYear,
          from: maxDate(startDate, `${currentYear}-01-01`),
          to: endDate,
          existing: null,
        },
      ];
    }

    const refreshFrom = maxDate(startDate, shiftIsoDate(endDate, -refreshDays + 1));
    const plans = [];

    for (const year of existingYears) {
      const yearStart = maxDate(refreshFrom, `${year}-01-01`);
      const yearEnd = minDate(endDate, `${year}-12-31`);
      if (yearStart > yearEnd) {
        continue;
      }

      plans.push({
        year,
        from: yearStart,
        to: yearEnd,
        existing: await this.repository.readYear(symbol, year),
      });
    }

    return plans;
  }
}

function mergeRows(existingRows, fetchedRows) {
  const byDate = new Map();

  for (const row of existingRows) {
    byDate.set(row.date, row);
  }

  for (const row of fetchedRows) {
    byDate.set(row.date, row);
  }

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  validateStockRows(rows);
  return rows;
}

function groupRowsByYear(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const year = yearFromIso(row.date);
    const yearRows = grouped.get(year) ?? [];
    yearRows.push(row);
    grouped.set(year, yearRows);
  }

  return [...grouped.entries()].sort(([left], [right]) => left - right);
}
