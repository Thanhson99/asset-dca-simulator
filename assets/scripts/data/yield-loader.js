let rateIndexPromise = null;
const rateFilePromises = new Map();

/**
 * Load the yield product manifest used by the yield tab.
 *
 * @returns {Promise<Array<object>>}
 */
export async function loadRateProducts() {
  rateIndexPromise = rateIndexPromise || fetchRateIndex();
  const index = await rateIndexPromise;
  return index.products;
}

/**
 * Load rate history for one product.
 *
 * @param {string} productId
 * @returns {Promise<object>}
 */
export async function loadRateHistory(productId) {
  const products = await loadRateProducts();
  const product = products.find((item) => item.id === productId);
  if (!product) {
    throw new Error(`Không tìm thấy dữ liệu lãi suất cho ${productId}`);
  }

  const key = product.dataPath;
  if (!rateFilePromises.has(key)) {
    rateFilePromises.set(key, fetchRateFile(key));
  }

  return rateFilePromises.get(key);
}

async function fetchRateIndex() {
  try {
    const response = await fetch("data/rates/index.json");
    if (!response.ok) {
      return { products: [] };
    }

    const data = await response.json();
    return { products: Array.isArray(data.products) ? data.products : [] };
  } catch {
    return { products: [] };
  }
}

async function fetchRateFile(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Không tải được dữ liệu lãi suất: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
