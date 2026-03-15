import {
  $,
  state,
  DEFAULT_SETTINGS,
  FONT_MIN,
  FONT_MAX,
  clamp,
  getActiveTab
} from "./state.js";

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

  $("modalOverlay").style.display = "flex";
  $("confirmPanel").style.display = kind === "confirmClose" ? "block" : "none";
  $("settingsPanel").style.display = kind === "settings" ? "block" : "none";

  if (kind === "settings") {
    $("modalTitle").textContent = "Settings";
    primeSettingsForm();
  } else if (kind === "confirmClose") {
    $("modalTitle").textContent = "Unsaved changes";
  }
}

export function closeModal() {
  state.modal.open = false;
  state.modal.kind = null;
  state.modal.pendingCloseTabIndex = null;
  $("modalOverlay").style.display = "none";
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

export function registerUIButtons(actions) {
  const {
    openFolderFlow,
    openFileFlow,
    saveCurrentFile,
    refreshRecent,
    renderTabs
  } = actions;

  $("btnOpenFolder")?.addEventListener("click", openFolderFlow);
  $("btnOpenFile")?.addEventListener("click", openFileFlow);
  $("btnSave")?.addEventListener("click", saveCurrentFile);

  $("welcomeOpenFile")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFileFlow();
  });

  $("welcomeOpenFolder")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFolderFlow();
  });

  $("recentClearBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await window.api.recent.clear();
    } catch {}
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
    if (typeof onConfirmDontSaveClose === "function") {
      await onConfirmDontSaveClose();
    }
  });

  $("confirmSaveBtn")?.addEventListener("click", async () => {
    if (typeof onConfirmSaveClose === "function") {
      await onConfirmSaveClose();
    }
  });

  $("settingsTheme")?.addEventListener("change", () => applySettingsFromForm(renderTabs));
  $("settingsTabWidth")?.addEventListener("change", () => applySettingsFromForm(renderTabs));
  $("settingsAutoSave")?.addEventListener("change", () => applySettingsFromForm(renderTabs));

  $("settingsFontSize")?.addEventListener("input", () => {
    $("settingsFontSizeVal").textContent = String($("settingsFontSize").value);
    applySettingsFromForm(renderTabs);
  });

  $("settingsDoneBtn")?.addEventListener("click", () => closeModal());

  $("settingsResetBtn")?.addEventListener("click", () => {
    resetSettings(renderTabs);
  });
}