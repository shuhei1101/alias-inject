# 引用の文脈の見出しと文書の呼び名「避ける語」を変えるかを決め、変える場合は AI slop の単語の対応表に合わせて修正する

## 概要

引用の文脈の見出し `避ける語` と、設計書・公開ドキュメントでの同じ呼び名を、AI slop の単語の対応表に合わせて変えるかを決め、変える場合は修正する。

## 背景

[Issue #85](https://github.com/shuhei1101/alias-inject/issues/85) の要望。
[PR #83](https://github.com/shuhei1101/alias-inject/pull/83)（起点 [#82](https://github.com/shuhei1101/alias-inject/issues/82)）でスキーマ `schemas/aliases.schema.yaml` の `avoid` の注釈を「使用しない単語」へ修正したが、引用の文脈の見出し `避ける語` は利用者の目に触れる用語のため変えず、注釈と見出しの呼び名が一致していない。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
