/**
 * Validate one rate history file.
 *
 * @param {object} history
 */
export function validateRateHistory(history) {
  if (!history || typeof history !== 'object') {
    throw new Error('Rate history must be an object.');
  }

  if (!history.productId || !history.type || !Array.isArray(history.snapshots)) {
    throw new Error(`Rate history is missing productId/type/snapshots: ${history.productId ?? 'unknown'}`);
  }

  for (const snapshot of history.snapshots) {
    validateSnapshot(history, snapshot);
  }
}

function validateSnapshot(history, snapshot) {
  const from = snapshot.effectiveFrom || snapshot.date;
  if (!isIsoDate(from)) {
    throw new Error(`${history.productId}: invalid effectiveFrom/date ${from}`);
  }

  if (snapshot.effectiveTo && !isIsoDate(snapshot.effectiveTo)) {
    throw new Error(`${history.productId}: invalid effectiveTo ${snapshot.effectiveTo}`);
  }

  if (snapshot.effectiveTo && snapshot.effectiveTo < from) {
    throw new Error(`${history.productId}: effectiveTo is before effectiveFrom`);
  }

  if (history.type === 'bank_saving') {
    validateBankSnapshot(history, snapshot);
    return;
  }

  validateAnnualRate(history.productId, snapshot.annualRate);
}

function validateBankSnapshot(history, snapshot) {
  if (!Array.isArray(snapshot.terms) || snapshot.terms.length === 0) {
    throw new Error(`${history.productId}: bank snapshot has no terms`);
  }

  const terms = new Set();
  for (const term of snapshot.terms) {
    if (!Number.isInteger(Number(term.months)) || Number(term.months) <= 0) {
      throw new Error(`${history.productId}: invalid term ${term.months}`);
    }
    if (terms.has(Number(term.months))) {
      throw new Error(`${history.productId}: duplicated term ${term.months}`);
    }
    terms.add(Number(term.months));
    validateAnnualRate(history.productId, term.annualRate);
  }
}

function validateAnnualRate(productId, value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 20) {
    throw new Error(`${productId}: suspicious annual rate ${value}`);
  }
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
