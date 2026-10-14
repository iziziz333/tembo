// Desktop icon layout: decides which group each icon belongs to and where
// it goes. Pure functions; reading and moving real icons lives in desktop.js.

const { CATEGORY_ORDER, names } = require('./i18n');

// Left to right on the desktop: each group starts in a new column.
const GROUP_ORDER = ['system', 'apps', 'games', 'tembo', 'folders', 'files'];

const GAME_TARGET = /\\(steamapps|epic games|riot games|gog galaxy\\games|gog games|ubisoft game launcher\\games|ea games|origin games|battle\.net|games|игры)\\/i;
const GAME_URL = /^URL=(steam:\/\/(rungameid|run)|com\.epicgames\.launcher:\/\/apps|uplay:\/\/|origin2?:\/\/|battlenet:\/\/|roblox)/im;

function isGameShortcut({ target = '', urlFile = '', unityNearby = false }) {
  return GAME_TARGET.test(target) || GAME_URL.test(urlFile) || unityNearby;
}

// Sort key for folders Tembo created: category order, review folder last.
function temboRank(name) {
  const lower = name.toLowerCase();
  for (const lang of ['ru', 'en']) {
    const n = names(lang);
    const i = CATEGORY_ORDER.findIndex(k => n[k].toLowerCase() === lower);
    if (i >= 0) return i;
    if (n.review.toLowerCase() === lower) return CATEGORY_ORDER.length;
  }
  return CATEGORY_ORDER.length + 1;
}

const collator = new Intl.Collator(['ru', 'en'], { numeric: true, sensitivity: 'base' });

// items: [{ name, group }]; grid: { origin: {x, y}, spacing: {x, y}, rows }
// Returns [{ name, x, y }] filling each group top-to-bottom, column by column.
function arrange(items, { origin, spacing, rows }) {
  rows = Math.max(1, rows | 0);
  const byGroup = new Map(GROUP_ORDER.map(g => [g, []]));
  for (const it of items) (byGroup.get(it.group) || byGroup.get('files')).push(it);

  const out = [];
  let col = 0;
  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group);
    if (!list.length) continue;
    list.sort((a, b) => group === 'tembo'
      ? temboRank(a.name) - temboRank(b.name) || collator.compare(a.name, b.name)
      : collator.compare(displayName(a.name), displayName(b.name)));
    list.forEach((it, i) => {
      out.push({
        name: it.name,
        x: origin.x + (col + Math.floor(i / rows)) * spacing.x,
        y: origin.y + (i % rows) * spacing.y,
      });
    });
    col += Math.ceil(list.length / rows);
  }
  return out;
}

// "Steam.lnk" sorts as "Steam".
function displayName(name) {
  return name.replace(/\.(lnk|url)$/i, '');
}

module.exports = { arrange, isGameShortcut, GROUP_ORDER };
