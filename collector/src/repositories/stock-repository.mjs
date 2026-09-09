import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { yearFromIso } from '../support/dates.mjs';
import { readJsonIfExists, writeJsonAtomic } from '../support/fs-json.mjs';
import { validateStockRows } from '../validators/stock-rows.mjs';

/**
 * Repository for stock JSON files under `data/stocks/{SYMBOL}/{YEAR}.json`.
 */
export class StockRepository {
  /**
   * @param {string} repoRoot
   */
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
  }

  /**
   * List existing year files for a symbol.
   *
   * @param {string} symbol
   * @returns {Promise<number[]>}
   */
  async listYears(symbol) {
    const stockDir = join(this.repoRoot, 'data', 'stocks', symbol);
    if (!existsSync(stockDir)) {
      return [];
    }

    const entries = await readdir(stockDir);
    return entries
      .map((entry) => entry.match(/^(\d{4})\.json$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
  }

  /**
   * Read a stock-year file if present.
   *
   * @param {string} symbol
   * @param {number} year
   * @returns {Promise<object|null>}
   */
  async readYear(symbol, year) {
    const data = await readJsonIfExists(this.yearPath(symbol, year));
    if (!data) {
      return null;
    }

    if (!Array.isArray(data.rows)) {
      throw new Error(`Existing file is missing rows: ${this.yearPath(symbol, year)}`);
    }

    validateStockRows(data.rows);
    return data;
  }

  /**
   * Write one stock-year file.
   *
   * @param {string} symbol
   * @param {number} year
   * @param {object|null} existing
   * @param {Array<object>} rows
   */
  async writeYear(symbol, year, existing, rows) {
    const yearRows = rows.filter((row) => yearFromIso(row.date) === year);
    validateStockRows(yearRows);

    await writeJsonAtomic(this.yearPath(symbol, year), {
      version: 1,
      assetId: symbol,
      assetType: 'stock',
      market: existing?.market ?? 'VN',
      currency: 'VND',
      year,
      source: 'kbs-public-poc',
      generatedAt: new Date().toISOString(),
      rows: yearRows,
    });
  }

  yearPath(symbol, year) {
    return join(this.repoRoot, 'data', 'stocks', symbol, `${year}.json`);
  }
}
