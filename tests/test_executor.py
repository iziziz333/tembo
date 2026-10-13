from pathlib import Path

from tembo import executor
from tembo.cli import main
from tembo.planner import Move, Plan, build_plan
from tembo.scanner import scan

from test_plan import touch


def snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(p.relative_to(root)): p.read_bytes()
        for p in root.rglob("*")
        if p.is_file() and executor.JOURNAL_DIR not in p.parts
    }


def messy(root: Path) -> None:
    touch(root, "report.pdf", b"r")
    touch(root, "IMG_1.jpg", b"img")
    touch(root, "copy.pdf", b"r", when="2025-08-01")
    touch(root, "weird.xyz", b"?")
    touch(root, "Work/keep.docx", b"k")


def test_apply_then_undo_restores_everything(tmp_path):
    messy(tmp_path)
    before = snapshot(tmp_path)
    dirs_before = sorted(p.name for p in tmp_path.iterdir())

    result = executor.apply(tmp_path, build_plan(scan(tmp_path)))
    assert not result.failed and len(result.done) == 4
    assert (tmp_path / "Documents/report.pdf").exists()
    assert (tmp_path / "Images/2025-07/IMG_1.jpg").exists()

    result = executor.undo(tmp_path)
    assert not result.failed
    assert snapshot(tmp_path) == before
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(dirs_before + [executor.JOURNAL_DIR])
    assert executor.undo(tmp_path).journal is None  # nothing left to undo


def test_apply_never_overwrites(tmp_path):
    touch(tmp_path, "a.pdf", b"new")
    touch(tmp_path, "Documents/a.pdf", b"old")
    plan = Plan(moves=[Move(Path("a.pdf"), Path("Documents/a.pdf"), "test")])
    result = executor.apply(tmp_path, plan)
    assert result.failed and (tmp_path / "Documents/a.pdf").read_bytes() == b"old"


def test_apply_rejects_paths_outside(tmp_path):
    touch(tmp_path, "a.pdf")
    plan = Plan(moves=[Move(Path("a.pdf"), Path("../escaped.pdf"), "test")])
    assert executor.apply(tmp_path, plan).failed
    assert (tmp_path / "a.pdf").exists()


def test_undo_skips_conflicts_and_can_retry(tmp_path):
    touch(tmp_path, "a.pdf", b"a")
    executor.apply(tmp_path, build_plan(scan(tmp_path)))
    touch(tmp_path, "a.pdf", b"someone else")
    assert executor.undo(tmp_path).failed
    (tmp_path / "a.pdf").unlink()
    result = executor.undo(tmp_path)
    assert not result.failed and (tmp_path / "a.pdf").read_bytes() == b"a"


def test_rescan_ignores_journal(tmp_path):
    touch(tmp_path, "a.pdf")
    executor.apply(tmp_path, build_plan(scan(tmp_path)))
    assert build_plan(scan(tmp_path)).moves == []


def test_cli_apply_and_undo(tmp_path, capsys):
    messy(tmp_path)
    before = snapshot(tmp_path)
    assert main(["apply", str(tmp_path), "--yes"]) == 0
    assert snapshot(tmp_path) != before
    assert main(["undo", str(tmp_path)]) == 0
    assert snapshot(tmp_path) == before
