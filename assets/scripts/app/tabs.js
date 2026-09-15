/**
 * Bind tab buttons to panels without coupling to any tab's business logic.
 */
export function initTabs() {
  const tabs = [...document.querySelectorAll("[data-tab-target]")];
  const panels = [...document.querySelectorAll("[data-tab-panel]")];
  const tabList = document.querySelector(".product-tabs");
  const shell = tabList?.closest(".page-shell");
  const initialTarget = readSavedTab(tabs) || tabs.find((tab) => tab.classList.contains("is-active"))?.dataset.tabTarget || "stocks";

  activateTab({ tabs, panels, tabList, shell, target: initialTarget, persist: false });

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      activateTab({ tabs, panels, tabList, shell, target: tab.dataset.tabTarget, persist: true });
    });
  }
}

const TAB_STORAGE_KEY = "asset-dca-simulator:active-tab";

function activateTab({ tabs, panels, tabList, shell, target, persist }) {
  tabList?.setAttribute("data-active", target);
  shell?.setAttribute("data-active", target);

  for (const item of tabs) {
    const active = item.dataset.tabTarget === target;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
  }

  for (const panel of panels) {
    const active = panel.dataset.tabPanel === target;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }

  if (persist) {
    writeSavedTab(target);
  }

  document.dispatchEvent(new CustomEvent("app-tab:change", { detail: { target } }));
}

function readSavedTab(tabs) {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return tabs.some((tab) => tab.dataset.tabTarget === saved) ? saved : "";
  } catch {
    return "";
  }
}

function writeSavedTab(target) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, target);
  } catch {
    // Ignore unavailable storage; tab switching still works for this page load.
  }
}
