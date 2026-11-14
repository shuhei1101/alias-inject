# アーキテクチャ図の repository.layout を除き、設計書のスキーマを knowledge の参照へ移してコピーを削除する

## 概要

設計書を、AI Monitor から配られたスキーマのコピーではなく knowledge のスキーマのリビジョンつきの参照で検査し、アーキテクチャ図からフォルダ構成の設計書と重なる `repository.layout` を除く。

## 背景

[Issue #104](https://github.com/shuhei1101/alias-inject/issues/104) の要望。
[#66](https://github.com/shuhei1101/alias-inject/issues/66)（作業 PR [#100](https://github.com/shuhei1101/alias-inject/pull/100)）でフォルダ構成の設計書 `docs/layout/LAY-1.yaml` を作るときに、スコープ外に回した。
`project-index.yaml` の `documents[].schema` は `layout` の行だけが knowledge のスキーマを参照し、他の行は `schemas/` のコピーを指している。
AI Monitor は [shuhei1101/ai-monitor#3430](https://github.com/shuhei1101/ai-monitor/pull/3430) でスキーマのコピーの配布をやめ、配布先の反映作業『各プロジェクトのスキーマの参照への移行』を出した。
knowledge のアーキテクチャ図のスキーマは、[shuhei1101/ai-monitor#3376](https://github.com/shuhei1101/ai-monitor/pull/3376) の変換のとおり `repository.layout` を持たない。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
