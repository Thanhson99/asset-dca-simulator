import { calculateHoldingDuration, calculatePortfolioSnapshot } from "../simulation/portfolio.js";

/**
 * Manage existing-position inputs and derived field rendering.
 *
 * @param {object} options
 * @returns {object}
 */
export function createPortfolioControls(options) {
  let isWritingFields = false;

  function bind() {
    for (const input of inputs()) {
      input.addEventListener("input", () => {
        if (!isWritingFields) {
          delete input.dataset.autoFilled;
        }
        render();
      });
      input.addEventListener("change", render);
    }

    for (const input of [options.elements.invested, options.elements.currentPrice, options.elements.averagePrice]) {
      input.addEventListener("blur", () => {
        const amount = options.parseVnd(input.value);
        if (amount > 0) {
          input.value = options.formatVnd(amount);
        }
      });
    }

    options.elements.profitValue.addEventListener("blur", () => {
      const amount = options.parseSignedVnd(options.elements.profitValue.value);
      if (amount !== 0) {
        options.elements.profitValue.value = amount > 0 ? `+${options.formatVnd(amount)}` : `-${options.formatVnd(Math.abs(amount))}`;
      }
    });
  }

  function clearAutoFlags() {
    for (const input of inputs()) {
      delete input.dataset.autoFilled;
    }
  }

  function syncCurrentPrice(latestRow) {
    if (!latestRow || options.elements.currentPrice.value.trim()) {
      return;
    }

    options.elements.currentPrice.value = options.formatVnd(latestRow.close);
  }

  function render() {
    if (isWritingFields) {
      return;
    }

    const snapshot = readSnapshot();
    const hasValuationInput = hasProfitLoss() || hasProfitPercent() || Number(options.elements.shares.value) > 0;
    const canInferPosition =
      (snapshot.investedValue > 0 && snapshot.averagePrice > 0) ||
      (snapshot.shares > 0 && snapshot.averagePrice > 0) ||
      (snapshot.shares > 0 && snapshot.currentPrice > 0) ||
      (snapshot.investedValue > 0 && snapshot.currentPrice > 0 && hasValuationInput);

    if (!canInferPosition) {
      options.elements.result.hidden = true;
      options.elements.result.innerHTML = "";
      return;
    }

    writeDerivedFields(snapshot);
    const duration = calculateHoldingDuration(options.readDate(options.elements.start), options.getToDate() || options.todayIso);
    const profitClass = snapshot.profitLoss >= 0 ? "is-profit" : "is-loss";

    options.elements.result.hidden = false;
    options.elements.result.innerHTML = [
      createResultItem("Thời gian", formatDuration(duration)),
      createResultItem("Giá trị hiện tại", options.formatMoney(snapshot.currentValue)),
      createResultItem(
        "Lãi/lỗ",
        `${snapshot.profitLoss >= 0 ? "+" : ""}${options.formatMoney(snapshot.profitLoss)} (${options.formatPercent(snapshot.profitPercent)})`,
        profitClass,
      ),
      createResultItem("Giá mua TB", options.formatMoney(snapshot.averagePrice)),
      createResultItem("Số cổ phiếu", options.formatShares(snapshot.shares)),
    ].join("");
  }

  function readExistingPosition() {
    const snapshot = readSnapshot();

    if (snapshot.investedValue <= 0 || snapshot.shares <= 0) {
      return null;
    }

    return {
      units: snapshot.shares,
      investedValue: snapshot.investedValue,
    };
  }

  function readSnapshot() {
    return calculatePortfolioSnapshot({
      investedValue: options.parseVnd(options.elements.invested.value),
      profitLoss: options.parseSignedVnd(options.elements.profitValue.value),
      hasProfitLoss: hasProfitLoss(),
      profitPercent: Number(options.elements.profitPercent.value),
      hasProfitPercent: hasProfitPercent(),
      currentPrice: options.parseVnd(options.elements.currentPrice.value),
      averagePrice: options.parseVnd(options.elements.averagePrice.value),
      shares: Number(options.elements.shares.value),
    });
  }

  function writeDerivedFields(snapshot) {
    isWritingFields = true;

    writeAutoMoneyField(options.elements.invested, snapshot.investedValue);
    writeAutoMoneyField(options.elements.profitValue, snapshot.profitLoss, { signed: true, allowZero: true });
    writeAutoNumberField(options.elements.profitPercent, snapshot.profitPercent, 2, { allowZero: true });
    writeAutoMoneyField(options.elements.currentPrice, snapshot.currentPrice);
    writeAutoMoneyField(options.elements.averagePrice, snapshot.averagePrice);
    writeAutoNumberField(options.elements.shares, snapshot.shares, 4);

    isWritingFields = false;
  }

  function writeAutoMoneyField(input, value, fieldOptions = {}) {
    if (!Number.isFinite(value) || (!fieldOptions.allowZero && value === 0) || (input.value.trim() && input.dataset.autoFilled !== "true")) {
      return;
    }

    input.value = fieldOptions.signed && value > 0 ? `+${options.formatVnd(value)}` : options.formatVnd(value);
    input.dataset.autoFilled = "true";
  }

  function writeAutoNumberField(input, value, digits, fieldOptions = {}) {
    if (!Number.isFinite(value) || (!fieldOptions.allowZero && value === 0) || (input.value.trim() && input.dataset.autoFilled !== "true")) {
      return;
    }

    input.value = options.formatPlainNumber(value, digits);
    input.dataset.autoFilled = "true";
  }

  function hasProfitLoss() {
    return options.elements.profitValue.value.trim() !== "";
  }

  function hasProfitPercent() {
    return options.elements.profitPercent.value.trim() !== "";
  }

  function inputs() {
    return [
      options.elements.start,
      options.elements.invested,
      options.elements.profitPercent,
      options.elements.profitValue,
      options.elements.currentPrice,
      options.elements.averagePrice,
      options.elements.shares,
    ];
  }

  return {
    bind,
    clearAutoFlags,
    readExistingPosition,
    render,
    syncCurrentPrice,
  };
}

function createResultItem(label, value, className = "") {
  return `<div class="portfolio-result__item ${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

function formatDuration(duration) {
  if (!duration) {
    return "Chưa chọn";
  }

  const years = Math.floor(duration.months / 12);
  const months = duration.months % 12;
  const parts = [];

  if (years > 0) {
    parts.push(`${years} năm`);
  }

  if (months > 0) {
    parts.push(`${months} tháng`);
  }

  if (duration.days > 0 || parts.length === 0) {
    parts.push(`${duration.days} ngày`);
  }

  return parts.join(" ");
}
