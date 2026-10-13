// Builds a plan of moves. A plan is pure data: nothing touches the disk
// until the user reviews it and the executor applies it.

const { categoryOf, shouldSkip, isGeneratedName } = require('./rules');
const { names } = require('./i18n');

function buildPlan(files, lang = 'en') {
  const n = names(lang);
  const moves = [];
  const skipped = [];
  // Windows paths are case-insensitive: "Notes.txt" and "notes.txt" collide.
  const taken = new Set(files.map(f => f.path.toLowerCase()));
  const seenHashes = new Map();

  const sorted = [...files].sort((a, b) => a.modified - b.modified || a.path.localeCompare(b.path));
  for (const f of sorted) {
    if (shouldSkip(f.ext)) {
      skipped.push(f);
      continue;
    }

    // The oldest copy stays the original; newer identical copies go to review.
    if (f.sha256) {
      const original = seenHashes.get(f.sha256);
      if (!original) {
        seenHashes.set(f.sha256, f);
      } else {
        const dst = unique(`${n.review}/${n.duplicates}/${f.name}`, taken);
        moves.push({ file: f, dst, group: 'duplicates', duplicateOf: original.path });
        continue;
      }
    }

    const category = categoryOf(f.ext);
    if (!category) {
      moves.push({ file: f, dst: unique(`${n.review}/${n.unsorted}/${f.name}`, taken), group: 'unsorted' });
      continue;
    }

    let folder = n[category];
    if ((category === 'Images' || category === 'Videos') && isGeneratedName(f.stem)) {
      folder += `/${month(f.modified)}`;
    }
    const dst = `${folder}/${f.name}`;
    if (dst.toLowerCase() === f.path.toLowerCase()) continue;
    moves.push({ file: f, dst: unique(dst, taken), group: category });
  }

  return { moves, skipped };
}

function month(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Pick a destination nobody else uses: "a.txt" -> "a (2).txt".
function unique(dst, taken) {
  const slash = dst.lastIndexOf('/');
  const dir = dst.slice(0, slash + 1);
  const name = dst.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = dst;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${dir}${stem} (${i})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// A destination must stay inside the organized folder.
function isSafeDestination(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  const parts = rel.replace(/\\/g, '/').split('/');
  return !rel.startsWith('/') && !rel.startsWith('\\') && !/^[a-z]:/i.test(rel)
    && !parts.includes('..') && !parts.includes('') ;
}

module.exports = { buildPlan, isSafeDestination };
