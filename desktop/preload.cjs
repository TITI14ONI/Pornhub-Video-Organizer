const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    // configuration
    getConfig: () => ipcRenderer.invoke("config:get"),
    saveConfig: config => ipcRenderer.invoke("config:set", config),
    describePlan: answers => ipcRenderer.invoke("plan:describe", answers),
    detectOpera: () => ipcRenderer.invoke("opera:detect"),
    pickOpera: () => ipcRenderer.invoke("dialog:pickOpera"),

    // programmes (tri / hasard)
    start: request => ipcRenderer.invoke("run:start", request),
    sendInput: text => ipcRenderer.send("run:input", text),
    stop: () => ipcRenderer.send("run:stop"),
    onEvent: callback => ipcRenderer.on("run:event", (_event, payload) => callback(payload)),
    onExit: callback => ipcRenderer.on("run:exit", (_event, code) => callback(code)),

    // bibliothèque
    getLibrary: () => ipcRenderer.invoke("library:get"),
    updateEntry: request => ipcRenderer.invoke("library:update", request),
    detectSaves: () => ipcRenderer.invoke("library:detect"),
    importDir: dir => ipcRenderer.invoke("library:import-dir", dir),
    importFiles: () => ipcRenderer.invoke("library:import-files"),

    // divers
    getThumb: url => ipcRenderer.invoke("thumb:get", url),
    openLink: url => ipcRenderer.invoke("browser:open-video", url),
    getDataPath: () => ipcRenderer.invoke("data:path"),
    openDataFolder: () => ipcRenderer.send("data:open")
});
