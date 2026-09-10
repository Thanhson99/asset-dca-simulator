export const DEFAULT_CHART_THEME = {
  text: "#000000",
  muted: "#77807c",
  grid: "#e9efeb",
  price: "#459ef2",
  investment: "#e042ff",
  high: "#f13b3b",
  low: "#f13b3b",
  latest: "#f13b3b",
  background: "#fffefa",
  lineGlow: false,
  fillTop: "rgba(69, 158, 242, 0.14)",
  fillBottom: "rgba(69, 158, 242, 0)",
  investmentFillTop: "rgba(224, 66, 255, 0.12)",
  investmentFillBottom: "rgba(224, 66, 255, 0)",
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

    const progress = Math.min((now - startedAt) / (options.durationSeconds * 1000), 1);
    const visibleCount = Math.max(2, Math.ceil(rows.length * progress));

    drawChart(context, state, rows.slice(0, visibleCount));

    if (progress < 1) {
      frameId = requestAnimationFrame(drawFrame);
    }
  }

  drawChart(context, state, rows.slice(0, 2));
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

  drawChart(context, createChartState(canvas, rows, { ...options, theme }), rows, options.hoverIndex);
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
 * @returns {{index: number, row: object, x: number, y: number}|null}
 */
export function getNearestChartPoint(canvas, rows, clientX, options = {}) {
  if (rows.length === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const state = createChartState(canvas, rows, options);
  const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
  const plotX = clamp(canvasX, state.padding.left, state.width - state.padding.right);
  const ratio = (plotX - state.padding.left) / plotWidth(state);
  const index = Math.round(ratio * (rows.length - 1));
  const point = pointForActiveSeries(state, rows[index], index);

  return {
    index,
    row: rows[index],
    x: (point.x / canvas.width) * rect.width,
    y: (point.y / canvas.height) * rect.height,
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
  const showPrice = requestedPrice || !requestedInvestment;
  const showInvestment = requestedInvestment;
  const priceTicks = createNiceTicksForRows(rows, "close");
  const investmentTicks = createNiceTicksForRows(rows, "investmentValue");
  const padding = createResponsivePadding(priceTicks, investmentTicks, rows.at(-1), { showPrice, showInvestment });

  return {
    width: canvas.width,
    height: canvas.height,
    padding,
    theme,
    showPrice,
    showInvestment,
    activeSeries: showPrice ? "price" : "investment",
    priceTicks,
    investmentTicks,
    xTicks: createDateTicks(rows, dateTickCountForWidth(canvas.width)),
    extrema: findGlobalPriceExtrema(rows),
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
 * @param {number|null} hoverIndex
 */
function drawChart(context, state, visibleRows, hoverIndex = null) {
  clearCanvas(context, state);
  drawGrid(context, state);
  drawPriceArea(context, state, visibleRows);
  drawInvestmentArea(context, state, visibleRows);
  drawInvestmentLine(context, state, visibleRows);
  drawPriceLine(context, state, visibleRows);
  drawPriceExtremaMarkers(context, state, visibleRows.length);
  drawLatestLabels(context, state, visibleRows.at(-1), visibleRows.length - 1);
  drawCrosshair(context, state, visibleRows, hoverIndex);
  drawDateAxis(context, state);
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
 * Draw global high/low markers for FPT price only.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {number} visibleCount
 */
function drawPriceExtremaMarkers(context, state, visibleCount) {
  if (!state.showPrice) {
    return;
  }

  for (const marker of state.extrema) {
    if (marker.index < visibleCount) {
      drawPriceMarker(context, state, marker);
    }
  }
}

/**
 * Find the selected range's highest and lowest FPT close price.
 *
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
function findGlobalPriceExtrema(rows) {
  let high = { row: rows[0], index: 0 };
  let low = { row: rows[0], index: 0 };

  rows.forEach((row, index) => {
    if (row.close > high.row.close) {
      high = { row, index };
    }

    if (row.close < low.row.close) {
      low = { row, index };
    }
  });

  if (high.index === low.index) {
    return [createPriceMarker(high, "high")];
  }

  return [createPriceMarker(high, "high"), createPriceMarker(low, "low")].sort((left, right) => left.index - right.index);
}

/**
 * Create drawing metadata for one FPT price marker.
 *
 * @param {{row: object, index: number}} point
 * @param {"high"|"low"} type
 * @returns {object}
 */
function createPriceMarker(point, type) {
  const isHigh = type === "high";

  return {
    row: point.row,
    index: point.index,
    type,
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
  const pricePoint = state.showPrice ? pointForPrice(state, row, index) : null;
  const investmentPoint = state.showInvestment ? pointForInvestment(state, row, index) : null;
  const labelsAreClose = pricePoint && investmentPoint && Math.abs(pricePoint.y - investmentPoint.y) < 34;

  if (pricePoint) {
    drawLatestPoint(context, pricePoint, `${formatVnd(row.close)} VNĐ`, state.theme.price, {
      labelOffsetY: labelsAreClose ? -18 : 7,
    });
  }

  if (investmentPoint) {
    drawLatestPoint(context, investmentPoint, `${formatCompactVnd(row.investmentValue)} VNĐ`, state.theme.investment, {
      labelOffsetY: labelsAreClose ? 24 : 7,
    });
  }
}

/**
 * Draw a latest point and label for one series.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {{x: number, y: number}} point
 * @param {string} label
 * @param {string} color
 * @param {object} options
 */
function drawLatestPoint(context, point, label, color, options = {}) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 7, 0, Math.PI * 2);
  context.fill();

  context.font = "700 20px system-ui";
  context.textAlign = "left";
  const labelY = clamp(point.y + (options.labelOffsetY ?? 7), 24, context.canvas.height - 24);
  context.fillText(label, point.x + 12, labelY);
}

/**
 * Draw one high/low marker on the FPT price line.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {object} marker
 */
function drawPriceMarker(context, state, marker) {
  const point = pointForPrice(state, marker.row, marker.index);
  const color = marker.type === "high" ? state.theme.high : state.theme.low;

  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fill();

  context.font = "700 15px system-ui";
  context.textAlign = "left";
  context.fillText(`${marker.label} ${formatVnd(marker.row.close)} VNĐ`, point.x + 8, point.y + marker.labelOffsetY);
}

/**
 * Draw pointer-following X/Y guide lines.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} state
 * @param {Array<object>} rows
 * @param {number|null} hoverIndex
 */
function drawCrosshair(context, state, rows, hoverIndex) {
  if (hoverIndex === null || hoverIndex >= rows.length) {
    return;
  }

  const row = rows[hoverIndex];
  const point = pointForActiveSeries(state, row, hoverIndex);
  const plotBottom = state.height - state.padding.bottom;
  const plotRight = state.width - state.padding.right;
  const color = state.activeSeries === "price" ? state.theme.price : state.theme.investment;

  context.save();
  context.strokeStyle = "rgba(0, 143, 107, 0.28)";
  context.lineWidth = 1;
  context.setLineDash([5, 5]);
  drawLine(context, point.x, state.padding.top, point.x, plotBottom);
  drawLine(context, state.padding.left, point.y, plotRight, point.y);
  context.setLineDash([]);
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fill();
  context.restore();
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

  for (const tick of state.xTicks) {
    context.textAlign = tick.align;
    context.fillText(tick.label, xForIndex(state, tick.index), state.height - 26);
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
    x: xForIndex(state, index),
    y: yForPrice(state, row.close),
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
    x: xForIndex(state, index),
    y: yForInvestment(state, row.investmentValue),
  };
}

/**
 * Convert a row index into an X coordinate.
 *
 * @param {object} state
 * @param {number} index
 * @returns {number}
 */
function xForIndex(state, index) {
  const divisor = Math.max(state.totalRows - 1, 1);
  return state.padding.left + (plotWidth(state) * index) / divisor;
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
function createNiceTicksForRows(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
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
function createResponsivePadding(priceTicks, investmentTicks, latestRow, visibility) {
  const leftLength = visibility.showPrice ? maxFormattedLength(priceTicks, formatVnd) : 0;
  const latestPriceLength = visibility.showPrice ? `${formatVnd(latestRow.close)} VNĐ`.length : 0;
  const rightAxisLength = visibility.showInvestment ? maxFormattedLength(investmentTicks, formatCompactVnd) : 0;
  const latestInvestmentLength = visibility.showInvestment ? `${formatCompactVnd(latestRow.investmentValue)} VNĐ`.length : 0;

  return {
    ...CHART_PADDING,
    left: Math.max(CHART_PADDING.left, leftLength * 10 + 20),
    right: Math.max(CHART_PADDING.right, Math.max(latestPriceLength * 12, rightAxisLength * 12, latestInvestmentLength * 12) + 28),
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
