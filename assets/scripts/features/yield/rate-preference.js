/**
 * Sort same-day bank rates so the app uses the most common retail tier first.
 *
 * Historical bank data can contain several rows for the same date and term
 * because banks publish tiers by channel, balance, or customer segment. Until
 * there is a dedicated tier selector, the default should stay close to a normal
 * retail customer instead of picking Private/Priority rows by accident.
 *
 * @param {{condition?: string, channel?: string, effectiveFrom?: string}} left
 * @param {{condition?: string, channel?: string, effectiveFrom?: string}} right
 * @returns {number}
 */
export function compareBankRatePreference(left, right) {
  return bankRatePriority(left) - bankRatePriority(right) || String(right.effectiveFrom || "").localeCompare(String(left.effectiveFrom || ""));
}

function bankRatePriority(item) {
  const text = `${item.condition || ""} ${item.channel || ""}`.toLowerCase();
  if (text.includes("tiêu chuẩn")) {
    return 0;
  }
  if (text.includes("dưới 500") || text.includes("dưới 1 tỷ") || text.includes("khách hàng thường")) {
    return 1;
  }
  if (text.includes("private") || text.includes("priority") || text.includes("từ 2 tỷ") || text.includes("trên 3 tỷ")) {
    return 3;
  }
  return 2;
}
