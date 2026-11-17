# #111 で入った workflow の E2E テストと、そのテストだけが使う記載を develop から削除する

## 概要

[PR #116](https://github.com/shuhei1101/alias-inject/pull/116) が develop に入れたテストの全件実行の workflow の E2E テストと、そのテストだけが参照する設計書・設定の記載を削除し、D-307（E2E は開発の間は作らず、メジャーリリースの前に作る）に合わせる。

## 背景

[Issue #127](https://github.com/shuhei1101/alias-inject/issues/127) の要望。
[Issue #111](https://github.com/shuhei1101/alias-inject/issues/111) は D-307 で未割り当てに置いていた行だったが着手され、PR #116（[215d21f](https://github.com/shuhei1101/alias-inject/commit/215d21f)）で E2E テストが develop に入った。
ユーザーが [Issue #125 の確認事項](https://github.com/shuhei1101/alias-inject/issues/125#issuecomment-6944515859) で、テストを削除して D-307 に合わせる案を選んだ。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
