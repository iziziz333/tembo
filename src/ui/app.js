'use strict';

const api = window.tembo;
const $ = id => document.getElementById(id);

const GROUPS = {
  Games: { icon: 'game', color: '#ff375f' },
  HtmlGames: { icon: 'game', color: '#ff9f0a' },
  Programs: { icon: 'window', color: '#5e5ce6' },
  Projects: { icon: 'code', color: '#34c759' },
  Scripts: { icon: 'terminal', color: '#1f2937' },
  Design: { icon: 'brush', color: '#bf5af2' },
  Models3D: { icon: 'cube', color: '#ff6b35' },
  AudioProjects: { icon: 'wave', color: '#ff2d55' },
  WebPages: { icon: 'globe', color: '#30b0c7' },
  Documents: { icon: 'doc', color: '#1a7cff' },
  Spreadsheets: { icon: 'table', color: '#34c759' },
  Presentations: { icon: 'slides', color: '#ff9f0a' },
  Images: { icon: 'img', color: '#5ac8fa' },
  Videos: { icon: 'video', color: '#af52de' },
  Audio: { icon: 'music', color: '#e0457b' },
  Archives: { icon: 'zip', color: '#a2845e' },
  Installers: { icon: 'app', color: '#64748b' },
  DiskImages: { icon: 'disc', color: '#8e8e93' },
  Code: { icon: 'code', color: '#8e8e93' },
  Fonts: { icon: 'font', color: '#ff9f0a' },
  Torrents: { icon: 'down', color: '#8e8e93' },
  duplicates: { icon: 'dup', color: '#5e5ce6' },
  unsorted: { icon: 'eye', color: '#ff9f0a' },
};
const ROWS_PREVIEW = 5;

const state = {
  env: null,
  folder: null,
  data: null,
  selected: new Set(),
  expanded: new Set(),
  showAll: new Set(),
  query: '',
};

// ---------- formatting ----------

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
const files = n => `${n} ${plural(n, ['файл', 'файла', 'файлов'])}`;
const dirs = n => `${n} ${plural(n, ['папка', 'папки', 'папок'])}`;

// "2 папки · 3 файла": what a group or plan actually holds.
function countLabel(moves) {
  const nd = moves.filter(m => m.isFolder).length;
  const nf = moves.length - nd;
  return [nd && dirs(nd), nf && files(nf)].filter(Boolean).join(' · ') || files(0);
}

function size(bytes) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const digits = v >= 10 || i === 0 ? 0 : 1;
  return `${v.toFixed(digits).replace('.', ',')} ${units[i]}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function icon(name, color, cls = 'ic') {
  const span = el('span', cls);
  span.style.background = color;
  span.innerHTML = `<svg><use href="#i-${name}"/></svg>`;
  return span;
}

function svgIcon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#i-${name}`);
  s.append(u);
  return s;
}

// ---------- data helpers ----------

function groupLabel(key) {
  const n = state.data.folderNames;
  if (key === 'duplicates') return n.duplicates;
  if (key === 'unsorted') return n.unsorted;
  return n[key] || key;
}

function groupsOf(moves) {
  const map = new Map();
  for (const m of moves) {
    if (!map.has(m.group)) map.set(m.group, []);
    map.get(m.group).push(m);
  }
  // Same order as the folders Tembo creates, review groups last.
  const order = [...state.data.categoryOrder, 'duplicates', 'unsorted'];
  return [...map.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

function folderTitle(folder) {
  const { downloads, desktop } = state.env;
  if (folder === downloads) return 'Загрузки';
  if (folder === desktop) return 'Рабочий стол';
  return state.data ? state.data.name : folder;
}

// ---------- sidebar ----------

// Loose-file counts of the folders that are not open right now.
const looseCounts = new Map();

function refreshCards({ rescan = false } = {}) {
  const { downloads, desktop } = state.env;
  for (const [id, folder] of [['card-downloads', downloads], ['card-desktop', desktop]]) {
    const card = $(id);
    const show = n => {
      card.querySelector('.n').textContent = n == null ? '–' : n;
      card.disabled = n === null;
    };
    card.classList.toggle('on', state.folder === folder);
    if (state.folder === folder) {
      // The open folder is counted by its own scan, never twice.
      if (state.data) show(state.data.moves.length);
      else if (rescan) api.looseCount(folder).then(show);
      looseCounts.delete(folder);
    } else if (looseCounts.has(folder) && !rescan) {
      show(looseCounts.get(folder));
    } else if (state.data || rescan) {
      api.looseCount(folder).then(n => { looseCounts.set(folder, n); show(n); });
    }
  }
  const moves = state.data ? state.data.moves : [];
  for (const key of ['duplicates', 'unsorted']) {
    const n = moves.filter(m => m.group === key).length;
    const card = $(`card-${key}`);
    card.querySelector('.n').textContent = state.data ? n : '–';
    card.disabled = !n;
  }
}

function renderRecent() {
  const box = $('recent');
  box.replaceChildren();
  const { downloads, desktop, recent } = state.env;
  for (const r of recent.filter(r => r.folder !== downloads && r.folder !== desktop)) {
    const b = el('button', 'li');
    b.classList.toggle('on', r.folder === state.folder);
    b.title = r.folder;
    b.append(icon('folder', '#34c759'), el('span', 'nm', r.folder.split(/[\\/]/).filter(Boolean).pop() || r.folder));
    b.onclick = () => open(r.folder);
    box.append(b);
  }
  box.previousElementSibling.hidden = !box.children.length;
}

// ---------- plan view ----------

async function open(folder) {
  state.folder = folder;
  state.data = null;
  state.selected.clear();
  state.expanded.clear();
  state.showAll.clear();
  showView('plan');
  $('title').textContent = folderTitle(folder);
  $('subtitle').textContent = folder;
  $('count').textContent = '';
  $('list').replaceChildren(message('Сканирую папку…', ''));
  $('apply').disabled = true;
  $('undo-last').hidden = true;
  $('arrange-wrap').hidden = true;
  $('arrange-only').hidden = true;
  setOrb(null);
  renderComposition();
  renderRecent();
  refreshCards();

  try {
    const data = await api.analyze(folder);
    if (state.folder !== folder) return;
    state.data = data;
  } catch (e) {
    $('list').replaceChildren(message('Не удалось открыть папку', String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
    return;
  }

  const d = state.data;
  for (const m of d.moves) if (!m.kept) state.selected.add(m.id);
  const groups = groupsOf(d.moves);
  if (groups.length) state.expanded.add(groups[0][0]);

  $('title').textContent = folderTitle(folder);
  $('count').textContent = d.moves.length || '';
  const dupSize = d.moves.filter(m => m.group === 'duplicates').reduce((s, m) => s + m.size, 0);
  $('subtitle').textContent = dupSize ? `${folder} · дубликаты занимают ${size(dupSize)}` : folder;
  $('undo-last').hidden = !d.canUndo;
  $('arrange-wrap').hidden = !d.isDesktop;
  $('arrange-only').hidden = !d.isDesktop;

  const pct = d.organized + d.moves.length ? d.organized / (d.organized + d.moves.length) : 1;
  setOrb(pct);
  $('pct-text').textContent = d.moves.length
    ? `${d.organized} из ${d.organized + d.moves.length} уже лежат в своих папках`
    : 'Все файлы лежат в своих папках';
  renderComposition();
  renderList();
  refreshCards();
}

api.onScanProgress((folder, n) => {
  if (folder !== state.folder || state.data) return;
  const box = $('list').querySelector('.empty');
  if (box) box.lastChild.textContent = `Найдено ${files(n)}`;
});

function setOrb(pct) {
  $('pct').textContent = pct == null ? '–' : `${Math.round(pct * 100)}%`;
  // Surface height in the 200px box; keep a sliver of liquid visible at 0%.
  const y = pct == null ? 200 : Math.max(8, Math.min(196, 200 - pct * 200));
  $('level').style.setProperty('--lvl', `${y}px`);
}

function renderComposition() {
  const bar = $('bar');
  const legend = $('legend');
  bar.replaceChildren();
  legend.replaceChildren();
  const d = state.data;
  $('composition').hidden = Boolean(d && !d.moves.length);
  if (!d) {
    $('comp-sub').textContent = '';
    return;
  }
  const total = d.moves.reduce((s, m) => s + m.size, 0);
  $('comp-sub').textContent = `${countLabel(d.moves)} · ${size(total)}`;
  const parts = groupsOf(d.moves)
    .map(([key, list]) => ({ key, bytes: list.reduce((s, m) => s + m.size, 0) }))
    .sort((a, b) => b.bytes - a.bytes);
  for (const p of parts) {
    const seg = el('i');
    seg.style.flex = String(Math.max(p.bytes, total * 0.01));
    seg.style.background = GROUPS[p.key].color;
    bar.append(seg);
  }
  for (const p of parts.slice(0, 6)) {
    const item = el('span');
    const dot = el('i');
    dot.style.background = GROUPS[p.key].color;
    item.append(dot, `${groupLabel(p.key)} ${size(p.bytes)}`);
    legend.append(item);
  }
}

function message(title, text) {
  const box = el('div', 'empty');
  box.append(el('b', null, title));
  if (text != null) box.append(text);
  return box;
}

function renderList() {
  const list = $('list');
  const d = state.data;
  list.replaceChildren();
  if (!d.moves.length) {
    list.append(message('Здесь уже порядок', d.skipped ? `Недокачанные файлы и ярлыки (${d.skipped}) Tembo не трогает.` : 'Разбирать нечего.'));
    updateDock();
    return;
  }
  const q = state.query.toLowerCase();
  const visible = q ? d.moves.filter(m => m.name.toLowerCase().includes(q)) : d.moves;
  if (!visible.length) list.append(message('Ничего не найдено'));

  for (const [key, items] of groupsOf(visible)) {
    const all = d.moves.filter(m => m.group === key);
    const nSel = all.filter(m => state.selected.has(m.id)).length;
    const open = q || state.expanded.has(key);

    const head = el('div', `row h${open ? ' open' : ''}`);
    head.id = `group-${key}`;
    const chk = el('button', `chk${nSel === all.length ? ' on' : nSel ? ' part' : ''}`);
    chk.title = nSel === all.length ? 'Не трогать эту группу' : 'Разобрать всю группу';
    chk.onclick = e => {
      e.stopPropagation();
      const on = nSel !== all.length;
      for (const m of all) on ? state.selected.add(m.id) : state.selected.delete(m.id);
      renderList();
    };
    const meta = GROUPS[key];
    const bytes = all.reduce((s, m) => s + m.size, 0);
    const rt = el('span', 'rt', `${countLabel(all)} · ${size(bytes)}`);
    rt.append(svgIcon('chev', 'chev'));
    head.append(chk, icon(meta.icon, meta.color), el('span', 'fn', groupLabel(key)), rt);
    head.onclick = () => {
      state.expanded.has(key) ? state.expanded.delete(key) : state.expanded.add(key);
      renderList();
    };
    list.append(head);
    if (!open) continue;

    const shown = state.showAll.has(key) || q ? items : items.slice(0, ROWS_PREVIEW);
    for (const m of shown) list.append(fileRow(m));
    if (shown.length < items.length) {
      const more = el('button', 'more', `Показать ещё ${items.length - shown.length}`);
      more.onclick = () => { state.showAll.add(key); renderList(); };
      list.append(more);
    }
  }
  updateDock();
}

function fileRow(m) {
  const row = el('div', 'row');
  const chk = el('button', `chk${state.selected.has(m.id) ? ' on' : ''}`);
  chk.onclick = () => {
    state.selected.has(m.id) ? state.selected.delete(m.id) : state.selected.add(m.id);
    renderList();
  };
  const name = el('span', 'fn', m.name);
  name.title = `${m.src} → ${m.dst}`;
  if (m.isFolder) name.prepend(svgIcon('folder', 'fi'));
  let note = m.isFolder ? `папка · ${size(m.size)}` : size(m.size);
  if (m.duplicateOf) note = `копия «${m.duplicateOf.split('/').pop()}» · ${note}`;
  else if (m.series) note = `серия «${m.series}» · ${note}`;
  else if (m.dst.split('/').length > 2 && m.group !== 'unsorted') note = `${m.dst.split('/').slice(1, -1).join(' › ')} · ${note}`;
  if (m.kept && !state.selected.has(m.id)) note = `вы просили не трогать · ${note}`;
  row.append(chk, name, el('span', 'rt', note));
  return row;
}

function updateDock() {
  const d = state.data;
  const n = d ? d.moves.filter(m => state.selected.has(m.id)).length : 0;
  const total = d ? d.moves.length : 0;
  $('selinfo').textContent = total ? `Выбрано ${n} из ${total}` : '';
  $('apply').textContent = n ? `Разобрать ${files(n)}` : 'Разобрать';
  $('apply').disabled = !n;
}

// ---------- apply / done ----------

async function applyPlan() {
  const d = state.data;
  const ids = d.moves.filter(m => state.selected.has(m.id)).map(m => m.id);
  $('apply').disabled = true;
  $('apply').textContent = 'Разбираю…';
  let r;
  try {
    r = await api.apply(state.folder, ids, { arrange: d.isDesktop && $('arrange-opt').checked });
  } catch (e) {
    $('list').replaceChildren(message('Не получилось', String(e.message || e)));
    return;
  }
  state.env = await api.init();
  showDone(r);
}

function showDone(r) {
  const sorted = r.done.filter(m => m.group !== 'duplicates' && m.group !== 'unsorted').length;
  const dups = r.done.filter(m => m.group === 'duplicates').length;
  const unknown = r.done.filter(m => m.group === 'unsorted').length;

  $('done-title').textContent = r.failed.length && !r.done.length
    ? 'Ничего не перемещено'
    : `«${folderTitle(state.folder)}» в порядке`;
  const parts = [];
  if (sorted) parts.push(`Разложено по папкам: ${files(sorted)}.`);
  const review = [];
  if (dups) review.push(`${dups} ${plural(dups, ['дубликат', 'дубликата', 'дубликатов'])}`);
  if (unknown) review.push(`${files(unknown)} неизвестного типа`);
  if (review.length) parts.push(`${review.join(' и ')} — в папке «${r.reviewDir}», проверьте их, когда будет время.`);
  const icons = iconsNote(r.icons);
  if (icons) parts.push(icons);
  $('done-text').textContent = parts.join(' ');

  const failed = $('failed');
  failed.replaceChildren();
  failed.hidden = !r.failed.length;
  if (r.failed.length) {
    failed.append(`Не удалось переместить: ${files(r.failed.length)}`);
    for (const f of r.failed.slice(0, 5)) failed.append(el('div', null, `${f.src} — ${f.error}`));
  }
  $('undo').hidden = !r.done.length;
  state.data = null; // the plan is spent; counters wait for the next scan
  showView('done');
  renderRecent();
  refreshCards({ rescan: true });
}

function iconsNote(icons) {
  if (!icons) return '';
  if (icons.arranged) return 'Значки на рабочем столе расставлены по группам.';
  if (icons.autoArrange) return 'Значки не расставлены: в Windows включено «Упорядочить значки автоматически». Выключите его (правый клик по рабочему столу → Вид) и нажмите «Только расставить значки».';
  return `Значки расставить не удалось: ${icons.error}.`;
}

async function arrangeOnly() {
  const b = $('arrange-only');
  b.disabled = true;
  b.textContent = 'Расставляю…';
  let icons;
  try {
    icons = await api.arrange(state.folder);
  } catch (e) {
    icons = { error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') };
  } finally {
    b.disabled = false;
    b.textContent = 'Только расставить значки';
  }
  $('done-title').textContent = icons.arranged ? 'Значки расставлены' : 'Значки не расставлены';
  $('done-text').textContent = icons.arranged
    ? 'Системные значки, приложения, игры, папки разбора, ваши папки и файлы стоят своими колонками. «Отменить» вернёт всё, как было.'
    : iconsNote(icons);
  $('failed').hidden = true;
  $('undo').hidden = !icons.arranged;
  showView('done');
}

function showView(name) {
  $('plan-view').hidden = name !== 'plan';
  $('done-view').hidden = name !== 'done';
}

async function undoLast() {
  for (const b of [$('undo'), $('undo-last')]) b.disabled = true;
  try {
    const r = await api.undo(state.folder);
    if (r.failed.length) alert(`Не удалось вернуть ${files(r.failed.length)}: место занято или файл открыт.`);
  } finally {
    for (const b of [$('undo'), $('undo-last')]) b.disabled = false;
  }
  open(state.folder);
}

// ---------- updates ----------

function showUpdate(s) {
  $('update').hidden = s.state === 'idle';
  if (s.state === 'downloading') {
    $('update-title').textContent = `Обновление ${s.version}`;
    $('update-text').textContent = `Скачивается… ${s.percent || 0}%`;
    $('update-btn').hidden = true;
  } else if (s.state === 'ready') {
    $('update-title').textContent = `Версия ${s.version} готова`;
    $('update-text').textContent = 'Установится при перезапуске.';
    $('update-btn').hidden = false;
  }
}

// ---------- wiring ----------

async function main() {
  state.env = await api.init();
  $('card-downloads').onclick = () => open(state.env.downloads);
  $('card-desktop').onclick = () => open(state.env.desktop);
  for (const key of ['duplicates', 'unsorted']) {
    $(`card-${key}`).onclick = () => {
      if (!state.data) return;
      showView('plan');
      state.expanded.add(key);
      state.showAll.add(key);
      renderList();
      $(`group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }
  $('pick').onclick = async () => {
    const folder = await api.pickFolder();
    if (folder) open(folder);
  };
  $('apply').onclick = applyPlan;
  $('undo').onclick = undoLast;
  $('undo-last').onclick = undoLast;
  $('arrange-only').onclick = arrangeOnly;
  $('open').onclick = () => api.openFolder(state.folder);
  $('again').onclick = () => open(state.folder);
  $('search').oninput = e => {
    state.query = e.target.value.trim();
    if (state.data) renderList();
  };
  $('update-btn').onclick = () => api.installUpdate();
  api.onUpdateStatus(showUpdate);
  api.onOpenFolder(folder => open(folder));
  showUpdate(await api.updateStatus());
  open(state.env.downloads);
}

main();
