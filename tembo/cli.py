"""Command line entry point: `tembo plan <folder>`."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from . import __version__
from . import executor
from .planner import build_plan
from .scanner import scan


def _print_plan(plan) -> None:

    for m in plan.moves:
        print(f"  {m.src}  ->  {m.dst}   ({m.reason})")
    if plan.skipped:
        print("\nПропущено (недокачанные файлы и ярлыки):")
        for f in plan.skipped:
            print(f"  - {f.path}")

    by_folder = Counter(m.dst.parts[0] for m in plan.moves)
    summary = ", ".join(f"{k}: {v}" for k, v in sorted(by_folder.items()))
    print(f"\nИтого: {len(plan.moves)} перемещений ({summary or 'нет'}), "
          f"{len(plan.skipped)} пропущено.")


def _cmd_plan(args: argparse.Namespace) -> int:
    _print_plan(build_plan(scan(Path(args.folder), recursive=args.recursive)))
    print("Это только план: ни один файл не изменён.")
    return 0


def _cmd_apply(args: argparse.Namespace) -> int:
    root = Path(args.folder)
    plan = build_plan(scan(root, recursive=args.recursive))
    _print_plan(plan)
    if not plan.moves:
        return 0
    if not args.yes and input("\nПрименить? [y/N] ").strip().lower() not in {"y", "yes", "д", "да"}:
        print("Отменено, ничего не изменено.")
        return 0
    result = executor.apply(root, plan)
    _print_failures(result)
    print(f"Перемещено: {len(result.done)}. Вернуть всё назад: tembo undo {args.folder}")
    return 1 if result.failed else 0


def _cmd_undo(args: argparse.Namespace) -> int:
    result = executor.undo(Path(args.folder))
    if result.journal is None:
        print("Нечего отменять.")
        return 0
    _print_failures(result)
    print(f"Возвращено на место: {len(result.done)}.")
    return 1 if result.failed else 0


def _print_failures(result: executor.Result) -> None:
    for m, why in result.failed:
        print(f"  ! {m.src}: {why}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tembo", description="Умный и безопасный разборщик файлов.")
    parser.add_argument("--version", action="version", version=f"tembo {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("plan", help="показать план разбора, ничего не меняя")
    p.add_argument("folder")
    p.add_argument("-r", "--recursive", action="store_true", help="заходить в подпапки")
    p.set_defaults(func=_cmd_plan)

    p = sub.add_parser("apply", help="разобрать папку (после подтверждения)")
    p.add_argument("folder")
    p.add_argument("-r", "--recursive", action="store_true", help="заходить в подпапки")
    p.add_argument("-y", "--yes", action="store_true", help="не спрашивать подтверждение")
    p.set_defaults(func=_cmd_apply)

    p = sub.add_parser("undo", help="отменить последний разбор")
    p.add_argument("folder")
    p.set_defaults(func=_cmd_undo)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except NotADirectoryError as e:
        print(f"Папка не найдена: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
