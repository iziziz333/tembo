"""Builds a plan of moves. A plan is pure data: nothing touches the disk
until the user reviews it and the executor applies it."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from . import REVIEW_DIR
from .rules import category_of, is_generated_name, should_skip
from .scanner import FileInfo


@dataclass
class Move:
    src: Path
    dst: Path
    reason: str


@dataclass
class Plan:
    moves: list[Move] = field(default_factory=list)
    skipped: list[FileInfo] = field(default_factory=list)


def build_plan(files: list[FileInfo]) -> Plan:
    plan = Plan()
    taken: set[Path] = {f.path for f in files}
    seen_hashes: dict[str, FileInfo] = {}

    for f in sorted(files, key=lambda f: (f.modified, str(f.path))):
        if should_skip(f):
            plan.skipped.append(f)
            continue

        # The oldest copy stays the original; newer identical copies go to review.
        if f.sha256:
            original = seen_hashes.setdefault(f.sha256, f)
            if original is not f:
                dst = _unique(Path(REVIEW_DIR) / "Duplicates" / f.name, taken)
                plan.moves.append(Move(f.path, dst, f"копия файла {original.path}"))
                continue

        category = category_of(f)
        if category is None:
            dst = _unique(Path(REVIEW_DIR) / "Unsorted" / f.name, taken)
            plan.moves.append(Move(f.path, dst, "неизвестный тип, проверьте вручную"))
            continue

        folder = Path(category)
        if category in {"Images", "Videos"} and is_generated_name(f):
            folder = folder / f"{f.modified:%Y-%m}"
        dst = folder / f.name
        if dst == f.path:
            continue
        plan.moves.append(Move(f.path, _unique(dst, taken), f"тип файла {f.ext}"))

    return plan


def _unique(dst: Path, taken: set[Path]) -> Path:
    """Pick a destination nobody else uses: 'a.txt' -> 'a (2).txt'."""
    candidate, n = dst, 2
    while candidate in taken:
        candidate = dst.with_name(f"{dst.stem} ({n}){dst.suffix}")
        n += 1
    taken.add(candidate)
    return candidate


def is_safe_destination(dst: Path) -> bool:
    """A destination must stay inside the organized folder."""
    p = PurePosixPath(str(dst).replace("\\", "/"))
    return not p.is_absolute() and ".." not in p.parts and bool(p.parts) and ":" not in p.parts[0]
