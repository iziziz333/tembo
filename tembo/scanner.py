"""Walks a folder and collects file metadata. Never reads more than needed:
content is hashed only for files whose sizes collide (duplicate candidates)."""

from __future__ import annotations

import hashlib
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import REVIEW_DIR

HASH_CHUNK = 1 << 20


@dataclass
class FileInfo:
    path: Path  # relative to the scanned root
    size: int
    modified: datetime
    sha256: str | None = field(default=None, compare=False)

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def ext(self) -> str:
        return self.path.suffix.lower()


def _is_hidden(name: str) -> bool:
    return name.startswith(".") or name in {"desktop.ini", "Thumbs.db"}


def _hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(HASH_CHUNK):
            h.update(chunk)
    return h.hexdigest()


def scan(root: Path, recursive: bool = False) -> list[FileInfo]:
    """Return files under root. By default only the top level is scanned:
    existing subfolders are treated as already organized by the user."""
    root = root.resolve()
    if not root.is_dir():
        raise NotADirectoryError(root)

    files: list[FileInfo] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(
            d for d in dirnames if not _is_hidden(d) and d != REVIEW_DIR
        ) if recursive else []
        for name in sorted(filenames):
            full = Path(dirpath) / name
            if _is_hidden(name) or full.is_symlink():
                continue
            st = full.stat()
            files.append(FileInfo(
                path=full.relative_to(root),
                size=st.st_size,
                modified=datetime.fromtimestamp(st.st_mtime),
            ))

    _hash_size_collisions(root, files)
    return files


def _hash_size_collisions(root: Path, files: list[FileInfo]) -> None:
    by_size: dict[int, list[FileInfo]] = defaultdict(list)
    for f in files:
        if f.size > 0:
            by_size[f.size].append(f)
    for group in by_size.values():
        if len(group) > 1:
            for f in group:
                f.sha256 = _hash(root / f.path)
