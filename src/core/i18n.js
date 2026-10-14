// Folder names Tembo creates, in the language of the system.

const NAMES = {
  ru: {
    Games: 'Игры', HtmlGames: 'HTML-игры', WebPages: 'Веб-страницы', Projects: 'Проекты',
    Programs: 'Программы', Installers: 'Установщики', Scripts: 'Скрипты',
    AudioProjects: 'Музыкальные проекты', Design: 'Графика', Models3D: '3D-модели',
    Images: 'Изображения', Videos: 'Видео', Audio: 'Музыка', Documents: 'Документы',
    Spreadsheets: 'Таблицы', Presentations: 'Презентации', Archives: 'Архивы',
    DiskImages: 'Образы дисков', Code: 'Код', Fonts: 'Шрифты', Torrents: 'Торренты',
    review: '_Tembo на проверку', duplicates: 'Дубликаты', unsorted: 'Неизвестные',
  },
  en: {
    Games: 'Games', HtmlGames: 'HTML Games', WebPages: 'Web Pages', Projects: 'Projects',
    Programs: 'Programs', Installers: 'Installers', Scripts: 'Scripts',
    AudioProjects: 'Music Projects', Design: 'Design', Models3D: '3D Models',
    Images: 'Images', Videos: 'Videos', Audio: 'Music', Documents: 'Documents',
    Spreadsheets: 'Spreadsheets', Presentations: 'Presentations', Archives: 'Archives',
    DiskImages: 'Disk Images', Code: 'Code', Fonts: 'Fonts', Torrents: 'Torrents',
    review: '_Tembo Review', duplicates: 'Duplicates', unsorted: 'Unsorted',
  },
};

// Display and layout order of the folders Tembo creates.
const CATEGORY_ORDER = [
  'Games', 'HtmlGames', 'Programs', 'Projects', 'Scripts', 'Documents', 'Spreadsheets',
  'Presentations', 'Images', 'Design', 'Models3D', 'Videos', 'Audio', 'AudioProjects',
  'WebPages', 'Archives', 'Installers', 'DiskImages', 'Code', 'Fonts', 'Torrents',
];

const RU_LOCALES = ['ru', 'uk', 'be', 'kk'];

function langFor(locale = '') {
  return RU_LOCALES.includes(locale.toLowerCase().split(/[-_]/)[0]) ? 'ru' : 'en';
}

function names(lang) {
  return NAMES[lang] || NAMES.en;
}

// Review folders of every language, so a rescan never sorts them again.
const REVIEW_DIRS = new Set(Object.values(NAMES).map(n => n.review.toLowerCase()));

// Folders Tembo itself creates, in every language: they are destinations,
// never something to sort.
const TEMBO_DIRS = new Set(
  Object.values(NAMES).flatMap(n => [...CATEGORY_ORDER.map(k => n[k]), n.review]).map(s => s.toLowerCase()),
);

module.exports = { langFor, names, REVIEW_DIRS, TEMBO_DIRS, CATEGORY_ORDER };
