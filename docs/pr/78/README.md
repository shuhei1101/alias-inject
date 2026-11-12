# セットアップの手順が取得する settings.sample.yaml の URL を master から develop にする

## 概要

使い方の『セットアップ』の手で用意する手順が `curl` で取得する `settings.sample.yaml` の URL を、`master` から `develop` のものにする。

## 背景

[Issue #67](https://github.com/shuhei1101/alias-inject/issues/67) の要望。
0.x の間は既定のブランチを develop にし、`master` と記載した参照を develop に修正すると決まった（D-296。前提の [shuhei1101/ai-monitor#3317](https://github.com/shuhei1101/ai-monitor/issues/3317) は完了済み）。
リポジトリの既定のブランチと GitHub Pages の配信元は既に `develop` で、master を指す参照は [docs/guide/セットアップ.md](../../guide/セットアップ.md) の `raw.githubusercontent.com` の URL だけが残っている。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
