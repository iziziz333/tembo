const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scan } = require('./core/scanner');
const { buildPlan } = require('./core/planner');
const executor = require('./core/executor');
const desktop = require('./desktop');
const updater = require('./updater');
const { langFor, names, CATEGORY_ORDER } = require('./core/i18n');

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

// ---------- remembered state ----------

const stateFile = name => path.join(app.getPath('userData'), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(stateFile(name), JSON.stringify(value));
}

function readRecent() {
  return readJson('recent.json', []).filter(r => fs.existsSync(r.folder));
}

function rememberFolder(folder) {
  const list = [{ folder, at: Date.now() }, ...readRecent().filter(r => r.folder !== folder)].slice(0, RECENT_LIMIT);
  writeJson('recent.json', list);
}

// Files the user unchecked in a folder stay unchecked next time.
const keepKey = folder => folder.toLowerCase();

function readKept(folder) {
  return new Set(readJson('keep.json', {})[keepKey(folder)] || []);
}

function rememberKept(folder, kept, chosen) {
  const all = readJson('keep.json', {});
  const set = new Set(all[keepKey(folder)] || []);
  for (const src of chosen) set.delete(src);
  for (const src of kept) set.add(src);
  all[keepKey(folder)] = [...set];
  writeJson('keep.json', all);
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

const isDesktop = folder => desktop.supported && path.resolve(folder).toLowerCase() === path.resolve(app.getPath('desktop')).toLowerCase();

function summarize(folder, { files, organized }, plan) {
  const n = names(lang);
  const kept = readKept(folder);
  return {
    folder,
    name: path.basename(folder) || folder,
    lang,
    folderNames: n,
    categoryOrder: CATEGORY_ORDER,
    total: files.length,
    organized,
    skipped: plan.skipped.length,
    isDesktop: isDesktop(folder),
    moves: plan.moves.map((m, id) => ({
      id,
      src: m.file.path,
      name: m.file.name,
      dst: m.dst,
      size: m.file.size,
      group: m.group,
      isFolder: Boolean(m.file.isFolder),
      series: m.series || null,
      duplicateOf: m.duplicateOf || null,
      kept: kept.has(m.file.path),
    })),
  };
}

ipcMain.handle('init', () => ({
  lang,
  glass,
  downloads: app.getPath('downloads'),
  desktop: app.getPath('desktop'),
  recent: readRecent(),
  canArrange: desktop.supported,
}));

ipcMain.handle('loose-count', async (_e, folder) => {
  if (!(await isFolder(folder))) return null;
  const { files, folders } = await scan(folder, { hash: false });
  return buildPlan(files, lang, folders).moves.length;
});

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('analyze', async (e, folder) => {
  if (!(await isFolder(folder))) throw new Error('Папка не найдена');
  const scanned = await scan(folder, { onProgress: n => e.sender.send('scan-progress', folder, n) });
  const plan = buildPlan(scanned.files, lang, scanned.folders);
  plans.set(folder, plan);
  return { ...summarize(folder, scanned, plan), canUndo: Boolean(await executor.lastJournal(folder)) };
});

// Desktop icon positions go into the journal, so undo puts icons back exactly.
async function iconSnapshot(folder) {
  if (!isDesktop(folder)) return null;
  const state = await desktop.getIcons();
  return state.error ? null : { icons: state.items };
}

ipcMain.handle('apply', async (_e, folder, ids, opts = {}) => {
  const plan = plans.get(folder);
  if (!plan || !Array.isArray(ids)) throw new Error('План устарел, обновите папку');
  const chosen = new Set(ids);
  const moves = plan.moves
    .filter((_m, id) => chosen.has(id))
    .map(m => ({ src: m.file.path, dst: m.dst, group: m.group, size: m.file.size }));
  rememberKept(folder, plan.moves.filter((_m, id) => !chosen.has(id)).map(m => m.file.path), moves.map(m => m.src));
  plans.delete(folder);

  const meta = await iconSnapshot(folder);
  const r = await executor.apply(folder, moves, meta);
  rememberFolder(folder);
  const icons = opts.arrange && isDesktop(folder) ? await desktop.arrangeDesktop(folder) : null;
  return {
    done: r.done.map(m => ({ group: m.group, size: m.size })),
    failed: r.failed.map(m => ({ src: m.src, error: m.error })),
    reviewDir: names(lang).review,
    icons,
  };
});

// Only line up desktop icons, without moving any file. Undoable too.
ipcMain.handle('arrange', async (_e, folder) => {
  if (!isDesktop(folder)) throw new Error('Расставлять значки можно только на рабочем столе');
  const meta = await iconSnapshot(folder);
  const icons = await desktop.arrangeDesktop(folder);
  if (icons.arranged && meta) await executor.apply(folder, [], meta);
  return icons;
});

ipcMain.handle('undo', async (_e, folder) => {
  if (!(await isFolder(folder))) throw new Error('Папка не найдена');
  const r = await executor.undo(folder);
  let icons = null;
  if (r.meta && r.meta.icons && isDesktop(folder)) {
    const back = await desktop.setIcons(r.meta.icons.map(({ name, x, y }) => ({ name, x, y })));
    icons = back.error ? { restored: false, error: back.error } : { restored: true };
  }
  return { done: r.done.length, failed: r.failed.map(m => ({ src: m.dst, error: m.error })), icons };
});

ipcMain.handle('open-folder', async (_e, folder) => {
  if (await isFolder(folder)) await shell.openPath(folder);
});

// ---------- app ----------

app.whenReady().then(() => {
  lang = langFor(app.getPreferredSystemLanguages()[0] || app.getLocale());
  Menu.setApplicationMenu(null);
  createWindow();
  updater.start(win);
});

app.on('window-all-closed', () => app.quit());
