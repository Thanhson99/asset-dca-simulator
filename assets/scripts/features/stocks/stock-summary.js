import { escapeHtml } from "../../shared/html.js";
import { formatPercent } from "../../shared/number-format.js";
import { buyStrategyLabel, formatShares, formatStockMoney } from "./stock-format.js";

/**
 * Render DCA totals outside the chart so invested cash does not clutter lines.
 *
 * @param {object} input
 * @param {HTMLElement} input.container
 * @param {Array<object>} input.rows
 * @param {object} input.filters
 * @param {string} input.primaryColor
 */
export function renderStockSimulationSummary({ container, rows, filters, primaryColor }) {
  if (filters.mode !== "dca" || rows.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const latest = rows.at(-1);
  const items = [
    createSummaryMetaItem("Cách mua", buyStrategyLabel(filters.buyStrategy, filters)),
    createSummaryRow({
      symbol: filters.symbol,
      color: primaryColor,
      monthlyAmount: filters.monthlyAmount,
      investedValue: latest.investedValue,
      investmentValue: latest.investmentValue,
      units: latest.units,
    }),
    ...filters.compareLegs.map((leg) =>
      createSummaryRow({
        symbol: leg.symbol,
        color: leg.priceColor,
        monthlyAmount: leg.monthlyAmount,
        investedValue: latest[`${leg.id}InvestedValue`],
        investmentValue: latest[`${leg.id}InvestmentValue`],
        units: latest[`${leg.id}Units`],
      }),
    ),
  ];

  if (filters.compareLegs.length > 0) {
    items.push(createSummaryMetaItem("So sánh", formatComparePerformance(latest, filters), "is-compare"));
  }

  container.hidden = false;
  container.innerHTML = items.join("");
}

function createSummaryRow(item) {
  const profitLoss = item.investmentValue - item.investedValue;
  const profitClass = profitLoss >= 0 ? "is-profit" : "is-loss";

  return `
    <div class="summary-row">
      <div class="summary-row__symbol" style="--summary-color: ${escapeHtml(item.color)}">
        <span></span>
        <strong>${escapeHtml(item.symbol)}</strong>
      </div>
      ${createSummaryMetric("Mỗi tháng", formatStockMoney(item.monthlyAmount))}
      ${createSummaryMetric("Đã góp", formatStockMoney(item.investedValue))}
      ${createSummaryMetric("Hiện tại", formatStockMoney(item.investmentValue))}
      ${createSummaryMetric("Cổ phiếu", formatShares(item.units))}
      ${createSummaryMetric("Lãi/lỗ", `${profitLoss >= 0 ? "+" : ""}${formatStockMoney(profitLoss)}`, profitClass)}
    </div>
  `;
}

function createSummaryMetric(label, value, className = "") {
  return `<div class="summary-metric ${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

function createSummaryMetaItem(label, value, className = "") {
  return `<div class="summary-meta ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatComparePerformance(latest, filters) {
  const returns = [
    {
      symbol: filters.symbol,
      value: returnRatio(latest.investmentValue, latest.investedValue),
    },
    ...filters.compareLegs.map((leg) => ({
      symbol: leg.symbol,
      value: returnRatio(latest[`${leg.id}InvestmentValue`], latest[`${leg.id}InvestedValue`]),
    })),
  ].sort((left, right) => right.value - left.value);

  const best = returns[0];
  const runnerUp = returns[1];
  const diff = (best.value - runnerUp.value) * 100;

  if (diff < 0.01) {
    return "Các mã gần như ngang nhau";
  }

  return `${best.symbol} cao hơn ${runnerUp.symbol} ${formatPercent(diff)}`;
}

function returnRatio(currentValue, investedValue) {
  return investedValue > 0 ? (currentValue - investedValue) / investedValue : 0;
}
