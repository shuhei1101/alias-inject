"""配布先のリポジトリの ER 図・project-index.yaml・依存のライブラリへ読み取りだけでつながるかを確かめる。"""

import sys
from pathlib import Path
import os

# 第 1 引数（対象のリポジトリの場所）を省いたら、作業ディレクトリを対象のリポジトリにする
if sys.argv[1:] in ([], ["--dry-run"]):
    sys.argv.insert(1, os.getcwd())

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEV_DOCS, er_files, fail, parse_args

args = parse_args(sys.argv[1:])
if args is None:
    fail("前提確認", "第 1 引数に配布先のリポジトリの直下を渡してください")
root, _ = args
try:
    import ruamel.yaml  # noqa: F401
    import yaml  # noqa: F401
except ImportError as e:
    fail("ライブラリ", f"PyYAML と ruamel.yaml が要ります: {e}")
print("ライブラリ: ok")
if not (root / DEV_DOCS).is_file():
    fail("project-index.yaml", str(root / DEV_DOCS))
print("project-index.yaml: ok")
print(f"ER 図: ok（{len(er_files(root))} 件）")
