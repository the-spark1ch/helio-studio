const { contextBridge, ipcRenderer } = require("electron");

function assertString(v, name) {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

const api = {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),

  readFile: (p) => {
    assertString(p, "path");
    return ipcRenderer.invoke("fs:readFile", p);
  },

  writeFile: (p, content) => {
    assertString(p, "path");
    if (typeof content !== "string") throw new Error("content must be a string");
    return ipcRenderer.invoke("fs:writeFile", p, content);
  },

  listDir: (p) => {
    assertString(p, "path");
    return ipcRenderer.invoke("fs:listDir", p);
  },

  openExternal: (url) => {
    assertString(url, "url");
    return ipcRenderer.invoke("shell:openExternal", url);
  }
};

contextBridge.exposeInMainWorld("api", Object.freeze(api));
