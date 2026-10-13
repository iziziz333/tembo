// Walks a folder and collects file metadata. Content is hashed only for
// files whose sizes collide (duplicate candidates).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REVIEW_DIRS } = require('./i18n');

const JOURNAL_DIR = '.tembo';
const ORGANIZED_LIMIT = 50000;

const isHidden = name => name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(name);
const isIgnoredDir = name => isHidden(name) || REVIEW_DIRS.has(name.toLowerCase());

// Paths inside a plan are relative and always use "/".
const toRel = (root, full) => path.relative(root, full).split(path.sep).join('/');
const toAbs = (root, rel) => path.join(root, ...rel.split('/'));

async function scan(root, { recursive = false, hash = true } = {}) {
  root = path.resolve(root);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${root}`);

  const files = [];
  let organized = 0;

  async function walk(dir, depth) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (isIgnoredDir(e.name)) continue;
        if (recursive) await walk(full, depth + 1);
        else if (depth === 0) organized += await countFiles(full);
      } else if (e.isFile() && !isHidden(e.name)) {
        const st = await fs.promises.stat(full);
        const ext = path.extname(e.name).toLowerCase();
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
  if (hash) await hashSizeCollisions(root, files);
  return { root, files, organized };
}

// Files already sitting in subfolders: the user (or Tembo) put them there.
async function countFiles(dir) {
  let count = 0;
  const stack = [dir];
  while (stack.length && count < ORGANIZED_LIMIT) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && !isIgnoredDir(e.name)) stack.push(path.join(current, e.name));
      else if (e.isFile() && !isHidden(e.name)) count++;
    }
  }
  return count;
}

async function hashSizeCollisions(root, files) {
  const bySize = new Map();
  for (const f of files) {
    if (f.size === 0) continue;
    if (!bySize.has(f.size)) bySize.set(f.size, []);
    bySize.get(f.size).push(f);
  }
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    for (const f of group) f.sha256 = await hashFile(toAbs(root, f.path));
  }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', chunk => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

module.exports = { scan, toAbs, JOURNAL_DIR };
