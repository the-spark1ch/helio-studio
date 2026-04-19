const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

let mainWindow = null;
let workspaceRootReal = null;
const userApprovedFilesReal = new Set();
const userApprovedDirsReal = new Set();
let terminalProcess = null;
let terminalCwd = null;

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

function isInsideApprovedDir(targetPathReal) {
  if (!targetPathReal) return false;

  for (const dirReal of userApprovedDirsReal) {
    if (isInsideDir(targetPathReal, dirReal)) return true;
  }

  return false;
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
    if (isInsideApprovedDir(dirReal)) return;
    throw new Error("Access denied");
  }

  if (!targetReal) throw new Error("Path not found");

  if (workspaceRootReal && isInsideDir(targetReal, workspaceRootReal)) return;
  if (isInsideApprovedDir(targetReal)) return;
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

function getTerminalCwd() {
  return workspaceRootReal || process.cwd();
}

function getShellCommand() {
  if (process.platform === "win32") {
    return {
      file: process.env.HELIO_TERMINAL_SHELL || "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit"]
    };
  }

  return {
    file: process.env.SHELL || "/bin/sh",
    args: []
  };
}

function sendTerminalEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("terminal:event", payload);
}

function stopTerminalProcess() {
  if (!terminalProcess) return false;

  try {
    terminalProcess.kill();
  } catch {}

  terminalProcess = null;
  terminalCwd = null;
  return true;
}

function startTerminalProcess({ restart = false } = {}) {
  if (terminalProcess && !terminalProcess.killed && !restart) {
    return { running: true, cwd: terminalCwd };
  }

  if (restart) {
    stopTerminalProcess();
  }

  const cwd = getTerminalCwd();
  const shellCommand = getShellCommand();

  terminalProcess = spawn(shellCommand.file, shellCommand.args, {
    cwd,
    env: process.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  terminalCwd = cwd;

  terminalProcess.stdout.setEncoding("utf8");
  terminalProcess.stderr.setEncoding("utf8");

  terminalProcess.stdout.on("data", (data) => {
    sendTerminalEvent({ type: "stdout", data: String(data) });
  });

  terminalProcess.stderr.on("data", (data) => {
    sendTerminalEvent({ type: "stderr", data: String(data) });
  });

  terminalProcess.on("error", (error) => {
    sendTerminalEvent({ type: "error", data: error?.message || "Terminal failed to start" });
    terminalProcess = null;
    terminalCwd = null;
  });

  terminalProcess.on("exit", (code, signal) => {
    sendTerminalEvent({ type: "exit", code, signal });
    terminalProcess = null;
    terminalCwd = null;
  });

  sendTerminalEvent({ type: "ready", cwd });
  return { running: true, cwd };
}

const RECENTS_VERSION = 1;
const RECENTS_LIMIT = 25;
const RECENTS_UI_LIMIT = 3;
const SESSION_VERSION = 1;

function getRecentsFilePath() {
  return path.join(app.getPath("userData"), "recent.json");
}

function getSessionFilePath() {
  return path.join(app.getPath("userData"), "session.json");
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

async function readSessionFile() {
  const fp = getSessionFilePath();
  try {
    const raw = await fs.readFile(fp, "utf-8");
    const parsed = JSON.parse(raw);
    const tabs = Array.isArray(parsed?.tabs) ? parsed.tabs : [];

    return {
      version: SESSION_VERSION,
      root: typeof parsed?.root === "string" ? parsed.root : null,
      tabs: tabs.filter((p) => typeof p === "string" && p),
      activePath: typeof parsed?.activePath === "string" ? parsed.activePath : null,
      updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0
    };
  } catch {
    return {
      version: SESSION_VERSION,
      root: null,
      tabs: [],
      activePath: null,
      updatedAt: 0
    };
  }
}

async function writeSessionFile(data) {
  const fp = getSessionFilePath();
  const dir = path.dirname(fp);
  await fs.mkdir(dir, { recursive: true });

  const payload = JSON.stringify(
    {
      version: SESSION_VERSION,
      root: typeof data?.root === "string" ? data.root : null,
      tabs: Array.isArray(data?.tabs) ? data.tabs : [],
      activePath: typeof data?.activePath === "string" ? data.activePath : null,
      updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : Date.now()
    },
    null,
    2
  );

  const tmp = fp + ".tmp";
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, fp);
}

async function normalizeSessionPayload(payload) {
  const requestedRoot = typeof payload?.root === "string" ? payload.root : null;
  const requestedTabs = Array.isArray(payload?.tabs) ? payload.tabs : [];
  const requestedActivePath = typeof payload?.activePath === "string" ? payload.activePath : null;

  let root = null;
  if (requestedRoot) {
    const rootReal = await toRealpathOrNull(requestedRoot);
    if (
      rootReal &&
      ((workspaceRootReal && isInsideDir(rootReal, workspaceRootReal)) || isInsideApprovedDir(rootReal))
    ) {
      root = rootReal;
    }
  }

  const tabs = [];
  const seen = new Set();

  for (const tabPath of requestedTabs) {
    if (typeof tabPath !== "string" || !tabPath) continue;

    const tabReal = await toRealpathOrNull(tabPath);
    if (!tabReal) continue;

    const isAllowed =
      (workspaceRootReal && isInsideDir(tabReal, workspaceRootReal)) ||
      isInsideApprovedDir(tabReal) ||
      userApprovedFilesReal.has(tabReal);

    if (!isAllowed || seen.has(tabReal)) continue;

    seen.add(tabReal);
    tabs.push(tabReal);
  }

  const activeReal = requestedActivePath ? await toRealpathOrNull(requestedActivePath) : null;
  const activePath = activeReal && seen.has(activeReal) ? activeReal : tabs[0] || null;

  return {
    version: SESSION_VERSION,
    root,
    tabs,
    activePath,
    updatedAt: Date.now()
  };
}

async function restoreSessionPayload() {
  const session = await readSessionFile();
  const rootReal = session.root ? await toRealpathOrNull(session.root) : null;

  if (rootReal) {
    workspaceRootReal = rootReal;
    userApprovedDirsReal.add(rootReal);
  }

  const tabs = [];
  const seen = new Set();

  for (const tabPath of session.tabs) {
    const tabReal = await toRealpathOrNull(tabPath);
    if (!tabReal || seen.has(tabReal)) continue;

    const isInsideWorkspace = rootReal && isInsideDir(tabReal, rootReal);
    if (!isInsideWorkspace) {
      userApprovedFilesReal.add(tabReal);
    }

    seen.add(tabReal);
    tabs.push(tabReal);
  }

  const activeReal = session.activePath ? await toRealpathOrNull(session.activePath) : null;
  const activePath = activeReal && seen.has(activeReal) ? activeReal : tabs[0] || null;

  const restored = {
    version: SESSION_VERSION,
    root: rootReal,
    tabs,
    activePath,
    updatedAt: Date.now()
  };

  if (rootReal !== session.root || tabs.length !== session.tabs.length || activePath !== session.activePath) {
    await writeSessionFile(restored);
  }

  return restored;
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
  stopTerminalProcess();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:openFolder", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (res.canceled || !res.filePaths?.[0]) return null;

  const picked = res.filePaths[0];
  const pickedReal = await toRealpathOrNull(picked);
  if (!pickedReal) return null;

  workspaceRootReal = pickedReal;
  userApprovedDirsReal.add(pickedReal);

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
    userApprovedDirsReal.add(pickedReal);

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

ipcMain.handle("session:get", async () => {
  return await restoreSessionPayload();
});

ipcMain.handle("session:save", async (_e, payload) => {
  const session = await normalizeSessionPayload(payload);
  await writeSessionFile(session);
  return session;
});

ipcMain.handle("terminal:start", async (_e, options) => {
  return startTerminalProcess({ restart: !!options?.restart });
});

ipcMain.handle("terminal:write", async (_e, data) => {
  if (typeof data !== "string") return false;
  if (!terminalProcess || terminalProcess.killed) {
    startTerminalProcess();
  }

  try {
    terminalProcess.stdin.write(data);
    return true;
  } catch (error) {
    sendTerminalEvent({ type: "error", data: error?.message || "Failed to write to terminal" });
    return false;
  }
});

ipcMain.handle("terminal:kill", async () => {
  return stopTerminalProcess();
});

ipcMain.handle("clipboard:readText", async () => {
  return clipboard.readText();
});

ipcMain.handle("clipboard:writeText", async (_e, text) => {
  if (typeof text !== "string") return false;
  clipboard.writeText(text);
  return true;
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
