# alias-inject

入力の語（用語・文書のエイリアス・コマンド・URL）を設定の YAML と照合し、引用の文脈として Claude Code に足すプラグイン

読んだ本文の `!{名前}` には、同じ名前の環境変数の値も文脈として追加する。

## ドキュメント

実体は開発ドキュメント [dev/](./dev/) と公開ドキュメント [docs/](./docs/) にある。
使い方は [使い方](./docs/使い方/)。

着手前に索引を引いて読む。

```bash
PROJECT_ROOT="$PWD" PYTHONPATH="$AI_MONITOR_HOME/src" python3 -m ai_monitor.inject.build_docs_index
```
