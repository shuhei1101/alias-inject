# AI Monitor v0.3.0 の配布物へ追従する

## 概要

alias-inject が、AI Monitor v0.3.0 のサイトのレイアウトと設計書の Schema に揃った状態になる。

## 背景

[Issue #44](https://github.com/shuhei1101/alias-inject/issues/44) の要望。
AI Monitor の `v0.2.0..v0.3.0` の配布物の差分（[比較](https://github.com/shuhei1101/ai-monitor/compare/v0.2.0...v0.3.0)）への追従で、[ai-monitor-version.ini](https://github.com/shuhei1101/alias-inject/blob/develop/ai-monitor-version.ini) は `v0.2.0` のまま。
この Issue は alias-inject のタグ `v0.3.0` を AI Monitor の `v0.3.0` と取り違えて起票された（[shuhei1101/ai-monitor#3089](https://github.com/shuhei1101/ai-monitor/issues/3089)）が、AI Monitor の `v0.3.0` は実在し、中身は alias-inject に当てはまる。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |

## タスク一覧

- [x] ~~初期構築~~（既存リポジトリのため対象外）
- [x] ~~リバースエンジニアリング~~（現状設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（未検証の技術機構に依存しない）
- [x] ~~複合ユースケース設計~~（影響なし: プラグインの挙動を変えない）
- [x] ~~デザインスタイル選定~~（画面を持たない）
- [x] ~~画面一覧・画面遷移~~（画面を持たない）
- [x] ~~単一ユースケース設計~~（影響なし: プラグインの挙動を変えない）
- [x] ~~モック作成~~（画面を持たない）
- [x] ~~インターフェース定義設計~~（影響なし: プラグインの挙動を変えない）
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] ~~モジュール構成設計~~（影響なし: プラグインの挙動を変えない）
- [x] ドキュメント修正（docs/_theme/・ai-monitor-theme.yaml・ai-monitor-version.ini・dev/設計書/ の Schema の変換）
- [x] ~~単体テスト作成~~（プラグインのコードを変えない）
- [x] ~~実装~~（プラグインのコードを変えない）
- [x] ~~結合テスト作成~~（プラグインのコードを変えない）
- [x] ~~E2E テスト作成~~（プラグインのコードを変えない）
