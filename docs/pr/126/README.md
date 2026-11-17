# 配信元 alias-inject の検索の対象とメタデータを project-index の setup の推奨の範囲と付け方に合わせる

## 概要

配信元 alias-inject の検索の対象（`project-index.yaml` の `documents[]`）を project-index の setup の推奨の範囲に広げ、メタデータを今の付け方で見直す。

## 背景

[#122](https://github.com/shuhei1101/alias-inject/issues/122) の要望。
project-index の setup が推奨する検索の範囲（`**/*`）と、ファイルの中身を段階的に参照してメタデータを付ける付け方が project-index の develop に入った（[shuhei1101/project-index#101](https://github.com/shuhei1101/project-index/issues/101)・[shuhei1101/project-index#102](https://github.com/shuhei1101/project-index/issues/102)）。
この配信元は、それより前の範囲と付け方のままで、Git 管理のファイルのうち `docs/pr/` を除く大半（`hooks/`・`tests/`・`skills/`・`scripts/`・直下のファイル・各フォルダの `README.md` など）が検索の対象に入っていない。
直下と `docs/` 直下のファイルを管理用の YAML に記載できるようにする判定の変更（[shuhei1101/project-index#133](https://github.com/shuhei1101/project-index/issues/133)）は close 済み。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
