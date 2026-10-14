// Builds a plan of moves. A plan is pure data: nothing touches the disk
// until the user reviews it and the executor applies it.

const { categoryOf, shouldSkip, isGeneratedName, seriesKey, SERIES_MIN } = require('./rules');
const { names } = require('./i18n');

// Categories where several files with one name prefix get their own subfolder.
const SERIES_CATEGORIES = new Set(['Images', 'Videos', 'Audio', 'Documents', 'Spreadsheets', 'Presentations', 'Archives', 'HtmlGames', 'Code']);

function buildPlan(files, lang = 'en', folders = []) {
  const n = names(lang);
  const moves = [];
  const skipped = [];
  // Windows paths are case-insensitive: "Notes.txt" and "notes.txt" collide.
  const taken = new Set([...files, ...folders].map(f => f.path.toLowerCase()));
  const seenHashes = new Map();
  const pending = []; // category moves, finalized after series are known

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

    const category = fileCategory(f);
    if (!category) {
      moves.push({ file: f, dst: unique(`${n.review}/${n.unsorted}/${f.name}`, taken), group: 'unsorted' });
      continue;
    }
    pending.push({ file: f, category });
  }

  // Series: three or more files of one category starting with the same word
  // ("IZROBOT2_take1.wav", "IZROBOT2_take2.wav", ...) get a subfolder.
  const series = new Map();
  for (const p of pending) {
    if (!SERIES_CATEGORIES.has(p.category) || isGeneratedName(p.file.stem)) continue;
    const key = seriesKey(p.file.stem);
    if (!key) continue;
    const id = `${p.category}\n${key.toLowerCase()}`;
    if (!series.has(id)) series.set(id, { name: key, items: [] });
    series.get(id).items.push(p);
  }
  for (const s of series.values()) {
    if (s.items.length >= SERIES_MIN) for (const p of s.items) p.series = safeName(s.name);
  }

  for (const p of pending) {
    const f = p.file;
    let folder = n[p.category];
    if (p.series) folder += `/${p.series}`;
    else if ((p.category === 'Images' || p.category === 'Videos') && isGeneratedName(f.stem)) {
      folder += `/${month(f.modified)}`;
    }
    const dst = `${folder}/${f.name}`;
    if (dst.toLowerCase() === f.path.toLowerCase()) continue;
    moves.push({ file: f, dst: unique(dst, taken), group: p.category, series: p.series || null });
  }

  for (const d of folders) {
    if (!d.kind) continue;
    const dst = `${n[d.kind]}/${d.name}`;
    if (dst.toLowerCase() === d.path.toLowerCase()) continue;
    moves.push({ file: { ...d, isFolder: true }, dst: unique(dst, taken), group: d.kind });
  }

  return { moves, skipped };
}

function fileCategory(f) {
  if (f.ext === '.exe') return f.installer ? 'Installers' : 'Programs';
  if (f.htmlKind) return f.htmlKind;
  return categoryOf(f.ext);
}

function month(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function safeName(s) {
  return s.replace(/[<>:"/\\|?*]/g, '').replace(/[. ]+$/, '') || 'Series';
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
    && !parts.includes('..') && !parts.includes('');
}

module.exports = { buildPlan, isSafeDestination };
