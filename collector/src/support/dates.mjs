/**
 * Validate a date string used by the collector.
 *
 * @param {string} value
 * @param {string} name
 * @returns {string}
 */
export function parseIsoDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${name} date: ${value}. Use YYYY-MM-DD.`);
  }

  return value;
}

/**
 * Format an ISO date as required by KBS endpoints.
 *
 * @param {string} value
 * @returns {string}
 */
export function isoToKbsDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Return today's date in UTC ISO format.
 *
 * @returns {string}
 */
export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shift an ISO date by a number of days.
 *
 * @param {string} value
 * @param {number} days
 * @returns {string}
 */
export function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Return every year touched by a date range.
 *
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number[]}
 */
export function yearsBetween(fromIso, toIso) {
  const years = [];

  for (let year = yearFromIso(fromIso); year <= yearFromIso(toIso); year += 1) {
    years.push(year);
  }

  return years;
}

/**
 * Extract year from an ISO date.
 *
 * @param {string} value
 * @returns {number}
 */
export function yearFromIso(value) {
  return Number(value.slice(0, 4));
}

export function minDate(left, right) {
  return left < right ? left : right;
}

export function maxDate(left, right) {
  return left > right ? left : right;
}
