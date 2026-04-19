import {
  $,
  state,
  getActiveTab
} from "./state.js";

let initialized = false;
let lastTarget = null;

function isTextControl(target) {
  return !!target?.closest?.("input, textarea, [contenteditable='true']");
}

function getTextControl(target) {
  return target?.closest?.("input, textarea, [contenteditable='true']") || null;
}

function isEditorTarget(target) {
  return !!target?.closest?.(".monaco-editor");
}

function hasActiveEditor() {
  return !!state.editor?.getModel?.();
}

function getSelectedEditorText() {
  const editor = state.editor;
  const model = editor?.getModel?.();
  const selection = editor?.getSelection?.();
  if (!editor || !model || !selection || selection.isEmpty()) return "";
  return model.getValueInRange(selection);
}

async function writeClipboard(text) {
  try {
    await window.api?.clipboard?.writeText?.(text || "");
  } catch {}
}

async function readClipboard() {
  try {
    return await window.api?.clipboard?.readText?.();
  } catch {
    return "";
  }
}

function replaceTextControlSelection(control, text) {
  if (!control) return;

  if (typeof control.selectionStart !== "number" || typeof control.selectionEnd !== "number") {
    return;
  }

  const start = control.selectionStart;
  const end = control.selectionEnd;
  const value = control.value || "";

  control.value = value.slice(0, start) + text + value.slice(end);
  control.selectionStart = start + text.length;
  control.selectionEnd = start + text.length;
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function getTextControlSelection(control) {
  if (!control) return "";
  if (typeof control.selectionStart !== "number" || typeof control.selectionEnd !== "number") return "";
  return (control.value || "").slice(control.selectionStart, control.selectionEnd);
}

async function cutTextControl(control) {
  const selected = getTextControlSelection(control);
  if (!selected) return;
  await writeClipboard(selected);
  replaceTextControlSelection(control, "");
}

async function copyTextControl(control) {
  await writeClipboard(getTextControlSelection(control));
}

async function pasteTextControl(control) {
  replaceTextControlSelection(control, await readClipboard());
}

function selectAllTextControl(control) {
  control?.focus?.();
  control?.select?.();
}

function runEditorCommand(command) {
  const editor = state.editor;
  if (!editor) return;

  editor.focus();
  editor.trigger("customContextMenu", command, null);
}

async function cutEditorSelection() {
  const editor = state.editor;
  const selection = editor?.getSelection?.();
  if (!editor || !selection || selection.isEmpty()) return;

  await writeClipboard(getSelectedEditorText());
  editor.pushUndoStop();
  editor.executeEdits("customContextMenu", [{ range: selection, text: "" }]);
  editor.pushUndoStop();
  editor.focus();
}

async function copyEditorSelection() {
  await writeClipboard(getSelectedEditorText());
  state.editor?.focus?.();
}

async function pasteIntoEditor() {
  const editor = state.editor;
  const selection = editor?.getSelection?.();
  if (!editor || !selection) return;

  const text = await readClipboard();
  editor.pushUndoStop();
  editor.executeEdits("customContextMenu", [{ range: selection, text }]);
  editor.pushUndoStop();
  editor.focus();
}

function selectAllEditor() {
  const editor = state.editor;
  const model = editor?.getModel?.();
  if (!editor || !model) return;

  editor.setSelection(model.getFullModelRange());
  editor.focus();
}

function createItem({ label, shortcut, disabled, action }) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "context-menu-item";
  item.disabled = !!disabled;

  const title = document.createElement("span");
  title.textContent = label;
  item.appendChild(title);

  if (shortcut) {
    const key = document.createElement("span");
    key.className = "context-menu-shortcut";
    key.textContent = shortcut;
    item.appendChild(key);
  }

  item.addEventListener("click", async () => {
    hideContextMenu();
    if (!disabled && typeof action === "function") {
      await action();
    }
  });

  return item;
}

function createSeparator() {
  const sep = document.createElement("div");
  sep.className = "context-menu-separator";
  return sep;
}

function getMenuItems(actions) {
  const target = lastTarget;
  const textControl = getTextControl(target);
  const inTextControl = !!textControl;
  const inEditor = isEditorTarget(target);
  const editorAvailable = hasActiveEditor();
  const tab = getActiveTab();

  if (inTextControl) {
    return [
      createItem({ label: "Cut", shortcut: "Ctrl+X", action: () => cutTextControl(textControl) }),
      createItem({ label: "Copy", shortcut: "Ctrl+C", action: () => copyTextControl(textControl) }),
      createItem({ label: "Paste", shortcut: "Ctrl+V", action: () => pasteTextControl(textControl) }),
      createSeparator(),
      createItem({ label: "Select All", shortcut: "Ctrl+A", action: () => selectAllTextControl(textControl) })
    ];
  }

  if (inEditor && editorAvailable) {
    return [
      createItem({ label: "Undo", shortcut: "Ctrl+Z", action: () => runEditorCommand("undo") }),
      createItem({ label: "Redo", shortcut: "Ctrl+Y", action: () => runEditorCommand("redo") }),
      createSeparator(),
      createItem({ label: "Cut", shortcut: "Ctrl+X", action: cutEditorSelection }),
      createItem({ label: "Copy", shortcut: "Ctrl+C", action: copyEditorSelection }),
      createItem({ label: "Paste", shortcut: "Ctrl+V", action: pasteIntoEditor }),
      createSeparator(),
      createItem({ label: "Find in File", shortcut: "Ctrl+F", action: actions.openFindPanel }),
      createItem({ label: "Select All", shortcut: "Ctrl+A", action: selectAllEditor }),
      createSeparator(),
      createItem({ label: "Save", shortcut: "Ctrl+S", disabled: !tab?.dirty, action: actions.saveCurrentFile })
    ];
  }

  return [
    createItem({ label: "Save", shortcut: "Ctrl+S", disabled: !tab?.dirty, action: actions.saveCurrentFile }),
    createItem({ label: "Find in File", shortcut: "Ctrl+F", disabled: !editorAvailable, action: actions.openFindPanel }),
    createSeparator(),
    createItem({ label: "Toggle Terminal", shortcut: "Ctrl+`", action: actions.toggleTerminal }),
    createItem({ label: "Command Palette", shortcut: "Ctrl+P", action: actions.openCommandPalette })
  ];
}

function positionMenu(menu, x, y) {
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.display = "block";

  const rect = menu.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(x, window.innerWidth - rect.width - margin);
  const top = Math.min(y, window.innerHeight - rect.height - margin);

  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function showContextMenu(event, actions) {
  const menu = $("customContextMenu");
  if (!menu) return;

  lastTarget = event.target;
  menu.innerHTML = "";

  for (const item of getMenuItems(actions)) {
    menu.appendChild(item);
  }

  positionMenu(menu, event.clientX, event.clientY);
}

export function hideContextMenu() {
  const menu = $("customContextMenu");
  if (!menu) return;
  menu.style.display = "none";
}

export function initCustomContextMenu(actions) {
  if (initialized) return;
  initialized = true;

  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event, actions);
  }, true);

  window.addEventListener("mousedown", (event) => {
    const menu = $("customContextMenu");
    if (!menu || menu.style.display === "none") return;
    if (menu.contains(event.target)) return;
    hideContextMenu();
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideContextMenu();
    }
  }, true);

  window.addEventListener("blur", () => hideContextMenu());
  window.addEventListener("resize", () => hideContextMenu());
  window.addEventListener("scroll", () => hideContextMenu(), true);
}
