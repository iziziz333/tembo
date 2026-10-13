// Folder names Tembo creates, in the language of the system.

const NAMES = {
  ru: {
    Images: 'Изображения', Videos: 'Видео', Audio: 'Музыка', Documents: 'Документы',
    Spreadsheets: 'Таблицы', Presentations: 'Презентации', Archives: 'Архивы',
    Installers: 'Установщики', DiskImages: 'Образы дисков', Code: 'Код',
    Fonts: 'Шрифты', Torrents: 'Торренты',
    review: '_Tembo на проверку', duplicates: 'Дубликаты', unsorted: 'Неизвестные',
  },
  en: {
    Images: 'Images', Videos: 'Videos', Audio: 'Music', Documents: 'Documents',
    Spreadsheets: 'Spreadsheets', Presentations: 'Presentations', Archives: 'Archives',
    Installers: 'Installers', DiskImages: 'Disk Images', Code: 'Code',
    Fonts: 'Fonts', Torrents: 'Torrents',
    review: '_Tembo Review', duplicates: 'Duplicates', unsorted: 'Unsorted',
  },
};

const RU_LOCALES = ['ru', 'uk', 'be', 'kk'];

function langFor(locale = '') {
  return RU_LOCALES.includes(locale.toLowerCase().split(/[-_]/)[0]) ? 'ru' : 'en';
}

function names(lang) {
  return NAMES[lang] || NAMES.en;
}

// Review folders of every language, so a rescan never sorts them again.
const REVIEW_DIRS = new Set(Object.values(NAMES).map(n => n.review.toLowerCase()));

module.exports = { langFor, names, REVIEW_DIRS };
