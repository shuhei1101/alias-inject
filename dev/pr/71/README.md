# dev/ を廃止して文書を docs/ 1 つにまとめ、ai-monitor#3307 と同じ構成へ移す

## 概要

`dev/` を廃止し、このリポジトリの文書を `docs/` の種類ごとのフォルダと `schemas/` へまとめ、公開範囲を各文書のメタデータ `visibility` で持つ。

## 背景

[Issue #70](https://github.com/shuhei1101/alias-inject/issues/70) の要望。
[shuhei1101/ai-monitor#3307](https://github.com/shuhei1101/ai-monitor/pull/3307) が AI Monitor 自身の文書を `docs/` 1 つへ移し、全ての監視対象のプロジェクトも同じ構成へ移す要件を持つ。
`dev/` が残る間は、`python -m ai_monitor.design_docs` の設計書の検証・Markdown の生成が動かない。
同じ移行は [shuhei1101/project-index#13](https://github.com/shuhei1101/project-index/pull/13) がマージ済み。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの設計書・Schema・公開ドキュメント・配信の設定の移し替えの計画書 |
