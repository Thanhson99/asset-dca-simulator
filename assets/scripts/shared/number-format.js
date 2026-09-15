/**
 * Parse VND text input such as `1.000.000` or `1,000,000`.
 *
 * @param {string} value
 * @returns {number}
 */
export function parseVndInput(value) {
  const digits = String(value).replace(/\D/g, "");
  return Number(digits || 0);
}

/**
 * Parse signed VND input such as `-5.000.000` or `+500.000`.
 *
 * @param {string} value
 * @returns {number}
 */
export function parseSignedVndInput(value) {
  const text = String(value || "").trim();
  const amount = parseVndInput(text);
  return text.startsWith("-") ? -amount : amount;
}

/**
 * Parse an optional numeric input, treating blank/invalid values as zero.
 *
 * @param {string} value
 * @returns {number}
 */
export function parseOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Format a VND number without currency text.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatVnd(value) {
  return Math.round(value).toLocaleString("vi-VN");
}

/**
 * Format a free-typed VND input while the user is entering digits.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatVndInputText(value) {
  const amount = parseVndInput(value);
  return amount > 0 ? formatVnd(amount) : "";
}

/**
 * Format a full VND currency label.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatFullMoney(value) {
  return `${formatVnd(value)} VNĐ`;
}

/**
 * Format a percentage value for compact Vietnamese UI.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatPercent(value) {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}%`;
}

/**
 * Format a plain number without locale separators for numeric inputs.
 *
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
export function formatPlainNumber(value, digits) {
  return Number(value.toFixed(digits)).toString();
}

/**
 * Clamp a numeric input into an allowed range.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
