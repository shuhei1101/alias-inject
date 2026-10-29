# エイリアスの元の行の alias_type を行の属性に移し、metadata を列名だけにして dev-docs.yaml から defaults[]・custom をなくす

## 概要

利用者が、dev-docs の documents の行と同じ構造（行の `alias_type` と、列名だけの `metadata`）でエイリアスの元の行を書けるようになる。
alias-inject の `dev-docs.yaml` から `defaults[]`・`custom`・行の `type` をなくす。

## 背景

[Issue #37](https://github.com/shuhei1101/alias-inject/issues/37) の要望。
dev-docs は `metadata` を列の対応（`name: title`）だけにし、`custom`・`defaults[]`・行の `type` をなくす（D-171、[shuhei1101/dev-docs#32](https://github.com/shuhei1101/dev-docs/issues/32)）。
エイリアスの元の行のスキーマは alias-inject が正本（D-120）で、今は種類を `metadata.alias_type: {type: custom, value: term}` で持つため、dev-docs の新しい構造と合わない。
alias-inject の `dev-docs.yaml` も、Markdown のファイルごとのタグを `defaults[]` に並べ、YAML の設計書に `tags: {type: custom}` を付けている。
今の構造は [#21](https://github.com/shuhei1101/alias-inject/pull/21) で入れた。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
| [反映作業](./反映作業/index.yaml) | 端末の設定の移し替え |

## タスク一覧

- [x] ~~初期構築~~（既存リポジトリのため対象外）
- [x] ~~リバースエンジニアリング~~（現状設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（未検証の技術機構に依存しない）
- [x] 複合ユースケース設計
- [x] ~~デザインスタイル選定~~（画面を持たない）
- [x] ~~画面一覧・画面遷移~~（画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（画面を持たない）
- [x] インターフェース定義設計
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [ ] モジュール構成設計
- [ ] ドキュメント修正（設計書/設定/プラグイン.yaml・設計書/アーキテクチャ図/アーキテクチャ図.yaml・docs/リファレンス/エイリアスのスキーマ.md・docs/リファレンス/設定ファイル.md・docs/はじめに/コアコンセプト/引用の文脈.md・docs/使い方/セットアップ.md・docs/使い方/設定の移し替え.md・docs/使い方/index.yaml・dev-docs.yaml・docs/files.yaml・dev/テンプレート/files.schema.yaml）
- [ ] 単体テスト作成
- [ ] 実装
- [ ] 結合テスト作成
- [ ] E2E テスト作成
