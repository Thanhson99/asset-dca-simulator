const COMPARE_PRICE_COLORS = ["#f97316", "#14b8a6", "#7c3aed", "#e11d48", "#84cc16", "#0f172a"];
const COMPARE_INVESTMENT_COLORS = ["#06b6d4", "#f43f5e", "#eab308", "#22c55e", "#2563eb", "#a855f7"];

/**
 * Manage dynamic comparison rows and keep row state separate from chart orchestration.
 *
 * @param {object} options
 * @returns {object}
 */
export function createCompareControls(options) {
  let legs = [];
  let nextId = 1;

  function bind() {
    options.elements.addButton.addEventListener("click", () => {
      legs.push(normalizeLeg());
      render();
      options.onSave();
    });
  }

  function render() {
    options.elements.list.innerHTML = legs.map(createLegHtml).join("");

    for (const row of options.elements.list.querySelectorAll(".compare-row")) {
      bindRow(row);
    }
  }

  function clear() {
    legs = [];
    nextId = 1;
    render();
  }

  function restore(state) {
    if (Array.isArray(state.compareLegs)) {
      legs = state.compareLegs.map(normalizeLeg).filter((leg) => leg.symbol || leg.monthlyAmountText);
      nextId = legs.length + 1;
      render();
      return;
    }

    if (state.compareEnabled && (state.compareSymbol || state.compareMonthlyAmount)) {
      legs = [
        normalizeLeg({
          symbol: state.compareSymbol,
          monthlyAmountText: state.compareMonthlyAmount,
        }),
      ];
      nextId = 2;
      render();
      return;
    }

    clear();
  }

  function read(fallbackMonthlyAmount) {
    return [...options.elements.list.querySelectorAll(".compare-row")]
      .map((row, index) => {
        const symbolInput = row.querySelector('[data-field="symbol"]');
        const amountInput = row.querySelector('[data-field="monthlyAmount"]');
        const priceColorInput = row.querySelector('[data-field="priceColor"]');
        const investmentColorInput = row.querySelector('[data-field="investmentColor"]');
        const showPriceInput = row.querySelector('[data-field="showPrice"]');
        const showInvestmentInput = row.querySelector('[data-field="showInvestment"]');
        const symbol = options.normalizeSymbol(symbolInput.value);
        const monthlyAmount = options.parseVnd(amountInput.value) || fallbackMonthlyAmount;

        return {
          id: row.dataset.id || `compare${index + 1}`,
          symbol,
          monthlyAmount: options.clamp(monthlyAmount, 10000, 1000000000),
          colorIndex: index,
          priceColor: priceColorInput.value,
          investmentColor: investmentColorInput.value,
          showPrice: showPriceInput.checked,
          showInvestment: showInvestmentInput.checked,
          symbolInput,
          amountInput,
        };
      })
      .filter((leg) => leg.symbol || leg.amountInput.value.trim());
  }

  function values() {
    return legs;
  }

  function normalizeLeg(leg = {}) {
    const colorIndex = nextId - 1;

    return {
      id: leg.id || `compare${nextId++}`,
      symbol: String(leg.symbol || "").trim().toUpperCase(),
      monthlyAmountText: leg.monthlyAmountText || "",
      priceColor: leg.priceColor || compareColor(colorIndex),
      investmentColor: leg.investmentColor || compareInvestmentColor(colorIndex),
      showPrice: leg.showPrice !== false,
      showInvestment: leg.showInvestment !== false,
    };
  }

  function createLegHtml(leg) {
    return `
      <div class="compare-row" data-id="${options.escapeHtml(leg.id)}">
        <div class="compare-row__fields">
          <label>
            <span>Mã so sánh</span>
            <input class="symbol-combobox" data-field="symbol" type="search" value="${options.escapeHtml(leg.symbol)}" list="stock-symbol-list" placeholder="Nhập mã cổ phiếu" autocomplete="off" />
          </label>
          <label>
            <span>Số tiền/tháng</span>
            <div class="money-input">
              <input data-field="monthlyAmount" type="text" value="${options.escapeHtml(leg.monthlyAmountText)}" list="monthly-amount-list" inputmode="numeric" placeholder="Bỏ trống để dùng mã chính" autocomplete="off" />
              <span>VNĐ</span>
            </div>
          </label>
          <button class="compare-row__remove" type="button" aria-label="Xóa mã so sánh" title="Xóa">×</button>
        </div>
        <div class="compare-row__options">
          <label class="toggle-control compare-option-toggle">
            <input data-field="showPrice" type="checkbox" ${leg.showPrice ? "checked" : ""} />
            <span>Giá</span>
          </label>
          <label class="compare-color-control">
            <span>Màu giá</span>
            <input data-field="priceColor" type="color" value="${options.escapeHtml(leg.priceColor)}" />
          </label>
          <label class="toggle-control compare-option-toggle">
            <input data-field="showInvestment" type="checkbox" ${leg.showInvestment ? "checked" : ""} />
            <span>Đầu tư</span>
          </label>
          <label class="compare-color-control">
            <span>Màu đầu tư</span>
            <input data-field="investmentColor" type="color" value="${options.escapeHtml(leg.investmentColor)}" />
          </label>
        </div>
      </div>
    `;
  }

  function bindRow(row) {
    const id = row.dataset.id;
    const symbolInput = row.querySelector('[data-field="symbol"]');
    const amountInput = row.querySelector('[data-field="monthlyAmount"]');
    const priceColorInput = row.querySelector('[data-field="priceColor"]');
    const investmentColorInput = row.querySelector('[data-field="investmentColor"]');
    const showPriceInput = row.querySelector('[data-field="showPrice"]');
    const showInvestmentInput = row.querySelector('[data-field="showInvestment"]');

    symbolInput.addEventListener("input", () => {
      options.clearFieldError(symbolInput);
      options.onSymbolQuery(symbolInput.value);
      updateLeg(id, { symbol: options.normalizeSymbol(symbolInput.value) });
      closeSymbolSuggestionsIfExact(symbolInput);
    });
    symbolInput.addEventListener("change", () => {
      options.normalizeSymbolField(symbolInput);
      options.onSymbolQuery(symbolInput.value);
      updateLeg(id, { symbol: symbolInput.value });
      closeSymbolSuggestionsIfExact(symbolInput);
      options.onRender();
    });
    symbolInput.addEventListener("blur", () => {
      options.normalizeSymbolField(symbolInput);
      options.onSymbolQuery(symbolInput.value);
      updateLeg(id, { symbol: symbolInput.value });
    });

    amountInput.addEventListener("input", () => {
      options.clearFieldError(amountInput);
      updateLeg(id, { monthlyAmountText: amountInput.value });
    });
    amountInput.addEventListener("blur", () => {
      const amount = options.parseVnd(amountInput.value);
      if (amount > 0) {
        amountInput.value = options.formatVnd(amount);
        updateLeg(id, { monthlyAmountText: amountInput.value });
      }
      options.onRefresh();
    });

    priceColorInput.addEventListener("input", () => {
      updateLeg(id, { priceColor: priceColorInput.value });
      options.onRefresh();
    });
    investmentColorInput.addEventListener("input", () => {
      updateLeg(id, { investmentColor: investmentColorInput.value });
      options.onRefresh();
    });
    showPriceInput.addEventListener("change", () => {
      ensureVisibleLine(row, showPriceInput);
      updateLeg(id, { showPrice: showPriceInput.checked });
      options.onRefresh();
    });
    showInvestmentInput.addEventListener("change", () => {
      ensureVisibleLine(row, showInvestmentInput);
      updateLeg(id, { showInvestment: showInvestmentInput.checked });
      options.onRefresh();
    });

    row.querySelector(".compare-row__remove").addEventListener("click", () => {
      legs = legs.filter((leg) => leg.id !== id);
      render();
      options.onSave();
      options.onRefresh();
    });
  }

  /**
   * Close the native datalist after an exact symbol selection.
   *
   * @param {HTMLInputElement} input
   */
  function closeSymbolSuggestionsIfExact(input) {
    if (typeof options.shouldCloseSymbolSuggestions !== "function" || !options.shouldCloseSymbolSuggestions(input.value)) {
      return;
    }

    requestAnimationFrame(() => input.blur());
  }

  function updateLeg(id, patch) {
    legs = legs.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg));
    options.onSave();
  }

  function ensureVisibleLine(row, changedInput) {
    const showPrice = row.querySelector('[data-field="showPrice"]');
    const showInvestment = row.querySelector('[data-field="showInvestment"]');

    if (!showPrice.checked && !showInvestment.checked) {
      changedInput.checked = true;
    }
  }

  return {
    bind,
    clear,
    read,
    render,
    restore,
    values,
  };
}

export function createCompareSeriesOptions(leg) {
  return {
    id: leg.id,
    symbol: leg.symbol,
    priceKey: `${leg.id}Close`,
    investmentKey: `${leg.id}InvestmentValue`,
    investedKey: `${leg.id}InvestedValue`,
    unitsKey: `${leg.id}Units`,
    color: leg.priceColor || compareColor(leg.colorIndex),
    investmentColor: leg.investmentColor || compareInvestmentColor(leg.colorIndex),
    showPrice: leg.showPrice,
    showInvestment: leg.showInvestment,
  };
}

export function compareColor(index) {
  return COMPARE_PRICE_COLORS[index % COMPARE_PRICE_COLORS.length];
}

export function compareInvestmentColor(index) {
  return COMPARE_INVESTMENT_COLORS[index % COMPARE_INVESTMENT_COLORS.length];
}
