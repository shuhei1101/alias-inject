"""alias-inject の端末の設定と、alias-inject の develop の worktree に読み取りだけでつながるかを確かめる。"""

import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/alias-inject/settings.yaml")
DEVELOP_WORKTREE = Path("/mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop")


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
    if DEVELOP_WORKTREE.is_dir():
        print("develop の worktree: ok")
    else:
        print("develop の worktree: failed")
        print(f"{DEVELOP_WORKTREE} がありません", file=sys.stderr)
        rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
