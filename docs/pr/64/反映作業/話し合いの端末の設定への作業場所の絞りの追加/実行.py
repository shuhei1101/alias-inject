#!/usr/bin/env python3
"""端末の設定の対象の行に scope.cwd を追加する。--dry-run は計画まで進んで止まる。"""

import difflib
import os
import shutil
import sys
import tempfile

import yaml

from common import CWD, ROW_ID, TARGET, find_row, find_row_value

dry_run = len(sys.argv) > 1 and sys.argv[1] == "--dry-run"

# 前提確認
try:
    with open(TARGET, encoding="utf-8") as file:
        text = file.read()
    data = yaml.safe_load(text)
except (OSError, yaml.YAMLError) as error:
    print(f"前提確認: failed（{error}）")
    sys.exit(1)
row = find_row_value(data)
lines = text.splitlines(keepends=True)
span = find_row(lines)
if row is None or span is None:
    print("前提確認: failed（対象の行がありません）")
    sys.exit(1)
print("前提確認: ok")

# 計画
if row.get("scope") == {"cwd": CWD}:
    print("scope.cwd の追加: skipped")
    sys.exit(0)
if "scope" in row:
    print("前提確認: failed（対象の行に別の scope があります）")
    sys.exit(1)
start, end, indent = span
pad = " " * (indent + 2)
quoted = ", ".join(f'"{path}"' for path in CWD)
insert = [f"{pad}scope:\n", f"{pad}  cwd: [{quoted}]\n"]
# 行の最後の空でない行の後ろに追加する
last = end
while last > start + 1 and lines[last - 1].strip() == "":
    last -= 1
new_lines = lines[:last] + insert + lines[last:]
new_text = "".join(new_lines)
sys.stdout.writelines(difflib.unified_diff(lines, new_lines, fromfile=TARGET, tofile=TARGET))

# 検証
try:
    new_row = find_row_value(yaml.safe_load(new_text))
except yaml.YAMLError as error:
    print(f"検証: failed（{error}）")
    sys.exit(1)
expected = dict(row, scope={"cwd": CWD})
if new_row != expected:
    print("検証: failed（書き換えた行が想定と違います）")
    sys.exit(1)
print("検証: ok")
if dry_run:
    print("scope.cwd の追加: changed")
    sys.exit(0)

# 適用（退避 → 置き換え）
shutil.copy2(TARGET, f"{TARGET}.bak")
directory = os.path.dirname(TARGET)
with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=directory, delete=False) as file:
    file.write(new_text)
    temporary = file.name
shutil.copymode(TARGET, temporary)
os.replace(temporary, TARGET)
print(f"scope.cwd の追加: changed（{ROW_ID}）")
