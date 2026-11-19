# 文脈を追加したときの表示の行から「文脈を追加: 」を削除する

## 概要

利用者が、引用の文脈が追加されたときに画面に出る行を、`文脈を追加: ` を含まない `alias-inject: {単語}（{id}）` の形で確認できるようになる。

## 背景

[Issue #140](https://github.com/shuhei1101/alias-inject/issues/140) の要望。
[#133](https://github.com/shuhei1101/alias-inject/pull/133)・[#138](https://github.com/shuhei1101/alias-inject/pull/138) で、追加した単語を `$.ui.log` の `transcript` で `文脈を追加: {単語}（{id}）、…` の 1 行として表示するようにした。
`文脈を追加: ` は毎回同じ文言で、行の幅を使う。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
