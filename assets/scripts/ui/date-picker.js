const MONTH_LABELS = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MIN_DATE_ISO = "2000-01-01";
const TODAY_ISO = toIsoDate(new Date());
const DATE_PICKER_STATES = new WeakMap();

/**
 * Replace a native date input with a small static-friendly calendar picker.
 *
 * The visible value is `dd/mm/yyyy`, while `input.dataset.iso` keeps the ISO
 * date used by data loading and validation.
 *
 * @param {HTMLInputElement} input
 */
export function enhanceDateInput(input) {
  const initialIso = parseDateText(input.value);
  const state = {
    input,
    selectedIso: initialIso,
    visibleMonth: initialIso ? monthStart(initialIso) : monthStart(TODAY_ISO),
    popover: document.createElement("div"),
  };
  DATE_PICKER_STATES.set(input, state);

  if (state.selectedIso) {
    input.dataset.iso = state.selectedIso;
    input.value = formatDisplayDate(state.selectedIso);
  } else {
    delete input.dataset.iso;
    input.value = "";
  }

  input.setAttribute("aria-haspopup", "dialog");

  state.popover.className = "date-picker";
  state.popover.hidden = true;
  document.body.append(state.popover);

  input.addEventListener("click", (event) => {
    event.stopPropagation();
    showPicker(state);
  });
  state.popover.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  input.addEventListener("blur", () => syncTypedDate(state));
  input.addEventListener("change", () => syncTypedDate(state));
  input.addEventListener("date-picker:clear", () => clearDate(state));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showPicker(state);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target !== input && !state.popover.contains(event.target)) {
      state.popover.hidden = true;
    }
  });
}

/**
 * Programmatically set an enhanced date input.
 *
 * @param {HTMLInputElement} input
 * @param {string} iso
 */
export function setDateInput(input, iso) {
  const state = DATE_PICKER_STATES.get(input);
  input.dataset.iso = iso;
  input.value = formatDisplayDate(iso);

  if (state) {
    state.selectedIso = iso;
    state.visibleMonth = monthStart(iso);
  }
}

/**
 * Clear the picker state when another UI action resets the input.
 *
 * @param {object} state
 */
function clearDate(state) {
  state.selectedIso = "";
  delete state.input.dataset.iso;
  state.input.value = "";
}

/**
 * Read the ISO value from an enhanced date input.
 *
 * @param {HTMLInputElement} input
 * @returns {string}
 */
export function readDateInput(input) {
  return input.dataset.iso || parseDateText(input.value) || "";
}

/**
 * Open and position the picker below its input.
 *
 * @param {object} state
 */
function showPicker(state) {
  state.visibleMonth = clampVisibleMonth(state, state.visibleMonth);
  renderPicker(state);
  positionPicker(state);
  state.popover.hidden = false;
}

/**
 * Render the current month view.
 *
 * @param {object} state
 */
function renderPicker(state) {
  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  const days = createMonthCells(year, month);
  const minDate = inputMinDate(state);
  const maxDate = inputMaxDate(state);

  state.popover.innerHTML = `
    <div class="date-picker__header">
      <button type="button" data-action="prev" aria-label="Tháng trước" ${isMinOrPastMonth(state, state.visibleMonth) ? "disabled" : ""}>‹</button>
      <div class="date-picker__jump">
        <select aria-label="Chọn tháng">
          ${createMonthOptions(month, year, minDate, maxDate)}
        </select>
        <select aria-label="Chọn năm">
          ${createYearOptions(year, minDate, maxDate)}
        </select>
      </div>
      <button type="button" data-action="next" aria-label="Tháng sau" ${isCurrentOrFutureMonth(state, state.visibleMonth) ? "disabled" : ""}>›</button>
    </div>
    <div class="date-picker__weekdays">
      ${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}
    </div>
    <div class="date-picker__days">
      ${days.map((day) => createDayButton(day, state.selectedIso, month, minDate, maxDate)).join("")}
    </div>
  `;

  state.popover.querySelector('[data-action="prev"]').addEventListener("click", () => moveMonth(state, -1));
  state.popover.querySelector('[data-action="next"]').addEventListener("click", () => moveMonth(state, 1));
  const [monthSelect, yearSelect] = state.popover.querySelectorAll(".date-picker__jump select");

  monthSelect.addEventListener("change", (event) => {
    setVisibleMonth(state, Number(event.target.value), year);
  });

  yearSelect.addEventListener("change", (event) => {
    setVisibleMonth(state, month, Number(event.target.value));
  });

  for (const button of state.popover.querySelectorAll("[data-date]")) {
    button.addEventListener("click", () => selectDate(state, button.dataset.date));
  }
}

/**
 * Keep typed dates and calendar state in sync.
 *
 * @param {object} state
 */
function syncTypedDate(state) {
  if (!state.input.value.trim()) {
    state.selectedIso = "";
    delete state.input.dataset.iso;
    return;
  }

  const iso = parseDateText(state.input.value);
  if (!iso) {
    delete state.input.dataset.iso;
    return;
  }

  state.selectedIso = iso;
  state.input.dataset.iso = iso;
  state.input.value = formatDisplayDate(iso);
  state.visibleMonth = monthStart(iso);
}

/**
 * Place picker with enough room to avoid viewport overflow.
 *
 * @param {object} state
 */
function positionPicker(state) {
  const rect = state.input.getBoundingClientRect();
  const left = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 320);
  const top = rect.bottom + window.scrollY + 8;

  state.popover.style.left = `${Math.max(left, 8)}px`;
  state.popover.style.top = `${top}px`;
}

/**
 * Move visible calendar month.
 *
 * @param {object} state
 * @param {number} offset
 */
function moveMonth(state, offset) {
  state.visibleMonth = clampVisibleMonth(state, new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + offset, 1));
  renderPicker(state);
}

/**
 * Jump the picker to a selected month and year.
 *
 * @param {object} state
 * @param {number} month
 * @param {number} year
 */
function setVisibleMonth(state, month, year) {
  state.visibleMonth = clampVisibleMonth(state, new Date(year, month, 1));
  renderPicker(state);
}

/**
 * Select a day and dispatch change so callers can react if needed.
 *
 * @param {object} state
 * @param {string} iso
 */
function selectDate(state, iso) {
  if (iso < inputMinDate(state) || iso > inputMaxDate(state)) {
    return;
  }

  state.selectedIso = iso;
  state.input.dataset.iso = iso;
  state.input.value = formatDisplayDate(iso);
  state.visibleMonth = monthStart(iso);
  state.popover.hidden = true;
  state.input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Create day cells including leading/trailing days to fill whole weeks.
 *
 * @param {number} year
 * @param {number} month
 * @returns {Array<object>}
 */
function createMonthCells(year, month) {
  const firstDate = new Date(year, month, 1);
  const startOffset = (firstDate.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];

  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    days.push({ date, iso: toIsoDate(date) });
  }

  return days;
}

/**
 * Render one calendar day button.
 *
 * @param {object} day
 * @param {string} selectedIso
 * @param {number} visibleMonth
 * @param {string} minIso
 * @param {string} maxIso
 * @returns {string}
 */
function createDayButton(day, selectedIso, visibleMonth, minIso, maxIso) {
  const outsideClass = day.date.getMonth() === visibleMonth ? "" : " is-outside";
  const selectedClass = selectedIso && day.iso === selectedIso ? " is-selected" : "";
  const disabled = day.iso < minIso || day.iso > maxIso ? " disabled" : "";

  return `<button class="date-picker__day${outsideClass}${selectedClass}" type="button" data-date="${day.iso}"${disabled}>${day.date.getDate()}</button>`;
}

/**
 * Parse `dd/mm/yyyy`, `d/m/yyyy`, or `yyyy-mm-dd` into ISO.
 *
 * @param {string} value
 * @returns {string}
 */
function parseDateText(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const displayMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (isoMatch) {
    return validIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  if (displayMatch) {
    return validIso(Number(displayMatch[3]), Number(displayMatch[2]), Number(displayMatch[1]));
  }

  return "";
}

/**
 * Return an ISO date only when the parts form a real calendar day.
 *
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function validIso(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "";
  }

  return toIsoDate(date);
}

/**
 * Create a practical year dropdown.
 *
 * @param {number} selectedYear
 * @param {string} minIso
 * @param {string} maxIso
 * @returns {string}
 */
function createYearOptions(selectedYear, minIso, maxIso) {
  const startYear = Number(minIso.slice(0, 4));
  const endYear = Number(maxIso.slice(0, 4));
  const options = [];

  for (let year = endYear; year >= startYear; year -= 1) {
    options.push(`<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}</option>`);
  }

  return options.join("");
}

/**
 * Create month options and disable future months in the current year.
 *
 * @param {number} selectedMonth
 * @param {number} selectedYear
 * @param {string} minIso
 * @param {string} maxIso
 * @returns {string}
 */
function createMonthOptions(selectedMonth, selectedYear, minIso, maxIso) {
  const maxDate = new Date(`${maxIso}T00:00:00`);
  const minDate = new Date(`${minIso}T00:00:00`);
  return MONTH_LABELS.map((label, index) => {
    const disabled =
      (selectedYear === maxDate.getFullYear() && index > maxDate.getMonth()) ||
      (selectedYear === minDate.getFullYear() && index < minDate.getMonth())
        ? " disabled"
        : "";
    return `<option value="${index}" ${index === selectedMonth ? "selected" : ""}${disabled}>${label}</option>`;
  }).join("");
}

/**
 * Keep the visible calendar from moving beyond the current month.
 *
 * @param {object} state
 * @param {Date} month
 * @returns {Date}
 */
function clampVisibleMonth(state, month) {
  const maxMonth = monthStart(inputMaxDate(state));
  const minMonth = monthStart(inputMinDate(state));
  if (month < minMonth) {
    return minMonth;
  }

  if (month > maxMonth) {
    return maxMonth;
  }

  return month;
}

/**
 * Check whether a calendar month is the current month or later.
 *
 * @param {object} state
 * @param {Date} month
 * @returns {boolean}
 */
function isCurrentOrFutureMonth(state, month) {
  return month >= monthStart(inputMaxDate(state));
}

/**
 * Check whether a calendar month is the minimum allowed month or earlier.
 *
 * @param {object} state
 * @param {Date} month
 * @returns {boolean}
 */
function isMinOrPastMonth(state, month) {
  return month <= monthStart(inputMinDate(state));
}

function inputMinDate(state) {
  return state.input.dataset.minDate || MIN_DATE_ISO;
}

function inputMaxDate(state) {
  return state.input.dataset.maxDate || TODAY_ISO;
}

/**
 * Return first day of an ISO date's month.
 *
 * @param {string} iso
 * @returns {Date}
 */
function monthStart(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Format ISO date as `dd/mm/yyyy`.
 *
 * @param {string} iso
 * @returns {string}
 */
function formatDisplayDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
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
