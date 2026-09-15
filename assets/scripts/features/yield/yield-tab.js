import { drawYieldChart, getNearestYieldPoint } from "../../charts/yield-chart.js";
import { loadRateHistory, loadRateProducts } from "../../data/yield-loader.js";
import { simulateFlexibleDailyYield, simulateTermDeposit } from "../../simulation/yield.js";
import { formatDisplayDate as formatDate, nextIsoDate, toIsoDate } from "../../shared/dates.js";
import { escapeHtml } from "../../shared/html.js";
import { formatFullMoney as formatMoney, formatVndInputText, parseVndInput } from "../../shared/number-format.js";
import { enhanceDateInput, readDateInput, setDateInput } from "../../ui/date-picker.js";
import { compareBankRatePreference } from "./rate-preference.js";

/**
 * Initialize the bank/MoMo yield simulator tab.
 */
export async function initYieldTab() {
  const elements = getElements();
  const state = {
    products: [],
    rows: [],
    filters: null,
    history: null,
  };

  hydrateDefaults(elements);
  enhanceDateInput(elements.from);
  enhanceDateInput(elements.to);
  bindMoneyFormatting(elements);
  bindTooltip(elements, state);
  new ResizeObserver(() => drawYieldChart(elements.canvas, state.rows)).observe(elements.canvas.parentElement);
  document.addEventListener("app-tab:change", (event) => {
    if (event.detail?.target === "yield") {
      requestAnimationFrame(() => drawYieldChart(elements.canvas, state.rows));
    }
  });

  state.products = await loadRateProducts();
  populateProductControls(elements, state.products);
  await syncDefaultDateRange(elements, state.products);
  updateRatePreview(elements, state.products);
  elements.product.addEventListener("change", async () => {
    populateProductControls(elements, state.products);
    await syncDefaultDateRange(elements, state.products);
    updateRatePreview(elements, state.products);
    renderEmpty(elements);
  });
  elements.provider.addEventListener("change", async () => {
    syncProductFields(elements, selectedProduct(elements, state.products));
    await syncDefaultDateRange(elements, state.products);
    updateRatePreview(elements, state.products);
    renderEmpty(elements);
  });
  elements.term.addEventListener("change", async () => {
    await syncDefaultDateRange(elements, state.products);
    updateRatePreview(elements, state.products);
  });
  elements.manualRate.addEventListener("input", () => updateRatePreview(elements, state.products));
  elements.play.addEventListener("click", () => renderYieldSimulation(elements, state));

  renderEmpty(elements);
}

function getElements() {
  return {
    product: document.getElementById("yield-product-input"),
    provider: document.getElementById("yield-provider-input"),
    termField: document.getElementById("yield-term-field"),
    term: document.getElementById("yield-term-input"),
    from: document.getElementById("yield-from-input"),
    to: document.getElementById("yield-to-input"),
    initial: document.getElementById("yield-initial-input"),
    monthly: document.getElementById("yield-monthly-input"),
    compounding: document.getElementById("yield-compounding-input"),
    tax: document.getElementById("yield-tax-input"),
    taxControl: document.getElementById("yield-tax-input").closest("label"),
    manualRate: document.getElementById("yield-manual-rate-input"),
    ratePreview: document.getElementById("yield-rate-preview"),
    play: document.getElementById("yield-play-button"),
    error: document.getElementById("yield-control-error"),
    dataPanel: document.getElementById("yield-data-panel"),
    summary: document.getElementById("yield-summary"),
    title: document.getElementById("yield-chart-title"),
    status: document.getElementById("yield-chart-status"),
    canvas: document.getElementById("yield-chart"),
    tooltip: document.getElementById("yield-chart-tooltip"),
  };
}

function hydrateDefaults(elements) {
  const today = toIsoDate(new Date());
  const lastYear = new Date(`${today}T00:00:00`);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  elements.from.value = toIsoDate(lastYear);
  elements.to.value = today;
}

async function syncDefaultDateRange(elements, products) {
  const product = selectedProduct(elements, products);
  if (!product) {
    setDateLimits(elements, null);
    return;
  }

  try {
    const history = await loadRateHistory(product.id);
    const limits = coveredDateLimits(history, product, Number(elements.term.value));
    setDateLimits(elements, limits);
    if (!limits) {
      return;
    }

    const fromDate = readDateInput(elements.from);
    const toDate = readDateInput(elements.to);
    if (fromDate && toDate && isDateRangeCovered(history, product, Number(elements.term.value), fromDate, toDate)) {
      return;
    }

    const range = clampDateRangeToLimits({ fromDate, toDate }, limits);
    if (!range) {
      return;
    }

    setDateInput(elements.from, range.fromDate);
    setDateInput(elements.to, range.toDate);
  } catch {
    // Keep the user's current dates if the history cannot be loaded.
  }
}

function setDateLimits(elements, limits) {
  for (const input of [elements.from, elements.to]) {
    if (!limits) {
      delete input.dataset.minDate;
      delete input.dataset.maxDate;
      continue;
    }

    input.dataset.minDate = limits.fromDate;
    input.dataset.maxDate = limits.toDate;
  }
}

function coveredDateLimits(history, product, termMonths) {
  const today = toIsoDate(new Date());
  const events = coverageEvents(history, product, termMonths);
  if (events.length === 0) {
    return null;
  }

  const first = events[0].from;
  const last = events.at(-1);
  const lastTo = last.to && last.to < today ? last.to : today;
  return {
    fromDate: first,
    toDate: lastTo,
  };
}

function clampDateRangeToLimits(range, limits) {
  if (!limits) {
    return null;
  }

  const rawFrom = range.fromDate || limits.fromDate;
  const rawTo = range.toDate || limits.toDate;
  let fromDate = clampIsoDate(rawFrom, limits.fromDate, limits.toDate);
  let toDate = clampIsoDate(rawTo, limits.fromDate, limits.toDate);

  if (fromDate > toDate) {
    const date = rawFrom < limits.fromDate || rawTo < limits.fromDate ? limits.fromDate : limits.toDate;
    fromDate = date;
    toDate = date;
  }

  return {
    fromDate,
    toDate,
  };
}

function clampIsoDate(value, minDate, maxDate) {
  if (value < minDate) {
    return minDate;
  }
  if (value > maxDate) {
    return maxDate;
  }
  return value;
}

function populateProductControls(elements, products) {
  const type = elements.product.value;
  const filtered = products.filter((product) => product.type === type);

  elements.provider.innerHTML = filtered.map((product) => createOption(product.id, `${product.provider} - ${product.name}`)).join("");
  syncProductFields(elements, selectedProduct(elements, products));
}

function syncProductFields(elements, product) {
  const terms = product?.terms || [];
  const bankProduct = product?.type === "bank_saving";

  elements.termField.hidden = !bankProduct;
  elements.taxControl.hidden = !bankProduct;
  elements.manualRate.placeholder = bankProduct ? "Bỏ trống: dùng data theo kỳ hạn" : "Bỏ trống: dùng data MoMo";
  elements.compounding.innerHTML = bankProduct
    ? [createOption("compound", "Tái tục gốc+lãi"), createOption("simple", "Tái tục gốc, rút lãi")].join("")
    : [createOption("compound", "Cộng lãi hằng ngày"), createOption("simple", "Nhận lãi, không nhập gốc")].join("");
  elements.term.innerHTML = terms.map((term) => createOption(String(term), `${term} tháng`)).join("");
  if (terms.includes(12)) {
    elements.term.value = "12";
  }
}

async function updateRatePreview(elements, products) {
  const product = selectedProduct(elements, products);

  if (!product) {
    renderRatePreviewCards(elements, [
      createRateCard("Lãi suất data", "Chưa chọn", ""),
      createRateCard("Cao nhất cùng kỳ hạn", "-", ""),
      createRateCard("Chênh lệch", "-", ""),
    ]);
    return;
  }

  const manualRate = elements.manualRate.value.trim() ? Number(elements.manualRate.value) : null;

  try {
    const history = await loadRateHistory(product.id);
    const rateInfo = latestRateInfo(history, product, Number(elements.term.value));
    const baseText =
      product.type === "wallet_yield" ? `${formatRate(rateInfo.annualRate)}/năm, tính theo ngày` : `${formatRate(rateInfo.annualRate)}/năm`;

    if (product.type === "wallet_yield") {
      renderWalletRatePreview(elements, rateInfo, manualRate, baseText);
      return;
    }

    const effectiveRate = Number.isFinite(manualRate) && manualRate > 0 ? manualRate : rateInfo.annualRate;
    const leaders = await highestBankRates(products, Number(elements.term.value));
    const leader = leaders[0];
    const diff = leader ? leader.annualRate - effectiveRate : 0;

    renderRatePreviewCards(elements, [
      createRateCard(
        "Lãi suất đang chọn",
        `${formatRate(effectiveRate)}/năm`,
        Number.isFinite(manualRate) && manualRate > 0
          ? `Đang dùng lãi suất tự nhập; dữ liệu hiện có là ${baseText}.`
          : rateInfo.needsReview
            ? `Mốc ${formatDate(rateInfo.effectiveFrom)}, độ tin cậy ${rateInfo.confidence || "chưa rõ"}.`
            : `Mốc ${formatDate(rateInfo.effectiveFrom)}, nguồn xác nhận.`,
        rateInfo.needsReview,
      ),
      createRateCard(
        "Cao nhất cùng kỳ hạn",
        leader ? `${leader.provider} ${formatRate(leader.annualRate)}/năm` : "-",
        leader ? `${elements.term.value} tháng, mốc ${formatDate(leader.effectiveFrom)}.` : "Chưa có dữ liệu so sánh.",
        leader?.needsReview,
      ),
      createRateCard(
        "Chênh lệch",
        leader ? `${diff >= 0 ? "+" : ""}${formatRate(diff)}` : "-",
        leader ? `So với ${product.provider} kỳ hạn ${elements.term.value} tháng.` : "",
        leader?.needsReview,
      ),
    ]);
  } catch (error) {
    renderRatePreviewCards(elements, [
      createRateCard("Lãi suất data", "Chưa đọc được", error.message, true),
      createRateCard("Cao nhất cùng kỳ hạn", "-", ""),
      createRateCard("Chênh lệch", "-", ""),
    ]);
  }
}

function renderWalletRatePreview(elements, rateInfo, manualRate, baseText) {
  const effectiveRate = Number.isFinite(manualRate) && manualRate > 0 ? manualRate : rateInfo.annualRate;
  const initialAmount = parseVndInput(elements.initial.value);
  const grossDailyInterest = Math.floor((initialAmount * effectiveRate) / 100 / 365);

  renderRatePreviewCards(elements, [
    createRateCard(
      "Lãi suất MoMo",
      `${formatRate(effectiveRate)}/năm`,
      Number.isFinite(manualRate) && manualRate > 0 ? `Đang dùng lãi suất tự nhập; dữ liệu hiện có là ${baseText}.` : "Tính lời mỗi ngày.",
      rateInfo.needsReview,
    ),
    createRateCard("Lãi/ngày ước tính", formatMoney(grossDailyInterest), "Tính trên số tiền ban đầu, trước thuế/phí."),
    createRateCard("Thanh khoản", "Rút linh hoạt", "MoMo/Finsight công bố rút không ảnh hưởng tỷ suất cố định."),
  ]);
}

async function highestBankRates(products, termMonths) {
  const bankProducts = products.filter((product) => product.type === "bank_saving");
  const rows = [];

  for (const product of bankProducts) {
    try {
      const history = await loadRateHistory(product.id);
      const info = latestRateInfo(history, product, termMonths);
      rows.push({
        provider: product.provider,
        annualRate: info.annualRate,
        needsReview: info.needsReview,
        effectiveFrom: info.effectiveFrom,
      });
    } catch {
      // Skip incomplete products so one bad source does not break the preview.
    }
  }

  return rows.sort((left, right) => right.annualRate - left.annualRate);
}

function renderRatePreviewCards(elements, cards) {
  elements.ratePreview.innerHTML = cards.map(createRateCardHtml).join("");
}

function createRateCard(label, value, detail, warning = false) {
  return { label, value, detail, warning };
}

function createRateCardHtml(card) {
  return `
    <div class="yield-rate-card ${card.warning ? "is-warning" : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </div>
  `;
}

function latestRateInfo(history, product, termMonths) {
  const snapshots = [...(history.snapshots || [])].sort((left, right) =>
    String(left.effectiveFrom || left.date).localeCompare(String(right.effectiveFrom || right.date)),
  );
  if (snapshots.length === 0) {
    throw new Error("Chưa có snapshot lãi suất.");
  }

  if (product.type === "bank_saving") {
    const candidates = snapshots.filter((snapshot) => snapshot.terms?.some((item) => Number(item.months) === termMonths));
    const latestDate = candidates.at(-1)?.effectiveFrom || candidates.at(-1)?.date;
    const latest = candidates
      .filter((snapshot) => (snapshot.effectiveFrom || snapshot.date) === latestDate)
      .sort(compareBankRatePreference)[0];
    const term = latest?.terms?.find((item) => Number(item.months) === termMonths);
    if (!term) {
      throw new Error(`Chưa có lãi suất kỳ hạn ${termMonths} tháng.`);
    }
    return {
      annualRate: Number(term.annualRate),
      needsReview: Boolean(latest.needsReview),
      source: latest.source || "unknown",
      effectiveFrom: latest.effectiveFrom || latest.date,
      confidence: latest.confidence || "",
      condition: latest.condition || "",
      channel: latest.channel || "",
    };
  }

  const latest = snapshots.at(-1);
  return {
    annualRate: Number(latest.annualRate),
    needsReview: Boolean(latest.needsReview),
    source: latest.source || "unknown",
    effectiveFrom: latest.effectiveFrom || latest.date,
  };
}

async function renderYieldSimulation(elements, state) {
  clearError(elements);

  try {
    const filters = readFilters(elements, state.products);
    const history = await loadRateHistory(filters.product.id);
    const normalizedFilters = normalizeYieldFilters(elements, filters, history);
    const result =
      normalizedFilters.product.type === "wallet_yield"
        ? simulateFlexibleDailyYield({ ...normalizedFilters, rateHistory: history })
        : simulateTermDeposit({ ...normalizedFilters, rateHistory: history });

    state.rows = result.rows;
    state.filters = normalizedFilters;
    state.history = history;
    renderMeta(elements, normalizedFilters, history, result.events);
    renderSummary(elements, result.rows, normalizedFilters);
    renderDataPanel(elements, history, result.events);
    drawYieldChart(elements.canvas, result.rows);
  } catch (error) {
    showError(elements, error);
  }
}

function readFilters(elements, products) {
  const product = selectedProduct(elements, products);
  const fromDate = readDateInput(elements.from);
  const toDate = readDateInput(elements.to);
  const initialAmount = parseVndInput(elements.initial.value);
  const monthlyAmount = parseVndInput(elements.monthly.value);
  const termMonths = Number(elements.term.value);
  const manualRate = elements.manualRate.value.trim() ? Number(elements.manualRate.value) : null;
  const errors = [];

  if (!product) {
    errors.push("chọn sản phẩm lãi suất");
  }
  if (!fromDate) {
    errors.push("nhập ngày bắt đầu hợp lệ");
  }
  if (!toDate) {
    errors.push("nhập ngày kết thúc hợp lệ");
  }
  if (fromDate && toDate && fromDate > toDate) {
    errors.push("ngày bắt đầu phải trước ngày kết thúc");
  }
  if (initialAmount <= 0 && monthlyAmount <= 0) {
    errors.push("nhập số tiền ban đầu hoặc góp thêm hằng tháng");
  }
  if (product?.type === "bank_saving" && !termMonths) {
    errors.push("chọn kỳ hạn ngân hàng");
  }
  if (manualRate !== null && (!Number.isFinite(manualRate) || manualRate <= 0 || manualRate > 20)) {
    errors.push("lãi suất tự nhập phải từ 0 đến 20%/năm");
  }

  if (errors.length > 0) {
    throw new Error(`Vui lòng ${errors.join(", ")}.`);
  }

  return {
    product,
    fromDate,
    toDate,
    initialAmount,
    monthlyAmount,
    termMonths,
    compoundingMode: elements.compounding.value,
    includeTax: product.type === "bank_saving" && elements.tax.checked,
    manualRate,
  };
}

function selectedProduct(elements, products) {
  return products.find((product) => product.id === elements.provider.value) || null;
}

function normalizeYieldFilters(elements, filters, history) {
  if (Number.isFinite(filters.manualRate)) {
    return filters;
  }

  if (isDateRangeCovered(history, filters.product, filters.termMonths, filters.fromDate, filters.toDate)) {
    return filters;
  }

  const range = clampDateRangeToLimits(
    { fromDate: filters.fromDate, toDate: filters.toDate },
    coveredDateLimits(history, filters.product, filters.termMonths),
  );
  if (!range) {
    return filters;
  }

  setDateInput(elements.from, range.fromDate);
  setDateInput(elements.to, range.toDate);
  return {
    ...filters,
    fromDate: range.fromDate,
    toDate: range.toDate,
  };
}

function isDateRangeCovered(history, product, termMonths, fromDate, toDate) {
  let cursor = fromDate;
  const events = coverageEvents(history, product, termMonths);

  for (const event of events) {
    if (event.to < cursor) {
      continue;
    }
    if (event.from > cursor) {
      return false;
    }
    if (event.to >= toDate) {
      return true;
    }
    cursor = nextIsoDate(event.to);
  }

  return false;
}

function coverageEvents(history, product, termMonths) {
  return [...(history.snapshots || [])]
    .filter((snapshot) => snapshot.effectiveFrom || snapshot.date)
    .filter((snapshot) => {
      if (product?.type !== "bank_saving") {
        return true;
      }
      return snapshot.terms?.some((term) => Number(term.months) === Number(termMonths));
    })
    .map((snapshot) => ({
      from: snapshot.effectiveFrom || snapshot.date,
      to: snapshot.effectiveTo || "9999-12-31",
    }))
    .sort((left, right) => left.from.localeCompare(right.from));
}

function renderMeta(elements, filters, history, events) {
  const latest = events.at(-1);
  elements.title.textContent = `${filters.product.name} (${formatRate(latest.annualRate)}/năm)`;
  elements.status.textContent = `${formatDate(filters.fromDate)} đến ${formatDate(filters.toDate)}`;
  elements.status.className = "source-label";

  if (events.some((event) => event.needsReview)) {
    elements.status.textContent = "Có mốc dữ liệu cần đối chiếu";
    elements.status.className = "source-label is-warning";
  }
}

function renderSummary(elements, rows, filters) {
  const latest = rows.at(-1);
  const profitClass = latest.interestValue >= 0 ? "is-profit" : "is-loss";
  const items = [
    createSummaryMetric("Sản phẩm", filters.product.provider),
    createSummaryMetric("Đã góp", formatMoney(latest.contributedValue)),
    createSummaryMetric("Tổng giá trị", formatMoney(latest.totalValue)),
    createSummaryMetric("Lãi tạm tính", formatMoney(latest.interestValue), profitClass),
    createSummaryMetric("Thuế/phí", formatMoney(latest.taxValue)),
    createSummaryMetric("Lãi suất năm", `${formatRate(latest.annualRate)}/năm`),
  ];

  elements.summary.hidden = false;
  elements.summary.innerHTML = `<div class="summary-row">${items.join("")}</div>`;
}

function renderDataPanel(elements, history, events) {
  const reviewCount = events.filter((event) => event.needsReview).length;
  const latest = events.at(-1);
  const rateTimeline = summarizeRateTimeline(events);
  const confidenceText = reviewCount > 0 ? `${reviewCount} mốc cần đối chiếu` : "Nguồn đã xác nhận";

  elements.dataPanel.innerHTML = `
    <div class="yield-data-card">
      <span>Nguồn</span>
      <strong>${escapeHtml(history.provider || history.productId || "unknown")}</strong>
      <small>${escapeHtml(sourceDetail(history, latest))}</small>
    </div>
    <div class="yield-data-card">
      <span>Lãi suất áp dụng</span>
      <strong>${escapeHtml(rateTimeline.primary)}</strong>
      <small>${escapeHtml(rateTimeline.detail)}</small>
    </div>
    <div class="yield-data-card ${reviewCount > 0 ? "is-warning" : ""}">
      <span>Độ tin cậy</span>
      <strong>${escapeHtml(confidenceText)}</strong>
      <small>${escapeHtml(reviewCount > 0 ? "Một số mốc lấy từ nguồn tổng hợp/lưu trữ." : "Không có cảnh báo trong khoảng đang tính.")}</small>
    </div>
  `;
}

function summarizeRateTimeline(events) {
  const ranges = compactRateRanges(events);
  const latest = ranges.at(-1);
  const previousCount = Math.max(ranges.length - 1, 0);

  if (!latest) {
    return { primary: "Chưa có dữ liệu", detail: "" };
  }

  return {
    primary: `${formatRate(latest.annualRate)}/năm`,
    detail: previousCount > 0 ? `${formatRange(latest)}; trước đó có ${previousCount} mốc lãi suất.` : formatRange(latest),
  };
}

function compactRateRanges(events) {
  const ranges = [];
  for (const event of events) {
    const last = ranges.at(-1);
    if (last && Number(last.annualRate) === Number(event.annualRate) && Boolean(last.needsReview) === Boolean(event.needsReview)) {
      last.effectiveTo = event.effectiveTo;
      continue;
    }
    ranges.push({ ...event });
  }
  return ranges;
}

function sourceDetail(history, latest) {
  if (history.type === "wallet_yield") {
    return "Tính lãi theo ngày, linh hoạt như số dư ví.";
  }
  const parts = [latest?.condition, latest?.channel, latest?.confidence ? `độ tin cậy ${latest.confidence}` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Tiết kiệm VND theo kỳ hạn.";
}

function formatRange(event) {
  return `${formatDate(event.effectiveFrom)}${event.effectiveTo ? ` - ${formatDate(event.effectiveTo)}` : " trở đi"}`;
}

function bindTooltip(elements, state) {
  elements.canvas.addEventListener("mousemove", (event) => {
    const focus = getNearestYieldPoint(elements.canvas, state.rows, event.clientX);
    if (!focus) {
      return;
    }

    const frameRect = elements.canvas.parentElement.getBoundingClientRect();
    elements.tooltip.hidden = false;
    elements.tooltip.innerHTML = `
      <strong>${formatDate(focus.row.date)}</strong>
      <span><b>Tổng giá trị</b><em>${formatMoney(focus.row.totalValue)}</em></span>
      <span><b>Đã góp</b><em>${formatMoney(focus.row.contributedValue)}</em></span>
      <span><b>Lãi</b><em>${formatMoney(focus.row.interestValue)}</em></span>
      <span><b>Lãi suất</b><em>${formatRate(focus.row.annualRate)}</em></span>
    `;
    const left = Math.min(event.clientX - frameRect.left + 14, frameRect.width - 260);
    elements.tooltip.style.left = `${Math.max(left, 10)}px`;
    elements.tooltip.style.top = `${Math.max(event.clientY - frameRect.top + 14, 10)}px`;
  });
  elements.canvas.addEventListener("mouseleave", () => {
    elements.tooltip.hidden = true;
  });
}

function bindMoneyFormatting(elements) {
  for (const input of [elements.initial, elements.monthly]) {
    input.addEventListener("input", () => {
      input.value = formatVndInputText(input.value);
    });

    input.addEventListener("blur", () => {
      input.value = formatVndInputText(input.value);
    });
  }
}

function renderEmpty(elements) {
  elements.summary.hidden = true;
  elements.summary.innerHTML = "";
  elements.dataPanel.innerHTML = "";
  elements.title.textContent = "Chọn sản phẩm để tính lãi";
  elements.status.textContent = "Chưa tính";
  elements.status.className = "source-label";
  drawYieldChart(elements.canvas, []);
}

function showError(elements, error) {
  elements.error.hidden = false;
  elements.error.textContent = error.message;
  elements.title.textContent = "Không tính được lãi suất";
  elements.status.textContent = error.message;
  elements.status.className = "source-label is-warning";
}

function clearError(elements) {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

function createSummaryMetric(label, value, className = "") {
  return `<div class="summary-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function createOption(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function formatRate(value) {
  return `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}
