export const DEFAULT_CHART_THEME = {
  text: "#000000",
  muted: "#77807c",
  grid: "#e9efeb",
  price: "#459ef2",
  comparePrice: "#176b4d",
  investment: "#e042ff",
  compareInvestment: "#ff9f1c",
  high: "#f13b3b",
  low: "#f13b3b",
  latest: "#f13b3b",
  background: "#fffefa",
  lineGlow: false,
  fillTop: "rgba(69, 158, 242, 0.14)",
  fillBottom: "rgba(69, 158, 242, 0)",
  investmentFillTop: "rgba(224, 66, 255, 0.12)",
  investmentFillBottom: "rgba(224, 66, 255, 0)",
  compareFillTop: "rgba(23, 107, 77, 0.1)",
  compareFillBottom: "rgba(23, 107, 77, 0)",
  compareInvestmentFillTop: "rgba(255, 159, 28, 0.1)",
  compareInvestmentFillBottom: "rgba(255, 159, 28, 0)",
};

const CHART_PADDING = { top: 34, right: 132, bottom: 70, left: 82 };

/**
 * Animate the selected chart rows over a fixed duration.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 * @param {object} options
 * @param {number} options.durationSeconds
 * @returns {{stop: () => void}}
 */
export function animateClosePriceChart(canvas, rows, options) {
  const context = canvas.getContext("2d");
  const state = createChartState(canvas, rows, options);
  const durationSeconds = Math.max(Number(options.durationSeconds) || 0, 0);
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const onComplete = typeof options.onComplete === "function" ? options.onComplete : () => {};

  if (durationSeconds === 0) {
    onProgress(1);
    drawChart(context, state, rows);
    onComplete();
    return { stop() {} };
  }

  const startedAt = performance.now();
  let frameId = 0;
  let stopped = false;

  /**
   * Draw one animation frame.
   *
   * @param {number} now
   */
  function drawFrame(now) {
    if (stopped) {
      return;
    }

    const progress = Math.min((now - startedAt) / (durationSeconds * 1000), 1);
    onProgress(progress);
    drawChart(context, state, rows, null, { revealRatio: progress });

    if (progress < 1) {
      frameId = requestAnimationFrame(drawFrame);
    } else {
      onComplete();
    }
  }

  onProgress(0);
  drawChart(context, state, rows, null, { revealRatio: 0 });
  frameId = requestAnimationFrame(drawFrame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frameId);
    },
  };
}

/**
 * Draw the full selected range without animation.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 * @param {object} theme
 * @param {object} options
 */
export function drawStaticClosePriceChart(canvas, rows, theme = DEFAULT_CHART_THEME, options = {}) {
  const context = canvas.getContext("2d");
  if (rows.length === 0) {
    drawEmptyChart(context, canvas, theme);
    return;
  }

  const hover = Number.isInteger(options.hoverIndex) ? { index: options.hoverIndex, ratio: options.hoverRatio ?? null } : null;
  drawChart(context, createChartState(canvas, rows, { ...options, theme }), rows, hover, {
    revealRatio: options.revealRatio ?? 1,
  });
}

/**
 * Draw a neutral canvas state before a dataset is selected.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {HTMLCanvasElement} canvas
 * @param {object} theme
 */
function drawEmptyChart(context, canvas, theme) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = theme.muted;
  context.font = "600 18px system-ui";
  context.textAlign = "center";
  context.fillText("Chọn mã cổ phiếu và khoảng ngày để xem biểu đồ", canvas.width / 2, canvas.height / 2);
}

/**
 * Find the nearest row from a pointer X coordinate inside the plot area.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 * @param {number} clientX
 * @param {object} options
 * @returns {{index: number, row: object, x: number, y: number, hoverRatio: number}|null}
 */
export function getNearestChartPoint(canvas, rows, clientX, options = {}) {
  if (rows.length === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const state = createChartState(canvas, rows, options);
  const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
  const plotX = clamp(canvasX, state.padding.left, state.width - state.padding.right);
  const maxRatio = Number.isFinite(options.revealRatio) ? clamp(options.revealRatio, 0, 1) : 1;
  const ratio = Math.min((plotX - state.padding.left) / plotWidth(state), maxRatio);
  const index = findNearestRowIndexByRatio(state, ratio);
  const point = pointForActiveSeries(state, rows[index], index);

  return {
    index,
    row: rows[index],
    x: (point.x / canvas.width) * rect.width,
    y: (point.y / canvas.height) * rect.height,
    hoverRatio: clamp(ratio, 0, 1),
  };
}

/**
 * Create immutable layout and axis scale values.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 * @param {object} options
 * @returns {object}
 */
function createChartState(canvas, rows, options = {}) {
  const theme = options.theme || DEFAULT_CHART_THEME;
  const requestedPrice = options.showPrice !== false;
  const requestedInvestment = options.showInvestment === true;
  const compareSeries = Array.isArray(options.compareSeries) ? options.compareSeries : [];
  const showCompare = compareSeries.length > 0;
  const showPrice = requestedPrice || !requestedInvestment;
  const showInvestment = requestedInvestment;
  const priceKeys = ["close", ...compareSeries.filter((series) => series.showPrice !== false).map((series) => series.priceKey)];
  const investmentKeys = ["investmentValue", ...compareSeries.filter((series) => series.showInvestment !== false).map((series) => series.investmentKey)];
  const priceTicks = createNiceTicksForRows(rows, priceKeys);
  const investmentTicks = createNiceTicksForRows(rows, investmentKeys);
  const padding = createResponsivePadding(priceTicks, investmentTicks, rows.at(-1), { showPrice, showInvestment }, compareSeries, options.symbol);
  const rowTimes = rows.map((row) => dateToTime(row.date));
  const startTime = rowTimes[0];
  const endTime = rowTimes.at(-1);

  return {
    width: canvas.width,
    height: canvas.height,
    padding,
    theme,
    symbol: options.symbol || "Mã",
    showPrice,
    showInvestment,
    showCompare,
    compareSeries,
    activeSeries: showPrice ? "price" : "investment",
    priceTicks,
    investmentTicks,
    rowTimes,
    startTime,
    endTime,
    xTicks: createDateTicks(rows, dateTickCountForWidth(canvas.width)),
    extrema: findVisiblePriceExtrema(rows, options.symbol || "Mã", compareSeries),
    totalRows: rows.length,
    priceMin: priceTicks[0],
    priceMax: priceTicks.at(-1),
    investmentMin: investmentTicks[0],
    investmentMax: investmentTicks.at(-1),
  };
}

/**
 * Draw all visible chart layers in deterministic order.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} visibleRows
 * @param {{index: number, ratio: number|null}|null} hover
 * @param {{revealRatio?: number}} options
 */
function drawChart(context, state, rows, hover = null, options = {}) {
  const revealRatio = Number.isFinite(options.revealRatio) ? clamp(options.revealRatio, 0, 1) : 1;
  const visibleRows = createRowsForReveal(state, rows, revealRatio);

  clearCanvas(context, state);
  drawGrid(context, state);
  drawPriceArea(context, state, visibleRows);
  drawComparePriceAreas(context, state, visibleRows);
  drawInvestmentArea(context, state, visibleRows);
  drawCompareInvestmentAreas(context, state, visibleRows);
  drawCompareInvestmentLines(context, state, visibleRows);
  drawInvestmentLine(context, state, visibleRows);
  drawComparePriceLines(context, state, visibleRows);
  drawPriceLine(context, state, visibleRows);
  drawPriceExtremaMarkers(context, state, timeForRatio(state, revealRatio));
  drawLatestLabels(context, state, visibleRows.at(-1), visibleRows.length - 1);
  drawCrosshair(context, state, rows, hover, revealRatio);
  drawDateAxis(context, state);
  drawChartLegend(context, state);
}

/**
 * Build the visible rows at an animation ratio, including a temporary interpolated edge point.
 *
 * @param {object} state
 * @param {Array<object>} rows
 * @param {number} revealRatio
 * @returns {Array<object>}
 */
function createRowsForReveal(state, rows, revealRatio) {
  if (rows.length < 2 || revealRatio >= 1) {
    return rows;
  }

  const targetTime = timeForRatio(state, revealRatio);
  const bounds = findRowsAroundTime(state, targetTime);
  const visibleRows = rows.slice(0, bounds.leftIndex + 1);

  if (bounds.leftIndex === bounds.rightIndex) {
    return visibleRows.length >= 2 ? visibleRows : [{ ...rows[0] }, { ...rows[0], __time: targetTime }];
  }

  const left = rows[bounds.leftIndex];
  const right = rows[bounds.rightIndex];
  const leftTime = state.rowTimes[bounds.leftIndex];
  const rightTime = state.rowTimes[bounds.rightIndex];
  const ratio = rightTime === leftTime ? 0 : (targetTime - leftTime) / (rightTime - leftTime);
  visibleRows.push(interpolateRow(left, right, clamp(ratio, 0, 1), targetTime));

  return visibleRows.length >= 2 ? visibleRows : rows.slice(0, 2);
}

/**
 * Draw a compact legend so colors stay meaningful with multiple symbols.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function drawChartLegend(context, state) {
  const items = createLegendItems(state);
  if (items.length <= 1) {
    return;
  }

  context.save();
  context.font = "700 12px system-ui";
  context.textBaseline = "middle";
  let x = state.padding.left;
  let y = state.height - state.padding.bottom + 62;
  const maxX = state.width - state.padding.right;

  for (const item of items) {
    const width = context.measureText(item.label).width + 28;
    if (x + width > maxX && x > state.padding.left) {
      x = state.padding.left;
      y += 20;
    }

    context.fillStyle = item.color;
    context.fillRect(x, y - 4, 16, 3);
    context.fillStyle = state.theme.text;
    context.fillText(item.label, x + 22, y);
    x += width + 12;
  }

  context.restore();
}

/**
 * Build visible legend entries for primary and comparison series.
 *
 * @param {object} state
 * @returns {Array<{label: string, color: string}>}
 */
function createLegendItems(state) {
  const items = [];

  if (state.showPrice) {
    items.push({ label: `${state.symbol} giá`, color: state.theme.price });
  }

  if (state.showInvestment) {
    items.push({ label: `${state.symbol} đầu tư`, color: state.theme.investment });
  }

  for (const series of state.compareSeries) {
    if (state.showPrice && series.showPrice !== false) {
      items.push({ label: `${series.symbol} giá`, color: series.color });
    }

    if (state.showInvestment && series.showInvestment !== false) {
      items.push({ label: `${series.symbol} đầu tư`, color: series.investmentColor });
    }
  }

  return items;
}

/**
 * Clear the canvas before each frame.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function clearCanvas(context, state) {
  context.clearRect(0, 0, state.width, state.height);
  context.fillStyle = state.theme.background;
  context.fillRect(0, 0, state.width, state.height);
}

/**
 * Draw grid lines plus left/right Y axes based on visible series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function drawGrid(context, state) {
  context.strokeStyle = state.theme.grid;
  context.lineWidth = 1;

  const gridTicks = state.showPrice ? state.priceTicks : state.investmentTicks;
  const yForGrid = state.showPrice ? yForPrice : yForInvestment;

  for (const tick of gridTicks) {
    const y = yForGrid(state, tick);
    drawLine(context, state.padding.left, y, state.width - state.padding.right, y);
  }

  if (state.showPrice) {
    drawLeftAxis(context, state);
  }

  if (state.showInvestment) {
    drawRightAxis(context, state);
  }
}

/**
 * Draw left Y-axis labels for FPT price.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function drawLeftAxis(context, state) {
  context.fillStyle = state.theme.text;
  context.font = "18px system-ui";
  context.textAlign = "left";

  for (const tick of state.priceTicks) {
    context.fillText(formatVnd(tick), 14, yForPrice(state, tick) + 6);
  }
}

/**
 * Draw subtle area fill below the investment value line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawInvestmentArea(context, state, rows) {
  if (!state.showInvestment || rows.length < 2) {
    return;
  }

  const gradient = context.createLinearGradient(0, state.padding.top, 0, state.height - state.padding.bottom);
  gradient.addColorStop(0, state.theme.investmentFillTop);
  gradient.addColorStop(1, state.theme.investmentFillBottom);

  context.beginPath();
  rows.forEach((row, index) => {
    const point = pointForInvestment(state, row, index);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.lineTo(pointForInvestment(state, rows.at(-1), rows.length - 1).x, state.height - state.padding.bottom);
  context.lineTo(state.padding.left, state.height - state.padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
}

/**
 * Draw subtle area fill below the comparison investment line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawCompareInvestmentAreas(context, state, rows) {
  if (!state.showInvestment || !state.showCompare || rows.length < 2) {
    return;
  }

  for (const series of state.compareSeries.filter((item) => item.showInvestment !== false)) {
    drawArea(context, state, rows, (row, index) => pointForCompareInvestment(state, row, index, series), [
      transparentize(series.investmentColor, 0.08),
      transparentize(series.investmentColor, 0),
    ]);
  }
}

/**
 * Draw right Y-axis labels for investment value.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function drawRightAxis(context, state) {
  context.fillStyle = state.theme.investment;
  context.font = "16px system-ui";
  context.textAlign = "right";

  for (const tick of state.investmentTicks) {
    context.fillText(formatCompactVnd(tick), state.width - 14, yForInvestment(state, tick) + 5);
  }
}

/**
 * Draw subtle area fill below the FPT price line only.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawPriceArea(context, state, rows) {
  if (!state.showPrice || rows.length < 2) {
    return;
  }

  const gradient = context.createLinearGradient(0, state.padding.top, 0, state.height - state.padding.bottom);
  gradient.addColorStop(0, state.theme.fillTop);
  gradient.addColorStop(1, state.theme.fillBottom);

  context.beginPath();
  rows.forEach((row, index) => {
    const point = pointForPrice(state, row, index);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.lineTo(pointForPrice(state, rows.at(-1), rows.length - 1).x, state.height - state.padding.bottom);
  context.lineTo(state.padding.left, state.height - state.padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
}

/**
 * Draw subtle area fill below the comparison price line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawComparePriceAreas(context, state, rows) {
  if (!state.showPrice || !state.showCompare || rows.length < 2) {
    return;
  }

  for (const series of state.compareSeries.filter((item) => item.showPrice !== false)) {
    drawArea(context, state, rows, (row, index) => pointForComparePrice(state, row, index, series), [
      transparentize(series.color, 0.08),
      transparentize(series.color, 0),
    ]);
  }
}

/**
 * Draw a generic area under a line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 * @param {Function} pointFactory
 * @param {[string, string]} colors
 */
function drawArea(context, state, rows, pointFactory, colors) {
  const gradient = context.createLinearGradient(0, state.padding.top, 0, state.height - state.padding.bottom);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);

  context.beginPath();
  rows.forEach((row, index) => {
    const point = pointFactory(row, index);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.lineTo(pointFactory(rows.at(-1), rows.length - 1).x, state.height - state.padding.bottom);
  context.lineTo(state.padding.left, state.height - state.padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
}

/**
 * Draw the FPT close-price line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawPriceLine(context, state, rows) {
  if (!state.showPrice || rows.length < 2) {
    return;
  }

  drawSeriesLine(context, rows, (row, index) => pointForPrice(state, row, index), state.theme.price, 4, state.theme.lineGlow);
}

/**
 * Draw the comparison close-price line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawComparePriceLines(context, state, rows) {
  if (!state.showPrice || !state.showCompare || rows.length < 2) {
    return;
  }

  for (const series of state.compareSeries.filter((item) => item.showPrice !== false)) {
    drawSeriesLine(context, rows, (row, index) => pointForComparePrice(state, row, index, series), series.color, 3, state.theme.lineGlow);
  }
}

/**
 * Draw the current investment value line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawInvestmentLine(context, state, rows) {
  if (!state.showInvestment || rows.length < 2) {
    return;
  }

  drawSeriesLine(context, rows, (row, index) => pointForInvestment(state, row, index), state.theme.investment, 3, state.theme.lineGlow);
}

/**
 * Draw the comparison investment-value line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 */
function drawCompareInvestmentLines(context, state, rows) {
  if (!state.showInvestment || !state.showCompare || rows.length < 2) {
    return;
  }

  for (const series of state.compareSeries.filter((item) => item.showInvestment !== false)) {
    drawSeriesLine(
      context,
      rows,
      (row, index) => pointForCompareInvestment(state, row, index, series),
      series.investmentColor,
      3,
      state.theme.lineGlow,
    );
  }
}

/**
 * Draw a connected line for one visible series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {Array<object>} rows
 * @param {Function} pointFactory
 * @param {string} color
 * @param {number} width
 * @param {boolean} lineGlow
 */
function drawSeriesLine(context, rows, pointFactory, color, width, lineGlow) {
  context.save();
  if (lineGlow) {
    context.shadowColor = color;
    context.shadowBlur = 9;
    context.shadowOffsetY = 3;
  }
  context.beginPath();
  rows.forEach((row, index) => {
    const point = pointFactory(row, index);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.restore();
}

/**
 * Draw global high/low markers for each visible price series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {number} revealTime
 */
function drawPriceExtremaMarkers(context, state, revealTime) {
  if (!state.showPrice) {
    return;
  }

  for (const marker of state.extrema) {
    if (timeForRow(state, marker.row, marker.index) <= revealTime) {
      drawPriceMarker(context, state, marker);
    }
  }
}

/**
 * Find the selected range's highest and lowest close price for every price line.
 *
 * @param {Array<object>} rows
 * @param {string} symbol
 * @param {Array<object>} compareSeries
 * @returns {Array<object>}
 */
function findVisiblePriceExtrema(rows, symbol, compareSeries = []) {
  const seriesList = [
    {
      symbol,
      valueKey: "close",
      colorKey: "price",
      color: null,
      pointFactory: pointForPrice,
    },
    ...compareSeries
      .filter((series) => series.showPrice !== false)
      .map((series) => ({
        symbol: series.symbol,
        valueKey: series.priceKey,
        colorKey: null,
        color: series.color,
        pointFactory: (state, row, index) => pointForComparePrice(state, row, index, series),
      })),
  ];

  return seriesList.flatMap((series) => findSeriesExtrema(rows, series)).sort((left, right) => left.index - right.index);
}

/**
 * Find high/low markers for one price series.
 *
 * @param {Array<object>} rows
 * @param {object} series
 * @returns {Array<object>}
 */
function findSeriesExtrema(rows, series) {
  let high = { row: rows[0], index: 0 };
  let low = { row: rows[0], index: 0 };

  rows.forEach((row, index) => {
    if (row[series.valueKey] > high.row[series.valueKey]) {
      high = { row, index };
    }

    if (row[series.valueKey] < low.row[series.valueKey]) {
      low = { row, index };
    }
  });

  if (high.index === low.index) {
    return [createPriceMarker(high, "high", series)];
  }

  return [createPriceMarker(high, "high", series), createPriceMarker(low, "low", series)].sort((left, right) => left.index - right.index);
}

/**
 * Create drawing metadata for one price marker.
 *
 * @param {{row: object, index: number}} point
 * @param {"high"|"low"} type
 * @param {object} series
 * @returns {object}
 */
function createPriceMarker(point, type, series) {
  const isHigh = type === "high";

  return {
    row: point.row,
    index: point.index,
    type,
    series,
    label: isHigh ? "Đỉnh" : "Đáy",
    labelOffsetY: isHigh ? -12 : 20,
  };
}

/**
 * Draw latest labels for visible price and investment series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {object} row
 * @param {number} index
 */
function drawLatestLabels(context, state, row, index) {
  const labels = [];

  if (state.showPrice) {
    labels.push({
      point: pointForPrice(state, row, index),
      label: `(${state.symbol}) giá ${formatVnd(row.close)}`,
      color: state.theme.price,
    });
  }

  if (state.showCompare && state.showPrice) {
    for (const series of state.compareSeries.filter((item) => item.showPrice !== false)) {
      labels.push({
        point: pointForComparePrice(state, row, index, series),
        label: `(${series.symbol}) giá ${formatVnd(row[series.priceKey])}`,
        color: series.color,
      });
    }
  }

  if (state.showInvestment) {
    labels.push({
      point: pointForInvestment(state, row, index),
      label: `(${state.symbol}) đầu tư ${formatCompactVnd(row.investmentValue)}`,
      color: state.theme.investment,
    });
  }

  if (state.showCompare && state.showInvestment) {
    for (const series of state.compareSeries.filter((item) => item.showInvestment !== false)) {
      labels.push({
        point: pointForCompareInvestment(state, row, index, series),
        label: `(${series.symbol}) đầu tư ${formatCompactVnd(row[series.investmentKey])}`,
        color: series.investmentColor,
      });
    }
  }

  drawDistributedLatestLabels(context, labels);
}

/**
 * Draw endpoint tags with vertical spacing so several series remain readable.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {Array<{point: {x: number, y: number}, label: string, color: string}>} labels
 */
function drawDistributedLatestLabels(context, labels) {
  if (labels.length === 0) {
    return;
  }

  const sortedLabels = labels
    .map((item) => ({
      ...item,
      labelY: clamp(item.point.y, 26, context.canvas.height - 26),
    }))
    .sort((left, right) => left.labelY - right.labelY);
  const minGap = 22;

  for (let index = 1; index < sortedLabels.length; index += 1) {
    const previous = sortedLabels[index - 1];
    const current = sortedLabels[index];
    if (current.labelY - previous.labelY < minGap) {
      current.labelY = previous.labelY + minGap;
    }
  }

  const overflow = sortedLabels.at(-1).labelY - (context.canvas.height - 26);
  if (overflow > 0) {
    for (const item of sortedLabels) {
      item.labelY -= overflow;
    }
  }

  for (const item of sortedLabels) {
    drawLatestPoint(context, item.point, item.label, item.color, item.labelY);
  }
}

/**
 * Draw a latest point and compact text tag for one series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {{x: number, y: number}} point
 * @param {string} label
 * @param {string} color
 * @param {number} labelY
 */
function drawLatestPoint(context, point, label, color, labelY) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fill();

  context.font = "700 14px system-ui";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, point.x + 10, labelY);
  context.textBaseline = "alphabetic";
}

/**
 * Draw one high/low marker on its own price line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {object} marker
 */
function drawPriceMarker(context, state, marker) {
  const point = marker.series.pointFactory(state, marker.row, marker.index);
  const color = marker.series.color || state.theme[marker.series.colorKey] || state.theme.price;
  const markerLabel = `(${marker.series.symbol}) ${marker.label} ${formatVnd(marker.row[marker.series.valueKey])}`;

  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fill();

  context.font = "700 13px system-ui";
  context.textAlign = "left";
  context.fillText(markerLabel, point.x + 8, point.y + marker.labelOffsetY);
}

/**
 * Draw pointer-following guide and markers for every visible series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 * @param {{index: number, ratio: number|null}|null} hover
 * @param {number} revealRatio
 */
function drawCrosshair(context, state, rows, hover, revealRatio = 1) {
  if (!hover || hover.index >= rows.length) {
    return;
  }

  const hoverRatio = Number.isFinite(hover.ratio) ? Math.min(hover.ratio, revealRatio) : revealRatio;
  const row = rows[findNearestRowIndexByRatio(state, hoverRatio)];
  const guideX = state.padding.left + plotWidth(state) * hoverRatio;
  const plotBottom = state.height - state.padding.bottom;
  const hoverPoints = createHoverPoints(state, rows, row, hover.index, hoverRatio);

  context.save();
  context.strokeStyle = "rgba(0, 143, 107, 0.28)";
  context.lineWidth = 1;
  context.setLineDash([5, 5]);
  drawLine(context, guideX, state.padding.top, guideX, plotBottom);
  context.setLineDash([]);

  for (const item of hoverPoints) {
    drawHoverMarker(context, item.point, item.color);
  }

  context.restore();
}

/**
 * Build hover markers for every visible series at the active date.
 *
 * @param {object} state
 * @param {Array<object>} rows
 * @param {object} row
 * @param {number} index
 * @param {number|null} ratio
 * @returns {Array<{point: {x: number, y: number}, color: string}>}
 */
function createHoverPoints(state, rows, row, index, ratio) {
  const points = [];
  const hoverX = Number.isFinite(ratio) ? state.padding.left + plotWidth(state) * ratio : xForIndex(state, index);

  if (state.showPrice) {
    points.push({ point: pointForHoverValue(state, rows, "close", ratio, hoverX, yForPrice), color: state.theme.price });
  }

  if (state.showInvestment) {
    points.push({ point: pointForHoverValue(state, rows, "investmentValue", ratio, hoverX, yForInvestment), color: state.theme.investment });
  }

  for (const series of state.compareSeries) {
    if (state.showPrice && series.showPrice !== false) {
      points.push({ point: pointForHoverValue(state, rows, series.priceKey, ratio, hoverX, yForPrice), color: series.color });
    }

    if (state.showInvestment && series.showInvestment !== false) {
      points.push({ point: pointForHoverValue(state, rows, series.investmentKey, ratio, hoverX, yForInvestment), color: series.investmentColor });
    }
  }

  return points;
}

/**
 * Interpolate a series marker at the pointer X position.
 *
 * @param {object} state
 * @param {Array<object>} rows
 * @param {string} key
 * @param {number|null} ratio
 * @param {number} x
 * @param {Function} yFactory
 * @returns {{x: number, y: number}}
 */
function pointForHoverValue(state, rows, key, ratio, x, yFactory) {
  if (!Number.isFinite(ratio) || rows.length < 2) {
    const index = findNearestRowIndexByRatio(state, ratio || 0);
    return { x: xForIndex(state, index), y: yFactory(state, rows[index][key]) };
  }

  const targetTime = timeForRatio(state, ratio);
  const bounds = findRowsAroundTime(state, targetTime);
  const left = rows[bounds.leftIndex];
  const right = rows[bounds.rightIndex];
  const leftTime = state.rowTimes[bounds.leftIndex];
  const rightTime = state.rowTimes[bounds.rightIndex];
  const segmentRatio = rightTime === leftTime ? 0 : (targetTime - leftTime) / (rightTime - leftTime);
  const value = interpolateNumber(left[key], right[key], clamp(segmentRatio, 0, 1));

  return { x, y: yFactory(state, value) };
}

/**
 * Draw one square hover marker with enough contrast over any line color.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {{x: number, y: number}} point
 * @param {string} color
 */
function drawHoverMarker(context, point, color) {
  const size = 10;

  context.fillStyle = "#fffefa";
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(point.x - size / 2, point.y - size / 2, size, size, 3);
  } else {
    context.rect(point.x - size / 2, point.y - size / 2, size, size);
  }
  context.fill();
  context.stroke();
}

/**
 * Draw multiple X-axis date ticks.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 */
function drawDateAxis(context, state) {
  context.fillStyle = state.theme.text;
  context.font = "17px system-ui";
  const axisY = state.height - state.padding.bottom + 34;

  for (const tick of state.xTicks) {
    context.textAlign = tick.align;
    context.fillText(tick.label, xForIndex(state, tick.index), axisY);
  }

  context.textAlign = "left";
}

/**
 * Convert one row to coordinates on the active hover series.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {{x: number, y: number}}
 */
function pointForActiveSeries(state, row, index) {
  if (state.activeSeries === "investment") {
    return pointForInvestment(state, row, index);
  }

  return pointForPrice(state, row, index);
}

/**
 * Convert one row to FPT price-line coordinates.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {{x: number, y: number}}
 */
function pointForPrice(state, row, index) {
  return {
    x: xForRow(state, row, index),
    y: yForPrice(state, row.close),
  };
}

/**
 * Convert one row to comparison price-line coordinates.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {{x: number, y: number}}
 */
function pointForComparePrice(state, row, index, series) {
  return {
    x: xForRow(state, row, index),
    y: yForPrice(state, row[series.priceKey]),
  };
}

/**
 * Convert one row to investment-value line coordinates.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {{x: number, y: number}}
 */
function pointForInvestment(state, row, index) {
  return {
    x: xForRow(state, row, index),
    y: yForInvestment(state, row.investmentValue),
  };
}

/**
 * Convert one row to comparison investment-value coordinates.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {{x: number, y: number}}
 */
function pointForCompareInvestment(state, row, index, series) {
  return {
    x: xForRow(state, row, index),
    y: yForInvestment(state, row[series.investmentKey]),
  };
}

/**
 * Convert a row into an X coordinate, including temporary animation rows.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {number}
 */
function xForRow(state, row, index) {
  return xForTime(state, timeForRow(state, row, index));
}

/**
 * Read a row timestamp from chart state or an interpolated animation row.
 *
 * @param {object} state
 * @param {object} row
 * @param {number} index
 * @returns {number}
 */
function timeForRow(state, row, index) {
  return Number.isFinite(row?.__time) ? row.__time : state.rowTimes[index] ?? state.startTime;
}

/**
 * Convert a row index into an X coordinate.
 *
 * @param {object} state
 * @param {number} index
 * @returns {number}
 */
function xForIndex(state, index) {
  return xForTime(state, state.rowTimes[index] ?? state.startTime);
}

/**
 * Convert a local date timestamp into an X coordinate.
 *
 * @param {object} state
 * @param {number} time
 * @returns {number}
 */
function xForTime(state, time) {
  const duration = Math.max(state.endTime - state.startTime, 1);
  return state.padding.left + (plotWidth(state) * (time - state.startTime)) / duration;
}

/**
 * Convert a hover ratio into a timestamp on the chart timeline.
 *
 * @param {object} state
 * @param {number} ratio
 * @returns {number}
 */
function timeForRatio(state, ratio) {
  return state.startTime + (state.endTime - state.startTime) * clamp(ratio, 0, 1);
}

/**
 * Find the closest real data row to a pointer ratio.
 *
 * @param {object} state
 * @param {number} ratio
 * @returns {number}
 */
function findNearestRowIndexByRatio(state, ratio) {
  const targetTime = timeForRatio(state, ratio);
  const bounds = findRowsAroundTime(state, targetTime);
  const leftDistance = Math.abs(targetTime - state.rowTimes[bounds.leftIndex]);
  const rightDistance = Math.abs(state.rowTimes[bounds.rightIndex] - targetTime);

  return leftDistance <= rightDistance ? bounds.leftIndex : bounds.rightIndex;
}

/**
 * Find row indexes around a timestamp.
 *
 * @param {object} state
 * @param {number} targetTime
 * @returns {{leftIndex: number, rightIndex: number}}
 */
function findRowsAroundTime(state, targetTime) {
  if (targetTime <= state.rowTimes[0]) {
    return { leftIndex: 0, rightIndex: 0 };
  }

  const lastIndex = state.rowTimes.length - 1;
  if (targetTime >= state.rowTimes[lastIndex]) {
    return { leftIndex: lastIndex, rightIndex: lastIndex };
  }

  let low = 0;
  let high = lastIndex;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const time = state.rowTimes[middle];

    if (time === targetTime) {
      return { leftIndex: middle, rightIndex: middle };
    }

    if (time < targetTime) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return { leftIndex: Math.max(0, high), rightIndex: Math.min(lastIndex, low) };
}

/**
 * Interpolate between two numeric values.
 *
 * @param {number} left
 * @param {number} right
 * @param {number} ratio
 * @returns {number}
 */
function interpolateNumber(left, right, ratio) {
  return Number(left) + (Number(right) - Number(left)) * ratio;
}

/**
 * Create a temporary row for smooth reveal animation between two real dates.
 *
 * @param {object} left
 * @param {object} right
 * @param {number} ratio
 * @param {number} time
 * @returns {object}
 */
function interpolateRow(left, right, ratio, time) {
  const row = { ...left, __time: time };

  for (const [key, value] of Object.entries(right)) {
    if (typeof value === "number" && typeof left[key] === "number") {
      row[key] = interpolateNumber(left[key], value, ratio);
    }
  }

  return row;
}

/**
 * Convert FPT price to left-axis Y coordinate.
 *
 * @param {object} state
 * @param {number} value
 * @returns {number}
 */
function yForPrice(state, value) {
  return yForRange(state, value, state.priceMin, state.priceMax);
}

/**
 * Convert investment value to right-axis Y coordinate.
 *
 * @param {object} state
 * @param {number} value
 * @returns {number}
 */
function yForInvestment(state, value) {
  return yForRange(state, value, state.investmentMin, state.investmentMax);
}

/**
 * Convert a value from any axis range into a Y coordinate.
 *
 * @param {object} state
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function yForRange(state, value, min, max) {
  const chartHeight = state.height - state.padding.top - state.padding.bottom;
  const range = max - min || 1;
  return state.padding.top + chartHeight - ((value - min) / range) * chartHeight;
}

/**
 * Draw a straight line segment.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 */
function drawLine(context, fromX, fromY, toX, toY) {
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
}

/**
 * Create human-friendly ticks for one row value field.
 *
 * @param {Array<object>} rows
 * @param {string} key
 * @returns {number[]}
 */
function createNiceTicksForRows(rows, keys) {
  const fieldNames = Array.isArray(keys) ? keys : [keys];
  const values = rows.flatMap((row) => fieldNames.map((key) => Number(row[key]))).filter(Number.isFinite);
  return createNiceTicks(Math.min(...values), Math.max(...values), 6);
}

/**
 * Create human-friendly value ticks.
 *
 * @param {number} min
 * @param {number} max
 * @param {number} count
 * @returns {number[]}
 */
function createNiceTicks(min, max, count) {
  const rawStep = (max - min) / Math.max(count - 1, 1);
  const step = niceStep(rawStep);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];

  for (let value = start; value <= end; value += step) {
    ticks.push(value);
  }

  return ticks;
}

/**
 * Round a raw tick step to 1, 2, 5, or 10 times its decimal base.
 *
 * @param {number} value
 * @returns {number}
 */
function niceStep(value) {
  const exponent = Math.floor(Math.log10(value || 1));
  const base = 10 ** exponent;
  const fraction = value / base;

  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

/**
 * Create date-axis ticks and keep the final label readable.
 *
 * @param {Array<object>} rows
 * @param {number} count
 * @returns {Array<object>}
 */
function createDateTicks(rows, count) {
  const ticks = [];
  const step = Math.max(Math.floor((rows.length - 1) / Math.max(count - 1, 1)), 1);

  for (let index = 0; index < rows.length; index += step) {
    ticks.push(createDateTick(rows, index));
  }

  if (ticks.at(-1)?.index !== rows.length - 1) {
    const lastGap = rows.length - 1 - ticks.at(-1).index;
    if (lastGap < step * 0.65) {
      ticks.pop();
    }

    ticks.push(createDateTick(rows, rows.length - 1));
  }

  return ticks;
}

/**
 * Pick fewer date labels on narrow canvases to prevent overlap.
 *
 * @param {number} width
 * @returns {number}
 */
function dateTickCountForWidth(width) {
  if (width < 640) return 3;
  if (width < 980) return 4;
  return 6;
}

/**
 * Create one date-axis tick with edge-aware text alignment.
 *
 * @param {Array<object>} rows
 * @param {number} index
 * @returns {object}
 */
function createDateTick(rows, index) {
  let align = "center";

  if (index === 0) {
    align = "left";
  }

  if (index === rows.length - 1) {
    align = "right";
  }

  return { index, align, label: formatDate(rows[index].date) };
}

/**
 * Create axis padding that can fit left price and right investment labels.
 *
 * @param {number[]} priceTicks
 * @param {number[]} investmentTicks
 * @param {object} latestRow
 * @param {object} visibility
 * @returns {object}
 */
function createResponsivePadding(priceTicks, investmentTicks, latestRow, visibility, compareSeries = [], symbol = "Mã") {
  const leftLength = visibility.showPrice ? maxFormattedLength(priceTicks, formatVnd) : 0;
  const latestPriceLabels = visibility.showPrice
    ? [
        `(${symbol}) giá ${formatVnd(latestRow.close)}`,
        ...compareSeries
          .filter((series) => series.showPrice !== false)
          .map((series) => `(${series.symbol}) giá ${formatVnd(latestRow[series.priceKey])}`),
      ]
    : [];
  const latestPriceLength = maxFormattedLength(latestPriceLabels, String);
  const rightAxisLength = visibility.showInvestment ? maxFormattedLength(investmentTicks, formatCompactVnd) : 0;
  const latestInvestmentLabels = visibility.showInvestment
    ? [
        `(${symbol}) đầu tư ${formatCompactVnd(latestRow.investmentValue)}`,
        ...compareSeries
          .filter((series) => series.showInvestment !== false)
          .map((series) => `(${series.symbol}) đầu tư ${formatCompactVnd(latestRow[series.investmentKey])}`),
      ]
    : [];
  const latestInvestmentLength = maxFormattedLength(latestInvestmentLabels, String);
  const legendCount =
    (visibility.showPrice ? 1 : 0) +
    (visibility.showInvestment ? 1 : 0) +
    compareSeries.filter((series) => visibility.showPrice && series.showPrice !== false).length +
    compareSeries.filter((series) => visibility.showInvestment && series.showInvestment !== false).length;
  const legendRows = legendCount > 1 ? Math.ceil(legendCount / 4) : 0;

  return {
    ...CHART_PADDING,
    left: Math.max(CHART_PADDING.left, leftLength * 10 + 20),
    right: Math.max(CHART_PADDING.right, Math.max(latestPriceLength * 8, rightAxisLength * 12, latestInvestmentLength * 8) + 28),
    bottom: Math.max(CHART_PADDING.bottom, 72 + legendRows * 20),
  };
}

/**
 * Find the longest formatted label length.
 *
 * @param {number[]} values
 * @param {Function} formatter
 * @returns {number}
 */
function maxFormattedLength(values, formatter) {
  return values.reduce((longest, value) => Math.max(longest, formatter(value).length), 0);
}

/**
 * Return drawable plot width after axis and label padding.
 *
 * @param {object} state
 * @returns {number}
 */
function plotWidth(state) {
  return state.width - state.padding.left - state.padding.right;
}

/**
 * Format VND values with Vietnamese thousands separators.
 *
 * @param {number} value
 * @returns {string}
 */
function formatVnd(value) {
  return Math.round(value).toLocaleString("vi-VN");
}

/**
 * Format large VND values compactly for chart labels.
 *
 * @param {number} value
 * @returns {string}
 */
function formatCompactVnd(value) {
  if (Math.abs(value) >= 1000000000) {
    return `${formatDecimal(value / 1000000000)} tỷ`;
  }

  if (Math.abs(value) >= 1000000) {
    return `${formatDecimal(value / 1000000)}tr`;
  }

  return formatVnd(value);
}

/**
 * Format compact decimal values without noisy trailing zeroes.
 *
 * @param {number} value
 * @returns {string}
 */
function formatDecimal(value) {
  return value.toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
}

/**
 * Format an ISO date as dd/mm/yyyy for chart axis labels.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Convert an ISO date into a local midnight timestamp.
 *
 * @param {string} value
 * @returns {number}
 */
function dateToTime(value) {
  return new Date(`${value}T00:00:00`).getTime();
}

/**
 * Convert a hex color to rgba.
 *
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function transparentize(hex, alpha) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Clamp a number into a drawing range.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
