/**
 * Calculate missing portfolio fields from any practical user-provided subset.
 *
 * @param {object} input
 * @param {number} input.investedValue
 * @param {number} input.profitLoss
 * @param {boolean} input.hasProfitLoss
 * @param {number} input.profitPercent
 * @param {boolean} input.hasProfitPercent
 * @param {number} input.currentPrice
 * @param {number} input.averagePrice
 * @param {number} input.shares
 * @returns {object}
 */
export function calculatePortfolioSnapshot(input) {
  const result = {
    investedValue: positiveOrZero(input.investedValue),
    profitLoss: finiteOrZero(input.profitLoss),
    profitPercent: finiteOrZero(input.profitPercent),
    currentPrice: positiveOrZero(input.currentPrice),
    averagePrice: positiveOrZero(input.averagePrice),
    shares: positiveOrZero(input.shares),
    currentValue: 0,
  };

  if (input.hasProfitLoss && result.investedValue > 0) {
    result.currentValue = result.investedValue + result.profitLoss;
  }

  if (input.hasProfitPercent && result.investedValue > 0) {
    result.currentValue = result.investedValue * (1 + result.profitPercent / 100);
  }

  if (result.currentValue === 0 && result.shares > 0 && result.currentPrice > 0) {
    result.currentValue = result.shares * result.currentPrice;
  }

  if (result.shares === 0 && result.currentValue > 0 && result.currentPrice > 0) {
    result.shares = result.currentValue / result.currentPrice;
  }

  if (result.averagePrice === 0 && result.investedValue > 0 && result.shares > 0) {
    result.averagePrice = result.investedValue / result.shares;
  }

  if (result.shares === 0 && result.investedValue > 0 && result.averagePrice > 0) {
    result.shares = result.investedValue / result.averagePrice;
  }

  if (result.currentValue === 0 && result.shares > 0 && result.currentPrice > 0) {
    result.currentValue = result.shares * result.currentPrice;
  }

  if (result.investedValue === 0 && result.shares > 0 && result.averagePrice > 0) {
    result.investedValue = result.shares * result.averagePrice;
  }

  if (!input.hasProfitLoss && result.currentValue > 0) {
    result.profitLoss = result.currentValue - result.investedValue;
  }

  if (!input.hasProfitPercent && result.investedValue > 0 && result.currentValue > 0) {
    result.profitPercent = (result.profitLoss / result.investedValue) * 100;
  }

  return result;
}

/**
 * Count elapsed full months and leftover days between two ISO dates.
 *
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {{months: number, days: number}|null}
 */
export function calculateHoldingDuration(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) {
    return null;
  }

  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  const anchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());

  if (anchor > to) {
    months -= 1;
  }

  const adjustedAnchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const days = Math.round((to - adjustedAnchor) / 86400000);

  return { months, days };
}

function positiveOrZero(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}
