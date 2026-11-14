# フォルダ構成の設計書の複製の元と git で管理する生成物を generated_from.source・tracked で記載する

## 概要

フォルダ構成の設計書 `docs/layout/LAY-1.yaml` で、リポジトリの外を元にする複製の元と、git で管理する生成物・複製の理由を、`contents` ではなくテンプレート『フォルダ構成』の `generated_from.source`・`generated_from.tracked` で記載する。

## 背景

[Issue #107](https://github.com/shuhei1101/alias-inject/issues/107) の要望。
[#100](https://github.com/shuhei1101/alias-inject/pull/100) では、テンプレート『フォルダ構成』に記載方法が無かったため、複製の元と git で管理する生成物を `contents` に記載した（[レビューの指摘](https://github.com/shuhei1101/alias-inject/pull/100#discussion_r4572214673)・[レビューの指摘](https://github.com/shuhei1101/alias-inject/pull/100#discussion_r4572215999)）。
[shuhei1101/knowledge#377](https://github.com/shuhei1101/knowledge/pull/377) で、テンプレート『フォルダ構成』に `generated_from.source`・`tracked` を追加した。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
