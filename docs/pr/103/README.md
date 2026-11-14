# dev/ の廃止の後に残った PR #71 の PR ドキュメントを docs/pr/71/ へ移す

## 概要

`dev/pr/71/` に残っている PR #71 の PR ドキュメントを `docs/pr/71/` へ移し、リポジトリから `dev/` を無くす。

## 背景

[Issue #102](https://github.com/shuhei1101/alias-inject/issues/102) の要望。
[PR #71](https://github.com/shuhei1101/alias-inject/pull/71) が `dev/` を廃止した後も、PR #71 自身の PR ドキュメントだけが `dev/pr/71/` に残り、他の PR ドキュメントの `docs/pr/{PR 番号}/` と 2 か所に分かれている。
[Issue #66](https://github.com/shuhei1101/alias-inject/issues/66)（作業 PR [#100](https://github.com/shuhei1101/alias-inject/pull/100)）で今のフォルダ構成をレビューの観点で確認して見つかった。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
