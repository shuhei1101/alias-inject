# 文書のマーカーを mdmark の JSON の記載へ移す

## 概要

このリポジトリの文書の旧書式のマーカーを、`mdmark upgrade` で mdmark の JSON の記載へ移す。

## 背景

[#93](https://github.com/shuhei1101/alias-inject/issues/93) の要望。
mdmark の [shuhei1101/mdmark#477](https://github.com/shuhei1101/mdmark/pull/477) で、マーカーの設定を名前の後ろの JSON のオブジェクトで記載できるようになり、今の書き方は [shuhei1101/mdmark#479](https://github.com/shuhei1101/mdmark/issues/479) で参照されなくなる。
前提の [#56](https://github.com/shuhei1101/alias-inject/issues/56) と [shuhei1101/mdmark#528](https://github.com/shuhei1101/mdmark/issues/528)（タグ v0.11.0）は close 済み。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
