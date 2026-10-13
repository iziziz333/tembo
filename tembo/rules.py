"""Deterministic classification. Anything these rules can decide never goes
to Claude: it is faster, free, and predictable."""

from __future__ import annotations

import re

from .scanner import FileInfo

CATEGORIES: dict[str, set[str]] = {
    "Images": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp", ".tiff", ".svg", ".raw", ".cr2", ".nef"},
    "Videos": {".mp4", ".mov", ".mkv", ".avi", ".webm", ".wmv", ".m4v"},
    "Audio": {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus"},
    "Documents": {".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".epub", ".djvu"},
    "Spreadsheets": {".xls", ".xlsx", ".ods", ".csv"},
    "Presentations": {".ppt", ".pptx", ".odp", ".key"},
    "Archives": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"},
    "Installers": {".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".apk", ".appimage"},
    "Disk Images": {".iso", ".img"},
    "Code": {".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".yaml", ".yml", ".sh", ".bat", ".ps1", ".java", ".c", ".cpp", ".cs", ".go", ".rs"},
    "Fonts": {".ttf", ".otf", ".woff", ".woff2"},
    "Torrents": {".torrent"},
}

EXT_TO_CATEGORY = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}

# Unfinished downloads and shortcuts must stay where they are.
SKIP_EXTS = {".crdownload", ".part", ".partial", ".download", ".tmp", ".lnk", ".url"}

# Names a camera/phone/screenshot tool produced: their meaning is the date,
# so rules can file them without asking Claude.
GENERATED_NAME = re.compile(
    r"^(img|dsc|dscn|pxl|vid|mvimg|photo|screenshot|снимок экрана|скриншот)[ _-]?\d",
    re.IGNORECASE,
)


def category_of(f: FileInfo) -> str | None:
    return EXT_TO_CATEGORY.get(f.ext)


def should_skip(f: FileInfo) -> bool:
    return f.ext in SKIP_EXTS


def is_generated_name(f: FileInfo) -> bool:
    return bool(GENERATED_NAME.match(f.path.stem))
