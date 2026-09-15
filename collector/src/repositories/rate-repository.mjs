import { join } from 'node:path';
import { readJsonIfExists, writeJsonAtomic } from '../support/fs-json.mjs';
import { validateRateHistory } from '../validators/rate-snapshots.mjs';

/**
 * Repository for rate JSON files under data/rates.
 */
export class RateRepository {
  /**
   * @param {string} repoRoot
   */
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
  }

  async readIndex() {
    const index = await readJsonIfExists(join(this.repoRoot, 'data', 'rates', 'index.json'));
    return { products: Array.isArray(index?.products) ? index.products : [] };
  }

  async readHistory(product) {
    const history = await readJsonIfExists(join(this.repoRoot, product.dataPath));
    if (!history) {
      throw new Error(`Missing rate history: ${product.dataPath}`);
    }

    validateRateHistory(history);
    return history;
  }

  async writeHistory(product, history) {
    validateRateHistory(history);
    await writeJsonAtomic(join(this.repoRoot, product.dataPath), history);
  }
}
