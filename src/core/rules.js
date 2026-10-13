// Deterministic classification: fast, free and predictable.

const CATEGORIES = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp', '.tiff', '.svg', '.raw', '.cr2', '.nef', '.ico'],
  Videos: ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.m4v'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
  Documents: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.epub', '.djvu', '.fb2'],
  Spreadsheets: ['.xls', '.xlsx', '.ods', '.csv'],
  Presentations: ['.ppt', '.pptx', '.odp', '.key'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  Installers: ['.exe', '.msi', '.msix', '.appx', '.dmg', '.pkg', '.deb', '.rpm', '.apk'],
  DiskImages: ['.iso', '.img', '.vhd', '.vhdx'],
  Code: ['.py', '.js', '.ts', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sh', '.bat', '.cmd', '.ps1', '.java', '.c', '.cpp', '.cs', '.go', '.rs'],
  Fonts: ['.ttf', '.otf', '.woff', '.woff2'],
  Torrents: ['.torrent'],
};

const EXT_TO_CATEGORY = new Map(
  Object.entries(CATEGORIES).flatMap(([cat, exts]) => exts.map(ext => [ext, cat])),
);

// Unfinished downloads and shortcuts must stay where they are.
const SKIP_EXTS = new Set(['.crdownload', '.part', '.partial', '.download', '.tmp', '.lnk', '.url']);

// Names a camera/phone/screenshot tool produced: their meaning is the date,
// so they are filed by month.
const GENERATED_NAME = /^(img|dsc|dscn|pxl|vid|mvimg|photo|screenshot|снимок экрана|скриншот)[ _-]?\d/i;

const categoryOf = ext => EXT_TO_CATEGORY.get(ext) || null;
const shouldSkip = ext => SKIP_EXTS.has(ext);
const isGeneratedName = stem => GENERATED_NAME.test(stem);

module.exports = { CATEGORIES, categoryOf, shouldSkip, isGeneratedName };
