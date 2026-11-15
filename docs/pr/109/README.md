# テスト実行方法の層ごとに実行場所を決め、ランナーで回せる層を GitHub Actions の workflow で回す

## 概要

テスト実行方法の層ごとに実行場所（GitHub Actions のランナーか手元か）を決め、ランナーで回せる層を GitHub Actions の workflow で回せるようにする。
ランナーで回す層も、手元で回すコマンドを残す。

## 背景

[Issue #99](https://github.com/shuhei1101/alias-inject/issues/99) の要望。
全てのプロジェクトの単体・結合テストが同じ WSL の上で回り、メモリが厳しい。
このリポジトリのテスト実行方法（`docs/test-procedure/TP-1.yaml`）は全ての層を手元で回す前提で記載されており、テストを回す workflow も無い。
層の実行場所を記載する仕組みは [shuhei1101/knowledge#350](https://github.com/shuhei1101/knowledge/issues/350)・[shuhei1101/knowledge#351](https://github.com/shuhei1101/knowledge/issues/351)・[shuhei1101/ai-monitor#3434](https://github.com/shuhei1101/ai-monitor/issues/3434) で入った。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
