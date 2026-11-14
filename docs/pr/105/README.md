# .gitignore に .claude-plugin/types/ を追加し、__pycache__/ を削除する

## 概要

開発者が `claude --plugin-dir {worktree}` で型の宣言 `.claude-plugin/types/` を書き出しても、Git の未追跡のファイルに出ないようになる。

## 背景

[Issue #101](https://github.com/shuhei1101/alias-inject/issues/101) の要望。
[#66](https://github.com/shuhei1101/alias-inject/issues/66)（作業 PR [#100](https://github.com/shuhei1101/alias-inject/pull/100)）で、規約『フォルダ構成の切り方とレビュー』のレビューの観点「管理しないもの」で今のフォルダ構成を確認して見つかった。
`.gitignore` には、開発コマンド CMD-1 の環境構築で書き出す `.claude-plugin/types/` が無く、Python のコードを持たなくなったリポジトリに `__pycache__/` が残っている。
フォルダ構成の設計書 LAY-1 の `gitignore[]` は、今の `.gitignore` と同じ 3 行を持つ。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
