import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Read JSON if the file exists.
 *
 * @param {string} path
 * @returns {Promise<unknown|null>}
 */
export async function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Write JSON through a temporary file and atomic rename.
 *
 * This protects existing market data from partial writes if the process exits
 * midway through a write.
 *
 * @param {string} path
 * @param {unknown} data
 */
export async function writeJsonAtomic(path, data) {
  const tempPath = `${path}.tmp`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
}
