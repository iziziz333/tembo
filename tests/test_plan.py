import os
from datetime import datetime
from pathlib import Path

from tembo import REVIEW_DIR
from tembo.cli import main
from tembo.planner import build_plan, is_safe_destination
from tembo.scanner import scan


def touch(root: Path, name: str, data: bytes = b"x", when: str = "2025-07-14") -> Path:
    p = root / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    ts = datetime.fromisoformat(when).timestamp()
    os.utime(p, (ts, ts))
    return p


def moves(plan):
    return {str(m.src): str(m.dst) for m in plan.moves}


def test_sorts_by_type(tmp_path):
    touch(tmp_path, "report.pdf")
    touch(tmp_path, "setup.exe", b"yy")
    touch(tmp_path, "song.mp3", b"zzz")
    plan = build_plan(scan(tmp_path))
    assert moves(plan) == {
        "report.pdf": "Documents/report.pdf",
        "setup.exe": "Installers/setup.exe",
        "song.mp3": "Audio/song.mp3",
    }


def test_camera_photos_grouped_by_month(tmp_path):
    touch(tmp_path, "IMG_2034.jpg", when="2025-07-14")
    touch(tmp_path, "logo.png", b"other")
    m = moves(build_plan(scan(tmp_path)))
    assert m["IMG_2034.jpg"] == "Images/2025-07/IMG_2034.jpg"
    assert m["logo.png"] == "Images/logo.png"


def test_duplicates_keep_oldest(tmp_path):
    touch(tmp_path, "a.txt", b"same", when="2025-01-01")
    touch(tmp_path, "a (1).txt", b"same", when="2025-02-01")
    m = moves(build_plan(scan(tmp_path)))
    assert m["a.txt"] == "Documents/a.txt"
    assert m["a (1).txt"] == f"{REVIEW_DIR}/Duplicates/a (1).txt"


def test_unknown_and_skipped(tmp_path):
    touch(tmp_path, "mystery.xyz")
    touch(tmp_path, "movie.mp4.crdownload")
    touch(tmp_path, ".hidden")
    plan = build_plan(scan(tmp_path))
    assert moves(plan) == {"mystery.xyz": f"{REVIEW_DIR}/Unsorted/mystery.xyz"}
    assert [str(f.path) for f in plan.skipped] == ["movie.mp4.crdownload"]


def test_name_conflicts_get_suffix(tmp_path):
    touch(tmp_path, "notes.txt", b"1")
    touch(tmp_path, "sub/notes.txt", b"22")
    m = moves(build_plan(scan(tmp_path, recursive=True)))
    assert sorted(m.values()) == ["Documents/notes (2).txt", "Documents/notes.txt"]


def test_top_level_only_by_default(tmp_path):
    touch(tmp_path, "Work/plan.docx")
    assert build_plan(scan(tmp_path)).moves == []


def test_already_in_place_not_moved(tmp_path):
    touch(tmp_path, "Documents/x.pdf")
    assert build_plan(scan(tmp_path, recursive=True)).moves == []


def test_safe_destination():
    assert is_safe_destination(Path("Documents/a.pdf"))
    for bad in ["../a", "/etc/passwd", "C:/Windows/x", "a/../../b", ""]:
        assert not is_safe_destination(Path(bad)), bad


def test_cli_plan_changes_nothing(tmp_path, capsys):
    touch(tmp_path, "report.pdf")
    assert main(["plan", str(tmp_path)]) == 0
    assert "Documents/report.pdf" in capsys.readouterr().out.replace("\\", "/")
    assert [p.name for p in tmp_path.iterdir()] == ["report.pdf"]
