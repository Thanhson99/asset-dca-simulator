/**
 * Render chart heading and status text.
 *
 * @param {object} data
 * @param {object} filters
 * @param {object} asset
 */
export function renderChartMeta(data, filters, asset = null) {
  const modeLabel = filters.mode === "dca" ? "Biểu đồ mô phỏng" : "Biểu đồ giá";
  const actualFrom = data.rows[0]?.date;
  const actualTo = data.rows.at(-1)?.date;
  const coverage = describeCoverage(filters, actualFrom, actualTo);

  setText("chart-eyebrow", "DCA simulator");
  setText("chart-title", `${modeLabel} ${formatAssetName(data.symbol, asset)}`);
  setText("chart-status", coverage.text);
  setClass("chart-status", "source-label", coverage.warning ? "source-label is-warning" : "source-label");
}

/**
 * Render a load or validation error in the chart heading.
 *
 * @param {Error} error
 */
export function renderChartError(error) {
  setText("chart-title", "Không tải được khoảng dữ liệu");
  setText("chart-status", error.message);
  setClass("chart-status", "source-label", "source-label is-warning");
}

/**
 * Set text content only if the target exists.
 *
 * @param {string} id
 * @param {string} value
 */
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

/**
 * Set a className only if the target exists.
 *
 * @param {string} id
 * @param {string} fallbackClass
 * @param {string} value
 */
function setClass(id, fallbackClass, value) {
  const element = document.getElementById(id);
  if (element) {
    element.className = value || fallbackClass;
  }
}

/**
 * Build a readable asset label for the chart title.
 *
 * @param {string} symbol
 * @param {object|null} asset
 * @returns {string}
 */
function formatAssetName(symbol, asset) {
  return [symbol, asset?.name, asset?.exchange].filter(Boolean).join(" - ");
}

/**
 * Describe whether the selected range is fully covered by local data.
 *
 * @param {object} filters
 * @param {string} actualFrom
 * @param {string} actualTo
 * @returns {{text: string, warning: boolean}}
 */
function describeCoverage(filters, actualFrom, actualTo) {
  if (!actualFrom || !actualTo) {
    return { text: "Chưa có dữ liệu trong khoảng này", warning: true };
  }

  const missingStart = actualFrom > filters.fromDate;

  if (missingStart) {
    return {
      text: `Dữ liệu có từ ${formatDate(actualFrom)}`,
      warning: true,
    };
  }

  return {
    text: `Dữ liệu: ${formatDate(actualFrom)} đến ${formatDate(actualTo)}`,
    warning: false,
  };
}

/**
 * Format an ISO date for compact Vietnamese UI text.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
