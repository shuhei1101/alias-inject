# alias-inject

入力の語（用語・文書のエイリアス・コマンド・URL・スキル・ツール・パス・環境・使用しない単語）を設定の YAML と照合し、引用の文脈として Claude Code に足すプラグイン

ツールで読んだ本文も同じ YAML と照合し、引用の文脈を追加する。
読んだ本文の `!{名前}` には、同じ名前の環境変数の値も文脈として追加する。

## ドキュメント

実体は [docs/](./docs/) の種類のフォルダにあり、設計書の Schema は [schemas/](./schemas/) にある。
使い方は [guide](./docs/guide/)。

着手前に索引を引いて読む。

```bash
PROJECT_ROOT="$PWD" PYTHONPATH="$AI_MONITOR_HOME/src" python3 -m ai_monitor.inject.build_docs_index
```
