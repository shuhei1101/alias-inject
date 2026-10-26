# 共通のスキーマを「エイリアスの元の行」に変え、dev-docs.yaml の documents から読む

## 概要

利用者が dev-docs.yaml の documents の行の `metadata` にエイリアスのキーを書くと、alias-inject がその行の文書を照合の定義として読むようになる。
共通のスキーマは documents の行と同じ構造の「エイリアスの元の行」になり、mdmark・dev-docs も同じ行を読む。

## 背景

[Issue #20](https://github.com/shuhei1101/alias-inject/issues/20) の要望。
[#8](https://github.com/shuhei1101/alias-inject/issues/8)（作業 PR [#13](https://github.com/shuhei1101/alias-inject/pull/13)）で `schemas/aliases.schema.yaml`（`aliases[]`）を置き、[#9](https://github.com/shuhei1101/alias-inject/issues/9)（作業 PR [#14](https://github.com/shuhei1101/alias-inject/pull/14)）で dev-docs.yaml の `aliases[]` を読むようにした。
その後の話し合い（D-164・D-165）で、documents の行が `metadata` で文書の列を対応づける構造になり、エイリアスもその `metadata` に置くと決まった。
引用の種類は [#12](https://github.com/shuhei1101/alias-inject/issues/12)（作業 PR [#18](https://github.com/shuhei1101/alias-inject/pull/18)）で加えた 5 種類を含む 9 種類を引き継ぐ（D-167）。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
| [反映作業](./反映作業/index.yaml) | 端末の設定の移し替え |

## タスク一覧

- [x] ~~初期構築~~（[#5](https://github.com/shuhei1101/alias-inject/pull/5) で済んでいる）
- [x] ~~リバースエンジニアリング~~（設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（既存の YAML の読み込みと照合の仕組みのまま、読む設定の構造を変えるだけで、未検証の技術機構に依存しない）
- [x] 複合ユースケース設計
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [x] インターフェース定義設計
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] モジュール構成設計
- [x] ドキュメント修正（設計書/設定/プラグイン.yaml・設計書/アーキテクチャ図/アーキテクチャ図.yaml・docs/リファレンス/設定ファイル.md・docs/リファレンス/エイリアスのスキーマ.md・docs/リファレンス/index.yaml・docs/はじめに/コアコンセプト/引用の文脈.md・docs/使い方/セットアップ.md・docs/使い方/設定の移し替え.md・docs/使い方/index.yaml）
- [x] 単体テスト作成
- [x] 実装
- [ ] 結合テスト作成
- [ ] E2E テスト作成
