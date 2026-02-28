const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");

let mainWindow = null;
let workspaceRootReal = null;
const userApprovedFilesReal = new Set();

function toRealpathOrNull(p) {
  if (typeof p !== "string" || !p) return null;
  return fs.realpath(p).catch(() => null);
}

function isInsideDir(childPathReal, parentDirReal) {
  if (!childPathReal || !parentDirReal) return false;
  if (childPathReal === parentDirReal) return true;
  const rel = path.relative(parentDirReal, childPathReal);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function assertFsAllowed(targetPath, { kind }) {
  if (typeof targetPath !== "string" || !targetPath) {
    throw new Error("Invalid path");
  }

  const targetReal = await toRealpathOrNull(targetPath);

  if (kind === "write" && !targetReal) {
    const dirReal = await toRealpathOrNull(path.dirname(targetPath));
    if (!dirReal) throw new Error("Path not found");
    if (workspaceRootReal && isInsideDir(dirReal, workspaceRootReal)) return;
    throw new Error("Access denied");
  }

  if (!targetReal) throw new Error("Path not found");

  if (workspaceRootReal && isInsideDir(targetReal, workspaceRootReal)) return;
  if (userApprovedFilesReal.has(targetReal)) return;

  throw new Error("Access denied");
}

function wireWebContentsSecurity(wc) {
  wc.setWindowOpenHandler(() => ({ action: "deny" }));

  wc.on("will-navigate", (event, url) => {
    if (typeof url === "string" && url.startsWith("file://")) return;
    event.preventDefault();
  });

  wc.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  wc.on("new-window", (event) => {
    event.preventDefault();
  });
}

const RECENTS_VERSION = 1;
const RECENTS_LIMIT = 25;
const RECENTS_UI_LIMIT = 3;

function getRecentsFilePath() {
  return path.join(app.getPath("userData"), "recent.json");
}

function normalizeRecentType(t) {
  if (t === "folder" || t === "file") return t;
  return null;
}

function safeBasename(p) {
  try {
    return path.basename(p);
  } catch {
    return "";
  }
}

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readRecentsFile() {
  const fp = getRecentsFilePath();
  try {
    const raw = await fs.readFile(fp, "utf-8");
    const parsed = JSON.parse(raw);

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
      version: RECENTS_VERSION,
      items: items
        .filter((it) => it && typeof it === "object")
        .map((it) => ({
          type: normalizeRecentType(it.type),
          path: typeof it.path === "string" ? it.path : "",
          name: typeof it.name === "string" ? it.name : "",
          lastOpenedAt: typeof it.lastOpenedAt === "number" ? it.lastOpenedAt : 0
        }))
        .filter((it) => it.type && it.path)
    };
  } catch {
    return { version: RECENTS_VERSION, items: [] };
  }
}

async function writeRecentsFile(data) {
  const fp = getRecentsFilePath();
  const dir = path.dirname(fp);
  await fs.mkdir(dir, { recursive: true });

  const payload = JSON.stringify(
    {
      version: RECENTS_VERSION,
      items: Array.isArray(data?.items) ? data.items : []
    },
    null,
    2
  );

  const tmp = fp + ".tmp";
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, fp);
}

function dedupeAndSortRecents(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.type}\n${it.path}`;
    const prev = map.get(key);
    if (!prev || (it.lastOpenedAt || 0) > (prev.lastOpenedAt || 0)) {
      map.set(key, it);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
    .slice(0, RECENTS_LIMIT);
}

async function getRecentItems({ pruneMissing = true } = {}) {
  const data = await readRecentsFile();
  let items = data.items;

  if (pruneMissing) {
    const kept = [];
    for (const it of items) {
      if (await pathExists(it.path)) kept.push(it);
    }
    if (kept.length !== items.length) {
      items = kept;
      await writeRecentsFile({ items });
    } else {
      items = kept;
    }
  }

  items = dedupeAndSortRecents(items);
  return items;
}

async function addRecentItem({ type, targetPath }) {
  const t = normalizeRecentType(type);
  if (!t) throw new Error("Invalid recent item type");
  if (typeof targetPath !== "string" || !targetPath) throw new Error("Invalid path");

  const real = await toRealpathOrNull(targetPath);
  const p = real || targetPath;

  if (!(await pathExists(p))) throw new Error("Path not found");

  const now = Date.now();
  const item = {
    type: t,
    path: p,
    name: safeBasename(p) || p,
    lastOpenedAt: now
  };

  const existing = await getRecentItems({ pruneMissing: true });
  const next = dedupeAndSortRecents([item, ...existing]);

  await writeRecentsFile({ items: next });
  return next;
}

async function clearRecentItems() {
  await writeRecentsFile({ items: [] });
  return [];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#1e1e1e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, "src", "renderer", "index.html"));

  wireWebContentsSecurity(mainWindow.webContents);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:openFolder", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (res.canceled || !res.filePaths?.[0]) return null;

  const picked = res.filePaths[0];
  const pickedReal = await toRealpathOrNull(picked);
  if (!pickedReal) return null;

  workspaceRootReal = pickedReal;
  userApprovedFilesReal.clear();

  try {
    await addRecentItem({ type: "folder", targetPath: picked });
  } catch {}

  return picked;
});

ipcMain.handle("dialog:openFile", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openFile"] });
  if (res.canceled || !res.filePaths?.[0]) return null;

  const picked = res.filePaths[0];
  const pickedReal = await toRealpathOrNull(picked);
  if (pickedReal) userApprovedFilesReal.add(pickedReal);

  try {
    await addRecentItem({ type: "file", targetPath: picked });
  } catch {}

  return picked;
});

ipcMain.handle("recent:get", async () => {
  const items = await getRecentItems({ pruneMissing: true });
  return items.slice(0, RECENTS_UI_LIMIT);
});

ipcMain.handle("recent:add", async (_e, item) => {
  const type = item?.type;
  const targetPath = item?.path;
  return await addRecentItem({ type, targetPath });
});

ipcMain.handle("recent:clear", async () => {
  return await clearRecentItems();
});

ipcMain.handle("recent:open", async (_e, item) => {
  const type = item?.type;
  const targetPath = item?.path;

  const t = normalizeRecentType(type);
  if (!t) return null;
  if (typeof targetPath !== "string" || !targetPath) return null;

  const real = await toRealpathOrNull(targetPath);
  const p = real || targetPath;

  if (!(await pathExists(p))) return null;

  if (t === "folder") {
    const pickedReal = await toRealpathOrNull(p);
    if (!pickedReal) return null;

    workspaceRootReal = pickedReal;
    userApprovedFilesReal.clear();

    try {
      await addRecentItem({ type: "folder", targetPath: p });
    } catch {}

    return { type: "folder", path: p };
  }

  const pickedReal = await toRealpathOrNull(p);
  if (pickedReal) userApprovedFilesReal.add(pickedReal);

  try {
    await addRecentItem({ type: "file", targetPath: p });
  } catch {}

  return { type: "file", path: p };
});

ipcMain.handle("fs:readFile", async (_e, filePath) => {
  await assertFsAllowed(filePath, { kind: "read" });
  const buf = await fs.readFile(filePath);
  return buf.toString("utf-8");
});

ipcMain.handle("fs:writeFile", async (_e, filePath, content) => {
  await assertFsAllowed(filePath, { kind: "write" });
  await fs.writeFile(filePath, content, "utf-8");
  return true;
});

ipcMain.handle("fs:listDir", async (_e, dirPath) => {
  await assertFsAllowed(dirPath, { kind: "list" });
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  return entries.map((e) => ({
    name: e.name,
    path: path.join(dirPath, e.name),
    type: e.isDirectory() ? "dir" : "file"
  }));
});

ipcMain.handle("shell:openExternal", async (_e, url) => {
  if (typeof url !== "string") return false;
  if (!url.startsWith("https://")) return false;
  await shell.openExternal(url);
  return true;
});
