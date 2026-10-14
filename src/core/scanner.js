// Walks a folder and collects the facts the rules need: file metadata,
// what kind of thing each subfolder is, whether an .exe is an installer and
// whether an .html is a game. Content is read sparingly: duplicates are
// compared by their edges first, and only the head of files is sniffed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REVIEW_DIRS, TEMBO_DIRS } = require('./i18n');
const { HTML_EXTS, INSTALLER_MARKERS, isInstallerName, htmlKind, classifyFolder } = require('./rules');

const JOURNAL_DIR = '.tembo';
const ORGANIZED_LIMIT = 20000;
const ORGANIZED_DEPTH = 4;
const SAMPLE = 64 * 1024;
const FOLDER_ENTRY_LIMIT = 4000;
const FOLDER_DEPTH = 3;
const EXE_SNIFF = 1024 * 1024;

const isHidden = name => name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(name);
const isIgnoredDir = name => isHidden(name) || REVIEW_DIRS.has(name.toLowerCase());

// Paths inside a plan are relative and always use "/".
const toRel = (root, full) => path.relative(root, full).split(path.sep).join('/');
const toAbs = (root, rel) => path.join(root, ...rel.split('/'));

async function scan(root, { recursive = false, hash = true, inspect = true, onProgress } = {}) {
  root = path.resolve(root);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${root}`);

  const files = [];
  const topDirs = [];

  async function walk(dir, depth) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (isIgnoredDir(e.name)) continue;
        if (recursive) await walk(full, depth + 1);
        else if (depth === 0) topDirs.push({ full, name: e.name });
      } else if (e.isFile() && !isHidden(e.name)) {
        let st;
        try {
          st = await fs.promises.stat(full);
        } catch {
          continue; // vanished or locked while we looked
        }
        const ext = path.extname(e.name).toLowerCase();
        if (onProgress && files.length % 200 === 0) onProgress(files.length);
        files.push({
          path: toRel(root, full),
          name: e.name,
          stem: path.basename(e.name, path.extname(e.name)),
          ext,
          size: st.size,
          modified: st.mtime,
          sha256: null,
        });
      }
    }
  }

  await walk(root, 0);

  const folders = [];
  let organized = 0;
  const dirNames = new Set(topDirs.map(d => d.name.toLowerCase()));
  await Promise.all([
    hash ? findDuplicateCandidates(root, files) : null,
    inspect ? inspectFiles(root, files, dirNames) : null,
    ...topDirs.map(async d => {
      if (TEMBO_DIRS.has(d.name.toLowerCase()) || !inspect) {
        organized += await countFiles(d.full);
        return;
      }
      const folder = await inspectFolder(root, d, files);
      if (folder.kind) folders.push(folder);
      else organized += await countFiles(d.full);
    }),
  ]);
  folders.sort((a, b) => a.name.localeCompare(b.name));

  return { root, files, folders, organized: Math.min(ORGANIZED_LIMIT, organized) };
}

// ---------- files ----------

async function inspectFiles(root, files, dirNames) {
  for (const f of files) {
    if (f.ext === '.exe') {
      f.installer = isInstallerName(f.stem) || await hasInstallerMarker(toAbs(root, f.path), f.size);
    } else if (HTML_EXTS.has(f.ext)) {
      const head = await readHead(toAbs(root, f.path), SAMPLE);
      f.htmlKind = htmlKind(head, dirNames.has(`${f.stem}_files`.toLowerCase()));
    }
  }
}

async function hasInstallerMarker(file, size) {
  try {
    const fh = await fs.promises.open(file, 'r');
    try {
      const head = Buffer.alloc(Math.min(EXE_SNIFF, size));
      await fh.read(head, 0, head.length, 0);
      const tailLen = Math.min(EXE_SNIFF / 2, Math.max(0, size - head.length));
      const tail = Buffer.alloc(tailLen);
      if (tailLen) await fh.read(tail, 0, tailLen, size - tailLen);
      const bytes = Buffer.concat([head, tail]);
      return INSTALLER_MARKERS.some(m =>
        bytes.includes(Buffer.from(m, 'latin1')) || bytes.includes(Buffer.from(m, 'utf16le')));
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

async function readHead(file, bytes) {
  try {
    const fh = await fs.promises.open(file, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}

// ---------- folders ----------

// Looks inside a top-level folder (bounded) and decides what it is.
async function inspectFolder(root, dir, files) {
  const facts = { files: [], dirs: [], indexHtmlHead: null };
  let size = 0;
  let newest = 0;
  let complete = true;
  const queue = [[dir.full, 1]];
  while (queue.length && complete) {
    const [current, depth] = queue.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (facts.files.length + facts.dirs.length >= FOLDER_ENTRY_LIMIT) {
        complete = false;
        break;
      }
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        facts.dirs.push({ name: e.name, depth });
        if (depth < FOLDER_DEPTH && !e.isSymbolicLink()) queue.push([full, depth + 1]);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        facts.files.push({ name: e.name, ext, depth });
        try {
          const st = await fs.promises.stat(full);
          size += st.size;
          newest = Math.max(newest, st.mtimeMs);
        } catch {
          // unreadable file: it still counts for the kind
        }
        if (/^index\.html?$/i.test(e.name) && depth <= 2 && facts.indexHtmlHead == null) {
          facts.indexHtmlHead = await readHead(full, SAMPLE);
        }
      }
    }
  }

  // "Page_files" saved by a browser travels with its page.
  const page = dir.name.match(/^(.*)_files$/i);
  const pageHtml = page && files.find(f => HTML_EXTS.has(f.ext) && f.stem.toLowerCase() === page[1].toLowerCase());
  const kind = pageHtml ? 'WebPages' : classifyFolder(facts);

  return {
    path: toRel(root, dir.full),
    name: dir.name,
    kind,
    size,
    sizeComplete: complete,
    modified: new Date(newest || Date.now()),
    pageOf: pageHtml ? pageHtml.path : null,
  };
}

// Files already sitting in subfolders: the user (or Tembo) put them there.
// Only an estimate for the gauge, so it stops early in huge trees.
async function countFiles(dir) {
  let count = 0;
  const stack = [[dir, 1]];
  while (stack.length && count < ORGANIZED_LIMIT) {
    const [current, depth] = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && depth < ORGANIZED_DEPTH && !isIgnoredDir(e.name)) stack.push([path.join(current, e.name), depth + 1]);
      else if (e.isFile() && !isHidden(e.name)) count++;
    }
  }
  return count;
}

// ---------- duplicates ----------

async function findDuplicateCandidates(root, files) {
  const bySize = groupBy(files.filter(f => f.size > 0), f => f.size);
  for (const sameSize of bySize) {
    if (sameSize.length < 2) continue;
    // Cheap pass: same size files rarely share their first and last 64 KB.
    for (const f of sameSize) f.sample = await sampleHash(toAbs(root, f.path), f.size);
    for (const sameSample of groupBy(sameSize, f => f.sample)) {
      if (sameSample.length < 2) continue;
      for (const f of sameSample) {
        f.sha256 = f.size <= 2 * SAMPLE ? f.sample : await hashFile(toAbs(root, f.path));
      }
    }
  }
  for (const f of files) delete f.sample;
}

function groupBy(items, key) {
  const map = new Map();
  for (const it of items) {
    const k = key(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map.values();
}

async function sampleHash(file, size) {
  const h = crypto.createHash('sha256');
  const fh = await fs.promises.open(file, 'r');
  try {
    const len = Math.min(SAMPLE, size);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    h.update(buf);
    if (size > SAMPLE) {
      const tail = Math.min(SAMPLE, size - SAMPLE);
      const buf2 = Buffer.alloc(tail);
      await fh.read(buf2, 0, tail, size - tail);
      h.update(buf2);
    }
  } finally {
    await fh.close();
  }
  return h.digest('hex');
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file, { highWaterMark: 1 << 20 })
      .on('data', chunk => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

module.exports = { scan, toAbs, JOURNAL_DIR };
