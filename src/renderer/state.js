export const DEFAULT_SETTINGS = {
  theme: "dark",
  tabWidth: 200,
  fontSize: 14,
  autoSaveDelay: 0
};

export const FONT_MIN = 10;
export const FONT_MAX = 28;
export const RECENTS_UI_LIMIT = 3;

export const DICTS = {
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

export const state = {
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
  },
  recent: {
    items: []
  }
};

export function $(id) {
  return document.getElementById(id);
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function fileBaseName(p) {
  if (!p) return "";
  const s = p.replace(/\\/g, "/");
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}

export function extToLanguage(filePath) {
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

export function getActiveTab() {
  if (state.activeTabIndex < 0) return null;
  return state.tabs[state.activeTabIndex] || null;
}