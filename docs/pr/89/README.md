# 設計書・公開ドキュメント・コードのコメントに残る AI slop の単語を対応表に合わせて修正する

## 概要

`docs/`（`docs/pr/` を除く）の設計書・公開ドキュメントと `hooks/` のコードのコメントに残る AI slop の単語を、knowledge の AI slop の単語の対応表に合わせて置き換える。

## 背景

[Issue #88](https://github.com/shuhei1101/alias-inject/issues/88) の要望。
[#84](https://github.com/shuhei1101/alias-inject/issues/84)（[PR #86](https://github.com/shuhei1101/alias-inject/pull/86)）はスキーマの修正と同じ文言の 5 箇所だけを、[#85](https://github.com/shuhei1101/alias-inject/issues/85)（[PR #87](https://github.com/shuhei1101/alias-inject/pull/87)）は呼び名「避ける語」だけを修正したため、それ以外の箇所に対応表の NG の単語が残っている。
[#56](https://github.com/shuhei1101/alias-inject/issues/56) の手順 4 の AI slop の単語の置き換えも、この作業へ移した。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
