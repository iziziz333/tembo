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
  const { files, folders } = await scan(root, opts);
  return buildPlan(files, lang, folders);
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

test('mixed folders are left alone and counted as organized', async () => {
  const d = tmp();
  touch(d, 'Work/plan.docx');
  touch(d, 'Work/deep/a.mp3', 'a');
  touch(d, 'Work/x.zip', 'z');
  touch(d, 'loose.pdf');
  const { files, folders, organized } = await scan(d);
  assert.deepEqual(files.map(f => f.path), ['loose.pdf']);
  assert.deepEqual(folders, []);
  assert.equal(organized, 3);
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
  touch(d, 'A/x.mp3');
  touch(d, 'A/B/C/D/4.zip');
  touch(d, 'A/B/C/D/E/5.txt');
  assert.equal((await scan(d)).organized, 3);
});

// ---------- folders, programs, html, series ----------

test('folders are sorted by what is inside', async () => {
  const d = tmp();
  touch(d, 'my_godot_game/project.godot', 'config');
  touch(d, 'my_godot_game/main.gd', 'extends Node');
  touch(d, 'snake/index.html', '<html><canvas id="c"></canvas></html>');
  touch(d, 'snake/game.js', 'requestAnimationFrame(loop)');
  touch(d, 'landing/index.html', '<html><h1>Hello</h1></html>');
  touch(d, 'Hollow/Hollow.exe', 'MZ');
  touch(d, 'Hollow/UnityPlayer.dll', 'x');
  touch(d, 'Hollow/Hollow_Data/level0', 'x');
  touch(d, 'Tool/tool.exe', 'MZ');
  touch(d, 'Tool/tool.dll', 'x');
  touch(d, 'kenney_tiny/a.png', '1');
  touch(d, 'kenney_tiny/b.png', '22');
  touch(d, 'kenney_tiny/sub/c.png', '333');
  touch(d, 'misc/a.mp3', 'a');
  touch(d, 'misc/b.zip', 'b');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), {
    my_godot_game: 'Проекты/my_godot_game',
    snake: 'HTML-игры/snake',
    landing: 'Веб-страницы/landing',
    Hollow: 'Игры/Hollow',
    Tool: 'Программы/Tool',
    kenney_tiny: 'Изображения/kenney_tiny',
  });
});

test('Tembo folders are destinations, never sorted themselves', async () => {
  const d = tmp();
  touch(d, 'Документы/a.pdf');
  touch(d, 'Games/x/x.exe', 'MZ');
  touch(d, 'Games/x/UnityPlayer.dll', 'x');
  touch(d, 'b.pdf', 'b');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), { 'b.pdf': 'Документы/b.pdf' });
});

test('exe: installers by name or builder signature, the rest are programs', async () => {
  const d = tmp();
  touch(d, 'DiscordSetup.exe', 'MZ1');
  touch(d, 'python-3.12.0-amd64.exe', 'MZ22');
  touch(d, 'mystery.exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(5000), Buffer.from('Nullsoft Install System')]));
  touch(d, 'Godot_v4.7.2-stable_win64.exe', 'MZ333');
  touch(d, 'Godot_v4.7.2-stable_win64_console.exe', 'MZ4444');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), {
    'DiscordSetup.exe': 'Установщики/DiscordSetup.exe',
    'python-3.12.0-amd64.exe': 'Установщики/python-3.12.0-amd64.exe',
    'mystery.exe': 'Установщики/mystery.exe',
    'Godot_v4.7.2-stable_win64.exe': 'Программы/Godot_v4.7.2-stable_win64.exe',
    'Godot_v4.7.2-stable_win64_console.exe': 'Программы/Godot_v4.7.2-stable_win64_console.exe',
  });
});

test('html: games by content, saved pages travel with their _files folder', async () => {
  const d = tmp();
  touch(d, 'mycelium.html', '<!doctype html><canvas></canvas><script>requestAnimationFrame(f)</script>');
  touch(d, 'ambient.html', '<html><body><canvas id=game></canvas></body></html>');
  touch(d, 'Article.html', '<html><p>text</p></html>');
  touch(d, 'Article_files/style.css', 'p{}');
  touch(d, 'notes.htm', '<html><p>just notes</p></html>');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), {
    'mycelium.html': 'HTML-игры/mycelium.html',
    'ambient.html': 'HTML-игры/ambient.html',
    'Article.html': 'Веб-страницы/Article.html',
    Article_files: 'Веб-страницы/Article_files',
    'notes.htm': 'Веб-страницы/notes.htm',
  });
});

test('series of files with one prefix get a subfolder', async () => {
  const d = tmp();
  touch(d, 'IZROBOT2_take1.wav', '1');
  touch(d, 'IZROBOT2_take2.wav', '22');
  touch(d, 'IZROBOT2 final mix.wav', '333');
  touch(d, 'other.wav', '4444');
  touch(d, 'new_1.txt', 'a');
  touch(d, 'new_2.txt', 'bb');
  touch(d, 'new_3.txt', 'ccc');
  assert.deepEqual(moves(await plan(d, {}, 'ru')), {
    'IZROBOT2_take1.wav': 'Музыка/IZROBOT2/IZROBOT2_take1.wav',
    'IZROBOT2_take2.wav': 'Музыка/IZROBOT2/IZROBOT2_take2.wav',
    'IZROBOT2 final mix.wav': 'Музыка/IZROBOT2/IZROBOT2 final mix.wav',
    'other.wav': 'Музыка/other.wav',
    'new_1.txt': 'Документы/new_1.txt',
    'new_2.txt': 'Документы/new_2.txt',
    'new_3.txt': 'Документы/new_3.txt',
  });
});

test('folders move and come back on undo, with journal meta', async () => {
  const d = tmp();
  touch(d, 'snake/index.html', '<canvas></canvas>');
  touch(d, 'snake/assets/a.png', 'a');
  const before = snapshot(d);
  const meta = { icons: [{ name: 'snake', x: 10, y: 20 }] };
  const r = await executor.apply(d, asMoves(await plan(d, {}, 'ru')), meta);
  assert.equal(r.failed.length, 0);
  assert.ok(fs.existsSync(path.join(d, 'HTML-игры', 'snake', 'assets', 'a.png')));
  const u = await executor.undo(d);
  assert.deepEqual(u.meta, meta);
  assert.deepEqual(snapshot(d), before);
  assert.ok(!fs.existsSync(path.join(d, 'HTML-игры')), 'empty category folder removed');
});

test('version 1 journals still undo', async () => {
  const d = tmp();
  touch(d, 'Documents/a.pdf', 'a');
  fs.mkdirSync(path.join(d, '.tembo'));
  fs.writeFileSync(path.join(d, '.tembo', '20250101-000000-000.json'), JSON.stringify([{ src: 'a.pdf', dst: 'Documents/a.pdf' }]));
  const u = await executor.undo(d);
  assert.equal(u.failed.length, 0);
  assert.ok(fs.existsSync(path.join(d, 'a.pdf')));
});

// ---------- desktop layout ----------

const { arrange, isGameShortcut } = require('../src/core/layout');

test('desktop icons: each group in its own columns, in a fixed order', () => {
  const items = [
    { name: 'zeta folder', group: 'folders' },
    { name: 'Документы', group: 'tembo' },
    { name: 'Игры', group: 'tembo' },
    { name: 'Telegram.lnk', group: 'apps' },
    { name: 'Blender.lnk', group: 'apps' },
    { name: 'Chrome.lnk', group: 'apps' },
    { name: 'Terraria.url', group: 'games' },
    { name: '::{645FF040-5081-101B-9F08-00AA002F954E}', group: 'system' },
    { name: 'notes.txt', group: 'files' },
  ];
  const pos = Object.fromEntries(arrange(items, { origin: { x: 10, y: 5 }, spacing: { x: 100, y: 90 }, rows: 2 })
    .map(p => [p.name, [p.x, p.y]]));
  assert.deepEqual(pos, {
    '::{645FF040-5081-101B-9F08-00AA002F954E}': [10, 5],
    'Blender.lnk': [110, 5], 'Chrome.lnk': [110, 95], 'Telegram.lnk': [210, 5],
    'Terraria.url': [310, 5],
    'Игры': [410, 5], 'Документы': [410, 95],
    'zeta folder': [510, 5],
    'notes.txt': [610, 5],
  });
});

test('game shortcuts are recognised by launcher or install folder', () => {
  assert.ok(isGameShortcut({ urlFile: '[InternetShortcut]\r\nURL=steam://rungameid/105600\r\n' }));
  assert.ok(isGameShortcut({ urlFile: '[InternetShortcut]\nURL=com.epicgames.launcher://apps/Fortnite?action=launch' }));
  assert.ok(isGameShortcut({ target: 'D:\\SteamLibrary\\steamapps\\common\\Warframe\\Warframe.exe' }));
  assert.ok(isGameShortcut({ target: 'C:\\Games\\Rust\\Rust.exe' }));
  assert.ok(isGameShortcut({ target: 'C:\\Tools\\MyGame\\game.exe', unityNearby: true }));
  assert.ok(!isGameShortcut({ target: 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe' }));
  assert.ok(!isGameShortcut({ urlFile: '[InternetShortcut]\nURL=https://github.com' }));
});
