"""alias-inject の端末の設定の alias-inject の行が project-index.yaml を指し、そのファイルがあるかを読むだけで確かめる。"""

import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/alias-inject/settings.yaml")
NEW_CONFIG = "/mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/project-index.yaml"
OLD_CONFIG = "/mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/dev-docs.yaml"


def main() -> int:
    """観測した値を出し、効いていれば 0 で終える。"""
    if not SETTINGS.is_file():
        print("端末の設定: failed")
        print(f"{SETTINGS} がありません", file=sys.stderr)
        return 1
    lines = SETTINGS.read_text(encoding="utf-8").splitlines()
    new_count = sum(1 for line in lines if line.strip().startswith(f"- config: {NEW_CONFIG}"))
    old_count = sum(1 for line in lines if line.strip().startswith(f"- config: {OLD_CONFIG}"))
    exists = Path(NEW_CONFIG).is_file()
    print(f"project-index.yaml の行: {new_count}")
    print(f"dev-docs.yaml の行: {old_count}")
    print(f"{NEW_CONFIG} の有無: {exists}")
    if new_count == 1 and old_count == 0 and exists:
        print("alias-inject の行: ok")
        return 0
    print("alias-inject の行: failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
