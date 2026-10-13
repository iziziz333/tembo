"""Command line entry point: `tembo plan <folder>`."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from . import __version__
from .planner import build_plan
from .scanner import scan


def _cmd_plan(args: argparse.Namespace) -> int:
    root = Path(args.folder)
    plan = build_plan(scan(root, recursive=args.recursive))

    for m in plan.moves:
        print(f"  {m.src}  ->  {m.dst}   ({m.reason})")
    if plan.unresolved:
        print("\nНе удалось разобрать правилами (позже их разберёт Claude):")
        for f in plan.unresolved:
            print(f"  ? {f.path}")
    if plan.skipped:
        print("\nПропущено (недокачанные файлы и ярлыки):")
        for f in plan.skipped:
            print(f"  - {f.path}")

    by_folder = Counter(m.dst.parts[0] for m in plan.moves)
    summary = ", ".join(f"{k}: {v}" for k, v in sorted(by_folder.items()))
    print(f"\nИтого: {len(plan.moves)} перемещений ({summary or 'нет'}), "
          f"{len(plan.unresolved)} без решения, {len(plan.skipped)} пропущено.")
    print("Это только план: ни один файл не изменён.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tembo", description="Умный и безопасный разборщик файлов.")
    parser.add_argument("--version", action="version", version=f"tembo {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("plan", help="показать план разбора, ничего не меняя")
    p.add_argument("folder")
    p.add_argument("-r", "--recursive", action="store_true", help="заходить в подпапки")
    p.set_defaults(func=_cmd_plan)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except NotADirectoryError as e:
        print(f"Папка не найдена: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
