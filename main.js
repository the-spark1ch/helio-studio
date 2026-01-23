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
  return picked;
});

ipcMain.handle("dialog:openFile", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openFile"] });
  if (res.canceled || !res.filePaths?.[0]) return null;

  const picked = res.filePaths[0];
  const pickedReal = await toRealpathOrNull(picked);
  if (pickedReal) userApprovedFilesReal.add(pickedReal);
  return picked;
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
