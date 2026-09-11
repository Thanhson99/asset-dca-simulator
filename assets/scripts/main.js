import { DEMO_ASSET } from "./config.js";
import { loadStockFreshness, loadStockRange } from "./data/stock-loader.js";
import { buildMonthlyDcaRows, buildMultiComparisonRows, buildPriceRows } from "./simulation/dca.js";
import {
  DEFAULT_CHART_THEME,
  animateClosePriceChart,
  drawStaticClosePriceChart,
  getNearestChartPoint,
} from "./charts/price-chart.js";
import { createCompareControls, createCompareSeriesOptions } from "./ui/compare-controls.js";
import { enhanceDateInput, readDateInput } from "./ui/date-picker.js";
import { createPortfolioControls } from "./ui/portfolio-controls.js";
import { renderChartError, renderChartMeta } from "./ui/summary.js";

const TODAY_ISO = toIsoDate(new Date());
const LATEST_COMPLETED_DATA_DATE_ISO = previousIsoDate(TODAY_ISO);
const FORM_STORAGE_KEY = "asset-dca-simulator:form";

const elements = {
  canvas: document.getElementById("price-chart"),
  chartFrame: document.querySelector(".chart-frame"),
  chartLoading: document.getElementById("chart-loading"),
  tooltip: document.getElementById("chart-tooltip"),
  controlError: document.getElementById("control-error"),
  symbol: document.getElementById("symbol-input"),
  symbolList: document.getElementById("stock-symbol-list"),
  symbolSearchStatus: document.getElementById("symbol-search-status"),
  from: document.getElementById("from-input"),
  to: document.getElementById("to-input"),
  duration: document.getElementById("duration-input"),
  mode: document.getElementById("mode-input"),
  monthlyAmount: document.getElementById("monthly-amount-input"),
  buyStrategy: document.getElementById("buy-strategy-input"),
  buyStrategyHelp: document.getElementById("buy-strategy-help"),
  portfolioStart: document.getElementById("portfolio-start-input"),
  portfolioInvested: document.getElementById("portfolio-invested-input"),
  portfolioProfit: document.getElementById("portfolio-profit-input"),
  portfolioProfitValue: document.getElementById("portfolio-profit-value-input"),
  portfolioCurrentPrice: document.getElementById("portfolio-current-price-input"),
  portfolioAveragePrice: document.getElementById("portfolio-average-price-input"),
  portfolioShares: document.getElementById("portfolio-shares-input"),
  portfolioResult: document.getElementById("portfolio-result"),
  addCompare: document.getElementById("add-compare-button"),
  compareList: document.getElementById("compare-list"),
  lineColor: document.getElementById("line-color-input"),
  investmentColor: document.getElementById("investment-color-input"),
  textColor: document.getElementById("text-color-input"),
  highColor: document.getElementById("high-color-input"),
  lowColor: document.getElementById("low-color-input"),
  chartBgColor: document.getElementById("chart-bg-color-input"),
  chartTheme: document.getElementById("chart-theme-input"),
  dataSyncPanel: document.getElementById("data-sync-panel"),
  dataSyncStatus: document.getElementById("data-sync-status"),
  valueLine: document.getElementById("value-line-input"),
  investedLine: document.getElementById("invested-line-input"),
  lineGlow: document.getElementById("line-glow-input"),
  simulationSummary: document.getElementById("simulation-summary"),
  play: document.getElementById("play-button"),
  clearForm: document.getElementById("clear-form-button"),
  fullscreen: document.getElementById("fullscreen-button"),
};

let activeAnimation = null;
let currentData = null;
let currentRows = [];
let currentCompareRows = [];
let currentChartRows = [];
let currentFilters = null;
let currentHoverIndex = null;
let currentHoverRatio = null;
let pendingHoverFrame = 0;
let availableSymbols = new Set();
let stockAssetsBySymbol = new Map();
let stockAssets = [];
let renderRequestId = 0;
let syncStatusRequestId = 0;

const portfolioControls = createPortfolioControls({
  elements: {
    start: elements.portfolioStart,
    invested: elements.portfolioInvested,
    profitPercent: elements.portfolioProfit,
    profitValue: elements.portfolioProfitValue,
    currentPrice: elements.portfolioCurrentPrice,
    averagePrice: elements.portfolioAveragePrice,
    shares: elements.portfolioShares,
    result: elements.portfolioResult,
  },
  todayIso: TODAY_ISO,
  getToDate: () => currentFilters?.toDate,
  readDate: readDateInput,
  parseVnd: parseVndInput,
  parseSignedVnd: parseSignedVndInput,
  formatVnd,
  formatMoney,
  formatPercent,
  formatShares,
  formatPlainNumber,
});
const compareControls = createCompareControls({
  elements: {
    addButton: elements.addCompare,
    list: elements.compareList,
  },
  normalizeSymbol: normalizeSymbolText,
  normalizeSymbolField,
  parseVnd: parseVndInput,
  formatVnd,
  clamp,
  escapeHtml,
  clearFieldError,
  onSymbolQuery: (query) => updateStockSymbolList(query, { showStatus: false }),
  onRender: renderSelectedChart,
  onRefresh: refreshCurrentSimulation,
  onSave: saveFormState,
});

hydrateDefaultInputs();
const restoredForm = restoreFormState();
enhanceDateInput(elements.from);
enhanceDateInput(elements.to);
enhanceDateInput(elements.portfolioStart);
elements.play.addEventListener("click", renderSelectedChart);
elements.clearForm.addEventListener("click", clearAllFormData);
elements.fullscreen.addEventListener("click", toggleChartFullscreen);
bindFieldErrorReset();
bindFormPersistence();
document.addEventListener("fullscreenchange", redrawCurrentChart);
observeChartResize();
bindThemeInputs();
bindModeInputs();
bindMoneyInput();
portfolioControls.bind();
compareControls.bind();
bindDataSyncStatus();
updateBuyStrategyHelp();
bindTooltip();
await loadStockOptions();
if (restoredForm && canRestoreChart()) {
  await renderSelectedChart();
} else {
  renderEmptyChart();
}

/**
 * Put configured defaults into the form.
 */
function hydrateDefaultInputs() {
  elements.symbol.value = DEMO_ASSET.symbol;
  elements.from.value = DEMO_ASSET.fromDate;
  elements.to.value = DEMO_ASSET.toDate;
  elements.duration.value = DEMO_ASSET.durationSeconds ? String(DEMO_ASSET.durationSeconds) : "";
  elements.mode.value = DEMO_ASSET.mode;
  elements.monthlyAmount.value = DEMO_ASSET.monthlyAmount ? formatVnd(DEMO_ASSET.monthlyAmount) : "";
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
 * Clear every user-entered value and return the app to a neutral chart state.
 */
function clearAllFormData() {
  renderRequestId += 1;
  syncStatusRequestId += 1;
  stopActiveAnimation();
  clearFieldErrors();
  hideTooltip();
  clearDateInput(elements.from);
  clearDateInput(elements.to);
  clearDateInput(elements.portfolioStart);

  for (const input of [
    elements.symbol,
    elements.duration,
    elements.monthlyAmount,
    elements.portfolioInvested,
    elements.portfolioProfit,
    elements.portfolioProfitValue,
    elements.portfolioCurrentPrice,
    elements.portfolioAveragePrice,
    elements.portfolioShares,
  ]) {
    input.value = "";
    delete input.dataset.autoFilled;
  }

  elements.mode.value = "dca";
  elements.buyStrategy.value = "fixed_day";
  portfolioControls.clearAutoFlags();
  currentCompareRows = [];
  compareControls.clear();
  syncModeControls();
  updateBuyStrategyHelp();
  removeSavedFormState();
  renderEmptyChart();
}

/**
 * Clear an enhanced date input including its internal ISO value.
 *
 * @param {HTMLInputElement} input
 */
function clearDateInput(input) {
  input.value = "";
  delete input.dataset.iso;
  delete input.dataset.autoFilled;
  input.dispatchEvent(new CustomEvent("date-picker:clear"));
}

/**
 * Show a neutral state before the user chooses a symbol and date range.
 */
function renderEmptyChart() {
  currentData = null;
  currentRows = [];
  currentCompareRows = [];
  currentFilters = null;
  currentChartRows = [];
  currentHoverIndex = null;
  currentHoverRatio = null;
  renderDataSyncStatus(null);
  elements.simulationSummary.hidden = true;
  elements.simulationSummary.innerHTML = "";
  document.getElementById("chart-title").textContent = "Chọn mã và khoảng ngày để mô phỏng";
  document.getElementById("chart-status").textContent = "Chưa tải dữ liệu";
  resizeCanvasToFrame();
  drawStaticClosePriceChart(elements.canvas, [], readTheme(), {});
}

/**
 * Restore the previous form values after a page reload.
 *
 * @returns {boolean}
 */
function restoreFormState() {
  try {
    const state = JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) || "null");
    if (!state) {
      return false;
    }

    elements.symbol.value = state.symbol || "";
    elements.from.value = state.fromDate || "";
    elements.to.value = state.toDate || "";
    elements.duration.value = state.durationSeconds ?? elements.duration.value;
    elements.mode.value = state.mode || elements.mode.value;
    elements.monthlyAmount.value = state.monthlyAmount || "";
    elements.buyStrategy.value = state.buyStrategy || elements.buyStrategy.value;
    elements.portfolioStart.value = state.portfolioStart || "";
    elements.portfolioInvested.value = state.portfolioInvested || "";
    elements.portfolioProfit.value = state.portfolioProfit || "";
    elements.portfolioProfitValue.value = state.portfolioProfitValue || "";
    elements.portfolioCurrentPrice.value = state.portfolioCurrentPrice || "";
    elements.portfolioAveragePrice.value = state.portfolioAveragePrice || "";
    elements.portfolioShares.value = state.portfolioShares || "";
    compareControls.restore(state);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save form values so reloads do not wipe a generated chart setup.
 */
function bindFormPersistence() {
  const inputs = [
    elements.symbol,
    elements.from,
    elements.to,
    elements.duration,
    elements.mode,
    elements.monthlyAmount,
    elements.buyStrategy,
    elements.portfolioStart,
    elements.portfolioInvested,
    elements.portfolioProfit,
    elements.portfolioProfitValue,
    elements.portfolioCurrentPrice,
    elements.portfolioAveragePrice,
    elements.portfolioShares,
  ];

  for (const input of inputs) {
    input.addEventListener("input", saveFormState);
    input.addEventListener("change", saveFormState);
  }
}

/**
 * Persist the current form values.
 */
function saveFormState() {
  try {
    localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        symbol: elements.symbol.value,
        fromDate: readDateInput(elements.from),
        toDate: readDateInput(elements.to),
        durationSeconds: elements.duration.value,
        mode: elements.mode.value,
        monthlyAmount: elements.monthlyAmount.value,
        buyStrategy: elements.buyStrategy.value,
        portfolioStart: readDateInput(elements.portfolioStart),
        portfolioInvested: elements.portfolioInvested.value,
        portfolioProfit: elements.portfolioProfit.value,
        portfolioProfitValue: elements.portfolioProfitValue.value,
        portfolioCurrentPrice: elements.portfolioCurrentPrice.value,
        portfolioAveragePrice: elements.portfolioAveragePrice.value,
        portfolioShares: elements.portfolioShares.value,
        compareLegs: compareControls.values(),
      }),
    );
  } catch {
    // Ignore unavailable storage; the app still works without persistence.
  }
}

/**
 * Remove persisted form data when the user explicitly clears the UI.
 */
function removeSavedFormState() {
  try {
    localStorage.removeItem(FORM_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage; clearing the visible form is enough.
  }
}

/**
 * Restore compare rows from current or previous localStorage shape.
 *
 * @param {object} state
 * @returns {Array<object>}
 */

/**
 * Check whether restored values are sufficient to rerender the chart.
 *
 * @returns {boolean}
 */
function canRestoreChart() {
  const hasBaseInputs = elements.symbol.value.trim() && readDateInput(elements.from) && readDateInput(elements.to);
  return Boolean(hasBaseInputs && (elements.mode.value !== "dca" || parseVndInput(elements.monthlyAmount.value) > 0));
}

/**
 * Load the selected range and start chart animation after user action.
 */
async function renderSelectedChart() {
  const requestId = ++renderRequestId;
  setBusy(true);
  stopActiveAnimation();
  clearFieldErrors();

  try {
    const filters = readFilters();
    normalizeMoneyInput(filters.monthlyAmount);
    saveFormState();
    const data = await loadStockRange(filters);
    const compareData = await Promise.all(
      filters.compareLegs.map(async (leg) => ({
        ...leg,
        rows: (await loadStockRange({
          symbol: leg.symbol,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
        })).rows,
      })),
    );
    if (requestId !== renderRequestId) {
      return;
    }

    currentData = data;
    currentRows = data.rows;
    currentCompareRows = compareData;
    currentFilters = filters;
    currentChartRows = buildChartRows(currentRows, filters, currentCompareRows);
    if (filters.compareLegs.length > 0 && currentChartRows.length === 0) {
      throw new Error(`Không có ngày giao dịch chung cho các mã đã chọn trong khoảng này`);
    }
    renderChartMeta(data, filters, stockAssetsBySymbol.get(filters.symbol));
    renderCompareMeta(filters);
    renderSimulationSummary(currentChartRows, filters);
    portfolioControls.syncCurrentPrice(currentChartRows.at(-1));
    portfolioControls.render();
    await updateDataSyncStatus(filters.symbol);
    resizeCanvasToFrame();
    const chartSettings = {
      ...filters,
      theme: readTheme(),
      ...chartOptions(filters),
    };

    if (filters.durationSeconds === 0) {
      drawStaticClosePriceChart(elements.canvas, currentChartRows, chartSettings.theme, chartSettings);
    } else {
      activeAnimation = animateClosePriceChart(elements.canvas, currentChartRows, chartSettings);
    }
  } catch (error) {
    if (requestId !== renderRequestId) {
      return;
    }

    showFieldError(error);
    if (!isValidationError(error)) {
      renderChartError(error);
    }
    console.warn(error.message);
  } finally {
    if (requestId === renderRequestId) {
      setBusy(false);
    }
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
  let filters;
  try {
    clearFieldErrors();
    filters = readFilters();
  } catch (error) {
    showFieldError(error);
    if (!isValidationError(error)) {
      renderChartError(error);
    }
    console.warn(error.message);
    return;
  }

  currentFilters = filters;
  currentHoverIndex = null;
  currentHoverRatio = null;
  currentChartRows = buildChartRows(currentRows, filters, currentCompareRows);
  renderChartMeta(currentData, filters, stockAssetsBySymbol.get(filters.symbol));
  renderSimulationSummary(currentChartRows, filters);
  redrawCurrentChart();
}

/**
 * Clear validation state as soon as the user edits a field.
 */
function bindFieldErrorReset() {
  const inputs = [
    elements.symbol,
    elements.from,
    elements.to,
    elements.duration,
    elements.mode,
    elements.monthlyAmount,
    elements.buyStrategy,
  ];

  for (const input of inputs) {
    input.addEventListener("input", () => clearFieldError(input));
    input.addEventListener("change", () => clearFieldError(input));
  }
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
    stockAssets = Array.isArray(data.assets) ? data.assets : [];
    availableSymbols = new Set(stockAssets.map((asset) => asset.symbol?.toUpperCase()).filter(Boolean));
    stockAssetsBySymbol = new Map(stockAssets.map((asset) => [asset.symbol?.toUpperCase(), asset]).filter(([symbol]) => symbol));
    updateStockSymbolList("");
  } catch (error) {
    console.warn("Không tải được danh sách mã cổ phiếu", error);
  }
}

/**
 * Keep browser suggestions predictable by filtering symbols before datalist renders.
 *
 * @param {string} query
 */
function updateStockSymbolList(query, options = {}) {
  const showStatus = options.showStatus !== false;
  const keyword = normalizeSymbolText(query);
  const searchableAssets = availableSymbols.has(keyword)
    ? stockAssets.filter((asset) => String(asset.symbol || "").toUpperCase() === keyword)
    : stockAssets;
  const matches = searchableAssets
    .filter((asset) => {
      const symbol = String(asset.symbol || "").toUpperCase();
      const name = String(asset.name || "").toUpperCase();

      if (!keyword) {
        return true;
      }

      return symbol === keyword || symbol.startsWith(keyword) || name.includes(keyword);
    })
    .sort((left, right) => scoreStockMatch(left, keyword) - scoreStockMatch(right, keyword))
    .slice(0, 12);

  if (keyword && matches.length === 0) {
    elements.symbolList.innerHTML = `<option value="" label="Không có mã nào khớp"></option>`;
    if (showStatus) {
      renderSymbolSearchStatus("Không có mã nào khớp");
    }
    return;
  }

  elements.symbolList.innerHTML = matches.map(createStockOption).join("");
  if (showStatus) {
    renderSymbolSearchStatus(null);
  }
}

/**
 * Show primary symbol-search feedback outside the browser datalist.
 *
 * @param {string|null} message
 */
function renderSymbolSearchStatus(message) {
  elements.symbolSearchStatus.hidden = !message;
  elements.symbolSearchStatus.textContent = message || "";
}

/**
 * Rank exact and symbol-prefix matches ahead of company-name matches.
 *
 * @param {object} asset
 * @param {string} keyword
 * @returns {number}
 */
function scoreStockMatch(asset, keyword) {
  const symbol = String(asset.symbol || "").toUpperCase();

  if (!keyword) {
    return 10;
  }

  if (symbol === keyword) {
    return 0;
  }

  if (symbol.startsWith(keyword)) {
    return 1;
  }

  return 2;
}

/**
 * Refresh data sync state when users choose or type a symbol.
 */
function bindDataSyncStatus() {
  elements.symbol.addEventListener("input", () => {
    updateStockSymbolList(elements.symbol.value, { showStatus: true });
  });
  elements.symbol.addEventListener("change", () => {
    normalizeSymbolField(elements.symbol);
    updateStockSymbolList(elements.symbol.value, { showStatus: true });
    updateDataSyncStatus(elements.symbol.value);
  });
  elements.symbol.addEventListener("blur", () => {
    normalizeSymbolField(elements.symbol);
    updateStockSymbolList(elements.symbol.value, { showStatus: true });
    updateDataSyncStatus(elements.symbol.value);
  });
}

/**
 * Load sync metadata for a symbol and render a stale/fresh status.
 *
 * @param {string} symbol
 */
async function updateDataSyncStatus(symbol) {
  const requestId = ++syncStatusRequestId;
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!normalizedSymbol || !availableSymbols.has(normalizedSymbol)) {
    if (requestId === syncStatusRequestId) {
      renderDataSyncStatus(null);
    }
    return;
  }

  renderDataSyncStatus({ symbol: normalizedSymbol, loading: true });

  try {
    const freshness = await loadStockFreshness(normalizedSymbol);
    if (requestId === syncStatusRequestId) {
      renderDataSyncStatus(freshness);
    }
  } catch (error) {
    if (requestId === syncStatusRequestId) {
      renderDataSyncStatus({ symbol: normalizedSymbol, error: error.message });
    }
  }
}

/**
 * Render the sync panel only when local data is stale.
 *
 * @param {object|null} freshness
 */
function renderDataSyncStatus(freshness) {
  elements.dataSyncPanel.hidden = true;
  elements.dataSyncPanel.className = "data-sync-panel is-warning";
  elements.dataSyncStatus.textContent = "";

  if (!freshness) {
    return;
  }

  if (freshness.loading) {
    return;
  }

  if (freshness.error || !freshness.generatedDate) {
    elements.dataSyncPanel.hidden = false;
    elements.dataSyncStatus.textContent = freshness.error || `Chưa đọc được ngày sync của ${freshness.symbol}`;
    return;
  }

  if (freshness.generatedDate >= LATEST_COMPLETED_DATA_DATE_ISO) {
    return;
  }

  elements.dataSyncPanel.hidden = false;
  elements.dataSyncStatus.textContent = formatDataGapMessage(nextIsoDate(freshness.generatedDate), LATEST_COMPLETED_DATA_DATE_ISO);
}

/**
 * Add comparison metadata to the chart title.
 *
 * @param {object} filters
 */
function renderCompareMeta(filters) {
  if (filters.compareLegs.length === 0) {
    return;
  }

  const title = document.getElementById("chart-title");
  if (title) {
    const chips = [
      createChartTitleChip(filters.symbol, elements.lineColor.value),
      ...filters.compareLegs.map((leg) => createChartTitleChip(leg.symbol, leg.priceColor)),
    ].join("");
    title.innerHTML = `Biểu đồ mô phỏng <span class="chart-title__chips">${chips}</span>`;
  }
}

/**
 * Create a compact colored symbol chip for multi-stock chart titles.
 *
 * @param {string} symbol
 * @param {string} color
 * @returns {string}
 */
function createChartTitleChip(symbol, color) {
  return `<span class="chart-title__chip" style="--chip-color: ${escapeHtml(color)}">${escapeHtml(symbol)}</span>`;
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
 * Build a compact symbol label from manifest metadata.
 *
 * @param {string} symbol
 * @param {object|null} asset
 * @returns {string}
 */
function formatAssetName(symbol, asset = null) {
  return [symbol, asset?.name, asset?.exchange].filter(Boolean).join(" - ");
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
  elements.buyStrategy.addEventListener("change", updateBuyStrategyHelp);
  elements.from.addEventListener("change", updateBuyStrategyHelp);
  elements.from.addEventListener("input", updateBuyStrategyHelp);
}

/**
 * Keep the monthly amount readable while preserving a numeric value.
 */
function bindMoneyInput() {
  for (const input of [elements.monthlyAmount]) {
    input.addEventListener("focus", () => {
      input.select();
    });

    input.addEventListener("blur", () => {
      const amount = parseVndInput(input.value);
      if (amount > 0) {
        input.value = formatVnd(amount);
      }

      refreshCurrentSimulation();
    });
  }
}

/**
 * Normalize a symbol field after datalist/browser autofill.
 *
 * @param {HTMLInputElement} input
 */
function normalizeSymbolField(input) {
  const symbol = normalizeSymbolText(input.value);
  if (availableSymbols.has(symbol)) {
    input.value = symbol;
  }
}

/**
 * Extract the stock symbol from user or datalist text.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeSymbolText(value) {
  return String(value || "").trim().toUpperCase().match(/^[A-Z0-9]+/)?.[0] || "";
}

/**
 * Keep each comparison row from hiding both lines at once.
 *
 * @param {HTMLElement} row
 * @param {HTMLInputElement} changedInput
 */
/**
 * Keep the monthly amount readable while preserving a numeric value.
 *
 * @param {number} amount
 */
function normalizeMoneyInput(amount) {
  elements.monthlyAmount.value = formatVnd(amount);
}

/**
 * Explain the selected buy strategy without lengthening the select label.
 */
function updateBuyStrategyHelp() {
  const fromDate = readDateInput(elements.from);
  const fixedDayText = fromDate ? `Mua ngày ${Number(fromDate.slice(8, 10))} hằng tháng.` : "Lấy ngày trong ô Từ ngày.";
  const messages = {
    fixed_day: fixedDayText,
    first_trading_day: "Mua phiên đầu tiên mỗi tháng.",
    last_trading_day: "Mua phiên cuối cùng mỗi tháng.",
    average_first_5: "Chia đều trong 5 phiên đầu tháng.",
    monthly_average: "Dùng giá đóng cửa trung bình tháng.",
    monthly_low: "Dùng giá đóng cửa thấp nhất tháng.",
  };

  elements.buyStrategyHelp.textContent = messages[elements.buyStrategy.value] || "";
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
    ...currentFilters,
    ...chartOptions(currentFilters),
    hoverIndex: currentHoverIndex,
    hoverRatio: currentHoverRatio,
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
  currentHoverRatio = focus.hoverRatio;
  scheduleHoverRedraw();

  const row = focus.row;
  const frameRect = elements.chartFrame.getBoundingClientRect();
  const pointerLeft = event.clientX - frameRect.left;
  const pointerTop = event.clientY - frameRect.top;

  elements.tooltip.hidden = false;
  elements.tooltip.innerHTML = createTooltipHtml(row, currentFilters);
  positionTooltip(pointerLeft, pointerTop, frameRect);
}

/**
 * Place the tooltip around the pointer without clipping long multi-symbol content.
 *
 * @param {number} pointerLeft
 * @param {number} pointerTop
 * @param {DOMRect} frameRect
 */
function positionTooltip(pointerLeft, pointerTop, frameRect) {
  const gap = 18;
  const margin = 10;
  const tooltipWidth = elements.tooltip.offsetWidth;
  const tooltipHeight = elements.tooltip.offsetHeight;
  const hasRightSpace = pointerLeft + gap + tooltipWidth <= frameRect.width - margin;
  const hasBottomSpace = pointerTop + gap + tooltipHeight <= frameRect.height - margin;
  const left = hasRightSpace ? pointerLeft + gap : pointerLeft - tooltipWidth - gap;
  const top = hasBottomSpace ? pointerTop + gap : pointerTop - tooltipHeight - gap;
  const maxLeft = Math.max(margin, frameRect.width - tooltipWidth - margin);
  const maxTop = Math.max(margin, frameRect.height - tooltipHeight - margin);

  elements.tooltip.style.left = `${clamp(left, margin, maxLeft)}px`;
  elements.tooltip.style.top = `${clamp(top, margin, maxTop)}px`;
}

/**
 * Redraw hover markers at most once per animation frame.
 */
function scheduleHoverRedraw() {
  if (pendingHoverFrame) {
    return;
  }

  pendingHoverFrame = requestAnimationFrame(() => {
    pendingHoverFrame = 0;
    redrawCurrentChart();
  });
}

/**
 * Hide tooltip when the pointer leaves the canvas.
 */
function hideTooltip() {
  currentHoverIndex = null;
  currentHoverRatio = null;
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
  const symbol = normalizeSymbolText(elements.symbol.value);
  const fromDate = readDateInput(elements.from);
  const toDate = readDateInput(elements.to);
  const monthlyAmount = parseVndInput(elements.monthlyAmount.value);
  const normalizedCompareLegs = compareControls.read(monthlyAmount);
  const existingPosition = portfolioControls.readExistingPosition();
  const errors = [];

  if (!availableSymbols.has(symbol)) {
    if (!symbol) {
      errors.push(fieldError(elements.symbol, "nhập mã cổ phiếu, ví dụ FPT"));
    } else {
      errors.push(fieldError(elements.symbol, `chọn mã có dữ liệu, ${symbol} chưa có trong danh sách`));
    }
  }

  if (!elements.from.value.trim()) {
    errors.push(fieldError(elements.from, "nhập ngày bắt đầu, ví dụ 01/01/2020"));
  } else if (!fromDate) {
    errors.push(fieldError(elements.from, "sửa ngày bắt đầu theo định dạng dd/mm/yyyy"));
  } else if (fromDate < "2000-01-01") {
    errors.push(fieldError(elements.from, "chọn ngày bắt đầu từ 01/01/2000 trở đi"));
  }

  if (!elements.to.value.trim()) {
    errors.push(fieldError(elements.to, `nhập ngày kết thúc, tối đa ${formatDate(TODAY_ISO)}`));
  } else if (!toDate) {
    errors.push(fieldError(elements.to, "sửa ngày kết thúc theo định dạng dd/mm/yyyy"));
  } else if (toDate > TODAY_ISO) {
    errors.push(fieldError(elements.to, `chọn ngày kết thúc không sau hôm nay (${formatDate(TODAY_ISO)})`));
  }

  if (elements.mode.value === "dca" && monthlyAmount <= 0) {
    errors.push(fieldError(elements.monthlyAmount, "nhập hoặc chọn số tiền đầu tư hằng tháng"));
  }

  for (const leg of normalizedCompareLegs) {
    if (!availableSymbols.has(leg.symbol)) {
      errors.push(fieldError(leg.symbolInput, "chọn mã so sánh có dữ liệu"));
    } else if (leg.symbol === symbol) {
      errors.push(fieldError(leg.symbolInput, "chọn mã so sánh khác mã chính"));
    }

    const duplicateCount = normalizedCompareLegs.filter((item) => item.symbol === leg.symbol).length;
    if (leg.symbol && duplicateCount > 1) {
      errors.push(fieldError(leg.symbolInput, "mỗi mã so sánh chỉ chọn một lần"));
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    errors.push(fieldError(elements.from, "ngày bắt đầu phải trước hoặc bằng ngày kết thúc"));
    errors.push(fieldError(elements.to, "ngày kết thúc phải sau hoặc bằng ngày bắt đầu"));
  }

  if (errors.length > 0) {
    throw validationError(errors);
  }

  return {
    symbol,
    fromDate,
    toDate,
    durationSeconds: clamp(parseOptionalNumber(elements.duration.value), 0, 60),
    mode: elements.mode.value,
    monthlyAmount: clamp(monthlyAmount, 10000, 1000000000),
    buyStrategy: elements.buyStrategy.value,
    existingPosition,
    compareLegs: normalizedCompareLegs.map(({ symbolInput, amountInput, ...leg }) => leg),
  };
}

/**
 * Create one field-level validation item.
 *
 * @param {HTMLElement} field
 * @param {string} message
 * @returns {object}
 */
function fieldError(field, message) {
  return { field, message };
}

/**
 * Create a validation error tied to one or more controls.
 *
 * @param {Array<object>} fieldErrors
 * @returns {Error}
 */
function validationError(fieldErrors) {
  const message =
    fieldErrors.length === 1
      ? `Vui lòng ${fieldErrors[0].message}.`
      : `Vui lòng kiểm tra ${fieldErrors.length} mục bên dưới.`;
  const error = new Error(message);
  error.fieldErrors = fieldErrors;
  return error;
}

/**
 * Detect form-only errors so they do not replace the chart content.
 *
 * @param {Error} error
 * @returns {boolean}
 */
function isValidationError(error) {
  return Array.isArray(error.fieldErrors);
}

/**
 * Display form validation error near the controls and mark the field.
 *
 * @param {Error} error
 */
function showFieldError(error) {
  if (!error.fieldErrors?.length) {
    return;
  }

  for (const item of error.fieldErrors) {
    const label = item.field.closest("label");
    label?.classList.add("is-invalid");
    item.field.setAttribute("aria-invalid", "true");
  }

  elements.controlError.hidden = false;
  if (error.fieldErrors.length === 1) {
    elements.controlError.textContent = error.message;
    return;
  }

  elements.controlError.innerHTML = [
    "<strong>Vui lòng kiểm tra:</strong>",
    `<ul>${error.fieldErrors.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>`,
  ].join("");
}

/**
 * Clear all visible form validation errors.
 */
function clearFieldErrors() {
  elements.controlError.hidden = true;
  elements.controlError.replaceChildren();

  for (const label of document.querySelectorAll("label.is-invalid")) {
    label.classList.remove("is-invalid");
  }

  for (const input of [
    elements.symbol,
    elements.from,
    elements.to,
    elements.duration,
    elements.mode,
    elements.monthlyAmount,
    elements.buyStrategy,
    ...elements.compareList.querySelectorAll("input"),
  ]) {
    input.removeAttribute("aria-invalid");
  }
}

/**
 * Clear validation state for one edited field.
 *
 * @param {HTMLElement} field
 */
function clearFieldError(field) {
  field.closest("label")?.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");

  if (!document.querySelector("label.is-invalid")) {
    elements.controlError.hidden = true;
    elements.controlError.replaceChildren();
  }
}

/**
 * Convert raw market rows into the series required by the selected chart mode.
 *
 * @param {Array<object>} rows
 * @param {object} filters
 * @returns {Array<object>}
 */
function buildChartRows(rows, filters, comparisons = []) {
  if (filters.mode === "dca") {
    const primaryRows = buildMonthlyDcaRows(rows, {
      ...filters,
      initialPosition: filters.existingPosition,
    });
    const compareSimulations = comparisons.map((comparison) => ({
      ...comparison,
      rows: buildMonthlyDcaRows(comparison.rows, {
        ...filters,
        monthlyAmount: comparison.monthlyAmount,
      }),
    }));

    return buildMultiComparisonRows(primaryRows, compareSimulations);
  }

  const priceRows = buildPriceRows(rows);
  return buildMultiComparisonRows(
    priceRows,
    comparisons.map((comparison) => ({
      ...comparison,
      rows: buildPriceRows(comparison.rows),
    })),
  );
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
    compareSeries: filters.compareLegs.map((leg) => createCompareSeriesOptions(leg)),
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
  const groups = [
    createTooltipGroup(filters.symbol, [
      [priceLabelForDate(row.sourceDate, row.date), formatMoney(row.close)],
      ...(filters.mode === "dca"
        ? [
            ["Hiện tại", formatMoney(row.investmentValue)],
            ["Đã góp", formatMoney(row.investedValue)],
            ["Cổ phiếu", formatShares(row.units)],
          ]
        : []),
    ]),
  ];

  for (const leg of filters.compareLegs) {
    groups.push(
      createTooltipGroup(leg.symbol, [
        [priceLabelForDate(row[`${leg.id}Date`], row.date), formatMoney(row[`${leg.id}Close`])],
        ...(filters.mode === "dca"
          ? [
              ["Hiện tại", formatMoney(row[`${leg.id}InvestmentValue`])],
              ["Đã góp", formatMoney(row[`${leg.id}InvestedValue`])],
              ["Cổ phiếu", formatShares(row[`${leg.id}Units`])],
            ]
          : []),
      ]),
    );
  }

  return [`<strong>${formatDate(row.date)}</strong>`, ...groups].join("");
}

/**
 * Create a separated tooltip block for one stock symbol.
 *
 * @param {string} symbol
 * @param {Array<[string, string]>} rows
 * @returns {string}
 */
function createTooltipGroup(symbol, rows) {
  return `
    <div class="chart-tooltip__group">
      <div class="chart-tooltip__symbol">${escapeHtml(symbol)}</div>
      ${rows.map(([label, value]) => `<span><b>${escapeHtml(label)}</b><em>${escapeHtml(value)}</em></span>`).join("")}
    </div>
  `;
}

/**
 * Clarify carried-forward prices for symbols that did not trade on the hover date.
 *
 * @param {string} sourceDate
 * @param {string} displayDate
 * @returns {string}
 */
function priceLabelForDate(sourceDate, displayDate) {
  return sourceDate && sourceDate !== displayDate ? "Đóng cửa gần nhất" : "Đóng cửa";
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
  const items = [
    createSummaryMetaItem("Cách mua", buyStrategyLabel(filters.buyStrategy, filters)),
    createSummaryRow({
      symbol: filters.symbol,
      color: elements.lineColor.value,
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

  elements.simulationSummary.hidden = false;
  elements.simulationSummary.innerHTML = items.join("");
}

/**
 * Create one full-width summary row for one stock symbol.
 *
 * @param {object} item
 * @returns {string}
 */
function createSummaryRow(item) {
  const profitLoss = item.investmentValue - item.investedValue;
  const profitClass = profitLoss >= 0 ? "is-profit" : "is-loss";

  return `
    <div class="summary-row">
      <div class="summary-row__symbol" style="--summary-color: ${escapeHtml(item.color)}">
        <span></span>
        <strong>${escapeHtml(item.symbol)}</strong>
      </div>
      ${createSummaryMetric("Mỗi tháng", formatMoney(item.monthlyAmount))}
      ${createSummaryMetric("Đã góp", formatMoney(item.investedValue))}
      ${createSummaryMetric("Hiện tại", formatMoney(item.investmentValue))}
      ${createSummaryMetric("Cổ phiếu", formatShares(item.units))}
      ${createSummaryMetric("Lãi/lỗ", `${profitLoss >= 0 ? "+" : ""}${formatMoney(profitLoss)}`, profitClass)}
    </div>
  `;
}

/**
 * Create a compact metric inside a symbol summary row.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} className
 * @returns {string}
 */
function createSummaryMetric(label, value, className = "") {
  return `<div class="summary-metric ${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

/**
 * Create a full-width metadata row for summary context.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} className
 * @returns {string}
 */
function createSummaryMetaItem(label, value, className = "") {
  return `<div class="summary-meta ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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
 * Compare DCA legs by return percentage so different monthly amounts are fair.
 *
 * @param {object} latest
 * @param {object} filters
 * @returns {string}
 */
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

/**
 * Calculate return ratio.
 *
 * @param {number} currentValue
 * @param {number} investedValue
 * @returns {number}
 */
function returnRatio(currentValue, investedValue) {
  return investedValue > 0 ? (currentValue - investedValue) / investedValue : 0;
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
 * Format a percentage value for compact Vietnamese UI.
 *
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}%`;
}

/**
 * Return the next local ISO date after a given ISO date.
 *
 * @param {string} value
 * @returns {string}
 */
function nextIsoDate(value) {
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
function previousIsoDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
}

/**
 * Create readable stale-data copy for one or more missing completed days.
 *
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {string}
 */
function formatDataGapMessage(fromDate, toDate) {
  if (fromDate === toDate) {
    return `Chưa có data ngày ${formatDate(fromDate)}`;
  }

  return `Chưa có data từ ngày ${formatDate(fromDate)} tới ${formatDate(toDate)}`;
}

/**
 * Convert a buy strategy id into a Vietnamese label.
 *
 * @param {string} strategy
 * @param {object} filters
 * @returns {string}
 */
function buyStrategyLabel(strategy, filters = {}) {
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
 * Parse signed VND input such as `-5.000.000` or `+500.000`.
 *
 * @param {string} value
 * @returns {number}
 */
function parseSignedVndInput(value) {
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
function parseOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Format a plain number without locale separators for numeric inputs.
 *
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
function formatPlainNumber(value, digits) {
  return Number(value.toFixed(digits)).toString();
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

/**
 * Convert Date to local ISO date without timezone shifts.
 *
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
