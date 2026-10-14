// Deterministic classification: fast, free and predictable.
// Functions here are pure; the scanner gathers the facts they look at.

const CATEGORIES = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp', '.tiff', '.svg', '.raw', '.cr2', '.nef', '.ico', '.psd', '.kra', '.ase', '.aseprite'],
  Videos: ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.m4v'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus', '.mid', '.midi', '.flp'],
  Documents: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.epub', '.djvu', '.fb2'],
  Spreadsheets: ['.xls', '.xlsx', '.ods', '.csv'],
  Presentations: ['.ppt', '.pptx', '.odp', '.key'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  Installers: ['.msi', '.msix', '.appx', '.msixbundle', '.appxbundle', '.dmg', '.pkg', '.deb', '.rpm', '.apk'],
  DiskImages: ['.iso', '.img', '.vhd', '.vhdx'],
  Code: ['.py', '.js', '.ts', '.css', '.json', '.xml', '.yaml', '.yml', '.sh', '.bat', '.cmd', '.ps1', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.gd', '.lua'],
  Fonts: ['.ttf', '.otf', '.woff', '.woff2'],
  Torrents: ['.torrent'],
};

const EXT_TO_CATEGORY = new Map(
  Object.entries(CATEGORIES).flatMap(([cat, exts]) => exts.map(ext => [ext, cat])),
);

// Unfinished downloads and shortcuts must stay where they are.
const SKIP_EXTS = new Set(['.crdownload', '.part', '.partial', '.download', '.tmp', '.lnk', '.url']);

const HTML_EXTS = new Set(['.html', '.htm']);

// Names a camera/phone/screenshot tool produced: their meaning is the date,
// so they are filed by month.
const GENERATED_NAME = /^(img|dsc|dscn|pxl|vid|mvimg|photo|screenshot|снимок экрана|скриншот)[ _-]?\d/i;

// ---------- .exe: installer or program ----------

const INSTALLER_NAME = new RegExp([
  'setup', 'install', 'инстал', 'установ', 'redist', 'update', '^unins', 'bootstrapper',
  '-init$', '_init$', 'webinstaller',
  // well-known downloads that do not say "setup"
  '^python-\\d', '^node-v\\d', '^git-\\d', '^7z\\d', '^npp\\.', '^vlc-\\d', '^obs-studio', '^winrar',
  '^blender-\\d', '^steam(setup)?$', '^epicinstaller', '^vscode', '^handbrake', '^audacity-win',
].join('|'), 'i');

// Byte signatures that installer builders leave inside the .exe.
const INSTALLER_MARKERS = [
  'Nullsoft', 'NullsoftInst', 'Inno Setup', 'InstallShield', '.wixburn', 'WixBundle',
  'Squirrel', '7zS.sfx', 'InstallAware', 'Advanced Installer', 'Setup Factory', 'Smart Install Maker',
];

function isInstallerName(stem) {
  return INSTALLER_NAME.test(stem);
}

// ---------- .html: game or saved page ----------

const GAME_HTML = /<canvas|requestanimationframe|phaser|pixi|three\.js|godot|unityloader|createunityinstance|kaboom|\bgame\b|игр/i;

function htmlKind(head, hasFilesFolder) {
  if (hasFilesFolder) return 'WebPages'; // "Page_files" next to it: saved from a browser
  return GAME_HTML.test(head) ? 'HtmlGames' : 'WebPages';
}

// ---------- folders ----------

const PROJECT_FILES = /^(project\.godot|package\.json|cargo\.toml|pyproject\.toml|requirements\.txt|cmakelists\.txt|makefile|go\.mod|build\.gradle|pom\.xml)$|\.(sln|csproj|uproject|vcxproj)$/i;
const PROJECT_DIRS = /^(\.git|projectsettings|\.godot|node_modules)$/i;
const GAME_FILES = /^(unityplayer\.dll|steam_api(64)?\.dll|data\.win|game\.ini|renpy\.exe|nw\.exe|ue4game\.exe)$|\.(pck|rpa|rgssad|rgss3a|upk|pak)$/i;
const GAME_DIRS = /(_data|^engine|^binaries|^renpy|^www)$/i;
const MEDIA_SHARE = 0.8;

// facts: { files: [{name, ext, depth}], dirs: [{name, depth}], indexHtmlHead: string|null }
function classifyFolder(facts) {
  const { files, dirs } = facts;
  if (!files.length) return null;
  const has = re => files.some(f => re.test(f.name));
  const hasDir = re => dirs.some(d => re.test(d.name));
  const top = files.filter(f => f.depth <= 1);

  const exes = top.filter(f => f.ext === '.exe');
  if (exes.length && (has(GAME_FILES) || hasDir(GAME_DIRS))) return 'Games';
  if (has(PROJECT_FILES) || hasDir(PROJECT_DIRS)) return 'Projects';

  if (facts.indexHtmlHead != null) {
    const engineFiles = files.some(f => ['.wasm', '.pck', '.data', '.unityweb'].includes(f.ext));
    return engineFiles || GAME_HTML.test(facts.indexHtmlHead) ? 'HtmlGames' : 'WebPages';
  }

  if (exes.length) {
    if (exes.every(f => isInstallerName(f.name.replace(/\.exe$/i, '')))) return 'Installers';
    return 'Programs';
  }

  const counts = {};
  for (const f of files) {
    const cat = categoryOf(f.ext);
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (best && files.length >= 2 && n / files.length >= MEDIA_SHARE
      && ['Images', 'Videos', 'Audio', 'Documents'].includes(best)) return best;
  return null; // mixed or unclear: leave the folder where the user put it
}

// ---------- series: files that clearly belong together ----------

const SERIES_STOPWORDS = new Set([
  'new', 'copy', 'untitled', 'document', 'image', 'photo', 'file', 'scan', 'export', 'final',
  'без', 'новый', 'новая', 'копия', 'документ', 'файл', 'имени', 'моя', 'мой',
]);
const SERIES_MIN = 3;

function seriesKey(stem) {
  const token = stem.split(/[\s_\-.()[\],]+/).find(Boolean) || '';
  if (token.length < 3 || /^\d+$/.test(token) || SERIES_STOPWORDS.has(token.toLowerCase())) return null;
  return token;
}

const categoryOf = ext => EXT_TO_CATEGORY.get(ext) || null;
const shouldSkip = ext => SKIP_EXTS.has(ext);
const isGeneratedName = stem => GENERATED_NAME.test(stem);

module.exports = {
  CATEGORIES, HTML_EXTS, INSTALLER_MARKERS, SERIES_MIN,
  categoryOf, shouldSkip, isGeneratedName, isInstallerName, htmlKind, classifyFolder, seriesKey,
};
