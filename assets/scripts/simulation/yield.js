import { toIsoDate } from "../shared/dates.js";
import { compareBankRatePreference } from "../features/yield/rate-preference.js";

/**
 * Simulate a flexible daily-yield product such as MoMo Túi Thần Tài.
 *
 * @param {object} input
 * @returns {{rows: Array<object>, events: Array<object>}}
 */
export function simulateFlexibleDailyYield(input) {
  const events = effectiveRateEvents(input.rateHistory, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    productType: "wallet_yield",
    manualRate: input.manualRate,
  });
  const rows = [];
  let balance = input.initialAmount;
  let contributedValue = input.initialAmount;
  let paidOutInterestValue = 0;
  let grossInterestValue = 0;
  let taxValue = 0;

  for (const date of eachIsoDate(input.fromDate, input.toDate)) {
    if (input.monthlyAmount > 0 && date !== input.fromDate && isMonthlyContributionDate(date, input.fromDate)) {
      balance += input.monthlyAmount;
      contributedValue += input.monthlyAmount;
    }

    const rate = rateForDate(events, date);
    const grossInterest = Math.floor((balance * rate.annualRate) / 100 / 365);
    const tax = input.includeTax ? Math.floor(grossInterest * ((rate.taxRate || 0) / 100)) : 0;
    const netInterest = Math.max(grossInterest - tax, 0);

    grossInterestValue += grossInterest;
    taxValue += tax;
    if (input.compoundingMode === "compound") {
      balance += netInterest;
    } else {
      paidOutInterestValue += netInterest;
    }

    rows.push(createYieldRow({ date, balance: balance + paidOutInterestValue, contributedValue, grossInterestValue, taxValue, rate }));
  }

  return { rows, events };
}

/**
 * Simulate term deposits as separate monthly lots.
 *
 * Each contribution opens its own deposit lot. Lots mature after the selected
 * term and either compound principal+interest or keep interest outside the lot.
 *
 * @param {object} input
 * @returns {{rows: Array<object>, events: Array<object>}}
 */
export function simulateTermDeposit(input) {
  const events = effectiveRateEvents(input.rateHistory, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    productType: "bank_saving",
    termMonths: input.termMonths,
    manualRate: input.manualRate,
  });
  const rows = [];
  const lots =
    input.initialAmount > 0
      ? [createDepositLot(input.initialAmount, input.fromDate, input.termMonths, rateForDate(events, input.fromDate))]
      : [];
  let contributedValue = input.initialAmount;
  let paidOutInterestValue = 0;
  let grossInterestValue = 0;
  let taxValue = 0;

  for (const date of eachIsoDate(input.fromDate, input.toDate)) {
    if (input.monthlyAmount > 0 && date !== input.fromDate && isMonthlyContributionDate(date, input.fromDate)) {
      lots.push(createDepositLot(input.monthlyAmount, date, input.termMonths, rateForDate(events, date)));
      contributedValue += input.monthlyAmount;
    }

    for (const lot of lots) {
      if (date !== lot.nextMaturityDate) {
        continue;
      }

      const grossInterest = calculateTermInterest(lot.principal, lot.annualRate, lot.termMonths);
      const tax = input.includeTax ? Math.floor(grossInterest * ((lot.taxRate || 0) / 100)) : 0;
      const netInterest = Math.max(grossInterest - tax, 0);

      grossInterestValue += grossInterest;
      taxValue += tax;
      if (input.compoundingMode === "compound") {
        lot.principal += netInterest;
      } else {
        paidOutInterestValue += netInterest;
      }

      const nextRate = rateForDate(events, date);
      lot.openedAt = date;
      lot.annualRate = nextRate.annualRate;
      lot.taxRate = nextRate.taxRate || 0;
      lot.nextMaturityDate = addMonths(date, input.termMonths);
    }

    const accruedInterestValue = lots.reduce((total, lot) => total + calculateAccruedInterest(lot, date), 0);
    const balance = lots.reduce((total, lot) => total + lot.principal, 0) + paidOutInterestValue + accruedInterestValue;
    const currentRate = rateForDate(events, date);

    rows.push(
      createYieldRow({
        date,
        balance,
        contributedValue,
        grossInterestValue: grossInterestValue + accruedInterestValue,
        taxValue,
        rate: currentRate,
      }),
    );
  }

  return { rows, events };
}

/**
 * Return rate events that overlap the selected date range.
 *
 * @param {object} history
 * @param {object} options
 * @returns {Array<object>}
 */
export function effectiveRateEvents(history, options) {
  if (Number.isFinite(options.manualRate) && options.manualRate > 0) {
    return [
      {
        effectiveFrom: options.fromDate,
        effectiveTo: options.toDate,
        annualRate: options.manualRate,
        taxRate: options.productType === "wallet_yield" ? 5 : 0,
        source: "manual",
      },
    ];
  }

  const snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
  const events = snapshots
    .map((snapshot) => rateEventFromSnapshot(snapshot, options))
    .filter(Boolean)
    .filter((event) => event.effectiveFrom <= options.toDate && (!event.effectiveTo || event.effectiveTo >= options.fromDate))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  if (events.length === 0) {
    throw new Error("Chưa có snapshot lãi suất phù hợp với khoảng ngày đã chọn");
  }

  return events;
}

function rateEventFromSnapshot(snapshot, options) {
  if (options.productType === "bank_saving") {
    const term = snapshot.terms?.find((item) => Number(item.months) === Number(options.termMonths));
    if (!term) {
      return null;
    }

    return {
      effectiveFrom: snapshot.effectiveFrom || snapshot.date,
      effectiveTo: snapshot.effectiveTo || null,
      annualRate: Number(term.annualRate),
      taxRate: Number(snapshot.taxRate || 0),
      source: snapshot.source || "unknown",
      sourceUrl: snapshot.sourceUrl || "",
      needsReview: Boolean(snapshot.needsReview),
      channel: snapshot.channel || "",
      condition: snapshot.condition || "",
      confidence: snapshot.confidence || "",
    };
  }

  return {
    effectiveFrom: snapshot.effectiveFrom || snapshot.date,
    effectiveTo: snapshot.effectiveTo || null,
    annualRate: Number(snapshot.annualRate),
    taxRate: Number(snapshot.taxRate || 0),
    source: snapshot.source || "unknown",
    sourceUrl: snapshot.sourceUrl || "",
    needsReview: Boolean(snapshot.needsReview),
    rateType: snapshot.rateType || "base",
  };
}

function createYieldRow({ date, balance, contributedValue, grossInterestValue, taxValue, rate }) {
  return {
    date,
    totalValue: Math.round(balance),
    contributedValue: Math.round(contributedValue),
    interestValue: Math.round(balance - contributedValue),
    grossInterestValue: Math.round(grossInterestValue),
    taxValue: Math.round(taxValue),
    annualRate: rate.annualRate,
  };
}

function createDepositLot(principal, date, termMonths, rate) {
  return {
    principal,
    openedAt: date,
    nextMaturityDate: addMonths(date, termMonths),
    termMonths,
    annualRate: rate.annualRate,
    taxRate: rate.taxRate || 0,
  };
}

function calculateTermInterest(principal, annualRate, termMonths) {
  return Math.floor((principal * annualRate) / 100 * (termMonths / 12));
}

function calculateAccruedInterest(lot, date) {
  if (date <= lot.openedAt || date >= lot.nextMaturityDate) {
    return 0;
  }

  const elapsedDays = daysBetween(lot.openedAt, date);
  const termDays = Math.max(daysBetween(lot.openedAt, lot.nextMaturityDate), 1);
  return Math.floor(calculateTermInterest(lot.principal, lot.annualRate, lot.termMonths) * (elapsedDays / termDays));
}

function rateForDate(events, date) {
  const matches = [];
  for (const event of events) {
    if (event.effectiveFrom <= date && (!event.effectiveTo || event.effectiveTo >= date)) {
      matches.push(event);
    }
  }

  if (matches.length > 0) {
    return matches.sort(compareRateEventPreference)[0];
  }

  throw new Error(`Thiếu dữ liệu lãi suất cho ngày ${formatDate(date)}`);
}

function compareRateEventPreference(left, right) {
  return compareBankRatePreference(left, right);
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isMonthlyContributionDate(date, fromDate) {
  const targetDay = Number(fromDate.slice(8, 10));
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  return Number(date.slice(8, 10)) === Math.min(targetDay, lastDay);
}

function* eachIsoDate(fromDate, toDate) {
  const date = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);

  while (date <= end) {
    yield toIsoDate(date);
    date.setDate(date.getDate() + 1);
  }
}

function addMonths(value, months) {
  const date = new Date(`${value}T00:00:00`);
  const targetDay = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < targetDay) {
    date.setDate(0);
  }
  return toIsoDate(date);
}

function daysBetween(fromDate, toDate) {
  return Math.round((new Date(`${toDate}T00:00:00`) - new Date(`${fromDate}T00:00:00`)) / 86400000);
}
