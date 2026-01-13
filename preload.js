const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  readFile: (p) => ipcRenderer.invoke("fs:readFile", p),
  writeFile: (p, c) => ipcRenderer.invoke("fs:writeFile", p, c),
  listDir: (p) => ipcRenderer.invoke("fs:listDir", p)
});
