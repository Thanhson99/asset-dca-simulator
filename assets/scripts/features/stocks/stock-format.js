/**
 * Format large VND values compactly without hiding smaller exact amounts.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatStockMoney(value) {
  const absolute = Math.round(Math.abs(value));

  if (absolute >= 1000000 && absolute % 100000 === 0) {
    const compact = value / 1000000;
    return `${compact.toLocaleString("vi-VN", {
      maximumFractionDigits: compact % 1 === 0 ? 0 : 1,
    })} tr VNĐ`;
  }

  return `${Math.round(value).toLocaleString("vi-VN")} VNĐ`;
}

/**
 * Format share units with Vietnamese decimal separators.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatShares(value) {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 4,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })} cổ phiếu`;
}

/**
 * Convert a buy strategy id into a Vietnamese label.
 *
 * @param {string} strategy
 * @param {object} filters
 * @returns {string}
 */
export function buyStrategyLabel(strategy, filters = {}) {
  if (strategy === "fixed_day" && filters.fromDate) {
    return `Ngày ${Number(filters.fromDate.slice(8, 10))} hằng tháng`;
  }

  const labels = {
    fixed_day: "Ngày cố định",
    first_trading_day: "Đầu tháng",
    last_trading_day: "Cuối tháng",
    average_first_5: "Chia 5 ngày đầu",
    monthly_average: "Trung bình tháng",
    monthly_low: "Thấp nhất tháng",
  };

  return labels[strategy] || labels.fixed_day;
}
