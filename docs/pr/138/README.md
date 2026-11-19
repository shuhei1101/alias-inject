# 応答の文の照合で追加した単語も、利用者の画面に表示する

## 概要

利用者が、応答の文で単語がヒットして引用の文脈が追加されたときも、入力・ツールの結果と同じく、追加した単語と文書の ID を画面で確認できるようになる。

## 背景

[Issue #137](https://github.com/shuhei1101/alias-inject/issues/137) の要望。
[#133](https://github.com/shuhei1101/alias-inject/pull/133)（起点 [#131](https://github.com/shuhei1101/alias-inject/issues/131)）で、入力（`prompt.submit`）とツールの結果（`tool.call`）で追加した単語を `$.ui.log` の `transcript` で表示するようにした。
応答の文（`turn.step`）の照合は `$.session.append` で会話に追加する別の経路のため #133 のスコープ外にしており、応答の文で追加した単語だけが画面に表示されない。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
