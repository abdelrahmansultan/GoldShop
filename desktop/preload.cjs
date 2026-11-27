const { contextBridge, ipcRenderer } = require("electron");

const arg = (name, fallback) => {
  const a = process.argv.find((x) => x.startsWith(`--goldshop-${name}=`));
  return a ? a.split("=").slice(1).join("=") : fallback;
};

contextBridge.exposeInMainWorld("goldshop", {
  apiUrl: arg("api", "http://localhost:8000"),
  mode: arg("mode", "remote"), // "standalone" | "standalone-demo" | "remote"
  platform: process.platform,
  print: (opts) => ipcRenderer.invoke("goldshop:print", opts || {}),
});
