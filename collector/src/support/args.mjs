/**
 * Parse CLI arguments in `--name=value` form.
 *
 * Keeping this strict avoids ambiguous flags when commands are later automated
 * by GitHub Actions or Windows scripts.
 *
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  const parsed = {};

  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      throw new Error(`Invalid argument: ${arg}. Use --name=value`);
    }

    parsed[match[1]] = match[2];
  }

  return parsed;
}

/**
 * Convert a user supplied value into a positive integer.
 *
 * @param {string} value
 * @param {string} name
 * @returns {number}
 */
export function toPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return number;
}

/**
 * Convert a user supplied value into a non-negative integer.
 *
 * @param {string} value
 * @param {string} name
 * @returns {number}
 */
export function toNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return number;
}
