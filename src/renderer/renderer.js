import {
  $,
  state,
  DEFAULT_SETTINGS,
  FONT_MIN,
  FONT_MAX,
  clamp
} from "./state.js";

import {
  loadSettings,
  saveSettings,
  applySettingsToUI,
  showWelcome,
  syncTopbarState,
  closeModal,
  isModalOpen,
  registerUIButtons,
  setModalHandlers
} from "./ui.js";

import {
  initMonacoOnce,
  renderTabs,
  closeTabNow,
  requestCloseTab,
  nextTab,
  prevTab,
  saveCurrentFile,
  hideSuggest,
  selectNextSuggest,
  selectPrevSuggest,
  acceptSuggest
} from "./editor.js";

import {
  openFileFlow,
  openFolderFlow,
  refreshRecent,
  savePendingCloseTabAndClose
} from "./workspace.js";

function registerShortcuts() {
  const isMac = navigator.platform.toLowerCase().includes("mac");

  window.addEventListener("mousedown", (e) => {
    const box = $("customSuggest");
    if (!box || box.style.display === "none") return;
    if (box.contains(e.target)) return;
    hideSuggest();
  });

  window.addEventListener("keydown", async (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (e.key === "Escape") {
      if (isModalOpen()) {
        e.preventDefault();
        closeModal();
        return;
      }
    }

    if (isModalOpen()) {
      if (state.modal.kind === "confirmClose" && e.key === "Enter") {
        e.preventDefault();
        $("confirmSaveBtn")?.click();
      }
      return;
    }

    if (mod && e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (state.activeTabIndex >= 0) {
        requestCloseTab(state.activeTabIndex);
      }
      return;
    }

    if (mod && e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) prevTab();
      else nextTab();
      return;
    }

    if (mod) {
      const key = e.key;

      if (key.toLowerCase() === "s") {
        e.preventDefault();
        await saveCurrentFile();
        return;
      }

      if (key.toLowerCase() === "o" && e.shiftKey) {
        e.preventDefault();
        await openFolderFlow();
        return;
      }

      if (key.toLowerCase() === "o" && !e.shiftKey) {
        e.preventDefault();
        await openFileFlow();
        return;
      }

      if (key === "+" || key === "=") {
        e.preventDefault();
        state.settings.fontSize = clamp(state.settings.fontSize + 1, FONT_MIN, FONT_MAX);
        saveSettings();
        applySettingsToUI();
        return;
      }

      if (key === "-") {
        e.preventDefault();
        state.settings.fontSize = clamp(state.settings.fontSize - 1, FONT_MIN, FONT_MAX);
        saveSettings();
        applySettingsToUI();
        return;
      }

      if (key === "0") {
        e.preventDefault();
        state.settings.fontSize = DEFAULT_SETTINGS.fontSize;
        saveSettings();
        applySettingsToUI();
      }
    }
  });

  window.addEventListener("beforeunload", (e) => {
    const hasDirty = state.tabs.some((t) => t.dirty);
    if (!hasDirty) return;

    e.preventDefault();
    e.returnValue = "";
  });
}

function registerSuggestGlobalNavigation() {
  window.addEventListener("keydown", (e) => {
    if (!state.suggest.open) return;
    if (isModalOpen()) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectNextSuggest();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectPrevSuggest();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      acceptSuggest();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      hideSuggest();
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  state.settings = loadSettings();
  applySettingsToUI();

  showWelcome();
  syncTopbarState();

  setModalHandlers({
    onConfirmDontSaveClose: async () => {
      const idx = state.modal.pendingCloseTabIndex;
      if (typeof idx === "number") {
        closeTabNow(idx);
      }
    },
    onConfirmSaveClose: async () => {
      await savePendingCloseTabAndClose(closeTabNow, closeModal);
    }
  });

  registerUIButtons({
    openFolderFlow,
    openFileFlow,
    saveCurrentFile,
    refreshRecent,
    renderTabs
  });

  registerShortcuts();
  registerSuggestGlobalNavigation();

  document.documentElement.style.setProperty("--tab-width", `${state.settings.tabWidth}px`);

  await initMonacoOnce();
  applySettingsToUI();
  await refreshRecent();
});