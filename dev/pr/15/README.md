# 読んだ本文の !{名前} に同じ名前の環境変数の値を文脈として追加する

## 概要

Read・Bash・MCP のツールで読んだ本文に `!{名前}` の変数参照があると、モデルが同じ名前の環境変数の値を文脈として受け取れるようになる。

## 背景

[Issue #11](https://github.com/shuhei1101/alias-inject/issues/11) の要望。
ai-monitor と knowledge の規約は本文に `!{名前}` の変数参照を書いており、今は rule-inject の MCP ツール `read_rules` が本文を返すときに環境変数の値へ置き換えている。
rule-inject は `read_rules` と MCP サーバーを廃止すると決めた（[shuhei1101/rule-inject#44](https://github.com/shuhei1101/rule-inject/pull/44)）。
廃止後は規約が Read で読まれ、`!{名前}` が置き換わらないまま届くため、語を照合して文脈を追加する alias-inject に役割を移す。
`read_rules` の廃止（[shuhei1101/rule-inject#36](https://github.com/shuhei1101/rule-inject/issues/36)）は、この Issue が閉じるのを待っている。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と影響する UC 一覧 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |

## タスク一覧

- [x] ~~初期構築~~（[#5](https://github.com/shuhei1101/alias-inject/pull/5) で済んでいる）
- [x] ~~リバースエンジニアリング~~（設計書が揃っている）
- [x] ~~方針決め~~（方針決めを依頼する Issue ではない）
- [x] PoC 検証
- [x] 複合ユースケース設計
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [x] インターフェース定義設計
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] モジュール構成設計
- [x] ドキュメント修正（設計書/アーキテクチャ図/アーキテクチャ図.yaml・設計書/外部ライブラリ/claude-code.yaml・docs/はじめに/コアコンセプト/変数参照の値.md・README.md・CLAUDE.md・.claude-plugin/plugin.json）
- [x] 単体テスト作成
- [x] 実装
- [ ] 結合テスト作成
- [ ] E2E テスト作成