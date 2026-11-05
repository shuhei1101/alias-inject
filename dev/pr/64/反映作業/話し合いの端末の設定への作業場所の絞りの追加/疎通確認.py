#!/usr/bin/env python3
"""端末の設定が読めて、対象の行があるかを読み取りだけで確かめる。"""

import sys

import yaml

from common import TARGET, find_row_value

try:
    with open(TARGET, encoding="utf-8") as file:
        data = yaml.safe_load(file)
except (OSError, yaml.YAMLError) as error:
    print(f"端末の設定: failed（{error}）")
    sys.exit(1)
print("端末の設定: ok")

if find_row_value(data) is None:
    print("対象の行: failed")
    sys.exit(1)
print("対象の行: ok")
