// Applies moves and undoes them. Every applied move is recorded in a journal
// inside the organized folder, so any run can be reverted later.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { isSafeDestination } = require('./planner');
const { toAbs, JOURNAL_DIR } = require('./scanner');

// meta: anything to bring back on undo (e.g. desktop icon positions).
async function apply(root, moves, meta = null) {
  root = path.resolve(root);
  const journalDir = path.join(root, JOURNAL_DIR);
  await fs.promises.mkdir(journalDir, { recursive: true });
  hideOnWindows(journalDir);
  const journal = path.join(journalDir, `${stamp()}.json`);

  const done = [];
  const failed = [];
  try {
    for (const m of moves) {
      const error = await move(root, m.src, m.dst);
      if (error) failed.push({ ...m, error });
      else done.push(m);
    }
  } finally {
    // Written even if we crash midway: whatever moved can be reverted.
    await writeJournal(journal, done.map(m => ({ src: m.src, dst: m.dst })), meta);
  }
  return { done, failed, journal };
}

async function lastJournal(root) {
  const dir = path.join(path.resolve(root), JOURNAL_DIR);
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return null;
  }
  const journals = names.filter(n => n.endsWith('.json')).sort();
  return journals.length ? path.join(dir, journals[journals.length - 1]) : null;
}

// Revert the most recent run that has not been undone yet.
async function undo(root) {
  root = path.resolve(root);
  const journal = await lastJournal(root);
  if (!journal) return { done: [], failed: [], journal: null, meta: null };

  const data = JSON.parse(await fs.promises.readFile(journal, 'utf8'));
  // Version 1 journals were a bare list of moves.
  const entries = Array.isArray(data) ? data : data.moves;
  const meta = Array.isArray(data) ? null : data.meta;
  const done = [];
  const failed = [];
  for (const e of [...entries].reverse()) {
    const error = await move(root, e.dst, e.src);
    if (error) {
      failed.push({ ...e, error });
    } else {
      done.push(e);
      await removeEmptyParents(root, toAbs(root, e.dst));
    }
  }

  if (failed.length) {
    // Keep only what is still to be reverted, so undo can be retried.
    await writeJournal(journal, failed.map(({ src, dst }) => ({ src, dst })), meta);
  } else {
    await fs.promises.rename(journal, journal.replace(/\.json$/, '.undone'));
  }
  return { done, failed, journal, meta };
}

function writeJournal(file, moves, meta) {
  return fs.promises.writeFile(file, JSON.stringify({ version: 2, moves, meta }, null, 1), 'utf8');
}

async function move(root, src, dst) {
  if (!isSafeDestination(src) || !isSafeDestination(dst)) return 'путь вне папки';
  const s = toAbs(root, src);
  const d = toAbs(root, dst);
  if (!(await exists(s))) return 'файл пропал';
  if (await exists(d)) return 'место уже занято';
  try {
    await fs.promises.mkdir(path.dirname(d), { recursive: true });
    await fs.promises.rename(s, d);
  } catch (e) {
    return e.code === 'EBUSY' || e.code === 'EPERM' ? 'файл открыт в другой программе' : e.message;
  }
  return null;
}

async function exists(p) {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function removeEmptyParents(root, file) {
  let dir = path.dirname(file);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    try {
      await fs.promises.rmdir(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

function hideOnWindows(dir) {
  if (process.platform === 'win32') execFile('attrib', ['+h', dir], () => {});
}

module.exports = { apply, undo, lastJournal };
