import {
  $,
  state,
  DEFAULT_SETTINGS,
  FONT_MIN,
  FONT_MAX,
  clamp,
  getActiveTab
} from "./state.js";

import { getCommands } from "./commands.js";

import {
  requestCloseTab,
  nextTab,
  prevTab,
  saveCurrentFile as saveCurrentFileFromEditor
} from "./editor.js";

import {
  openFileFlow,
  openFolderFlow
} from "./workspace.js";

let onConfirmSaveClose = null;
let onConfirmDontSaveClose = null;

export function setModalHandlers(handlers) {
  onConfirmSaveClose = handlers.onConfirmSaveClose || null;
  onConfirmDontSaveClose = handlers.onConfirmDontSaveClose || null;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem("helio.settings");
    if (!raw) return { ...DEFAULT_SETTINGS };

    const obj = JSON.parse(raw);
    const s = { ...DEFAULT_SETTINGS, ...obj };

    s.tabWidth = clamp(Number(s.tabWidth) || DEFAULT_SETTINGS.tabWidth, 120, 400);
    s.fontSize = clamp(Number(s.fontSize) || DEFAULT_SETTINGS.fontSize, FONT_MIN, FONT_MAX);
    s.autoSaveDelay = clamp(Number(s.autoSaveDelay) || 0, 0, 5000);
    s.theme = s.theme === "light" ? "light" : "dark";

    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings() {
  localStorage.setItem("helio.settings", JSON.stringify(state.settings));
}

export function applySettingsToUI() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "";
  document.documentElement.style.setProperty("--tab-width", `${state.settings.tabWidth}px`);

  if (state.editor) {
    monaco.editor.setTheme(state.settings.theme === "light" ? "vs" : "vs-dark");
    state.editor.updateOptions({ fontSize: state.settings.fontSize });
  }

  syncTopbarState();
}

export function showWelcome() {
  const w = $("welcome");
  const e = $("editor");
  const t = $("tabs");

  if (w) w.style.display = "flex";
  if (e) e.style.display = "none";
  if (t) t.style.display = "none";
}

export function hideWelcomeShowEditor() {
  const w = $("welcome");
  const e = $("editor");
  const t = $("tabs");

  if (w) w.style.display = "none";
  if (e) e.style.display = "block";
  if (t) t.style.display = "flex";
}

export function syncTopbarState() {
  const tab = getActiveTab();

  const currentFile = $("currentFile");
  if (currentFile) {
    currentFile.textContent = tab?.path ? tab.path : "No file opened";
  }

  const btnSave = $("btnSave");
  if (btnSave) {
    btnSave.disabled = !(tab?.path && tab?.dirty);
  }
}

export function openModal(kind) {
  state.modal.open = true;
  state.modal.kind = kind;

  const overlay = $("modalOverlay");
  overlay.style.display = "flex";

  $("confirmPanel").style.display = kind === "confirmClose" ? "block" : "none";
  $("settingsPanel").style.display = kind === "settings" ? "block" : "none";

  if (kind === "settings") {
    $("modalTitle").textContent = "Settings";
    primeSettingsForm();
  } else if (kind === "confirmClose") {
    $("modalTitle").textContent = "Unsaved changes";
  }

  requestAnimationFrame(() => {
    overlay.classList.add("show");
  });
}

export function closeModal() {
  const overlay = $("modalOverlay");
  overlay.classList.remove("show");

  setTimeout(() => {
    state.modal.open = false;
    state.modal.kind = null;
    state.modal.pendingCloseTabIndex = null;
    overlay.style.display = "none";
  }, 280);
}

export function isModalOpen() {
  return !!state.modal.open;
}

export function primeSettingsForm() {
  $("settingsTheme").value = state.settings.theme;
  $("settingsTabWidth").value = String(state.settings.tabWidth);
  $("settingsFontSize").value = String(state.settings.fontSize);
  $("settingsFontSizeVal").textContent = String(state.settings.fontSize);
  $("settingsAutoSave").value = String(state.settings.autoSaveDelay);
}

export function applySettingsFromForm(onAfterApply) {
  const theme = $("settingsTheme").value === "light" ? "light" : "dark";
  const tabWidth = clamp(Number($("settingsTabWidth").value) || DEFAULT_SETTINGS.tabWidth, 120, 400);
  const fontSize = clamp(Number($("settingsFontSize").value) || DEFAULT_SETTINGS.fontSize, FONT_MIN, FONT_MAX);
  const autoSaveDelay = clamp(Number($("settingsAutoSave").value) || 0, 0, 5000);

  state.settings.theme = theme;
  state.settings.tabWidth = tabWidth;
  state.settings.fontSize = fontSize;
  state.settings.autoSaveDelay = autoSaveDelay;

  saveSettings();
  applySettingsToUI();

  if (typeof onAfterApply === "function") {
    onAfterApply();
  }
}

export function resetSettings(onAfterReset) {
  state.settings = { ...DEFAULT_SETTINGS };
  saveSettings();
  applySettingsToUI();
  primeSettingsForm();

  if (typeof onAfterReset === "function") {
    onAfterReset();
  }
}

export function openCommandPalette() {
  if (state.commandPalette.open) return;
  state.commandPalette.open = true;
  state.commandPalette.query = "";
  state.commandPalette.activeIndex = 0;

  const overlay = $("commandPaletteOverlay");
  const input = $("commandInput");

  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("show"));

  input.value = "";
  input.focus();

  const actions = getActions();
  state.commandPalette.filteredCommands = getCommands(actions);
  renderCommandPalette();
}

export function closeCommandPalette() {
  const overlay = $("commandPaletteOverlay");
  overlay.classList.remove("show");
  setTimeout(() => {
    state.commandPalette.open = false;
    state.commandPalette.query = "";
    state.commandPalette.activeIndex = 0;
    state.commandPalette.filteredCommands = [];
    overlay.style.display = "none";
  }, 180);
}

function getActions() {
  return {
    saveCurrentFile: saveCurrentFileFromEditor,
    openFileFlow,
    openFolderFlow,
    requestCloseCurrentTab: () => {
      if (state.activeTabIndex >= 0) requestCloseTab(state.activeTabIndex);
    },
    closeAllTabs: () => {
      while (state.tabs.length > 0) {
        const idx = 0;
        const tab = state.tabs[idx];
        if (tab?.autoSaveTimer) clearTimeout(tab.autoSaveTimer);
        if (tab?.model) tab.model.dispose?.();
        state.tabs.splice(idx, 1);
      }
      state.activeTabIndex = -1;
      showWelcome();
      syncTopbarState();
    },
    nextTab,
    prevTab,
    openSettings: () => openModal("settings"),
    toggleTheme: () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      saveSettings();
      applySettingsToUI();
      closeCommandPalette();
    },
    increaseFontSize: () => {
      state.settings.fontSize = clamp(state.settings.fontSize + 1, FONT_MIN, FONT_MAX);
      saveSettings();
      applySettingsToUI();
      closeCommandPalette();
    },
    decreaseFontSize: () => {
      state.settings.fontSize = clamp(state.settings.fontSize - 1, FONT_MIN, FONT_MAX);
      saveSettings();
      applySettingsToUI();
      closeCommandPalette();
    },
    resetFontSize: () => {
      state.settings.fontSize = DEFAULT_SETTINGS.fontSize;
      saveSettings();
      applySettingsToUI();
      closeCommandPalette();
    },
    gotoLine: () => {
      const tab = getActiveTab();
      if (!tab || !state.editor) {
        alert("No file is open");
        return;
      }
      const lineStr = prompt("Enter line number:");
      if (lineStr === null) return;
      const lineNumber = parseInt(lineStr.trim(), 10);
      if (isNaN(lineNumber) || lineNumber < 1) {
        alert("Invalid line number");
        return;
      }
      state.editor.revealLineInCenter(lineNumber);
      state.editor.setPosition({ lineNumber, column: 1 });
      state.editor.focus();
      closeCommandPalette();
    }
  };
}

function renderCommandPalette() {
  const listEl = $("commandList");
  if (!listEl) return;

  listEl.innerHTML = "";

  state.commandPalette.filteredCommands.forEach((cmd, i) => {
    const row = document.createElement("div");
    row.className = `command-palette-item${i === state.commandPalette.activeIndex ? " active" : ""}`;

    row.innerHTML = `
      <div class="command-palette-title">${cmd.title}</div>
      ${cmd.shortcut ? `<div class="command-palette-shortcut">${cmd.shortcut}</div>` : ""}
    `;

    row.addEventListener("click", () => {
      closeCommandPalette();
      if (typeof cmd.action === "function") cmd.action();
    });

    listEl.appendChild(row);
  });
}

function filterCommands(query) {
  const q = (query || "").toLowerCase().trim();
  const actions = getActions();
  const all = getCommands(actions);

  if (!q) {
    state.commandPalette.filteredCommands = all;
  } else {
    state.commandPalette.filteredCommands = all.filter(cmd =>
      cmd.title.toLowerCase().includes(q)
    );
  }

  renderCommandPalette();
}

export function registerUIButtons(actions) {
  const {
    openFolderFlow: folderFlow,
    openFileFlow: fileFlow,
    saveCurrentFile,
    refreshRecent,
    renderTabs
  } = actions;

  $("btnOpenFolder")?.addEventListener("click", folderFlow);
  $("btnOpenFile")?.addEventListener("click", fileFlow);
  $("btnSave")?.addEventListener("click", saveCurrentFile);

  $("welcomeOpenFile")?.addEventListener("click", (e) => { e.preventDefault(); fileFlow(); });
  $("welcomeOpenFolder")?.addEventListener("click", (e) => { e.preventDefault(); folderFlow(); });

  $("recentClearBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try { await window.api.recent.clear(); } catch {}
    await refreshRecent();
  });

  $("btnSettings")?.addEventListener("click", () => openModal("settings"));

  $("modalOverlay")?.addEventListener("mousedown", (e) => {
    if (e.target.id !== "modalOverlay") return;
    closeModal();
  });

  $("modalCloseBtn")?.addEventListener("click", () => closeModal());
  $("confirmCancelBtn")?.addEventListener("click", () => closeModal());

  $("confirmDontSaveBtn")?.addEventListener("click", async () => {
    closeModal();
    if (typeof onConfirmDontSaveClose === "function") await onConfirmDontSaveClose();
  });

  $("confirmSaveBtn")?.addEventListener("click", async () => {
    if (typeof onConfirmSaveClose === "function") await onConfirmSaveClose();
  });

  $("settingsTheme")?.addEventListener("change", () => applySettingsFromForm(renderTabs));
  $("settingsTabWidth")?.addEventListener("change", () => applySettingsFromForm(renderTabs));
  $("settingsAutoSave")?.addEventListener("change", () => applySettingsFromForm(renderTabs));

  $("settingsFontSize")?.addEventListener("input", () => {
    $("settingsFontSizeVal").textContent = String($("settingsFontSize").value);
    applySettingsFromForm(renderTabs);
  });

  $("settingsDoneBtn")?.addEventListener("click", () => closeModal());
  $("settingsResetBtn")?.addEventListener("click", () => resetSettings(renderTabs));

  const paletteInput = $("commandInput");
  if (paletteInput) {
    paletteInput.addEventListener("input", (e) => filterCommands(e.target.value));

    paletteInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCommandPalette();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.commandPalette.activeIndex < state.commandPalette.filteredCommands.length - 1) {
          state.commandPalette.activeIndex++;
          renderCommandPalette();
        }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.commandPalette.activeIndex > 0) {
          state.commandPalette.activeIndex--;
          renderCommandPalette();
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = state.commandPalette.filteredCommands[state.commandPalette.activeIndex];
        if (cmd && typeof cmd.action === "function") {
          closeCommandPalette();
          cmd.action();
        }
      }
    });
  }
}
