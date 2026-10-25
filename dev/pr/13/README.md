# エイリアスの共通の形 aliases[] のスキーマ schemas/aliases.schema.yaml を SSOT として置く

## 概要

mdmark・dev-docs・alias-inject が、用語・文書のエイリアス・コマンド・URL の定義 `aliases[]` を、alias-inject の `schemas/aliases.schema.yaml` という同じスキーマで読めるようになる。

## 背景

[Issue #8](https://github.com/shuhei1101/alias-inject/issues/8) の要望。
alias-inject（設定の `sources[]`）・mdmark-style（mdmark の用語集）・dev-docs（`terms`）が、同じ用語集を別々の構造で定義している。
共通の構造 `aliases[]` を使い回すため、その正本のスキーマを alias-inject に置く（決定の経緯は Issue の `## 必読` が挙げる話し合いの記録の D-116・D-118・D-120）。
後続の [#9](https://github.com/shuhei1101/alias-inject/issues/9)・[shuhei1101/mdmark#125](https://github.com/shuhei1101/mdmark/issues/125)・[shuhei1101/dev-docs#3](https://github.com/shuhei1101/dev-docs/issues/3) がこのスキーマを待っている。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインのリポジトリに置くスキーマの計画書 |

## タスク一覧

- [x] ~~初期構築~~（[#5](https://github.com/shuhei1101/alias-inject/pull/5) で済んでいる）
- [x] ~~リバースエンジニアリング~~（設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（未検証の技術機構に依存しない）
- [x] ~~複合ユースケース設計~~（影響なし: プラグインの振る舞いを変えない）
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] ~~単一ユースケース設計~~（影響なし: プラグインの振る舞いを変えない）
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [x] ~~インターフェース定義設計~~（操作の入口を持たない。スキーマのファイルを置くだけ）
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] ~~モジュール構成設計~~（コードのモジュールを追加しない）
- [x] ドキュメント修正（設計書/アーキテクチャ図/アーキテクチャ図.yaml・docs/リファレンス/エイリアスのスキーマ.md・docs/リファレンス/index.yaml・docs/index.yaml）
- [x] ~~単体テスト作成~~（スキーマはレビューで確かめる。単体テストの対応先になる設計書を持たない）
- [ ] 実装
- [x] ~~結合テスト作成~~（インターフェース定義を持たない）
- [x] ~~E2E テスト作成~~（シナリオに影響しない）
