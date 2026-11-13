# hooks が出力する警告・エラーの文言に残る AI slop の単語を対応表に合わせて修正する

## 概要

`hooks/` が出力する警告・エラーの文言に残る AI slop の単語を、knowledge の AI slop の単語の対応表に合わせて置き換え、期待値を持つテストと文言を記載した設計書も合わせて修正する。

## 背景

[Issue #91](https://github.com/shuhei1101/alias-inject/issues/91) の要望。
[#88](https://github.com/shuhei1101/alias-inject/issues/88)（[PR #89](https://github.com/shuhei1101/alias-inject/pull/89)）と [#90](https://github.com/shuhei1101/alias-inject/issues/90)（[PR #94](https://github.com/shuhei1101/alias-inject/pull/94)）は、コードが出力する文字列とその期待値を変えずに残した。
警告・エラーの文言は利用者の目に触れるため、別の作業に分けた。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
