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

/**
 * Replace a native date input with a small static-friendly calendar picker.
 *
 * The visible value is `dd/mm/yyyy`, while `input.dataset.iso` keeps the ISO
 * date used by data loading and validation.
 *
 * @param {HTMLInputElement} input
 */
export function enhanceDateInput(input) {
  const state = {
    input,
    selectedIso: normalizeIso(input.value),
    visibleMonth: monthStart(normalizeIso(input.value)),
    popover: document.createElement("div"),
  };

  input.dataset.iso = state.selectedIso;
  input.value = formatDisplayDate(state.selectedIso);
  input.setAttribute("aria-haspopup", "dialog");

  state.popover.className = "date-picker";
  state.popover.hidden = true;
  document.body.append(state.popover);

  input.addEventListener("click", () => showPicker(state));
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
 * Read the ISO value from an enhanced date input.
 *
 * @param {HTMLInputElement} input
 * @returns {string}
 */
export function readDateInput(input) {
  return input.dataset.iso || normalizeIso(input.value);
}

/**
 * Open and position the picker below its input.
 *
 * @param {object} state
 */
function showPicker(state) {
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

  state.popover.innerHTML = `
    <div class="date-picker__header">
      <button type="button" data-action="prev" aria-label="Tháng trước">‹</button>
      <div class="date-picker__jump">
        <select aria-label="Chọn tháng">
          ${MONTH_LABELS.map((label, index) => `<option value="${index}" ${index === month ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <input aria-label="Chọn năm" type="number" value="${year}" min="2000" max="2100" />
      </div>
      <button type="button" data-action="next" aria-label="Tháng sau">›</button>
    </div>
    <div class="date-picker__weekdays">
      ${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}
    </div>
    <div class="date-picker__days">
      ${days.map((day) => createDayButton(day, state.selectedIso, month)).join("")}
    </div>
  `;

  state.popover.querySelector('[data-action="prev"]').addEventListener("click", () => moveMonth(state, -1));
  state.popover.querySelector('[data-action="next"]').addEventListener("click", () => moveMonth(state, 1));
  state.popover.querySelector(".date-picker__jump select").addEventListener("change", (event) => {
    setVisibleMonth(state, Number(event.target.value), year);
  });
  state.popover.querySelector(".date-picker__jump input").addEventListener("change", (event) => {
    setVisibleMonth(state, month, clampYear(Number(event.target.value)));
  });

  for (const button of state.popover.querySelectorAll("[data-date]")) {
    button.addEventListener("click", () => selectDate(state, button.dataset.date));
  }
}

/**
 * Place picker with enough room to avoid viewport overflow.
 *
 * @param {object} state
 */
function positionPicker(state) {
  const rect = state.input.getBoundingClientRect();
  const left = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 292);
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
  state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + offset, 1);
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
  state.visibleMonth = new Date(year, month, 1);
  renderPicker(state);
}

/**
 * Select a day and dispatch change so callers can react if needed.
 *
 * @param {object} state
 * @param {string} iso
 */
function selectDate(state, iso) {
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
 * @returns {string}
 */
function createDayButton(day, selectedIso, visibleMonth) {
  const outsideClass = day.date.getMonth() === visibleMonth ? "" : " is-outside";
  const selectedClass = day.iso === selectedIso ? " is-selected" : "";

  return `<button class="date-picker__day${outsideClass}${selectedClass}" type="button" data-date="${day.iso}">${day.date.getDate()}</button>`;
}

/**
 * Normalize any valid date-like value to ISO.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeIso(value) {
  return toIsoDate(new Date(`${value}T00:00:00`));
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

/**
 * Keep year input in a practical range for this static dataset.
 *
 * @param {number} year
 * @returns {number}
 */
function clampYear(year) {
  if (!Number.isFinite(year)) {
    return new Date().getFullYear();
  }

  return Math.min(Math.max(year, 2000), 2100);
}
