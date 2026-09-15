/**
 * Convert Date to local ISO date without timezone shifts.
 *
 * @param {Date} date
 * @returns {string}
 */
export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format an ISO date as dd/mm/yyyy.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatDisplayDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

/**
 * Return the next local ISO date after a given ISO date.
 *
 * @param {string} value
 * @returns {string}
 */
export function nextIsoDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return toIsoDate(date);
}

/**
 * Return the local ISO date before a given ISO date.
 *
 * @param {string} value
 * @returns {string}
 */
export function previousIsoDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
}
