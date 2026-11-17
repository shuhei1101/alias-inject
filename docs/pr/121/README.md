# テスト実行方法と開発コマンドの設計書に lead を記載する

## 概要

テスト実行方法 TP-1 と開発コマンド CMD-1 に lead（冒頭リード）を記載し、project-index の `check_project` の description の欠けの警告を無くす。

## 背景

[Issue #120](https://github.com/shuhei1101/alias-inject/issues/120) の要望。
`project-index.yaml` の `test_procedure`・`dev_command` の行は `metadata.description: lead` を持つが、2 つの設計書に `lead` が無いため、`search_docs` の一覧で概要文が空になる。
[PR #119](https://github.com/shuhei1101/alias-inject/pull/119) で `check_project` を実行して気づき、範囲外のため切り出した。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
