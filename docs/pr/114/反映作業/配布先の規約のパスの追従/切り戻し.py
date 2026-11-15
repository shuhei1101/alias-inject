"""実行で退避した rules.yaml・agent_context.yaml を書き戻す。"""

import shutil
import sys
from pathlib import Path
import os

# 第 1 引数（対象のリポジトリの場所）を省いたら、作業ディレクトリを対象のリポジトリにする
if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
    sys.argv.insert(1, os.getcwd())

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from common import TARGETS, repo_root  # noqa: E402

root, _ = repo_root([sys.argv[0], *sys.argv[1:2]])
for name in TARGETS:
    backup = root / (name + ".bak")
    if not backup.is_file():
        print(f"{name}: skipped")
        continue
    shutil.copy2(backup, root / name)
    print(f"{name}: changed")
