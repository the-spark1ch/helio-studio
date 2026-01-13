const state = {
  root: null,
  currentFile: null,
  editor: null,
  theme: "dark",
  dirty: false,
  fontSize: 14,
  suggest: {
    open: false,
    items: [],
    activeIndex: 0,
    replaceRange: null,
    prefix: ""
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

function setDirty(isDirty) {
  state.dirty = isDirty;
  const btnSave = $("btnSave");
  if (btnSave) btnSave.disabled = !state.currentFile || !isDirty;
}

function setCurrentFile(filePath) {
  state.currentFile = filePath || null;
  const currentFile = $("currentFile");
  if (currentFile) currentFile.textContent = filePath ? filePath : "No file opened";
  const btnSave = $("btnSave");
  if (btnSave) btnSave.disabled = !state.currentFile || !state.dirty;
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme === "light" ? "light" : "";
  if (state.editor) monaco.editor.setTheme(theme === "light" ? "vs" : "vs-dark");
}

function showWelcome() {
  const w = $("welcome");
  const e = $("editor");
  if (w) w.style.display = "flex";
  if (e) e.style.display = "none";
}

function hideWelcome() {
  const w = $("welcome");
  const e = $("editor");
  if (w) w.style.display = "none";
  if (e) e.style.display = "block";
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function updateEditorFontSize() {
  if (!state.editor) return;
  state.editor.updateOptions({ fontSize: state.fontSize });
}

function zoomInCode() {
  state.fontSize = clamp(state.fontSize + 1, FONT_MIN, FONT_MAX);
  updateEditorFontSize();
}

function zoomOutCode() {
  state.fontSize = clamp(state.fontSize - 1, FONT_MIN, FONT_MAX);
  updateEditorFontSize();
}

function resetCodeZoom() {
  state.fontSize = 14;
  updateEditorFontSize();
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
        fontSize: state.fontSize,
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

      resolve();
    });
  });
}

async function openFile(filePath) {
  if (!filePath) return;

  await initMonacoOnce();
  hideWelcome();

  const content = await window.api.readFile(filePath);
  const language = extToLanguage(filePath);

  const model = monaco.editor.createModel(content, language);

  const oldModel = state.editor.getModel();
  if (oldModel) oldModel.dispose();

  state.editor.setModel(model);
  setCurrentFile(filePath);
  setDirty(false);

  model.onDidChangeContent(() => setDirty(true));

  requestAnimationFrame(() => state.editor.layout());
}

async function saveCurrentFile() {
  if (!state.currentFile || !state.editor) return;
  await window.api.writeFile(state.currentFile, state.editor.getValue());
  setDirty(false);
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
  hideWelcome();
  await buildTree(folder);

  requestAnimationFrame(() => state.editor.layout());
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

  $("themeSelect")?.addEventListener("change", (e) => {
    applyTheme(e.target.value);
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
        if (state.editor) zoomInCode();
        return;
      }

      if (key === "-") {
        e.preventDefault();
        if (state.editor) zoomOutCode();
        return;
      }

      if (key === "0") {
        e.preventDefault();
        if (state.editor) resetCodeZoom();
        return;
      }
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  showWelcome();
  setCurrentFile(null);
  setDirty(false);
  registerButtons();
  registerShortcuts();
  applyTheme("dark");
});
