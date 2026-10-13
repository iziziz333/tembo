const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scan } = require('../src/core/scanner');
const { buildPlan, isSafeDestination } = require('../src/core/planner');
const executor = require('../src/core/executor');
const { langFor } = require('../src/core/i18n');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tembo-'));
}

function touch(root, rel, data = 'x', when = '2025-07-14T12:00:00') {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  const t = new Date(when);
  fs.utimesSync(p, t, t);
}

async function plan(root, opts = {}, lang = 'en') {
  const { files } = await scan(root, opts);
  return buildPlan(files, lang);
}

const moves = p => Object.fromEntries(p.moves.map(m => [m.file.path, m.dst]));

function snapshot(root) {
  const out = {};
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.name === '.tembo') continue;
      if (e.isDirectory()) walk(full);
      else out[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
    }
  })(root);
  return out;
}

test('sorts by type', async () => {
  const d = tmp();
  touch(d, 'report.pdf');
  touch(d, 'setup.exe', 'yy');
  touch(d, 'song.mp3', 'zzz');
  assert.deepEqual(moves(await plan(d)), {
    'report.pdf': 'Documents/report.pdf',
    'setup.exe': 'Installers/setup.exe',
    'song.mp3': 'Music/song.mp3',
  });
});

test('russian folder names', async () => {
  const d = tmp();
  touch(d, 'report.pdf');
  touch(d, 'weird.xyz', '?');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), {
    'report.pdf': 'Документы/report.pdf',
    'weird.xyz': '_Tembo на проверку/Неизвестные/weird.xyz',
  });
});

test('language from locale', () => {
  assert.equal(langFor('ru-RU'), 'ru');
  assert.equal(langFor('uk'), 'ru');
  assert.equal(langFor('en-US'), 'en');
  assert.equal(langFor(''), 'en');
});

test('camera photos grouped by month', async () => {
  const d = tmp();
  touch(d, 'IMG_2034.jpg');
  touch(d, 'logo.png', 'other');
  const m = moves(await plan(d));
  assert.equal(m['IMG_2034.jpg'], 'Images/2025-07/IMG_2034.jpg');
  assert.equal(m['logo.png'], 'Images/logo.png');
});

test('duplicates keep the oldest copy', async () => {
  const d = tmp();
  touch(d, 'a.txt', 'same', '2025-01-01T00:00:00');
  touch(d, 'a (1).txt', 'same', '2025-02-01T00:00:00');
  const p = await plan(d);
  const m = moves(p);
  assert.equal(m['a.txt'], 'Documents/a.txt');
  assert.equal(m['a (1).txt'], '_Tembo Review/Duplicates/a (1).txt');
  assert.equal(p.moves.find(x => x.group === 'duplicates').duplicateOf, 'a.txt');
});

test('unknown types go to review, unfinished downloads are skipped', async () => {
  const d = tmp();
  touch(d, 'mystery.xyz');
  touch(d, 'movie.mp4.crdownload');
  touch(d, '.hidden');
  touch(d, 'desktop.ini', 'ini');
  const p = await plan(d);
  assert.deepEqual(moves(p), { 'mystery.xyz': '_Tembo Review/Unsorted/mystery.xyz' });
  assert.deepEqual(p.skipped.map(f => f.path), ['movie.mp4.crdownload']);
});

test('name conflicts get a suffix, case-insensitively', async () => {
  const d = tmp();
  touch(d, 'notes.txt', '1');
  touch(d, 'sub/Notes.txt', '22');
  const values = Object.values(moves(await plan(d, { recursive: true }))).sort();
  assert.deepEqual(values, ['Documents/notes.txt', 'Documents/Notes (2).txt'].sort());
});

test('subfolders are left alone and counted as organized', async () => {
  const d = tmp();
  touch(d, 'Work/plan.docx');
  touch(d, 'Work/deep/a.txt', 'a');
  touch(d, 'loose.pdf');
  const { files, organized } = await scan(d);
  assert.deepEqual(files.map(f => f.path), ['loose.pdf']);
  assert.equal(organized, 2);
});

test('safe destinations', () => {
  assert.ok(isSafeDestination('Documents/a.pdf'));
  for (const bad of ['../a', '/etc/passwd', 'C:/Windows/x', 'C:\\x', 'a/../../b', '', 'a//b']) {
    assert.ok(!isSafeDestination(bad), bad);
  }
});

function messy(d) {
  touch(d, 'report.pdf', 'r');
  touch(d, 'IMG_1.jpg', 'img');
  touch(d, 'copy.pdf', 'r', '2025-08-01T00:00:00');
  touch(d, 'weird.xyz', '?');
  touch(d, 'Work/keep.docx', 'k');
}

const asMoves = p => p.moves.map(m => ({ src: m.file.path, dst: m.dst }));

test('apply then undo restores everything', async () => {
  const d = tmp();
  messy(d);
  const before = snapshot(d);
  const entriesBefore = fs.readdirSync(d).sort();

  const r = await executor.apply(d, asMoves(await plan(d)));
  assert.equal(r.failed.length, 0);
  assert.equal(r.done.length, 4);
  assert.ok(fs.existsSync(path.join(d, 'Documents', 'report.pdf')));
  assert.ok(fs.existsSync(path.join(d, 'Images', '2025-07', 'IMG_1.jpg')));
  assert.deepEqual((await plan(d)).moves, [], 'a rescan finds nothing to do');

  const u = await executor.undo(d);
  assert.equal(u.failed.length, 0);
  assert.deepEqual(snapshot(d), before);
  assert.deepEqual(fs.readdirSync(d).sort(), [...entriesBefore, '.tembo'].sort());
  assert.equal((await executor.undo(d)).journal, null, 'nothing left to undo');
});

test('apply never overwrites', async () => {
  const d = tmp();
  touch(d, 'a.pdf', 'new');
  touch(d, 'Documents/a.pdf', 'old');
  const r = await executor.apply(d, [{ src: 'a.pdf', dst: 'Documents/a.pdf' }]);
  assert.equal(r.failed.length, 1);
  assert.equal(fs.readFileSync(path.join(d, 'Documents', 'a.pdf'), 'utf8'), 'old');
});

test('apply rejects paths outside the folder', async () => {
  const d = tmp();
  touch(d, 'a.pdf');
  const r = await executor.apply(d, [{ src: 'a.pdf', dst: '../escaped.pdf' }]);
  assert.equal(r.failed.length, 1);
  assert.ok(fs.existsSync(path.join(d, 'a.pdf')));
});

test('undo skips conflicts and can be retried', async () => {
  const d = tmp();
  touch(d, 'a.pdf', 'a');
  await executor.apply(d, asMoves(await plan(d)));
  touch(d, 'a.pdf', 'someone else');
  assert.equal((await executor.undo(d)).failed.length, 1);
  fs.unlinkSync(path.join(d, 'a.pdf'));
  const u = await executor.undo(d);
  assert.equal(u.failed.length, 0);
  assert.equal(fs.readFileSync(path.join(d, 'a.pdf'), 'utf8'), 'a');
});

test('large files: same edges but different middle are not duplicates', async () => {
  const d = tmp();
  const size = 512 * 1024;
  const a = Buffer.alloc(size, 1);
  const b = Buffer.from(a);
  b[size / 2] = 2; // differs only in the middle
  touch(d, 'a.iso', a, '2025-01-01T00:00:00');
  touch(d, 'b.iso', b, '2025-01-02T00:00:00');
  touch(d, 'c.iso', a, '2025-01-03T00:00:00'); // a true copy of a.iso
  const p = await plan(d);
  const dups = p.moves.filter(m => m.group === 'duplicates');
  assert.deepEqual(dups.map(m => [m.file.path, m.duplicateOf]), [['c.iso', 'a.iso']]);
});

test('subfolder count stops at depth 4', async () => {
  const d = tmp();
  touch(d, 'A/1.txt');
  touch(d, 'A/B/C/D/4.txt');
  touch(d, 'A/B/C/D/E/5.txt');
  assert.equal((await scan(d)).organized, 2);
});
