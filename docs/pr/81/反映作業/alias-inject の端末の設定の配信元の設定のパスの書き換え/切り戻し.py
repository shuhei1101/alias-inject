"""alias-inject の端末の設定の alias-inject の行の config を dev-docs.yaml へ戻す（作業 PR を develop から revert した後に使う）。"""

import difflib
import shutil
import sys
from pathlib import Path

SETTINGS = Path("/home/shuhei2441/.config/alias-inject/settings.yaml")
BACKUP = Path("/home/shuhei2441/.config/alias-inject/settings.yaml.bak-pr81-revert")
TEMPORARY = Path("/home/shuhei2441/.config/alias-inject/settings.yaml.tmp-pr81-revert")
OLD_CONFIG = Path("/mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/dev-docs.yaml")
OLD_LINE = '    - config: /mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/dev-docs.yaml  # alias-inject\n'
NEW_LINE = '    - config: /mnt/c/Users/shuhe/repo/alias-inject/.claude/worktrees/develop/project-index.yaml  # alias-inject\n'


def fail(step: str, detail: str) -> int:
    """failed の行と、失敗した手順の stderr を出す。"""
    print(f"{step}: failed")
    print(detail, file=sys.stderr)
    return 1


def main() -> int:
    """前提確認 → 計画 → 適用の順に、NEW_LINE の 1 行だけを OLD_LINE へ戻す。"""
    # 前提確認
    if not SETTINGS.is_file():
        return fail("前提確認", f"{SETTINGS} がありません")
    if not OLD_CONFIG.is_file():
        return fail(
            "前提確認",
            f"{OLD_CONFIG} がありません（作業 PR を develop から revert していないため、戻すと照合から外れる）",
        )
    before = SETTINGS.read_text(encoding="utf-8")
    lines = before.splitlines(keepends=True)
    if lines.count(OLD_LINE) == 1 and lines.count(NEW_LINE) == 0:
        print("前提確認: ok")
        print("設定の書き戻し: skipped")
        return 0
    if lines.count(NEW_LINE) != 1 or lines.count(OLD_LINE) != 0:
        return fail(
            "前提確認", f"{SETTINGS} に {NEW_LINE.strip()} の行だけが 1 つある状態ではありません"
        )
    print("前提確認: ok")

    # 計画
    after = "".join(OLD_LINE if line == NEW_LINE else line for line in lines)
    sys.stdout.writelines(
        difflib.unified_diff(lines, after.splitlines(keepends=True), str(SETTINGS), str(SETTINGS))
    )

    # 適用（一時ファイル → 検証 → 退避 → 置き換え）
    TEMPORARY.write_text(after, encoding="utf-8")
    written = TEMPORARY.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = [(old, new) for old, new in zip(lines, written, strict=False) if old != new]
    if len(written) != len(lines) or changed != [(NEW_LINE, OLD_LINE)]:
        TEMPORARY.unlink()
        return fail("検証", f"{TEMPORARY} の差分が {NEW_LINE.strip()} の 1 行だけではありません")
    print("検証: ok")
    shutil.copy2(SETTINGS, BACKUP)
    if BACKUP.read_text(encoding="utf-8") != before:
        TEMPORARY.unlink()
        return fail("退避", f"{BACKUP} の中身が {SETTINGS} と一致しません")
    print("退避: ok")
    TEMPORARY.replace(SETTINGS)
    print("設定の書き戻し: changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
