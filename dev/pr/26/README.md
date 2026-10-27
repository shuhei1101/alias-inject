# E2E の補助 harness.py の _drain の読み飛ばしと、test_error_when_values_unavailable の仕込みを修正する

## 概要

release PR #17 の E2E で fail した 2 件のテスト不備（transcript の行の読み飛ばしと、値を引けない状態を作れていない仕込み）を修正し、対象のケースが pass するようにする。

## 背景

[Issue #25](https://github.com/shuhei1101/alias-inject/issues/25) の要望で、子の [Issue #22](https://github.com/shuhei1101/alias-inject/issues/22)・[Issue #23](https://github.com/shuhei1101/alias-inject/issues/23) を束ねる。
どちらも [release PR #17](https://github.com/shuhei1101/alias-inject/pull/17)（`release/v0.1.0`、`3010c940`）の E2E の fail を tester が切り分け、実装（`hooks/`）ではなくテストの不備と判定した。
#22 は、`ClaudeSession._drain` が改行で終わるファイルの末尾の空の要素を読んだ行に数え、次に追記された 1 行を読み飛ばすため、end_turn の行を落としたケースが時間切れになる。
#23 は、`PATH` を空のフォルダにして claude を起動しても、hooks モジュールの `$.process.run(['env', '-0'])` が成功し、値を引けない状態を作れていない。

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
- [x] ~~複合ユースケース設計~~（影響なし: 補助の修正で、シナリオの記述は変わらない）
- [x] ~~デザインスタイル選定~~（利用者に見える画面を持たない）
- [x] ~~画面一覧・画面遷移~~（利用者に見える画面を持たない）
- [x] 単一ユースケース設計
- [x] ~~モック作成~~（利用者に見える画面を持たない）
- [x] ~~インターフェース定義設計~~（hooks モジュールの入口と挙動を変えない）
- [x] ~~部品設計~~（画面を持たない）
- [x] ~~画面設計~~（画面を持たない）
- [x] ~~モジュール構成設計~~（`hooks/` の構成を変えない）
- [x] ~~ドキュメント修正~~（更新するドキュメントが無い）
- [x] ~~単体テスト作成~~（`hooks/` の処理を変えない）
- [x] ~~実装~~（`hooks/` の処理を変えない）
- [x] ~~結合テスト作成~~（`hooks/` の処理を変えない）
- [x] E2E テスト作成
