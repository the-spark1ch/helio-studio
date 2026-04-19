const { contextBridge, ipcRenderer } = require("electron");

function assertString(v, name) {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertRecentItem(item) {
  if (!item || typeof item !== "object") throw new Error("item must be an object");
  if (item.type !== "file" && item.type !== "folder") throw new Error("item.type must be 'file' or 'folder'");
  assertString(item.path, "item.path");
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
  },

  recent: Object.freeze({
    get: () => ipcRenderer.invoke("recent:get"),
    clear: () => ipcRenderer.invoke("recent:clear"),
    add: (item) => {
      assertRecentItem(item);
      return ipcRenderer.invoke("recent:add", item);
    },
    open: (item) => {
      assertRecentItem(item);
      return ipcRenderer.invoke("recent:open", item);
    }
  }),

  session: Object.freeze({
    get: () => ipcRenderer.invoke("session:get"),
    save: (session) => {
      if (!session || typeof session !== "object") throw new Error("session must be an object");
      if (session.root !== null && session.root !== undefined && typeof session.root !== "string") {
        throw new Error("session.root must be a string or null");
      }
      if (!Array.isArray(session.tabs)) throw new Error("session.tabs must be an array");
      for (const p of session.tabs) assertString(p, "session tab path");
      if (
        session.activePath !== null &&
        session.activePath !== undefined &&
        typeof session.activePath !== "string"
      ) {
        throw new Error("session.activePath must be a string or null");
      }
      return ipcRenderer.invoke("session:save", session);
    }
  }),

  terminal: Object.freeze({
    start: (options = {}) => ipcRenderer.invoke("terminal:start", {
      restart: !!options.restart
    }),
    write: (data) => {
      assertString(data, "terminal data");
      return ipcRenderer.invoke("terminal:write", data);
    },
    kill: () => ipcRenderer.invoke("terminal:kill"),
    onEvent: (callback) => {
      if (typeof callback !== "function") throw new Error("callback must be a function");

      const handler = (_event, payload) => {
        callback(payload);
      };

      ipcRenderer.on("terminal:event", handler);
      return () => ipcRenderer.removeListener("terminal:event", handler);
    }
  }),

  clipboard: Object.freeze({
    readText: () => ipcRenderer.invoke("clipboard:readText"),
    writeText: (text) => {
      if (typeof text !== "string") throw new Error("clipboard text must be a string");
      return ipcRenderer.invoke("clipboard:writeText", text);
    }
  })
};

contextBridge.exposeInMainWorld("api", Object.freeze(api));
