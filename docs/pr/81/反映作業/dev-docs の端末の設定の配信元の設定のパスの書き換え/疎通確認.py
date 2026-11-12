"""dev-docs の端末の設定と、alias-inject のクローンの develop に読み取りだけでつながるかを確かめる。"""

import subprocess
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/dev-docs/settings.yaml")
CLONE = "/mnt/c/Users/shuhe/repo/alias-inject"


def main() -> int:
    """対象ごとに結果の行を出す。"""
    rc = 0
    if SETTINGS.is_file():
        SETTINGS.read_text(encoding="utf-8")
        print("端末の設定: ok")
    else:
        print("端末の設定: failed")
        print(f"{SETTINGS} がありません", file=sys.stderr)
        rc = 1
    shown = subprocess.run(
        ["git", "-C", CLONE, "rev-parse", "--verify", "develop"],
        capture_output=True,
        text=True,
        check=False,
    )
    if shown.returncode == 0:
        print("クローンの develop: ok")
    else:
        print("クローンの develop: failed")
        print(f"git -C {CLONE} rev-parse --verify develop: {shown.stderr.strip()}", file=sys.stderr)
        rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
