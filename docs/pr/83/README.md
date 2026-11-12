# エイリアスのスキーマの title・description の文言を AI slop の単語の対応表に合わせて修正する

## 概要

`schemas/aliases.schema.yaml` の `title`・`description` の文言を、knowledge の AI slop の単語の対応表に合わせて修正する。

## 背景

[Issue #82](https://github.com/shuhei1101/alias-inject/issues/82) の要望。
dev-docs・project-index は alias-inject のスキーマをタグで取り込んだコピーとして持つため、文言は取り込み元の alias-inject で修正する（[shuhei1101/dev-docs#151](https://github.com/shuhei1101/dev-docs/issues/151) の扱いの判断）。
`hooks/lib/aliases-schema.ts` は `scripts/gen-aliases-schema.mjs` がスキーマから生成し、同じ文言を持つ。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
