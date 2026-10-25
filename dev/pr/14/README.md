# 設定を aliases[] の共通の構造に合わせ、リポジトリの dev-docs.yaml の aliases[] を読む

## 概要

利用者が、読むリポジトリの `dev-docs.yaml` を端末の設定に並べるだけで、そのリポジトリの `aliases[]` の用語・文書・コマンド・URL を引用の文脈に使えるようになる。
端末だけのエイリアスも、同じ `aliases[]` の構造で端末の設定に書ける。

## 背景

[Issue #9](https://github.com/shuhei1101/alias-inject/issues/9) の要望。
[#1](https://github.com/shuhei1101/alias-inject/issues/1)（[#7](https://github.com/shuhei1101/alias-inject/pull/7)）で作った端末の設定は、照合の定義を独自の構造 `sources[]` で持っている。
[#8](https://github.com/shuhei1101/alias-inject/issues/8)（[#13](https://github.com/shuhei1101/alias-inject/pull/13)）で、dev-docs・mdmark と使い回す共通の構造 `aliases[]` のスキーマ `schemas/aliases.schema.yaml` を置いた。
定義は各リポジトリの `dev-docs.yaml` の `aliases[]` に 1 回だけ書き、alias-inject もそれを読む（決定の経緯は Issue の `## 必読` が挙げる話し合いの記録の D-87・D-92・D-116・D-118・D-120）。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |

## タスク一覧

- [x] ~~初期構築~~（[#5](https://github.com/shuhei1101/alias-inject/pull/5) で済んでいる）
- [x] ~~リバースエンジニアリング~~（設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] ~~PoC 検証~~（YAML の読み込みと照合は既存の仕組みで動いている。スキーマでの検証にライブラリを使う場合は、ライブラリ選定で mod のランタイムで動くかを確かめる）
- [ ] 複合ユースケース設計
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [ ] インターフェース定義設計
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [ ] モジュール構成設計
- [ ] ドキュメント修正（設計書/アーキテクチャ図/アーキテクチャ図.yaml・設計書/設定/プラグイン.yaml・docs/リファレンス/設定ファイル.md・docs/リファレンス/エイリアスのスキーマ.md・docs/使い方/セットアップ.md・docs/はじめに/コアコンセプト/引用の文脈.md）
- [ ] 単体テスト作成
- [ ] 実装
- [ ] 結合テスト作成
- [ ] E2E テスト作成
