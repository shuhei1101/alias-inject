"""実行で退避した alias-inject の端末の設定へ戻す（作業 PR を develop から revert した後に使う）。"""

import shutil
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/alias-inject/settings.yaml")
BACKUP = Path("/home/shuhei2441/.config/alias-inject/settings.yaml.bak-pr81")
OLD_CONFIG = Path("/mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/dev-docs.yaml")


def main() -> int:
    """退避したファイルを書き戻す。"""
    if not BACKUP.is_file():
        print("退避したファイル: failed")
        print(f"{BACKUP} がありません", file=sys.stderr)
        return 1
    if not OLD_CONFIG.is_file():
        print("戻す先の設定: failed")
        print(
            f"{OLD_CONFIG} がありません（作業 PR を develop から revert していないため、戻すと照合から外れる）",
            file=sys.stderr,
        )
        return 1
    print("戻す先の設定: ok")
    shutil.copy2(BACKUP, SETTINGS)
    print("設定の書き戻し: changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
