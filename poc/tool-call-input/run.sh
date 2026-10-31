#!/usr/bin/env bash
# PoC を claude -p で流す。引数: ログを置くフォルダ（無ければ作る）
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
log="${1:?ログを置くフォルダを渡す}"
mkdir -p "$log"
fx="$here/fixture"
POC_LOG_DIR="$log" claude -p --plugin-dir "$here" --permission-mode bypassPermissions "次を順に実行して。各手順は 1 つの応答で行うこと。
1. Read ツールで $fx/a.md を読む
2. Bash ツールで cat $fx/b.md を実行する
3. MCP ツール mcp__plugin_dev-docs_dev-docs__search_docs を source=\"alias-inject\", view=\"ids\", limit=3, filter={\"field\":\"id\",\"op\":\"prefix\",\"values\":[\"dev\"]} で呼ぶ
4. 1 つの応答の中で Read ツールを 2 つ並列に呼び、$fx/a.md と $fx/b.md を同時に読む
5. Agent ツール（subagent_type: general-purpose）で、サブエージェントに「Read ツールで $fx/b.md を読み、ツールの結果の後ろに付いた POC-MARK で始まる文字列を全てそのまま答えて」と頼む
最後に、手順ごとに、ツールの結果の後ろに付いた追加の文脈のうち POC-MARK で始まる文字列を全てそのまま列挙して（無ければ『なし』）。サブエージェントの答えも書き写して。" | tee "$log/answer.txt"
