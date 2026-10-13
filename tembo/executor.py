"""Applies a plan and undoes it. Every applied move is recorded in a journal
inside the organized folder, so any run can be reverted later."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .planner import Move, Plan, is_safe_destination

JOURNAL_DIR = ".tembo"


@dataclass
class Result:
    done: list[Move] = field(default_factory=list)
    failed: list[tuple[Move, str]] = field(default_factory=list)
    journal: Path | None = None


def apply(root: Path, plan: Plan) -> Result:
    root = root.resolve()
    result = Result()
    journal_dir = root / JOURNAL_DIR
    journal_dir.mkdir(exist_ok=True)
    result.journal = journal_dir / f"{datetime.now():%Y%m%d-%H%M%S-%f}.json"

    try:
        for m in plan.moves:
            error = _move(root, m.src, m.dst)
            if error:
                result.failed.append((m, error))
            else:
                result.done.append(m)
    finally:
        # Written even if we crash midway: whatever moved can be reverted.
        entries = [{"src": str(m.src), "dst": str(m.dst)} for m in result.done]
        result.journal.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def undo(root: Path) -> Result:
    """Revert the most recent run that has not been undone yet."""
    root = root.resolve()
    result = Result()
    journals = sorted((root / JOURNAL_DIR).glob("*.json"))
    if not journals:
        return result
    result.journal = journals[-1]

    entries = json.loads(result.journal.read_text(encoding="utf-8"))
    for e in reversed(entries):
        m = Move(Path(e["dst"]), Path(e["src"]), "отмена")
        error = _move(root, m.src, m.dst)
        if error:
            result.failed.append((m, error))
        else:
            result.done.append(m)
            _remove_empty_parents(root, root / m.src)

    if result.failed:
        # Keep only what is still to be reverted, so undo can be retried.
        left = [{"src": str(m.dst), "dst": str(m.src)} for m, _ in result.failed]
        result.journal.write_text(json.dumps(left, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        result.journal.rename(result.journal.with_suffix(".undone"))
    return result


def _move(root: Path, src: Path, dst: Path) -> str | None:
    if not (is_safe_destination(src) and is_safe_destination(dst)):
        return "путь вне папки"
    s, d = root / src, root / dst
    if not s.exists():
        return "файл пропал"
    if d.exists():
        return "место уже занято"
    try:
        d.parent.mkdir(parents=True, exist_ok=True)
        os.rename(s, d)
    except OSError as e:
        return e.strerror or str(e)
    return None


def _remove_empty_parents(root: Path, path: Path) -> None:
    parent = path.parent
    while parent != root and root in parent.parents:
        try:
            parent.rmdir()
        except OSError:
            return
        parent = parent.parent
