# テスト・README.md・CLAUDE.md・スキル・スクリプトに残る AI slop の単語を対応表に合わせて修正する

## 概要

`tests/` のコメント・テスト名・入力の値、ルートの `README.md`・`CLAUDE.md`、`skills/global-setup/`、`scripts/gen-aliases-schema.mjs` に残る AI slop の単語を、knowledge の AI slop の単語の対応表に合わせて置き換える。

## 背景

[Issue #90](https://github.com/shuhei1101/alias-inject/issues/90) の要望。
[#88](https://github.com/shuhei1101/alias-inject/issues/88)（[PR #89](https://github.com/shuhei1101/alias-inject/pull/89)）は `docs/` と `hooks/` のコメントだけを対象にしたため、それ以外の箇所に対応表の NG の単語が残っている。
用語「語」の呼び名は #89 で「単語」へ変更すると決まった。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
