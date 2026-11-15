# テストの全件実行の workflow をランナーで初めて回し、skip の件数の比較とタイムアウトの再計算と動作確認を記録する

## 概要

テストの全件実行の workflow（`.github/workflows/test.yml`）を GitHub Actions のランナーで初めて回し、手元との skip の件数の比較・ジョブのタイムアウトの再計算・GitHub Actions の動作確認を記録する。

## 背景

[Issue #110](https://github.com/shuhei1101/alias-inject/issues/110) の要望。
[PR #109](https://github.com/shuhei1101/alias-inject/pull/109)（起点 [Issue #99](https://github.com/shuhei1101/alias-inject/issues/99)）で workflow を追加したが、`workflow_dispatch` は develop にある workflow だけを起動できるため、PR #109 の中ではランナーで回せなかった。
そのため、ジョブのタイムアウトは実測が無く GitHub Actions の 1 ジョブの上限（360 分）を暫定で使用しており、外部ライブラリの設計書 LIB-4 の `verification` は `未確認` のままになっている。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
