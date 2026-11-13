# 配信元の設定 project-index.yaml に description と when を記載する

## 概要

文書の MCP の利用者が、`describe` の一覧と MCP の instructions から、alias-inject の配信元が何の文書を持ち、どういうときに検索するかを読めるようになる。

## 背景

[Issue #92](https://github.com/shuhei1101/alias-inject/issues/92) の要望。
[shuhei1101/project-index#39](https://github.com/shuhei1101/project-index/issues/39)（作業 PR [shuhei1101/project-index#55](https://github.com/shuhei1101/project-index/pull/55)）で、配信元の設定に省略できるキー `when` が追加された。
直下の `project-index.yaml` は `version`・`name`・`worktrees`・`documents` だけを持ち、配信元の `description` と `when` が無い。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
