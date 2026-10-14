// Desktop icons on Windows: snapshot, restore and arrange them by group.
// Talks to Explorer through desktop-icons.ps1; every failure is reported,
// never thrown, because files are sorted correctly either way.

const { app, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { arrange, isGameShortcut } = require('./core/layout');
const { TEMBO_DIRS } = require('./core/i18n');

const supported = process.platform === 'win32';
let scriptPath = null;

function script() {
  if (!scriptPath) {
    // The app is packed into an archive PowerShell cannot read; copy the script out.
    scriptPath = path.join(app.getPath('temp'), `tembo-desktop-icons-${process.pid}.ps1`);
    fs.writeFileSync(scriptPath, fs.readFileSync(path.join(__dirname, 'desktop-icons.ps1')));
  }
  return scriptPath;
}

function run(args) {
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script(), ...args],
      { windowsHide: true, timeout: 45000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        const line = String(stdout || '').trim().split(/\r?\n/).pop() || '';
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({ error: err ? err.message : 'нет ответа от Проводника' });
        }
      });
  });
}

async function getIcons() {
  if (!supported) return { error: 'только Windows' };
  return run(['get']);
}

async function setIcons(icons) {
  if (!supported) return { error: 'только Windows' };
  if (!icons.length) return { placed: 0, missing: [] };
  const file = path.join(os.tmpdir(), `tembo-icons-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(icons), 'utf8');
  try {
    return await run(['set', file]);
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

const publicDesktop = () => path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
const isHidden = name => name.startsWith('.') || /^desktop\.ini$/i.test(name);

function listDir(dir) {
  try {
    return fs.readdirSync(dir).filter(n => !isHidden(n)).map(n => path.join(dir, n));
  } catch {
    return [];
  }
}

// Which column an icon belongs to.
function groupOf(full) {
  const name = path.basename(full);
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    return 'files';
  }
  if (st.isDirectory()) return TEMBO_DIRS.has(name.toLowerCase()) ? 'tembo' : 'folders';
  const ext = path.extname(name).toLowerCase();
  if (ext === '.lnk') {
    let target = '';
    try {
      target = shell.readShortcutLink(full).target || '';
    } catch {
      return 'apps';
    }
    try {
      if (target && fs.statSync(target).isDirectory()) return 'folders';
    } catch {
      // broken shortcut: still an app shortcut
    }
    const unityNearby = Boolean(target) && fs.existsSync(path.join(path.dirname(target), 'UnityPlayer.dll'));
    return isGameShortcut({ target, unityNearby }) ? 'games' : 'apps';
  }
  if (ext === '.url') {
    let urlFile = '';
    try {
      urlFile = fs.readFileSync(full, 'utf8');
    } catch {
      // unreadable: treat as a plain link
    }
    return isGameShortcut({ urlFile }) ? 'games' : 'apps';
  }
  if (ext === '.exe') return 'apps';
  return 'files';
}

// Puts every desktop icon into its group's columns.
async function arrangeDesktop(desktopDir) {
  const state = await getIcons();
  if (state.error) return { arranged: false, error: state.error };
  if (state.autoArrange) return { arranged: false, autoArrange: true };

  const items = [];
  const seen = new Set();
  for (const full of [...listDir(desktopDir), ...listDir(publicDesktop())]) {
    const name = path.basename(full);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, group: groupOf(full) });
  }
  for (const ic of state.items) {
    if (ic.name.startsWith('::') && !seen.has(ic.name.toLowerCase())) items.push({ name: ic.name, group: 'system' });
  }

  const spacing = state.spacing && state.spacing.x > 0 ? state.spacing : { x: 100, y: 100 };
  const xs = state.items.map(i => i.x);
  const ys = state.items.map(i => i.y);
  const origin = {
    x: xs.length ? Math.min(...xs) : state.workArea.left,
    y: ys.length ? Math.min(...ys) : state.workArea.top,
  };
  const rows = Math.floor((state.workArea.bottom - origin.y) / spacing.y);
  const r = await setIcons(arrange(items, { origin, spacing, rows }));
  if (r.error) return { arranged: false, error: r.error };
  return { arranged: true, placed: r.placed, missing: r.missing || [] };
}

module.exports = { supported, getIcons, setIcons, arrangeDesktop };
