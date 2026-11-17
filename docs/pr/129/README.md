# 既存の文書を mdmark の記載方法と表し方の優先順位に移行し、メタデータを再設定する

## 概要

配信元 alias-inject の文書を、mdmark の記載方法と表し方の優先順位（図 → 表 → 箇条書き → 文）に移行し、タグ・エイリアス・`description`・関連を今の規約で再設定する。

## 背景

[#56](https://github.com/shuhei1101/alias-inject/issues/56) の要望。
文書の配信は project-index に統一したが、文書の中身は Mermaid の図・文の羅列・接頭辞の無いタグ・空の `description` のままのものが多い。
前提の [shuhei1101/knowledge#132](https://github.com/shuhei1101/knowledge/issues/132)（規約『表し方の優先順位』）・[shuhei1101/knowledge#144](https://github.com/shuhei1101/knowledge/issues/144)（エイリアスの判定フローチャート）・[shuhei1101/mdmark#324](https://github.com/shuhei1101/mdmark/issues/324)（図 map）・[shuhei1101/ai-monitor#2973](https://github.com/shuhei1101/ai-monitor/issues/2973)（`dev/` の廃止）は close 済み。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
