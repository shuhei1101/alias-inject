#!/usr/bin/env python3
"""実行で退避した端末の設定を書き戻す。"""

import shutil
import sys

from common import TARGET

try:
    shutil.copy2(f"{TARGET}.bak", TARGET)
except OSError as error:
    print(f"退避したファイル: failed（{error}）")
    sys.exit(1)
print("設定の書き戻し: changed")
