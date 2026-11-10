# 用語の avoid の単語が本文に出たら、避ける語として用語の title を案内する

## 概要

利用者が用語集の用語の `avoid` にやめた言い方を記載しておくと、やめた言い方を発言やツールで読んだ本文に書いたときに、代わりに使用する用語の名前が避ける語として案内されるようになる。

## 背景

[Issue #72](https://github.com/shuhei1101/alias-inject/issues/72) の要望。
用語集の用語は、やめた言い方を `avoid` に持つ。
alias-inject は、用語の `name` と `aliases` が本文に出たときに用語を案内するが、`avoid` の単語が出たときは案内しない（[docs/config/CFG-1.yaml](https://github.com/shuhei1101/alias-inject/blob/bf3a993189dbbd597ed08177de4e8430539f5447/docs/config/CFG-1.yaml) の `global.aliases[].metadata.avoid` は「スキーマが受け付けるが、文脈には使わない」）。
そのため、話し合いで命名を変えた後に旧命名で記載しても、新しい命名が案内されない。
用語の `avoid` の単語を避ける語として照合することは、Issue の `## 決まったこと` のとおり起票前の話し合いで決めた。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
