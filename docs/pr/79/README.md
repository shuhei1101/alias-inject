# 設計書とテストに記載した dev-docs の文書の MCP のツールの完全名を、project-index のプラグインの名前に書き換える

## 概要

設計書とテストに記載した dev-docs の文書の MCP のツールの完全名を、project-index のプラグインの完全名に書き換える。

## 背景

[Issue #76](https://github.com/shuhei1101/alias-inject/issues/76) の要望。
[shuhei1101/project-index#15](https://github.com/shuhei1101/project-index/pull/15)（マージ済み）で、dev-docs の文書の MCP がプラグイン `project-index` へ移り、ツールの完全名が `mcp__plugin_dev-docs_dev-docs__{ツール名}` から `mcp__plugin_project-index_project-index__{ツール名}` に変わった（[確認ログの決定](https://github.com/shuhei1101/project-index/pull/15#discussion_r4545422559)）。
`hooks/lib/tool.ts` は `mcp__` で始まるかだけで MCP のツールを判定し、プラグインの名前に依存しないため、振る舞いは変わらない。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | 設計書のテストケースとテストの値のツールの完全名の置換の計画書 |
