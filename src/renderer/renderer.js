const DEFAULT_SETTINGS = {
  theme: "dark",
  tabWidth: 200,
  fontSize: 14,
  autoSaveDelay: 0
};

const state = {
  root: null,
  editor: null,
  settings: { ...DEFAULT_SETTINGS },
  tabs: [],
  activeTabIndex: -1,
  suggest: {
    open: false,
    items: [],
    activeIndex: 0,
    replaceRange: null,
    prefix: ""
  },
  modal: {
    open: false,
    kind: null,
    pendingCloseTabIndex: null
  }
};

const FONT_MIN = 10;
const FONT_MAX = 28;

const $ = (id) => document.getElementById(id);

const DICTS = {
  javascript: [
    "const",
    "let",
    "var",
    "function",
    "return",
    "export",
    "import",
    "from",
    "default",
    "class",
    "extends",
    "new",
    "try",
    "catch",
    "finally",
    "async",
    "await",
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "throw",
    "console",
    "console.log",
    "JSON.stringify",
    "JSON.parse",
    "setTimeout",
    "setInterval",
    "Promise",
    "Array",
    "Object",
    "Map",
    "Set"
  ],
  typescript: [
    "interface",
    "type",
    "implements",
    "public",
    "private",
    "protected",
    "readonly",
    "enum",
    "as",
    "unknown",
    "never",
    "any",
    "string",
    "number",
    "boolean"
  ],
  html: ["div", "span", "button", "input", "section", "header", "footer", "main", "aside", "h1", "h2", "p", "a"],
  css: ["display", "flex", "grid", "position", "absolute", "relative", "border", "padding", "margin", "color", "background"],
  python: ["def", "class", "return", "import", "from", "as", "if", "elif", "else", "for", "while", "try", "except", "with"]
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fileBaseName(p) {
  if (!p) return "";
  const s = p.replace(/\\/g, "/");
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}

function extToLanguage(filePath) {
  const lower = (filePath || "").toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    less: "css",
    md: "markdown",
    py: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    php: "php",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    sql: "sql",
    txt: "plaintext"
  };
  return map[ext] || "plaintext";
}

function loadSettings() {
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

function saveSettings() {
  localStorage.setItem("helio.settings", JSON.stringify(state.settings));
}

function applySettingsToUI() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "";
  document.documentElement.style.setProperty("--tab-width", `${state.settings.tabWidth}px`);

  if (state.editor) {
    monaco.editor.setTheme(state.settings.theme === "light" ? "vs" : "vs-dark");
    state.editor.updateOptions({ fontSize: state.settings.fontSize });
  }

  syncTopbarState();
}

function showWelcome() {
  const w = $("welcome");
  const e = $("editor");
  const t = $("tabs");
  if (w) w.style.display = "flex";
  if (e) e.style.display = "none";
  if (t) t.style.display = "none";
}

function hideWelcomeShowEditor() {
  const w = $("welcome");
  const e = $("editor");
  const t = $("tabs");
  if (w) w.style.display = "none";
  if (e) e.style.display = "block";
  if (t) t.style.display = "flex";
}

function getActiveTab() {
  if (state.activeTabIndex < 0) return null;
  return state.tabs[state.activeTabIndex] || null;
}

function syncTopbarState() {
  const tab = getActiveTab();
  const currentFile = $("currentFile");
  if (currentFile) currentFile.textContent = tab?.path ? tab.path : "No file opened";

  const btnSave = $("btnSave");
  if (btnSave) btnSave.disabled = !(tab?.path && tab?.dirty);
}

function openModal(kind) {
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

function closeModal() {
  state.modal.open = false;
  state.modal.kind = null;
  state.modal.pendingCloseTabIndex = null;
  $("modalOverlay").style.display = "none";
}

function isModalOpen() {
  return !!state.modal.open;
}

function scrollTabIntoView(index) {
  const tabsEl = $("tabs");
  if (!tabsEl) return;
  const tabEl = tabsEl.children[index];
  if (!tabEl) return;
  tabEl.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
}

function renderTabs() {
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
        return;
      }
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      activateTab(idx);
    });

    tabsEl.appendChild(el);
  });

  if (state.tabs.length > 0) hideWelcomeShowEditor();
  syncTopbarState();

  if (state.activeTabIndex >= 0) scrollTabIntoView(state.activeTabIndex);
}

function markTabDirty(tab, isDirty) {
  tab.dirty = !!isDirty;
  if (tab === getActiveTab()) syncTopbarState();
  renderTabs();
}

function scheduleAutoSave(tab) {
  const delay = state.settings.autoSaveDelay;
  if (!delay || delay <= 0) return;

  if (tab.autoSaveTimer) clearTimeout(tab.autoSaveTimer);

  tab.autoSaveTimer = setTimeout(async () => {
    tab.autoSaveTimer = null;
    if (!tab.dirty) return;
    try {
      await saveTab(tab);
    } catch {}
  }, delay);
}

let suggestTimer = null;

function scheduleSuggest() {
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => showSuggestNow(false), 60);
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

  if (top < viewTop) box.scrollTop = top;
  else if (bottom > viewBottom) box.scrollTop = bottom - box.clientHeight;
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

function showSuggestNow(force) {
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

function hideSuggest() {
  const box = $("customSuggest");
  if (box) box.style.display = "none";
  state.suggest.open = false;
  state.suggest.items = [];
  state.suggest.activeIndex = 0;
  state.suggest.replaceRange = null;
  state.suggest.prefix = "";
}

function acceptSuggest() {
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

function selectNext() {
  const n = state.suggest.items.length;
  if (n <= 0) return;
  state.suggest.activeIndex = (state.suggest.activeIndex + 1) % n;
  renderSuggest();
  ensureActiveVisible();
}

function selectPrev() {
  const n = state.suggest.items.length;
  if (n <= 0) return;
  state.suggest.activeIndex = (state.suggest.activeIndex - 1 + n) % n;
  renderSuggest();
  ensureActiveVisible();
}

function initMonacoOnce() {
  if (state.editor) return Promise.resolve();

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

      editor.onDidChangeModelContent(() => scheduleSuggest());
      editor.onDidChangeCursorPosition(() => scheduleSuggest());
      editor.onDidBlurEditorWidget(() => hideSuggest());

      editor.onKeyDown((ev) => {
        if (!state.suggest.open) return;

        const kc = ev.keyCode;

        if (kc === monaco.KeyCode.DownArrow) {
          ev.preventDefault();
          ev.stopPropagation();
          selectNext();
          return;
        }

        if (kc === monaco.KeyCode.UpArrow) {
          ev.preventDefault();
          ev.stopPropagation();
          selectPrev();
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
          return;
        }
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        showSuggestNow(true);
      });

      applySettingsToUI();
      resolve();
    });
  });
}

function activateTab(index) {
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
  state.editor.setModel(tab.model);

  if (tab.viewState) {
    try {
      state.editor.restoreViewState(tab.viewState);
    } catch {}
  }

  state.editor.focus();
  syncTopbarState();
  renderTabs();
  requestAnimationFrame(() => state.editor.layout());
}

function closeTabNow(index) {
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
    return;
  }

  if (wasActive) {
    const nextIndex = Math.min(index, state.tabs.length - 1);
    state.activeTabIndex = -1;
    activateTab(nextIndex);
  } else {
    if (index < state.activeTabIndex) state.activeTabIndex -= 1;
    renderTabs();
  }
}

async function saveTab(tab) {
  await window.api.writeFile(tab.path, tab.model.getValue());
  tab.dirty = false;
  markTabDirty(tab, false);
}

function requestCloseTab(index) {
  const tab = state.tabs[index];
  if (!tab) return;

  if (!tab.dirty) {
    closeTabNow(index);
    return;
  }

  state.modal.pendingCloseTabIndex = index;
  $("confirmText").textContent = "This file has unsaved changes.";
  $("confirmSubText").textContent = fileBaseName(tab.path) + " — " + tab.path;
  openModal("confirmClose");
}

function nextTab() {
  if (state.tabs.length <= 1) return;
  const next = (state.activeTabIndex + 1) % state.tabs.length;
  activateTab(next);
}

function prevTab() {
  if (state.tabs.length <= 1) return;
  const prev = (state.activeTabIndex - 1 + state.tabs.length) % state.tabs.length;
  activateTab(prev);
}

async function openFile(filePath) {
  if (!filePath) return;

  await initMonacoOnce();
  hideWelcomeShowEditor();

  const existingIndex = state.tabs.findIndex((t) => t.path === filePath);
  if (existingIndex >= 0) {
    activateTab(existingIndex);
    return;
  }

  const content = await window.api.readFile(filePath);
  const language = extToLanguage(filePath);

  const model = monaco.editor.createModel(content, language);

  const tab = {
    path: filePath,
    model,
    dirty: false,
    viewState: null,
    autoSaveTimer: null
  };

  model.onDidChangeContent(() => {
    if (!tab.dirty) {
      tab.dirty = true;
      markTabDirty(tab, true);
    } else {
      if (tab === getActiveTab()) syncTopbarState();
    }
    scheduleAutoSave(tab);
  });

  state.tabs.push(tab);

  renderTabs();
  activateTab(state.tabs.length - 1);
  requestAnimationFrame(() => state.editor.layout());
}

async function saveCurrentFile() {
  const tab = getActiveTab();
  if (!tab || !state.editor) return;
  await saveTab(tab);
  syncTopbarState();
}

async function openFileFlow() {
  const file = await window.api.openFile();
  if (!file) return;
  await openFile(file);
}

function clearTree() {
  const tree = $("tree");
  if (tree) tree.innerHTML = "";
}

function setRootPathLabel(p) {
  const el = $("rootPath");
  if (el) el.textContent = p || "No folder selected";
}

function makeTreeRow({ icon, name, indentPx = 0 }) {
  const row = document.createElement("div");
  row.className = "tree-item";
  row.style.paddingLeft = `${8 + indentPx}px`;
  row.innerHTML = `<span class="icon">${icon}</span><span class="name"></span>`;
  row.querySelector(".name").textContent = name;
  return row;
}

async function buildTree(rootPath) {
  clearTree();
  setRootPathLabel(rootPath);

  const tree = $("tree");
  if (!tree) return;

  async function addDir(dirPath, depth) {
    const entries = await window.api.listDir(dirPath);

    for (const e of entries) {
      if (e.type === "dir") {
        const row = makeTreeRow({ icon: "📁", name: e.name, indentPx: depth * 14 });
        tree.appendChild(row);

        let expanded = false;
        const marker = document.createElement("span");
        marker.textContent = " ▸";
        marker.style.color = "var(--muted)";
        marker.style.marginLeft = "6px";
        row.appendChild(marker);

        const childrenContainer = document.createElement("div");
        childrenContainer.style.display = "none";
        tree.appendChild(childrenContainer);

        row.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          expanded = !expanded;
          childrenContainer.style.display = expanded ? "block" : "none";
          marker.textContent = expanded ? " ▾" : " ▸";

          if (expanded && childrenContainer.childElementCount === 0) {
            const savedAppend = tree.appendChild.bind(tree);
            tree.appendChild = childrenContainer.appendChild.bind(childrenContainer);
            try {
              await addDir(e.path, depth + 1);
            } finally {
              tree.appendChild = savedAppend;
            }
          }
        });
      } else {
        const row = makeTreeRow({ icon: "📄", name: e.name, indentPx: depth * 14 });
        row.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          await openFile(e.path);
        });
        tree.appendChild(row);
      }
    }
  }

  await addDir(rootPath, 0);
}

async function openFolderFlow() {
  const folder = await window.api.openFolder();
  if (!folder) return;

  state.root = folder;
  await initMonacoOnce();
  hideWelcomeShowEditor();
  await buildTree(folder);

  requestAnimationFrame(() => state.editor.layout());
}

function primeSettingsForm() {
  $("settingsTheme").value = state.settings.theme;
  $("settingsTabWidth").value = String(state.settings.tabWidth);
  $("settingsFontSize").value = String(state.settings.fontSize);
  $("settingsFontSizeVal").textContent = String(state.settings.fontSize);
  $("settingsAutoSave").value = String(state.settings.autoSaveDelay);
}

function applySettingsFromForm() {
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
  renderTabs();
}

function registerButtons() {
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

  $("btnSettings")?.addEventListener("click", () => openModal("settings"));

  $("modalOverlay")?.addEventListener("mousedown", (e) => {
    if (e.target.id !== "modalOverlay") return;
    closeModal();
  });

  $("modalCloseBtn")?.addEventListener("click", () => closeModal());

  $("confirmCancelBtn")?.addEventListener("click", () => closeModal());
  $("confirmDontSaveBtn")?.addEventListener("click", () => {
    const idx = state.modal.pendingCloseTabIndex;
    closeModal();
    if (typeof idx === "number") closeTabNow(idx);
  });
  $("confirmSaveBtn")?.addEventListener("click", async () => {
    const idx = state.modal.pendingCloseTabIndex;
    if (typeof idx !== "number") {
      closeModal();
      return;
    }
    const tab = state.tabs[idx];
    if (!tab) {
      closeModal();
      return;
    }

    try {
      await saveTab(tab);
      closeModal();
      closeTabNow(idx);
    } catch {}
  });

  $("settingsTheme")?.addEventListener("change", applySettingsFromForm);
  $("settingsTabWidth")?.addEventListener("change", applySettingsFromForm);
  $("settingsAutoSave")?.addEventListener("change", applySettingsFromForm);
  $("settingsFontSize")?.addEventListener("input", () => {
    $("settingsFontSizeVal").textContent = String($("settingsFontSize").value);
    applySettingsFromForm();
  });

  $("settingsDoneBtn")?.addEventListener("click", () => closeModal());
  $("settingsResetBtn")?.addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applySettingsToUI();
    primeSettingsForm();
    renderTabs();
  });
}

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
      if (state.activeTabIndex >= 0) requestCloseTab(state.activeTabIndex);
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
        return;
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

window.addEventListener("DOMContentLoaded", () => {
  state.settings = loadSettings();
  applySettingsToUI();

  showWelcome();
  syncTopbarState();

  registerButtons();
  registerShortcuts();

  document.documentElement.style.setProperty("--tab-width", `${state.settings.tabWidth}px`);
});
