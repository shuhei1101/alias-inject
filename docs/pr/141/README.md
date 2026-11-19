# 文脈を追加したときの表示の行の頭を「alias-inject: 」に変更する

## 概要

利用者が、引用の文脈が追加されたときに画面に出る行を、`文脈を追加: ` ではなく `alias-inject: ` で始まる行で確認できるようになる。

## 背景

[Issue #140](https://github.com/shuhei1101/alias-inject/issues/140) の要望。
[#133](https://github.com/shuhei1101/alias-inject/pull/133)・[#138](https://github.com/shuhei1101/alias-inject/pull/138) で、追加した単語を `$.ui.log` の `transcript` で `文脈を追加: {単語}（{id}）、…` の 1 行として表示するようにした。
行の頭の `文脈を追加: ` は、どのプラグインが表示した行かを示さず、毎回同じ文言で幅を使う。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
