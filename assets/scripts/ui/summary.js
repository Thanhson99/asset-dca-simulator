/**
 * Render chart heading and status text.
 *
 * @param {object} data
 * @param {object} filters
 */
export function renderChartMeta(data, filters) {
  const modeLabel = filters.mode === "dca" ? "Biểu đồ mô phỏng" : "Biểu đồ giá";

  setText("chart-eyebrow", "DCA simulator");
  setText("chart-title", `${modeLabel} ${data.symbol}`);
  setText(
    "chart-status",
    `Khoảng chọn: ${formatDate(filters.fromDate)} đến ${formatDate(filters.toDate)} | ${filters.durationSeconds} giây`,
  );
}

/**
 * Render a load or validation error in the chart heading.
 *
 * @param {Error} error
 */
export function renderChartError(error) {
  setText("chart-title", "Không tải được khoảng dữ liệu");
  setText("chart-status", error.message);
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
 * Format an ISO date for compact Vietnamese UI text.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
