import { initTabs } from "./app/tabs.js";
import { initStockTab } from "./features/stocks/stock-tab.js";
import { initYieldTab } from "./features/yield/yield-tab.js";

initTabs();
await Promise.all([initStockTab(), initYieldTab()]);
