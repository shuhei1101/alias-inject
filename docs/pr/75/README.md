# 設計書・公開ドキュメント・設定の例の配信元の設定のファイル名を dev-docs.yaml から project-index.yaml にする

## 概要

設計書・公開ドキュメント・設定の例・コードのコメントが例に使う配信元の設定のファイル名を、`dev-docs.yaml` から `project-index.yaml` にする。

## 背景

[Issue #74](https://github.com/shuhei1101/alias-inject/issues/74) の要望。
[shuhei1101/dev-docs#114](https://github.com/shuhei1101/dev-docs/issues/114)（作業 PR [shuhei1101/dev-docs#163](https://github.com/shuhei1101/dev-docs/pull/163)）で、配信元の設定の既定のファイル名を dev-docs・alias-inject・project-index で共通の `project-index.yaml`・`project-index.local.yaml` にすると決まった。
alias-inject は `repositories[].config` に指定したパスを読むだけで既定のファイル名を探さないため、振る舞いは変わらない。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの設計書・公開ドキュメント・設定の例・コメントの例の名前の置換の計画書 |
