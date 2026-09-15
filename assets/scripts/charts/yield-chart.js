import { formatDisplayDate as formatDate } from "../shared/dates.js";
import { clamp } from "../shared/number-format.js";

const PADDING = { top: 28, right: 34, bottom: 56, left: 82 };
const THEME = {
  text: "#242927",
  muted: "#77807c",
  grid: "#e3ebe5",
  total: "#176b4d",
  contributed: "#459ef2",
  background: "#fffefa",
};

/**
 * Draw a static yield chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 */
export function drawYieldChart(canvas, rows) {
  const context = canvas.getContext("2d");
  resizeCanvas(canvas);

  if (rows.length === 0) {
    drawEmpty(context, canvas);
    return;
  }

  const state = createState(canvas, rows);
  clear(context, state);
  drawGrid(context, state);
  drawLine(context, state, rows, "totalValue", THEME.total);
  drawLine(context, state, rows, "contributedValue", THEME.contributed);
  drawLatestLabels(context, state, rows.at(-1));
  drawXAxis(context, state, rows);
  drawLegend(context, state);
}

/**
 * Get the nearest chart row for tooltip use.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} rows
 * @param {number} clientX
 * @returns {object|null}
 */
export function getNearestYieldPoint(canvas, rows, clientX) {
  if (rows.length === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const ratio = clamp((x - PADDING.left) / plotWidth(canvas), 0, 1);
  const index = Math.round(ratio * (rows.length - 1));
  const state = createState(canvas, rows);

  return {
    index,
    row: rows[index],
    x: (xForIndex(state, index) / canvas.width) * rect.width,
    y: (yForValue(state, rows[index].totalValue) / canvas.height) * rect.height,
  };
}

function resizeCanvas(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width), 320);
  const height = Math.max(Math.round(width * 0.36), 320);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function createState(canvas, rows) {
  const maxValue = Math.max(...rows.flatMap((row) => [row.totalValue, row.contributedValue]));
  const ticks = niceTicks(0, maxValue, 5);

  return {
    width: canvas.width,
    height: canvas.height,
    minValue: ticks[0],
    maxValue: ticks.at(-1),
    ticks,
    totalRows: rows.length,
  };
}

function drawEmpty(context, canvas) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = THEME.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = THEME.muted;
  context.font = "600 18px system-ui";
  context.textAlign = "center";
  context.fillText("Chọn sản phẩm lãi suất để xem mô phỏng", canvas.width / 2, canvas.height / 2);
}

function clear(context, state) {
  context.clearRect(0, 0, state.width, state.height);
  context.fillStyle = THEME.background;
  context.fillRect(0, 0, state.width, state.height);
}

function drawGrid(context, state) {
  context.save();
  context.strokeStyle = THEME.grid;
  context.fillStyle = THEME.muted;
  context.font = "600 12px system-ui";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (const tick of state.ticks) {
    const y = yForValue(state, tick);
    context.beginPath();
    context.moveTo(PADDING.left, y);
    context.lineTo(state.width - PADDING.right, y);
    context.stroke();
    context.fillText(formatCompactMoney(tick), PADDING.left - 10, y);
  }

  context.restore();
}

function drawLine(context, state, rows, key, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  rows.forEach((row, index) => {
    const x = xForIndex(state, index, rows.length);
    const y = yForValue(state, row[key]);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  context.stroke();
  context.restore();
}

function drawLatestLabels(context, state, latest) {
  context.save();
  context.font = "700 12px system-ui";
  context.textAlign = "right";
  context.textBaseline = "middle";
  drawLabel(context, state, latest.totalValue, "Tổng", THEME.total);
  drawLabel(context, state, latest.contributedValue, "Góp", THEME.contributed);
  context.restore();
}

function drawLabel(context, state, value, label, color) {
  const text = `${label} ${formatCompactMoney(value)}`;
  const x = state.width - PADDING.right;
  const y = yForValue(state, value);
  const width = context.measureText(text).width + 14;

  context.fillStyle = "rgba(255, 254, 250, 0.92)";
  context.fillRect(x - width, y - 13, width, 26);
  context.fillStyle = color;
  context.fillText(text, x - 7, y);
}

function drawXAxis(context, state, rows) {
  const ticks = createDateTicks(rows);
  context.save();
  context.fillStyle = THEME.muted;
  context.font = "600 12px system-ui";
  context.textAlign = "center";
  context.textBaseline = "top";

  for (const tick of ticks) {
    const index = rows.findIndex((row) => row.date === tick);
    context.fillText(formatDate(tick), xForIndex(state, index, rows.length), state.height - PADDING.bottom + 18);
  }

  context.restore();
}

function drawLegend(context, state) {
  context.save();
  context.font = "700 12px system-ui";
  context.textBaseline = "middle";
  const items = [
    ["Tổng giá trị", THEME.total],
    ["Đã góp", THEME.contributed],
  ];
  let x = PADDING.left;
  const y = state.height - 18;

  for (const [label, color] of items) {
    context.fillStyle = color;
    context.fillRect(x, y - 4, 16, 3);
    context.fillStyle = THEME.text;
    context.fillText(label, x + 22, y);
    x += context.measureText(label).width + 54;
  }

  context.restore();
}

function createDateTicks(rows) {
  if (rows.length <= 3) {
    return rows.map((row) => row.date);
  }

  return [rows[0].date, rows[Math.floor(rows.length / 2)].date, rows.at(-1).date];
}

function xForIndex(state, index, totalRows = state.totalRows || 2) {
  const denominator = Math.max(totalRows - 1, 1);
  return PADDING.left + (index / denominator) * (state.width - PADDING.left - PADDING.right);
}

function yForValue(state, value) {
  const range = Math.max(state.maxValue - state.minValue, 1);
  const ratio = (value - state.minValue) / range;
  return state.height - PADDING.bottom - ratio * (state.height - PADDING.top - PADDING.bottom);
}

function plotWidth(canvas) {
  return canvas.width - PADDING.left - PADDING.right;
}

function niceTicks(min, max, count) {
  const safeMax = Math.max(max, 1);
  const rawStep = (safeMax - min) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const end = Math.ceil(safeMax / step) * step;
  const ticks = [];

  for (let value = 0; value <= end; value += step) {
    ticks.push(value);
  }

  return ticks;
}

function formatCompactMoney(value) {
  const rounded = Math.round(value);
  if (rounded >= 1000000000) {
    return `${(rounded / 1000000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (rounded >= 1000000) {
    return `${(rounded / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  return rounded.toLocaleString("vi-VN");
}
