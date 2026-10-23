// Desktop app: runs the Lineatur server inside Electron and shows the editor in its own window.
//
// The server only listens on 127.0.0.1 and always on the same port: the browser storage (the
// document library) belongs to that exact address, so a changing port would look like an empty library.
// The portable .exe keeps its data in "Lineatur-Daten" next to itself, so it can live on a USB stick.

const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = 37615;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// electron-builder's portable target sets this to the folder of the .exe
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (portableDir) {
  const dataDir = path.join(portableDir, 'Lineatur-Daten');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    app.setPath('userData', dataDir);
  } catch {
    // read-only location (e.g. a network share): fall back to the user profile
  }
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'Lineatur',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#ecedea',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // links (licence texts, image sources) open in the normal browser, never inside the app
  const external = (url) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(ORIGIN)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      external(url);
    }
  });
  win.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  // already running: the first instance brings its window to the front
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    process.env.PORT = String(PORT);
    process.env.HOST = '127.0.0.1';
    try {
      const server = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
      await server.ready;
    } catch (err) {
      dialog.showErrorBox('Lineatur konnte nicht starten',
        err?.code === 'EADDRINUSE'
          ? `Der Port ${PORT} wird bereits von einem anderen Programm verwendet.`
          : String(err?.stack || err));
      app.quit();
      return;
    }
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
