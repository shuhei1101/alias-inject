# 開発ドキュメントのタブの並びとサイドバーのグループを nav で定義し、目次を並べない

## 概要

dev-docs の画面で alias-inject の文書を参照する人が、最初のタブ（はじめに・使い方）から参照し始め、設計書を種類ごとのグループで探せるようになる。

## 背景

[Issue #115](https://github.com/shuhei1101/alias-inject/issues/115) の要望。
[project-index.yaml](https://github.com/shuhei1101/alias-inject/blob/d87dba0/project-index.yaml) が `nav` を持たないため、dev-docs が文書の行ごとにタブを作り、タブが 11 件並んで画面の幅に収まらない。
起点になる公開ドキュメントが右にあり、フォルダの目次（`index`）が「目次」のタブとサイドバーに並ぶ。
タブの並びとサイドバーのグループの決まりは [shuhei1101/knowledge#421](https://github.com/shuhei1101/knowledge/issues/421) で規約『開発ドキュメントのナビゲーション』として登録された。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
