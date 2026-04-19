import {
  $,
  state,
  DICTS,
  fileBaseName,
  getActiveTab
} from "./state.js";

import {
  hideWelcomeShowEditor,
  showWelcome,
  syncTopbarState,
  syncEditorStatus,
  openModal
} from "./ui.js";

import {
  saveSessionSoon
} from "./session.js";

import {
  closeFindPanel,
  openFindPanel,
  refreshFindMatches
} from "./find.js";

let suggestTimer = null;

export function scrollTabIntoView(index) {
  const tabsEl = $("tabs");
  if (!tabsEl) return;

  const tabEl = tabsEl.children[index];
  if (!tabEl) return;

  tabEl.scrollIntoView({
    behavior: "smooth",
    inline: "nearest",
    block: "nearest"
  });
}

export function renderTabs() {
  const tabsEl = $("tabs");
  if (!tabsEl) return;

  tabsEl.innerHTML = "";

  state.tabs.forEach((tab, idx) => {
    const el = document.createElement("div");
    el.className = "tab" + (idx === state.activeTabIndex ? " active" : "");
    el.title = tab.path;

    const left = document.createElement("div");
    left.className = "tab-left";

    const title = document.createElement("div");
    title.className = "tab-title";
    title.textContent = fileBaseName(tab.path);

    left.appendChild(title);

    if (tab.dirty) {
      const dirty = document.createElement("span");
      dirty.className = "tab-dirty";
      dirty.textContent = "•";
      left.appendChild(dirty);
    }

    el.appendChild(left);

    const close = document.createElement("span");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close (Ctrl+W)";

    close.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestCloseTab(idx);
    });

    el.appendChild(close);

    el.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        requestCloseTab(idx);
      }
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      activateTab(idx);
    });

    tabsEl.appendChild(el);
  });

  if (state.tabs.length > 0) {
    hideWelcomeShowEditor();
  }

  syncTopbarState();

  if (state.activeTabIndex >= 0) {
    scrollTabIntoView(state.activeTabIndex);
  }
}

export function markTabDirty(tab, isDirty) {
  tab.dirty = !!isDirty;

  if (isDirty) {
    tab.saveError = null;
  }

  if (tab === getActiveTab()) {
    syncTopbarState();
  }

  renderTabs();
}

export function scheduleAutoSave(tab) {
  const delay = state.settings.autoSaveDelay;
  if (!delay || delay <= 0) return;

  if (tab.autoSaveTimer) {
    clearTimeout(tab.autoSaveTimer);
  }

  tab.autoSaveTimer = setTimeout(async () => {
    tab.autoSaveTimer = null;
    if (!tab.dirty) return;

    try {
      await saveTab(tab);
    } catch (error) {
      console.error("Auto save failed", error);
    }
  }, delay);
}

export function scheduleSuggest() {
  if (suggestTimer) {
    clearTimeout(suggestTimer);
  }

  suggestTimer = setTimeout(() => {
    showSuggestNow(false);
  }, 60);
}

function getDocumentWords(model) {
  const text = model.getValue();
  const words = new Set();
  const re = /[A-Za-z_]\w{2,}/g;

  let m;
  while ((m = re.exec(text))) {
    words.add(m[0]);
    if (words.size > 4000) break;
  }

  return words;
}

function getLangDict(lang) {
  const base = new Set();

  for (const w of DICTS.javascript || []) base.add(w);
  for (const w of DICTS[lang] || []) base.add(w);

  return base;
}

function computeSuggestions() {
  const editor = state.editor;
  if (!editor) return { items: [], range: null, prefix: "" };

  const model = editor.getModel();
  if (!model) return { items: [], range: null, prefix: "" };

  const pos = editor.getPosition();
  if (!pos) return { items: [], range: null, prefix: "" };

  const word = model.getWordUntilPosition(pos);
  const prefix = (word?.word || "").trim();
  if (!prefix) return { items: [], range: null, prefix: "" };

  const lang = model.getLanguageId();
  const dict = getLangDict(lang);
  const docWords = getDocumentWords(model);

  const candidates = new Set();
  for (const w of dict) candidates.add(w);
  for (const w of docWords) candidates.add(w);

  const low = prefix.toLowerCase();
  const scored = [];

  for (const w of candidates) {
    if (!w) continue;

    const lw = w.toLowerCase();
    if (lw === low) continue;
    if (!lw.startsWith(low)) continue;

    let score = 0;
    score += Math.max(0, 200 - w.length);
    if (w.includes(".")) score += 10;

    scored.push({ text: w, score });
  }

  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

  const items = scored.slice(0, 40).map((x) => x.text);
  const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, pos.column);

  return { items, range, prefix };
}

function placeSuggest() {
  const editor = state.editor;
  const box = $("customSuggest");
  if (!editor || !box) return;

  const pos = editor.getPosition();
  const p = editor.getScrolledVisiblePosition(pos);
  const domNode = editor.getDomNode();
  if (!p || !domNode) return;

  const rect = domNode.getBoundingClientRect();
  const wrapRect = $("editorWrap").getBoundingClientRect();

  const left = rect.left - wrapRect.left + p.left;
  const top = rect.top - wrapRect.top + p.top + p.height + 6;

  box.style.left = `${Math.max(8, left)}px`;
  box.style.top = `${Math.max(8, top)}px`;
}

function ensureActiveVisible() {
  const box = $("customSuggest");
  if (!box || box.style.display === "none") return;

  const idx = state.suggest.activeIndex;
  const el = box.children[idx];
  if (!el) return;

  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;

  const viewTop = box.scrollTop;
  const viewBottom = viewTop + box.clientHeight;

  if (top < viewTop) {
    box.scrollTop = top;
  } else if (bottom > viewBottom) {
    box.scrollTop = bottom - box.clientHeight;
  }
}

function renderSuggest() {
  const box = $("customSuggest");
  if (!box) return;

  box.innerHTML = "";

  const items = state.suggest.items;
  if (!items.length) return;

  items.forEach((text, i) => {
    const row = document.createElement("div");
    row.className = "custom-suggest-item" + (i === state.suggest.activeIndex ? " active" : "");

    const left = document.createElement("div");
    left.className = "custom-suggest-left";
    left.textContent = text;

    const right = document.createElement("div");
    right.className = "custom-suggest-right";
    right.textContent = i === 0 ? "Enter" : "";

    row.appendChild(left);
    row.appendChild(right);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      state.suggest.activeIndex = i;
      renderSuggest();
      ensureActiveVisible();
      acceptSuggest();
    });

    box.appendChild(row);
  });
}

export function showSuggestNow(force) {
  const editor = state.editor;
  const box = $("customSuggest");
  if (!editor || !box) return;

  const { items, range, prefix } = computeSuggestions();

  if (!force && items.length === 0) {
    hideSuggest();
    return;
  }

  if (items.length === 0) {
    hideSuggest();
    return;
  }

  state.suggest.open = true;
  state.suggest.items = items;
  state.suggest.activeIndex = 0;
  state.suggest.replaceRange = range;
  state.suggest.prefix = prefix;

  box.style.display = "block";
  renderSuggest();
  placeSuggest();
  ensureActiveVisible();
}

export function hideSuggest() {
  const box = $("customSuggest");
  if (box) box.style.display = "none";

  state.suggest.open = false;
  state.suggest.items = [];
  state.suggest.activeIndex = 0;
  state.suggest.replaceRange = null;
  state.suggest.prefix = "";
}

export function acceptSuggest() {
  const editor = state.editor;
  if (!editor) return;
  if (!state.suggest.open) return;
  if (!state.suggest.items.length) return;

  const text = state.suggest.items[state.suggest.activeIndex] || state.suggest.items[0];
  const range = state.suggest.replaceRange;
  if (!range) return;

  editor.executeEdits("customSuggest", [{ range, text }]);
  editor.focus();
  hideSuggest();
}

export function selectNextSuggest() {
  const n = state.suggest.items.length;
  if (n <= 0) return;

  state.suggest.activeIndex = (state.suggest.activeIndex + 1) % n;
  renderSuggest();
  ensureActiveVisible();
}

export function selectPrevSuggest() {
  const n = state.suggest.items.length;
  if (n <= 0) return;

  state.suggest.activeIndex = (state.suggest.activeIndex - 1 + n) % n;
  renderSuggest();
  ensureActiveVisible();
}

export function initMonacoOnce() {
  if (state.editor) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.require.config({ paths: { vs: "./monaco/vs" } });

    window.require(["vs/editor/editor.main"], () => {
      const editorEl = $("editor");

      const editor = monaco.editor.create(editorEl, {
        value: "",
        language: "plaintext",
        theme: "vs-dark",
        automaticLayout: true,
        lineNumbers: "on",
        minimap: { enabled: true },
        roundedSelection: true,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        scrollBeyondLastLine: false,
        contextmenu: false,
        fontFamily:
          "Inter, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: state.settings.fontSize,
        fontLigatures: false,
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        parameterHints: { enabled: false },
        inlineSuggest: { enabled: false },
        tabCompletion: "off",
        acceptSuggestionOnEnter: "off",
        wordBasedSuggestions: "off"
      });

      state.editor = editor;

      editor.onDidChangeModelContent(() => {
        scheduleSuggest();
        syncEditorStatus();
        refreshFindMatches();
      });
      editor.onDidChangeCursorPosition(() => {
        scheduleSuggest();
        syncEditorStatus();
      });
      editor.onDidBlurEditorWidget(() => hideSuggest());

      editor.onKeyDown((ev) => {
        if (!state.suggest.open) return;

        const kc = ev.keyCode;

        if (kc === monaco.KeyCode.DownArrow) {
          ev.preventDefault();
          ev.stopPropagation();
          selectNextSuggest();
          return;
        }

        if (kc === monaco.KeyCode.UpArrow) {
          ev.preventDefault();
          ev.stopPropagation();
          selectPrevSuggest();
          return;
        }

        if (kc === monaco.KeyCode.Enter) {
          ev.preventDefault();
          ev.stopPropagation();
          acceptSuggest();
          return;
        }

        if (kc === monaco.KeyCode.Escape) {
          ev.preventDefault();
          ev.stopPropagation();
          hideSuggest();
        }
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        showSuggestNow(true);
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
        openFindPanel();
      });

      syncEditorStatus();
      resolve();
    });
  });
}

export function activateTab(index) {
  if (!state.editor) return;
  if (index < 0 || index >= state.tabs.length) return;
  if (index === state.activeTabIndex) return;

  const current = getActiveTab();
  if (current) {
    try {
      current.viewState = state.editor.saveViewState();
    } catch {}
  }

  state.activeTabIndex = index;

  const tab = getActiveTab();
  if (!tab) {
    syncTopbarState();
    renderTabs();
    return;
  }

  hideSuggest();
  closeFindPanel();
  state.editor.setModel(tab.model);

  if (tab.viewState) {
    try {
      state.editor.restoreViewState(tab.viewState);
    } catch {}
  }

  state.editor.focus();
  syncTopbarState();
  renderTabs();
  saveSessionSoon();

  requestAnimationFrame(() => {
    state.editor.layout();
  });
}

export function closeTabNow(index) {
  if (index < 0 || index >= state.tabs.length) return;

  const wasActive = index === state.activeTabIndex;
  const tab = state.tabs[index];

  try {
    if (tab.autoSaveTimer) clearTimeout(tab.autoSaveTimer);
    tab.autoSaveTimer = null;
  } catch {}

  try {
    tab.model?.dispose?.();
  } catch {}

  state.tabs.splice(index, 1);

  if (state.tabs.length === 0) {
    state.activeTabIndex = -1;
    showWelcome();
    syncTopbarState();
    renderTabs();
    saveSessionSoon();
    return;
  }

  if (wasActive) {
    const nextIndex = Math.min(index, state.tabs.length - 1);
    state.activeTabIndex = -1;
    activateTab(nextIndex);
  } else {
    if (index < state.activeTabIndex) {
      state.activeTabIndex -= 1;
    }
    renderTabs();
    saveSessionSoon();
  }
}

export async function saveTab(tab) {
  try {
    await window.api.writeFile(tab.path, tab.model.getValue());
    tab.saveError = null;
    tab.dirty = false;
    markTabDirty(tab, false);
  } catch (error) {
    tab.saveError = error?.message || "Unknown error";
    syncTopbarState();
    console.error("Save failed", error);
    throw error;
  }
}

export function requestCloseTab(index) {
  const tab = state.tabs[index];
  if (!tab) return;

  if (!tab.dirty) {
    closeTabNow(index);
    return;
  }

  state.modal.pendingCloseTabIndex = index;
  $("confirmText").textContent = "This file has unsaved changes.";
  $("confirmSubText").textContent = `${fileBaseName(tab.path)} — ${tab.path}`;
  openModal("confirmClose");
}

export function nextTab() {
  if (state.tabs.length <= 1) return;
  const next = (state.activeTabIndex + 1) % state.tabs.length;
  activateTab(next);
}

export function prevTab() {
  if (state.tabs.length <= 1) return;
  const prev = (state.activeTabIndex - 1 + state.tabs.length) % state.tabs.length;
  activateTab(prev);
}

export async function saveCurrentFile() {
  const tab = getActiveTab();
  if (!tab || !state.editor) return;

  try {
    await saveTab(tab);
    syncTopbarState();
  } catch {}
}
