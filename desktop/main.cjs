// Electron shell: loads the same React build used on the web and talks to the
// same Django API. The API URL is configured once per workstation.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs");
const path = require("path");

const CONFIG = path.join(app.getPath("userData"), "config.json");
const DEFAULT_API = "http://localhost:8000";

function readConfig() {
  try { return { apiUrl: DEFAULT_API, ...JSON.parse(fs.readFileSync(CONFIG, "utf8")) }; }
  catch { return { apiUrl: DEFAULT_API }; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 680, backgroundColor: "#0f1b33",
    title: "Gold Shop ERP", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [`--goldshop-api=${readConfig().apiUrl}`],
    },
  });
  win.loadFile(path.join(__dirname, "web", "index.html"));
  win.once("ready-to-show", () => win.show());
  // Never navigate the app window away; open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") return { action: "allow" }; // label printing popup
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) e.preventDefault(); });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Server address…", click: configureServer },
      { type: "separator" }, { role: "quit" },
    ] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
  ]));
}

async function configureServer() {
  const cfg = readConfig();
  const choice = await dialog.showMessageBox(win, {
    type: "question", buttons: ["Use localhost", "Keep current", "Edit config file"],
    message: `Current server: ${cfg.apiUrl}`,
    detail: "For a shared server, edit config.json and set apiUrl, e.g. http://192.168.1.10:8000",
  });
  if (choice.response === 0) { writeConfig({ ...cfg, apiUrl: DEFAULT_API }); app.relaunch(); app.exit(0); }
  if (choice.response === 2) { if (!fs.existsSync(CONFIG)) writeConfig(cfg); shell.openPath(CONFIG); }
}

// Desktop printing: native print dialog for invoices (or silent to default printer).
ipcMain.handle("goldshop:print", async (_e, opts = {}) => new Promise((resolve) => {
  win.webContents.print({ silent: !!opts.silent, printBackground: true }, () => resolve());
}));

app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on("window-all-closed", () => app.quit());
