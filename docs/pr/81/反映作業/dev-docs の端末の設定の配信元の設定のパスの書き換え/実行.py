"""dev-docs の端末の設定の配信元 alias-inject の config を project-index.yaml へ書き換える。"""

import difflib
import shutil
import subprocess
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/dev-docs/settings.yaml")
BACKUP = Path("/home/shuhei2441/.config/dev-docs/settings.yaml.bak-pr81")
TEMPORARY = Path("/home/shuhei2441/.config/dev-docs/settings.yaml.tmp-pr81")
CLONE = "/mnt/c/Users/shuhe/repo/alias-inject"
OLD_LINE = "  - config: /mnt/c/Users/shuhe/repo/alias-inject/dev-docs.yaml\n"
NEW_LINE = "  - config: /mnt/c/Users/shuhe/repo/alias-inject/project-index.yaml\n"


def fail(step: str, detail: str) -> int:
    """failed の行と、失敗した手順の stderr を出す。"""
    print(f"{step}: failed")
    print(detail, file=sys.stderr)
    return 1


def main(args: list[str]) -> int:
    """前提確認 → 計画 → 適用の順に進める。"""
    # 前提確認
    if len(args) > 1 or (len(args) == 1 and args[0] != "--dry-run"):
        return fail("前提確認", f"受け付けない引数: {args}")
    dry_run = args == ["--dry-run"]
    if not SETTINGS.is_file():
        return fail("前提確認", f"{SETTINGS} がありません")
    shown = subprocess.run(
        ["git", "-C", CLONE, "cat-file", "-e", "develop:project-index.yaml"],
        capture_output=True,
        text=True,
        check=False,
    )
    if shown.returncode != 0:
        return fail(
            "前提確認",
            f"git -C {CLONE} cat-file -e develop:project-index.yaml: {shown.stderr.strip()}"
            "（作業 PR が develop へ入っていないか、クローンの develop が古い）",
        )
    before = SETTINGS.read_text(encoding="utf-8")
    lines = before.splitlines(keepends=True)
    done = lines.count(NEW_LINE) == 1 and lines.count(OLD_LINE) == 0
    if not done and lines.count(OLD_LINE) != 1:
        return fail("前提確認", f"{SETTINGS} に {OLD_LINE.strip()} の行が 1 つではありません")
    print("前提確認: ok")

    # 計画（--dry-run もここを通る）
    if done:
        print("設定の書き換え: skipped")
        return 0
    after = "".join(NEW_LINE if line == OLD_LINE else line for line in lines)
    sys.stdout.writelines(
        difflib.unified_diff(lines, after.splitlines(keepends=True), str(SETTINGS), str(SETTINGS))
    )
    if dry_run:
        print("設定の書き換え: changed")
        return 0

    # 適用（一時ファイル → 検証 → 退避 → 置き換え）
    TEMPORARY.write_text(after, encoding="utf-8")
    written = TEMPORARY.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = [(old, new) for old, new in zip(lines, written, strict=False) if old != new]
    if len(written) != len(lines) or changed != [(OLD_LINE, NEW_LINE)]:
        TEMPORARY.unlink()
        return fail("検証", f"{TEMPORARY} の差分が {OLD_LINE.strip()} の 1 行だけではありません")
    print("検証: ok")
    shutil.copy2(SETTINGS, BACKUP)
    if BACKUP.read_text(encoding="utf-8") != before:
        TEMPORARY.unlink()
        return fail("退避", f"{BACKUP} の中身が {SETTINGS} と一致しません")
    print("退避: ok")
    TEMPORARY.replace(SETTINGS)
    print("設定の書き換え: changed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
