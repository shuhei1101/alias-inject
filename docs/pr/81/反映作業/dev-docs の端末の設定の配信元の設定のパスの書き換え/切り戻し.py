"""実行で退避した dev-docs の端末の設定へ戻す（作業 PR を develop から revert した後に使う）。"""

import shutil
import subprocess
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/dev-docs/settings.yaml")
BACKUP = Path("/home/shuhei2441/.config/dev-docs/settings.yaml.bak-pr81")
CLONE = "/mnt/c/Users/shuhe/repo/alias-inject"


def main() -> int:
    """退避したファイルを書き戻す。"""
    if not BACKUP.is_file():
        print("退避したファイル: failed")
        print(f"{BACKUP} がありません", file=sys.stderr)
        return 1
    shown = subprocess.run(
        ["git", "-C", CLONE, "cat-file", "-e", "develop:dev-docs.yaml"],
        capture_output=True,
        text=True,
        check=False,
    )
    if shown.returncode != 0:
        print("戻す先の設定: failed")
        print(
            f"git -C {CLONE} cat-file -e develop:dev-docs.yaml: {shown.stderr.strip()}"
            "（作業 PR を develop から revert していないため、戻すと配信元の設定を読めない）",
            file=sys.stderr,
        )
        return 1
    print("戻す先の設定: ok")
    shutil.copy2(BACKUP, SETTINGS)
    print("設定の書き戻し: changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
