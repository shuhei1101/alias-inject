"""話し合いの端末の設定への作業場所の絞りの追加で使う固定値と、行の範囲の取り出し。"""

import os

TARGET = os.path.expanduser("~/.config/alias-inject/settings.yaml")
ROW_ID = "mindstella-nandemo-terms"
CWD = [
    "/mnt/c/Users/shuhe/repo/tmp/何でも会話/**",
    "/mnt/c/Users/shuhe/repo/aituber/**",
    "/mnt/c/Users/shuhe/repo/claude-balancer/**",
]


def find_row(lines):
    """`global.aliases` の行のうち `id` が ROW_ID の要素の、開始行と終了行（含まない）と `- ` の字下げを返す。無ければ None。"""
    for index, line in enumerate(lines):
        stripped = line.lstrip(" ")
        if stripped.startswith("- id: ") and stripped[len("- id: "):].split("#")[0].strip() == ROW_ID:
            indent = len(line) - len(stripped)
            end = index + 1
            while end < len(lines):
                body = lines[end]
                if body.strip() != "" and len(body) - len(body.lstrip(" ")) <= indent:
                    break
                end += 1
            return index, end, indent
    return None


def find_row_value(data):
    """パースした設定から ROW_ID の要素を返す。無ければ None。"""
    aliases = ((data or {}).get("global") or {}).get("aliases") or []
    for alias in aliases:
        if isinstance(alias, dict) and alias.get("id") == ROW_ID:
            return alias
    return None
