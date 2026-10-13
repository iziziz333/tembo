// Walks a folder and collects file metadata. Content is hashed only for
// files whose sizes collide (duplicate candidates), and read in full only
// when their first and last bytes match too.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REVIEW_DIRS } = require('./i18n');

const JOURNAL_DIR = '.tembo';
const ORGANIZED_LIMIT = 20000;
const ORGANIZED_DEPTH = 4;
const SAMPLE = 64 * 1024;

const isHidden = name => name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(name);
const isIgnoredDir = name => isHidden(name) || REVIEW_DIRS.has(name.toLowerCase());

// Paths inside a plan are relative and always use "/".
const toRel = (root, full) => path.relative(root, full).split(path.sep).join('/');
const toAbs = (root, rel) => path.join(root, ...rel.split('/'));

async function scan(root, { recursive = false, hash = true, onProgress } = {}) {
  root = path.resolve(root);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${root}`);

  const files = [];
  const subdirs = [];

  async function walk(dir, depth) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (isIgnoredDir(e.name)) continue;
        if (recursive) await walk(full, depth + 1);
        else if (depth === 0) subdirs.push(full);
      } else if (e.isFile() && !isHidden(e.name)) {
        const st = await fs.promises.stat(full);
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
  const [counts] = await Promise.all([
    Promise.all(subdirs.map(countFiles)),
    hash ? findDuplicateCandidates(root, files) : null,
  ]);
  const organized = Math.min(ORGANIZED_LIMIT, counts.reduce((a, b) => a + b, 0));
  return { root, files, organized };
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
