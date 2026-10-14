// Updates itself from GitHub Releases: checks on start and every few hours,
// downloads in the background and installs on restart. Only the installed
// version updates; a copy unpacked from the zip is left alone.

const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const CHECK_EVERY = 4 * 60 * 60 * 1000;

let status = { state: 'idle' };
let updater = null;

function installedWithSetup() {
  const dir = path.dirname(process.execPath);
  return fs.existsSync(path.join(dir, `Uninstall ${app.getName()}.exe`)) || fs.existsSync(path.join(dir, 'Uninstall Tembo.exe'));
}

function start(win) {
  ipcMain.handle('update-status', () => status);
  ipcMain.handle('update-install', () => updater && updater.quitAndInstall());
  if (!app.isPackaged || process.platform !== 'win32' || !installedWithSetup()) return;

  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  const send = next => {
    status = next;
    if (!win.isDestroyed()) win.webContents.send('update-status', status);
  };
  updater.on('update-available', info => send({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', p => send({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }));
  updater.on('update-downloaded', info => send({ state: 'ready', version: info.version }));
  // Offline or GitHub unreachable: stay quiet and try again later.
  updater.on('error', () => send({ state: 'idle' }));

  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY);
}

module.exports = { start };
