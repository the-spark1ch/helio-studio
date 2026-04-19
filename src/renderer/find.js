import {
  $,
  state
} from "./state.js";

let initialized = false;
let open = false;
let query = "";
let matches = [];
let activeIndex = -1;
let decorations = [];

function getEditor() {
  return state.editor || null;
}

function getModel() {
  return getEditor()?.getModel?.() || null;
}

function setPanelVisible(isVisible) {
  const panel = $("findPanel");
  if (!panel) return;
  panel.style.display = isVisible ? "flex" : "none";
}

function setCount() {
  const count = $("findCount");
  if (!count) return;

  if (!query) {
    count.textContent = "0/0";
    return;
  }

  count.textContent = matches.length ? `${activeIndex + 1}/${matches.length}` : "0/0";
}

function clearDecorations() {
  const editor = getEditor();
  if (!editor) {
    decorations = [];
    return;
  }

  decorations = editor.deltaDecorations(decorations, []);
}

function applyDecorations() {
  const editor = getEditor();
  if (!editor) return;

  const next = matches.map((match, index) => ({
    range: match.range,
    options: {
      className: index === activeIndex ? "custom-find-match-current" : "custom-find-match",
      stickiness: 1
    }
  }));

  decorations = editor.deltaDecorations(decorations, next);
}

function revealActiveMatch() {
  const editor = getEditor();
  const active = matches[activeIndex];
  if (!editor || !active) return;

  editor.setSelection(active.range);
  editor.revealRangeInCenter(active.range);
}

function selectedTextForSearch() {
  const editor = getEditor();
  const model = getModel();
  if (!editor || !model) return "";

  const selection = editor.getSelection();
  if (!selection || selection.isEmpty()) return "";
  if (selection.startLineNumber !== selection.endLineNumber) return "";

  const value = model.getValueInRange(selection);
  return value.length <= 120 ? value : "";
}

function updateMatches({ preserveActive = false } = {}) {
  const model = getModel();
  query = $("findInput")?.value || "";

  if (!model || !query) {
    matches = [];
    activeIndex = -1;
    clearDecorations();
    setCount();
    return;
  }

  matches = model.findMatches(query, false, false, false, null, false, 2000);

  if (!matches.length) {
    activeIndex = -1;
    clearDecorations();
    setCount();
    return;
  }

  if (!preserveActive || activeIndex < 0 || activeIndex >= matches.length) {
    activeIndex = 0;
  }

  applyDecorations();
  setCount();
}

export function isFindPanelOpen() {
  return open;
}

export function closeFindPanel() {
  open = false;
  setPanelVisible(false);
  clearDecorations();
  matches = [];
  activeIndex = -1;
  query = "";
  getEditor()?.focus?.();
}

export function openFindPanel() {
  if (!getEditor() || !getModel()) return;

  open = true;
  setPanelVisible(true);

  const input = $("findInput");
  if (!input) return;

  const selectedText = selectedTextForSearch();
  if (selectedText) {
    input.value = selectedText;
  }

  updateMatches();

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

export function findNext() {
  if (!matches.length) return;
  activeIndex = (activeIndex + 1) % matches.length;
  applyDecorations();
  setCount();
  revealActiveMatch();
}

export function findPrev() {
  if (!matches.length) return;
  activeIndex = (activeIndex - 1 + matches.length) % matches.length;
  applyDecorations();
  setCount();
  revealActiveMatch();
}

export function refreshFindMatches() {
  if (!open) return;
  updateMatches({ preserveActive: true });
}

export function initFindPanel() {
  if (initialized) return;
  initialized = true;

  $("findInput")?.addEventListener("input", () => {
    updateMatches();
  });

  $("findInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFindPanel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) findPrev();
      else findNext();
    }
  });

  $("findPrevBtn")?.addEventListener("click", () => findPrev());
  $("findNextBtn")?.addEventListener("click", () => findNext());
  $("findCloseBtn")?.addEventListener("click", () => closeFindPanel());
}
