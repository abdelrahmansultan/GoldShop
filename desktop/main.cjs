// Electron shell for Gold Shop ERP.
//
// Two modes, chosen in config.json (File → Server…):
//   standalone — the installer ships PostgreSQL + Python + the Django API; this
//                process starts them locally and stops them on quit. Default when
//                the bundled server is present.
//   remote     — connect to a shop server on the LAN or the internet (apiUrl).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const IS_WIN = process.platform === "win32";
const API_PORT = 8765;
const DATA = path.join(app.getPath("userData"), "data");
const CONFIG = path.join(app.getPath("userData"), "config.json");

// Bundled server layout (packaged): resources/server/{python,pgsql,app}.
// For development, GOLDSHOP_PYTHON / GOLDSHOP_PGBIN / GOLDSHOP_APP override these.
const SERVER_DIR = path.join(process.resourcesPath || __dirname, "server");
const PY = process.env.GOLDSHOP_PYTHON || path.join(SERVER_DIR, "python", IS_WIN ? "python.exe" : "bin/python3");
const PGBIN = process.env.GOLDSHOP_PGBIN || path.join(SERVER_DIR, "pgsql", "bin");
const APP_DIR = process.env.GOLDSHOP_APP || path.join(SERVER_DIR, "app");
const HAS_SERVER = fs.existsSync(PY) && fs.existsSync(path.join(APP_DIR, "standalone.py"));

function readConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { /* first run */ }
  if (!cfg.mode) cfg.mode = cfg.apiUrl ? "remote" : HAS_SERVER ? "standalone" : "remote";
  if (!cfg.apiUrl) cfg.apiUrl = "http://localhost:8000";
  if (cfg.mode === "standalone" && !HAS_SERVER) cfg.mode = "remote";
  return cfg;
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

let win = null;
let splash = null;
let server = null;
let serverLog = "";
let quitting = false;

/** Start the bundled server; resolves with its URL once it prints READY and answers /health. */
function startServer() {
  fs.mkdirSync(DATA, { recursive: true });
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (msg) => { if (!settled) { settled = true; reject(new Error(msg)); } };
    server = spawn(PY, [path.join(APP_DIR, "standalone.py")], {
      cwd: APP_DIR,
      env: { ...process.env, GOLDSHOP_DATA: DATA, GOLDSHOP_PGBIN: PGBIN, GOLDSHOP_PORT: String(API_PORT),
        GOLDSHOP_DEMO: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
    });
    const onData = (d) => {
      const text = d.toString();
      serverLog = (serverLog + text).slice(-20000);
      fs.appendFile(path.join(DATA, "server.log"), text, () => undefined);
      const m = text.match(/READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (m && !settled) {
        waitForHealth(m[1], 60000).then(() => { settled = true; resolve(m[1]); }, () => fail("health check failed"));
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("error", (e) => fail(e.message));
    server.on("exit", (code) => {
      server = null;
      if (!settled) fail(`server exited with code ${code}`);
      else if (!quitting) {
        dialog.showErrorBox("Gold Shop ERP", `The built-in server stopped (code ${code}).\n\n${serverLog.slice(-2500)}`);
        app.quit();
      }
    });
    setTimeout(() => fail("timed out"), 300000);
  });
}

function stopServer() {
  if (server) { try { server.kill(); } catch { /* already gone */ } }
  // PostgreSQL runs detached from pg_ctl; stop it cleanly so data is flushed.
  const pgdata = path.join(DATA, "pgdata");
  if (HAS_SERVER && fs.existsSync(path.join(pgdata, "PG_VERSION"))) {
    try {
      execFileSync(path.join(PGBIN, IS_WIN ? "pg_ctl.exe" : "pg_ctl"), ["stop", "-D", pgdata, "-m", "fast", "-w", "-t", "30"],
        { windowsHide: true, stdio: "ignore" });
    } catch { /* not running */ }
  }
}

function waitForHealth(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${url}/api/v1/health/`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(); else retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => (Date.now() > until ? reject(new Error("timeout")) : setTimeout(tick, 700));
    tick();
  });
}

const SPLASH = `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0f1b33;color:#f5e9c8;font-family:Segoe UI,Tahoma,sans-serif}
.box{text-align:center;padding:24px}.ring{width:46px;height:46px;border:4px solid #2c4580;border-top-color:#d4a63a;border-radius:50%;margin:0 auto 18px;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}h1{font-size:19px;margin:0 0 8px}p{margin:0;color:#94a3b8;font-size:13px}</style></head>
<body><div class="box"><div class="ring"></div><h1>جارٍ تشغيل نظام محل الذهب…</h1><p>أول تشغيل ممكن ياخد دقيقة</p><p>Starting Gold Shop ERP — first launch can take a minute</p></div></body></html>`;

function showSplash() {
  splash = new BrowserWindow({ width: 460, height: 280, frame: false, resizable: false, backgroundColor: "#0f1b33",
    show: true, webPreferences: { sandbox: true, contextIsolation: true } });
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);
}

function createMainWindow(apiUrl, mode) {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 680, backgroundColor: "#0f1b33", title: "Gold Shop ERP",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [`--goldshop-api=${apiUrl}`, `--goldshop-mode=${mode}`],
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") return { action: "allow" }; // barcode label printing
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) e.preventDefault(); });
  win.once("ready-to-show", () => { win.show(); if (splash) { splash.destroy(); splash = null; } });
  win.loadFile(path.join(__dirname, "web", "index.html"));
}

async function launch() {
  const cfg = readConfig();
  if (cfg.mode !== "standalone") return createMainWindow(cfg.apiUrl, "remote");
  showSplash();
  try {
    const url = await startServer();
    const demo = fs.existsSync(path.join(DATA, "DEMO_DATA"));
    createMainWindow(url, demo ? "standalone-demo" : "standalone");
  } catch (e) {
    if (splash) { splash.destroy(); splash = null; }
    dialog.showErrorBox("Gold Shop ERP", `The built-in server did not start (${e.message}).\n\nLog: ${path.join(DATA, "server.log")}\n\n${serverLog.slice(-2500)}`);
    quitting = true;
    stopServer();
    app.quit();
  }
}

async function chooseServer() {
  const cfg = readConfig();
  const buttons = [...(HAS_SERVER ? ["This computer (built-in server)"] : []), "Network / internet server…", "Cancel"];
  const { response } = await dialog.showMessageBox(win, {
    type: "question", buttons, cancelId: buttons.length - 1, title: "Server",
    message: cfg.mode === "standalone" ? "Currently using the built-in server on this computer." : `Currently connected to ${cfg.apiUrl}`,
    detail: "For a network server, set \"apiUrl\" in config.json (e.g. http://192.168.1.10), save, then restart the app.",
  });
  const choice = buttons[response];
  if (choice.startsWith("This computer")) { writeConfig({ ...cfg, mode: "standalone" }); app.relaunch(); app.quit(); }
  if (choice.startsWith("Network")) { writeConfig({ ...cfg, mode: "remote" }); shell.openPath(CONFIG); }
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Server…", click: chooseServer },
      { label: "Open data folder (database, backups)", click: () => { fs.mkdirSync(DATA, { recursive: true }); shell.openPath(DATA); } },
      { type: "separator" }, { role: "quit" },
    ] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
  ]));
}

ipcMain.handle("goldshop:print", async (_e, opts = {}) => new Promise((resolve) => {
  win.webContents.print({ silent: !!opts.silent, printBackground: true }, () => resolve());
}));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { buildMenu(); return launch(); });
  app.on("before-quit", () => { quitting = true; stopServer(); });
  app.on("window-all-closed", () => app.quit());
}
