# 引用の種類に skill・tool・path・env・avoid を追加する

## 概要

利用者が `aliases[]` の要素の `type` に skill・tool・path・env・avoid を指定でき、入力に出た語のスキル名・MCP のツール名・パス・環境の URL とポート・正しい語がモデルに追加されるようになる。

## 背景

[Issue #12](https://github.com/shuhei1101/alias-inject/issues/12) の要望。
[#1](https://github.com/shuhei1101/alias-inject/issues/1)（作業 PR [#7](https://github.com/shuhei1101/alias-inject/pull/7)）では、D-91 の決定に沿って引用の種類を term・doc・command・url だけ作り、残りの種類を `dev/pr/7/要件.md` の `## スコープ外` へ回した。
設定は [#9](https://github.com/shuhei1101/alias-inject/issues/9) で `aliases[]` の構造に変わり、種類の一覧は [#8](https://github.com/shuhei1101/alias-inject/issues/8) のスキーマ `schemas/aliases.schema.yaml` が SSOT として持つ。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |

## タスク一覧

- [x] ~~初期構築~~（[#5](https://github.com/shuhei1101/alias-inject/pull/5) で済んでいる）
- [x] ~~リバースエンジニアリング~~（設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（既存の種類と同じ仕組みに種類を追加するだけで、未検証の技術機構に依存しない）
- [x] ~~複合ユースケース設計~~（影響なし: セッションの流れは変わらない）
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [x] インターフェース定義設計
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] モジュール構成設計
- [ ] ドキュメント修正（設計書/設定/プラグイン.yaml・docs/リファレンス/設定ファイル.md・docs/リファレンス/エイリアスのスキーマ.md・docs/はじめに/コアコンセプト/引用の文脈.md・README.md・CLAUDE.md）
- [ ] 単体テスト作成
- [ ] 実装
- [ ] 結合テスト作成
- [ ] E2E テスト作成
