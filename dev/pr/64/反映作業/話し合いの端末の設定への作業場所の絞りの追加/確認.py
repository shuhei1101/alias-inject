#!/usr/bin/env python3
"""対象の行の scope.cwd が 3 つの glob になっているかを読み取りだけで確かめる。"""

import sys

import yaml

from common import CWD, TARGET, find_row_value

with open(TARGET, encoding="utf-8") as file:
    row = find_row_value(yaml.safe_load(file))
scope = (row or {}).get("scope")
print(f"観測した scope: {scope}")
if scope == {"cwd": CWD}:
    print("scope.cwd: ok")
else:
    print("scope.cwd: failed")
    sys.exit(1)
