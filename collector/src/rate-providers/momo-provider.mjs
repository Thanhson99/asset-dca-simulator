const MOMO_TUI_THAN_TAI_URL = 'https://www.momo.vn/tui-than-tai';

/**
 * Fetch the current public base rate from MoMo's product page.
 *
 * Historical promotions remain manual snapshots because eligibility and campaign
 * windows are product rules, not a single public base rate.
 *
 * @returns {Promise<object>}
 */
export async function fetchMomoTuiThanTaiSnapshot() {
  const html = await fetchText(MOMO_TUI_THAN_TAI_URL);
  const rate = extractAnnualRate(html);

  return {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null,
    rateType: 'base',
    annualRate: rate,
    taxRate: 5,
    source: 'official-page',
    sourceUrl: MOMO_TUI_THAN_TAI_URL,
    needsReview: false,
    fetchedAt: new Date().toISOString(),
  };
}

function extractAnnualRate(html) {
  const matches = [...html.matchAll(/(?:lên đến|đến)\s*(\d+(?:[,.]\d+)?)\s*%\s*\/\s*năm/giu)];
  const rates = matches.map((match) => Number(match[1].replace(',', '.'))).filter(Number.isFinite);

  if (rates.length === 0) {
    throw new Error('Cannot find MoMo annual rate on product page.');
  }

  return Math.max(...rates);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; asset-dca-simulator/0.1)',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.text();
}
