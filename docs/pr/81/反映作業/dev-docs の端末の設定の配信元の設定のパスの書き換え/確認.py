"""dev-docs の端末の設定の配信元 alias-inject の config が project-index.yaml を指し、develop にそのファイルがあるかを読むだけで確かめる。"""

import subprocess
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/dev-docs/settings.yaml")
CLONE = "/mnt/c/Users/shuhe/repo/alias-inject"
NEW_LINE = "  - config: /mnt/c/Users/shuhe/repo/alias-inject/project-index.yaml"
OLD_LINE = "  - config: /mnt/c/Users/shuhe/repo/alias-inject/dev-docs.yaml"


def main() -> int:
    """観測した値を出し、効いていれば 0 で終える。"""
    if not SETTINGS.is_file():
        print("端末の設定: failed")
        print(f"{SETTINGS} がありません", file=sys.stderr)
        return 1
    lines = SETTINGS.read_text(encoding="utf-8").splitlines()
    new_count = lines.count(NEW_LINE)
    old_count = lines.count(OLD_LINE)
    shown = subprocess.run(
        ["git", "-C", CLONE, "cat-file", "-e", "develop:project-index.yaml"],
        capture_output=True,
        text=True,
        check=False,
    )
    exists = shown.returncode == 0
    print(f"project-index.yaml の行: {new_count}")
    print(f"dev-docs.yaml の行: {old_count}")
    print(f"develop:project-index.yaml の有無: {exists}")
    if new_count == 1 and old_count == 0 and exists:
        print("配信元 alias-inject の config: ok")
        return 0
    print("配信元 alias-inject の config: failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
