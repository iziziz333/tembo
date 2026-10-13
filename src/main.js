const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scan } = require('./core/scanner');
const { buildPlan } = require('./core/planner');
const executor = require('./core/executor');
const { langFor, names } = require('./core/i18n');

const RECENT_LIMIT = 5;

// Acrylic blur behind the window exists from Windows 11 22H2 (build 22621).
const glass = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;

let win;
let lang = 'en';
// Last computed plan per folder: the renderer only picks moves by id,
// it can never ask to move arbitrary paths.
const plans = new Map();

function titleBarOverlay() {
  return {
    color: '#00000000',
    symbolColor: nativeTheme.shouldUseDarkColors ? '#e8f0fc' : '#0f1c2e',
    height: 36,
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: 'Tembo',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(),
    backgroundMaterial: glass ? 'acrylic' : undefined,
    backgroundColor: glass ? '#00000000' : (nativeTheme.shouldUseDarkColors ? '#081326' : '#e6f0fc'),
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: { glass: glass ? '1' : '0' } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

nativeTheme.on('updated', () => {
  if (win && process.platform === 'win32') win.setTitleBarOverlay(titleBarOverlay());
});

// ---------- recent folders ----------

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

function readRecent() {
  try {
    return JSON.parse(fs.readFileSync(recentFile(), 'utf8')).filter(r => fs.existsSync(r.folder));
  } catch {
    return [];
  }
}

function rememberFolder(folder) {
  const list = [{ folder, at: Date.now() }, ...readRecent().filter(r => r.folder !== folder)].slice(0, RECENT_LIMIT);
  fs.mkdirSync(path.dirname(recentFile()), { recursive: true });
  fs.writeFileSync(recentFile(), JSON.stringify(list));
}

// ---------- IPC ----------

async function isFolder(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return false;
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function summarize(folder, { files, organized }, plan) {
  const n = names(lang);
  return {
    folder,
    name: path.basename(folder) || folder,
    lang,
    folderNames: n,
    total: files.length,
    organized,
    skipped: plan.skipped.length,
    moves: plan.moves.map((m, id) => ({
      id,
      src: m.file.path,
      name: m.file.name,
      dst: m.dst,
      size: m.file.size,
      group: m.group,
      duplicateOf: m.duplicateOf || null,
    })),
  };
}

ipcMain.handle('init', () => ({
  lang,
  glass,
  downloads: app.getPath('downloads'),
  desktop: app.getPath('desktop'),
  recent: readRecent(),
}));

ipcMain.handle('loose-count', async (_e, folder) => {
  if (!(await isFolder(folder))) return null;
  const { files } = await scan(folder, { hash: false });
  return buildPlan(files, lang).moves.length;
});

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('analyze', async (e, folder) => {
  if (!(await isFolder(folder))) throw new Error('Папка не найдена');
  const scanned = await scan(folder, { onProgress: n => e.sender.send('scan-progress', folder, n) });
  const plan = buildPlan(scanned.files, lang);
  plans.set(folder, plan);
  return { ...summarize(folder, scanned, plan), canUndo: Boolean(await executor.lastJournal(folder)) };
});

ipcMain.handle('apply', async (_e, folder, ids) => {
  const plan = plans.get(folder);
  if (!plan || !Array.isArray(ids)) throw new Error('План устарел, обновите папку');
  const chosen = new Set(ids);
  const moves = plan.moves
    .filter((_m, id) => chosen.has(id))
    .map(m => ({ src: m.file.path, dst: m.dst, group: m.group, size: m.file.size }));
  plans.delete(folder);
  const r = await executor.apply(folder, moves);
  rememberFolder(folder);
  return {
    done: r.done.map(m => ({ group: m.group, size: m.size })),
    failed: r.failed.map(m => ({ src: m.src, error: m.error })),
    reviewDir: names(lang).review,
  };
});

ipcMain.handle('undo', async (_e, folder) => {
  if (!(await isFolder(folder))) throw new Error('Папка не найдена');
  const r = await executor.undo(folder);
  return { done: r.done.length, failed: r.failed.map(m => ({ src: m.dst, error: m.error })) };
});

ipcMain.handle('open-folder', async (_e, folder) => {
  if (await isFolder(folder)) await shell.openPath(folder);
});

// ---------- app ----------

app.whenReady().then(() => {
  lang = langFor(app.getPreferredSystemLanguages()[0] || app.getLocale());
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
