import {
  $,
  state,
  RECENTS_UI_LIMIT,
  fileBaseName,
  extToLanguage
} from "./state.js";

import {
  hideWelcomeShowEditor
} from "./ui.js";

import {
  initMonacoOnce,
  renderTabs,
  activateTab,
  markTabDirty,
  scheduleAutoSave,
  saveTab
} from "./editor.js";

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

  async function addDir(dirPath, depth, container) {
    const entries = await window.api.listDir(dirPath);

    for (const e of entries) {
      if (e.type === "dir") {
        const row = makeTreeRow({ icon: "📁", name: e.name, indentPx: depth * 14 });
        container.appendChild(row);

        let expanded = false;

        const marker = document.createElement("span");
        marker.textContent = " ▸";
        marker.style.color = "var(--muted)";
        marker.style.marginLeft = "6px";
        row.appendChild(marker);

        const childrenContainer = document.createElement("div");
        childrenContainer.style.display = "none";
        container.appendChild(childrenContainer);

        row.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          expanded = !expanded;

          childrenContainer.style.display = expanded ? "block" : "none";
          marker.textContent = expanded ? " ▾" : " ▸";

          if (expanded && childrenContainer.childElementCount === 0) {
            await addDir(e.path, depth + 1, childrenContainer);
          }
        });
      } else {
        const row = makeTreeRow({ icon: "📄", name: e.name, indentPx: depth * 14 });

        row.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          await openFile(e.path);
        });

        container.appendChild(row);
      }
    }
  }

  await addDir(rootPath, 0, tree);
}

export async function openFile(filePath) {
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
    }

    scheduleAutoSave(tab);
  });

  state.tabs.push(tab);

  renderTabs();
  activateTab(state.tabs.length - 1);

  requestAnimationFrame(() => {
    state.editor.layout();
  });
}

export async function openFileFlow() {
  const file = await window.api.openFile();
  if (!file) return;

  await openFile(file);
  await refreshRecent();
}

export async function openFolderAtPath(folder) {
  if (!folder) return;

  state.root = folder;

  await initMonacoOnce();
  hideWelcomeShowEditor();
  await buildTree(folder);

  requestAnimationFrame(() => {
    state.editor.layout();
  });
}

export async function openFolderFlow() {
  const folder = await window.api.openFolder();
  if (!folder) return;

  await openFolderAtPath(folder);
  await refreshRecent();
}

function formatRecentTime(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";

  try {
    const d = new Date(n);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  } catch {
    return "";
  }
}

function renderRecent(list) {
  const listEl = $("recentList");
  const sectionEl = $("recentSection");
  const emptyEl = $("recentEmpty");
  const clearBtn = $("recentClearBtn");

  if (!listEl) return;

  const items = (Array.isArray(list) ? list : []).slice(0, RECENTS_UI_LIMIT);
  state.recent.items = items;

  listEl.innerHTML = "";

  if (sectionEl) sectionEl.style.display = items.length ? "block" : "none";
  if (emptyEl) emptyEl.style.display = items.length ? "none" : "block";
  if (clearBtn) clearBtn.disabled = items.length === 0;

  for (const it of items) {
    if (!it || (it.type !== "file" && it.type !== "folder") || !it.path) continue;

    const row = document.createElement("div");
    row.className = "recent-item";
    row.tabIndex = 0;

    const icon = document.createElement("div");
    icon.className = "recent-icon";
    icon.textContent = it.type === "folder" ? "📁" : "📄";

    const body = document.createElement("div");
    body.className = "recent-body";

    const title = document.createElement("div");
    title.className = "recent-title";
    title.textContent = it.name || fileBaseName(it.path) || it.path;

    const meta = document.createElement("div");
    meta.className = "recent-meta";
    const time = formatRecentTime(it.lastOpenedAt);
    meta.textContent = time ? `${it.path} · ${time}` : it.path;

    body.appendChild(title);
    body.appendChild(meta);

    row.appendChild(icon);
    row.appendChild(body);

    const onActivate = async () => {
      try {
        const res = await window.api.recent.open({ type: it.type, path: it.path });
        if (!res?.path) return;

        if (res.type === "folder") {
          await openFolderAtPath(res.path);
        } else if (res.type === "file") {
          await openFile(res.path);
        }

        await refreshRecent();
      } catch {}
    };

    row.addEventListener("click", (e) => {
      e.preventDefault();
      onActivate();
    });

    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onActivate();
      }
    });

    listEl.appendChild(row);
  }
}

export async function refreshRecent() {
  if (!window.api?.recent?.get) return;

  try {
    const list = await window.api.recent.get();
    renderRecent(list || []);
  } catch {
    renderRecent([]);
  }
}

export async function savePendingCloseTabAndClose(closeTabNow, closeModal) {
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
}