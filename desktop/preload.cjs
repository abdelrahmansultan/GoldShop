const { contextBridge, ipcRenderer } = require("electron");

const arg = process.argv.find((a) => a.startsWith("--goldshop-api="));
const apiUrl = arg ? arg.split("=").slice(1).join("=") : "http://localhost:8000";

contextBridge.exposeInMainWorld("goldshop", {
  apiUrl,
  platform: process.platform,
  print: (opts) => ipcRenderer.invoke("goldshop:print", opts || {}),
});
