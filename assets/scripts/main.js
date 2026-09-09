import { DEMO_ASSET } from "./config.js";
import { loadStockRange } from "./data/stock-loader.js";
import { buildMonthlyDcaRows, buildPriceRows } from "./simulation/dca.js";
import {
  DEFAULT_CHART_THEME,
  animateClosePriceChart,
  drawStaticClosePriceChart,
  getNearestChartPoint,
} from "./charts/price-chart.js";
import { enhanceDateInput, readDateInput } from "./ui/date-picker.js";
import { renderChartError, renderChartMeta } from "./ui/summary.js";

const elements = {
  canvas: document.getElementById("price-chart"),
  chartFrame: document.querySelector(".chart-frame"),
  chartLoading: document.getElementById("chart-loading"),
  tooltip: document.getElementById("chart-tooltip"),
  symbol: document.getElementById("symbol-input"),
  symbolList: document.getElementById("stock-symbol-list"),
  from: document.getElementById("from-input"),
  to: document.getElementById("to-input"),
  duration: document.getElementById("duration-input"),
  mode: document.getElementById("mode-input"),
  monthlyAmount: document.getElementById("monthly-amount-input"),
  buyStrategy: document.getElementById("buy-strategy-input"),
  lineColor: document.getElementById("line-color-input"),
  investmentColor: document.getElementById("investment-color-input"),
  textColor: document.getElementById("text-color-input"),
  highColor: document.getElementById("high-color-input"),
  lowColor: document.getElementById("low-color-input"),
  chartBgColor: document.getElementById("chart-bg-color-input"),
  chartTheme: document.getElementById("chart-theme-input"),
  valueLine: document.getElementById("value-line-input"),
  investedLine: document.getElementById("invested-line-input"),
  lineGlow: document.getElementById("line-glow-input"),
  simulationSummary: document.getElementById("simulation-summary"),
  play: document.getElementById("play-button"),
  fullscreen: document.getElementById("fullscreen-button"),
};

let activeAnimation = null;
let currentData = null;
let currentRows = [];
let currentChartRows = [];
let currentFilters = null;
let currentHoverIndex = null;
let availableSymbols = new Set([DEMO_ASSET.symbol]);

hydrateDefaultInputs();
enhanceDateInput(elements.from);
enhanceDateInput(elements.to);
elements.play.addEventListener("click", renderSelectedChart);
elements.fullscreen.addEventListener("click", toggleChartFullscreen);
document.addEventListener("fullscreenchange", redrawCurrentChart);
observeChartResize();
bindThemeInputs();
bindModeInputs();
bindMoneyInput();
bindTooltip();
loadStockOptions();
await renderInitialChart();

/**
 * Put configured defaults into the form.
 */
function hydrateDefaultInputs() {
  elements.symbol.value = DEMO_ASSET.symbol;
  elements.from.value = DEMO_ASSET.fromDate;
  elements.to.value = DEMO_ASSET.toDate;
  elements.duration.value = String(DEMO_ASSET.durationSeconds);
  elements.mode.value = DEMO_ASSET.mode;
  elements.monthlyAmount.value = formatVnd(DEMO_ASSET.monthlyAmount);
  elements.buyStrategy.value = DEMO_ASSET.buyStrategy;
  elements.lineColor.value = DEFAULT_CHART_THEME.price;
  elements.investmentColor.value = DEFAULT_CHART_THEME.investment;
  elements.textColor.value = DEFAULT_CHART_THEME.text;
  elements.chartBgColor.value = DEFAULT_CHART_THEME.background;
  elements.highColor.value = DEFAULT_CHART_THEME.high;
  elements.lowColor.value = DEFAULT_CHART_THEME.low;
  elements.lineGlow.checked = DEFAULT_CHART_THEME.lineGlow;
  syncModeControls();
}

/**
 * Load the default range and draw it without animation.
 */
async function renderInitialChart() {
  setBusy(true);

  try {
    const filters = readFilters();
    const data = await loadStockRange(filters);
    currentData = data;
    currentRows = data.rows;
    currentFilters = filters;
    currentChartRows = buildChartRows(currentRows, filters);
    renderChartMeta(data, filters);
    renderSimulationSummary(currentChartRows, filters);
    resizeCanvasToFrame();
    drawStaticClosePriceChart(elements.canvas, currentChartRows, readTheme(), chartOptions(filters));
  } catch (error) {
    renderChartError(error);
    console.error(error);
  } finally {
    setBusy(false);
  }
}

/**
 * Load the selected range and start chart animation after user action.
 */
async function renderSelectedChart() {
  setBusy(true);
  stopActiveAnimation();

  try {
    const filters = readFilters();
    const data = await loadStockRange(filters);
    currentData = data;
    currentRows = data.rows;
    currentFilters = filters;
    currentChartRows = buildChartRows(currentRows, filters);
    renderChartMeta(data, filters);
    renderSimulationSummary(currentChartRows, filters);
    resizeCanvasToFrame();
    activeAnimation = animateClosePriceChart(elements.canvas, currentChartRows, {
      ...filters,
      theme: readTheme(),
      ...chartOptions(filters),
    });
  } catch (error) {
    renderChartError(error);
    console.error(error);
  } finally {
    setBusy(false);
  }
}

/**
 * Redraw simulation-only changes without reloading market data.
 */
function refreshCurrentSimulation() {
  if (!currentData || currentRows.length === 0) {
    return;
  }

  stopActiveAnimation();
  const filters = readFilters();
  currentFilters = filters;
  currentHoverIndex = null;
  currentChartRows = buildChartRows(currentRows, filters);
  renderChartMeta(currentData, filters);
  renderSimulationSummary(currentChartRows, filters);
  redrawCurrentChart();
}

/**
 * Read chart theme values from color inputs.
 *
 * @returns {object}
 */
function readTheme() {
  const price = elements.lineColor.value;
  const darkMode = selectedChartTheme() === "dark";

  return {
    ...DEFAULT_CHART_THEME,
    price,
    investment: elements.investmentColor.value,
    text: elements.textColor.value,
    muted: darkMode ? "#cbd5e1" : DEFAULT_CHART_THEME.muted,
    grid: darkMode ? "rgba(203, 213, 225, 0.18)" : DEFAULT_CHART_THEME.grid,
    background: elements.chartBgColor.value,
    lineGlow: elements.lineGlow.checked,
    high: elements.highColor.value,
    low: elements.lowColor.value,
    latest: elements.lowColor.value,
    fillTop: hexToRgba(price, 0.14),
    fillBottom: hexToRgba(price, 0),
    investmentFillTop: hexToRgba(elements.investmentColor.value, 0.12),
    investmentFillBottom: hexToRgba(elements.investmentColor.value, 0),
  };
}

/**
 * Redraw static chart when a theme input changes.
 */
function bindThemeInputs() {
  const colorInputs = [
    elements.lineColor,
    elements.investmentColor,
    elements.textColor,
    elements.chartBgColor,
    elements.highColor,
    elements.lowColor,
  ];

  for (const input of colorInputs) {
    input.addEventListener("input", () => {
      stopActiveAnimation();
      redrawCurrentChart();
    });
  }

  for (const input of [elements.valueLine, elements.investedLine]) {
    input.addEventListener("change", () => {
      ensureVisibleLine(input);
      updateLineToggleStates();
      stopActiveAnimation();
      redrawCurrentChart();
    });
  }

  elements.lineGlow.addEventListener("change", () => {
    stopActiveAnimation();
    redrawCurrentChart();
  });

  elements.chartTheme.addEventListener("change", () => {
    applyChartThemePreset(elements.chartTheme.checked ? "dark" : "light");
    stopActiveAnimation();
    redrawCurrentChart();
  });
}

/**
 * Apply contrast presets for the chart canvas only.
 *
 * @param {"light"|"dark"} value
 */
function applyChartThemePreset(value) {
  if (value === "dark") {
    elements.chartBgColor.value = "#111827";
    elements.textColor.value = "#f8fafc";
    return;
  }

  elements.chartBgColor.value = DEFAULT_CHART_THEME.background;
  elements.textColor.value = DEFAULT_CHART_THEME.text;
}

/**
 * Read the selected chart contrast preset.
 *
 * @returns {"light"|"dark"}
 */
function selectedChartTheme() {
  return elements.chartTheme.checked ? "dark" : "light";
}

/**
 * Fill the stock symbol search list from assets that have local price data.
 */
async function loadStockOptions() {
  try {
    const response = await fetch("data/stocks/index.json");
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const assets = Array.isArray(data.assets) ? data.assets : [];
    availableSymbols = new Set(assets.map((asset) => asset.symbol?.toUpperCase()).filter(Boolean));
    elements.symbolList.innerHTML = assets.map(createStockOption).join("");
  } catch (error) {
    console.warn("Không tải được danh sách mã cổ phiếu", error);
  }
}

/**
 * Create one searchable stock option.
 *
 * @param {object} asset
 * @returns {string}
 */
function createStockOption(asset) {
  const label = [asset.name, asset.exchange].filter(Boolean).join(" - ");
  return `<option value="${escapeHtml(asset.symbol)}" label="${escapeHtml(label)}"></option>`;
}

/**
 * Redraw immediately when switching chart mode.
 */
function bindModeInputs() {
  elements.mode.addEventListener("change", () => {
    syncModeControls();
    refreshCurrentSimulation();
  });

  elements.buyStrategy.addEventListener("change", refreshCurrentSimulation);
}

/**
 * Keep the monthly amount readable while preserving a numeric value.
 */
function bindMoneyInput() {
  elements.monthlyAmount.addEventListener("focus", () => {
    elements.monthlyAmount.value = String(parseVndInput(elements.monthlyAmount.value));
  });

  elements.monthlyAmount.addEventListener("blur", () => {
    elements.monthlyAmount.value = formatVnd(parseVndInput(elements.monthlyAmount.value));
    refreshCurrentSimulation();
  });
}

/**
 * Enable DCA-only controls only when DCA mode is active.
 */
function syncModeControls() {
  const dcaMode = elements.mode.value === "dca";

  elements.monthlyAmount.disabled = !dcaMode;
  elements.buyStrategy.disabled = !dcaMode;
  elements.investedLine.disabled = !dcaMode;
  elements.investedLine.closest("label").classList.toggle("is-disabled", !dcaMode);

  if (!dcaMode && !elements.valueLine.checked) {
    elements.valueLine.checked = true;
  }

  updateLineToggleStates();
}

/**
 * Keep at least one visible chart line selected.
 *
 * @param {HTMLInputElement} changedInput
 */
function ensureVisibleLine(changedInput) {
  const dcaMode = elements.mode.value === "dca";
  const hasVisibleLine = elements.valueLine.checked || (dcaMode && elements.investedLine.checked);

  if (!hasVisibleLine) {
    changedInput.checked = true;
  }
}

/**
 * Disable the last visible line toggle so the chart never becomes blank.
 */
function updateLineToggleStates() {
  const dcaMode = elements.mode.value === "dca";
  const visibleCount = Number(elements.valueLine.checked) + Number(dcaMode && elements.investedLine.checked);
  const valueLocked = visibleCount === 1 && elements.valueLine.checked;
  const investmentLocked = dcaMode && visibleCount === 1 && elements.investedLine.checked;

  elements.valueLine.disabled = valueLocked;
  elements.valueLine.closest("label").classList.toggle("is-disabled", valueLocked);

  if (dcaMode) {
    elements.investedLine.disabled = investmentLocked;
    elements.investedLine.closest("label").classList.toggle("is-disabled", investmentLocked);
  }
}

/**
 * Escape text before inserting generated option HTML.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Redraw the current chart if rows are available.
 */
function redrawCurrentChart() {
  if (currentChartRows.length === 0 || !currentFilters) {
    return;
  }

  resizeCanvasToFrame();
  drawStaticClosePriceChart(elements.canvas, currentChartRows, readTheme(), {
    ...chartOptions(currentFilters),
    hoverIndex: currentHoverIndex,
  });
}

/**
 * Keep canvas pixels in sync with the visible chart frame.
 */
function observeChartResize() {
  const observer = new ResizeObserver(redrawCurrentChart);
  observer.observe(elements.chartFrame);
}

/**
 * Resize canvas backing pixels to match its rendered size.
 */
function resizeCanvasToFrame() {
  const rect = elements.chartFrame.getBoundingClientRect();
  const fullscreen = document.fullscreenElement === elements.chartFrame;
  const width = Math.max(Math.round(rect.width), 320);
  const height = fullscreen ? Math.max(Math.round(rect.height - 82), 360) : Math.max(Math.round(width * 0.42), 360);

  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
  }
}

/**
 * Toggle fullscreen for the chart frame.
 */
async function toggleChartFullscreen() {
  if (!document.fullscreenEnabled) {
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await elements.chartFrame.requestFullscreen();
  }

  requestAnimationFrame(redrawCurrentChart);
}

/**
 * Bind hover tooltip to the nearest visible row.
 */
function bindTooltip() {
  elements.canvas.addEventListener("mousemove", showTooltip);
  elements.canvas.addEventListener("mouseleave", hideTooltip);
}

/**
 * Position and render the chart tooltip.
 *
 * @param {MouseEvent} event
 */
function showTooltip(event) {
  if (currentChartRows.length === 0 || !currentFilters) {
    return;
  }

  const focus = getNearestChartPoint(elements.canvas, currentChartRows, event.clientX, chartOptions(currentFilters));
  if (!focus) {
    return;
  }

  currentHoverIndex = focus.index;
  redrawCurrentChart();

  const row = focus.row;
  const frameRect = elements.chartFrame.getBoundingClientRect();
  const canvasRect = elements.canvas.getBoundingClientRect();
  const canvasLeft = canvasRect.left - frameRect.left;
  const canvasTop = canvasRect.top - frameRect.top;
  const left = clamp(canvasLeft + focus.x + 18, 10, frameRect.width - 230);
  const top = clamp(canvasTop + focus.y + 18, 10, frameRect.height - 142);

  elements.tooltip.hidden = false;
  elements.tooltip.style.left = `${left}px`;
  elements.tooltip.style.top = `${top}px`;
  elements.tooltip.innerHTML = createTooltipHtml(row, currentFilters);
}

/**
 * Hide tooltip when the pointer leaves the canvas.
 */
function hideTooltip() {
  currentHoverIndex = null;
  elements.tooltip.hidden = true;
  redrawCurrentChart();
}

/**
 * Convert a hex color to rgba for chart fill gradients.
 *
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Read and normalize form values.
 *
 * @returns {object}
 */
function readFilters() {
  const symbol = elements.symbol.value.trim().toUpperCase();
  const fromDate = readDateInput(elements.from);
  const toDate = readDateInput(elements.to);

  if (!availableSymbols.has(symbol)) {
    throw new Error(`Mã ${symbol || "(trống)"} chưa có dữ liệu trong prototype`);
  }

  if (fromDate > toDate) {
    throw new Error("Ngày bắt đầu phải trước ngày kết thúc");
  }

  return {
    symbol,
    fromDate,
    toDate,
    durationSeconds: clamp(Number(elements.duration.value), 1, 60),
    mode: elements.mode.value,
    monthlyAmount: clamp(parseVndInput(elements.monthlyAmount.value), 10000, 1000000000),
    buyStrategy: elements.buyStrategy.value,
  };
}

/**
 * Convert raw market rows into the series required by the selected chart mode.
 *
 * @param {Array<object>} rows
 * @param {object} filters
 * @returns {Array<object>}
 */
function buildChartRows(rows, filters) {
  if (filters.mode === "dca") {
    return buildMonthlyDcaRows(rows, filters);
  }

  return buildPriceRows(rows);
}

/**
 * Create generic chart options from the current mode.
 *
 * @param {object} filters
 * @returns {object}
 */
function chartOptions(filters) {
  return {
    showPrice: elements.valueLine.checked,
    showInvestment: filters.mode === "dca" && elements.investedLine.checked,
  };
}

/**
 * Build sanitized tooltip markup for the active mode.
 *
 * @param {object} row
 * @param {object} filters
 * @returns {string}
 */
function createTooltipHtml(row, filters) {
  const lines = [
    `<strong>${formatDate(row.date)}</strong>`,
    `<span><b>Giá đóng cửa</b><em>${formatMoney(row.close)}</em></span>`,
  ];

  if (filters.mode === "dca") {
    lines.push(`<span><b>Giá trị đầu tư</b><em>${formatMoney(row.investmentValue)}</em></span>`);
    lines.push(`<span><b>Đã góp</b><em>${formatMoney(row.investedValue)}</em></span>`);
    lines.push(`<span><b>Số cổ phiếu</b><em>${formatShares(row.units)}</em></span>`);
  }

  return lines.join("");
}

/**
 * Format a VND number without currency noise in compact chart UI.
 *
 * @param {number} value
 * @returns {string}
 */
function formatVnd(value) {
  return Math.round(value).toLocaleString("vi-VN");
}

/**
 * Render DCA totals outside the chart so invested cash does not clutter lines.
 *
 * @param {Array<object>} rows
 * @param {object} filters
 */
function renderSimulationSummary(rows, filters) {
  if (filters.mode !== "dca" || rows.length === 0) {
    elements.simulationSummary.hidden = true;
    elements.simulationSummary.innerHTML = "";
    return;
  }

  const latest = rows.at(-1);
  const profitLoss = latest.investmentValue - latest.investedValue;
  const profitClass = profitLoss >= 0 ? "is-profit" : "is-loss";

  elements.simulationSummary.hidden = false;
  elements.simulationSummary.innerHTML = [
    createSummaryItem("Mỗi tháng", formatMoney(filters.monthlyAmount)),
    createSummaryItem("Cách mua", buyStrategyLabel(filters.buyStrategy)),
    createSummaryItem("Đã góp", formatMoney(latest.investedValue)),
    createSummaryItem("Giá trị hiện tại", formatMoney(latest.investmentValue)),
    createSummaryItem("Số cổ phiếu", formatShares(latest.units)),
    createSummaryItem("Lãi/lỗ", `${profitLoss >= 0 ? "+" : ""}${formatMoney(profitLoss)}`, profitClass),
  ].join("");
}

/**
 * Format large VND values compactly without hiding smaller exact amounts.
 *
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  const absolute = Math.round(Math.abs(value));

  if (absolute >= 1000000 && absolute % 100000 === 0) {
    const compact = value / 1000000;
    return `${compact.toLocaleString("vi-VN", {
      maximumFractionDigits: compact % 1 === 0 ? 0 : 1,
    })} tr VNĐ`;
  }

  return `${formatVnd(value)} VNĐ`;
}

/**
 * Format share units with Vietnamese decimal separators.
 *
 * @param {number} value
 * @returns {string}
 */
function formatShares(value) {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 4,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })} cổ phiếu`;
}

/**
 * Format an ISO date as dd/mm/yyyy for compact UI labels.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Convert a buy strategy id into a Vietnamese label.
 *
 * @param {string} strategy
 * @returns {string}
 */
function buyStrategyLabel(strategy) {
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

/**
 * Create one compact summary item.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} className
 * @returns {string}
 */
function createSummaryItem(label, value, className = "") {
  return `<div class="summary-item ${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

/**
 * Parse VND text input such as `1.000.000` or `1,000,000`.
 *
 * @param {string} value
 * @returns {number}
 */
function parseVndInput(value) {
  const digits = String(value).replace(/\D/g, "");
  return Number(digits || 0);
}

/**
 * Stop the previous animation before drawing a new range.
 */
function stopActiveAnimation() {
  if (activeAnimation) {
    activeAnimation.stop();
    activeAnimation = null;
  }
}

/**
 * Toggle the play button state while data is loading.
 *
 * @param {boolean} isBusy
 */
function setBusy(isBusy) {
  elements.play.disabled = isBusy;
  elements.play.textContent = isBusy ? "Đang tải" : "Xem biểu đồ";
  elements.chartLoading.hidden = !isBusy;
}

/**
 * Clamp a numeric input into an allowed range.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
