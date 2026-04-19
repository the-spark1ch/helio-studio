import {
  state,
  getActiveTab
} from "./state.js";

let saveTimer = null;
let restoring = false;

function serializeSession() {
  const activeTab = getActiveTab();

  return {
    root: state.root || null,
    tabs: state.tabs
      .map((tab) => tab?.path)
      .filter((path) => typeof path === "string" && path),
    activePath: activeTab?.path || null
  };
}

export function saveSessionNow() {
  if (restoring || !window.api?.session?.save) return;

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    window.api.session.save(serializeSession()).catch(() => {});
  } catch {}
}

export function saveSessionSoon() {
  if (restoring) return;

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSessionNow();
  }, 150);
}

function getActiveRestoreIndex(session, restoredPaths) {
  if (!session?.activePath) return restoredPaths.length - 1;
  const idx = restoredPaths.findIndex((path) => path === session.activePath);
  return idx >= 0 ? idx : restoredPaths.length - 1;
}

export async function restoreSession({ openFolderAtPath, openFile, activateTab }) {
  if (!window.api?.session?.get) return false;

  restoring = true;

  try {
    const session = await window.api.session.get();
    if (!session?.root && !Array.isArray(session?.tabs)) return false;

    if (session.root && typeof openFolderAtPath === "function") {
      await openFolderAtPath(session.root, { skipSessionSave: true });
    }

    const tabs = Array.isArray(session.tabs) ? session.tabs : [];
    const restoredPaths = [];

    for (const tabPath of tabs) {
      if (typeof tabPath !== "string" || !tabPath) continue;

      try {
        await openFile(tabPath, { skipSessionSave: true });
        restoredPaths.push(tabPath);
      } catch {}
    }

    if (restoredPaths.length && typeof activateTab === "function") {
      activateTab(getActiveRestoreIndex(session, restoredPaths));
    }

    return !!session.root || restoredPaths.length > 0;
  } catch {
    return false;
  } finally {
    restoring = false;
    saveSessionNow();
  }
}
