# 開発ドキュメントのサイドバーで、入れ子にすべきグループを入れ子にする

## 概要

dev-docs の画面で alias-inject の設計書を参照する人が、サイドバーの入れ子のグループから機能の単位で設計書を探せるようになる。

## 背景

[Issue #144](https://github.com/shuhei1101/alias-inject/issues/144) の要望。
project-index の `nav` の `group` は子の `items[]` に `group` を持てるようになったが、[project-index.yaml](https://github.com/shuhei1101/alias-inject/blob/cf6f1d1/project-index.yaml) の `nav` はグループが 1 階層だけで、タブ「設計書」のモジュール構成のグループには 17 件が並ぶ。
タブとサイドバーの構成は [#115](https://github.com/shuhei1101/alias-inject/issues/115)（[#119](https://github.com/shuhei1101/alias-inject/pull/119)）で 1 階層のグループとして定義した。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.mark.md) | 要望の整理 |
