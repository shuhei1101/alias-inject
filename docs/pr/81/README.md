# 配信元の設定 dev-docs.yaml を project-index.yaml へ改名し、端末の設定の config を書き換える

## 概要

リポジトリの直下の配信元の設定 `dev-docs.yaml` を `project-index.yaml` へ改名し、端末の設定が指す alias-inject の配信元の設定のパスを改名後のパスへ書き換える。

## 背景

[#77](https://github.com/shuhei1101/alias-inject/issues/77) の要望。
[#75](https://github.com/shuhei1101/alias-inject/pull/75)（起点 [#74](https://github.com/shuhei1101/alias-inject/issues/74)）で文書が例に使う配信元の設定のファイル名を `project-index.yaml` にし、リポジトリの直下の実体はスコープ外にした。
依存の [shuhei1101/dev-docs#114](https://github.com/shuhei1101/dev-docs/issues/114) は解消している（作業 PR [shuhei1101/dev-docs#163](https://github.com/shuhei1101/dev-docs/pull/163) がマージ済み）。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [反映作業](./反映作業/index.yaml) | 端末の設定の書き換え |
