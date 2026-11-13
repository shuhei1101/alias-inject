# plugin.json・settings.sample.yaml・rules.yaml に残る AI slop の単語を対応表に合わせて修正する

## 概要

`.claude-plugin/plugin.json` の description、`settings.sample.yaml`・`rules.yaml` のコメントに残る AI slop の単語を、knowledge の AI slop の単語の対応表に合わせて置き換える。

## 背景

[Issue #95](https://github.com/shuhei1101/alias-inject/issues/95) の要望。
[#90](https://github.com/shuhei1101/alias-inject/issues/90)（[PR #94](https://github.com/shuhei1101/alias-inject/pull/94)）の対象は `tests/`・`README.md`・`CLAUDE.md`・`skills/global-setup/`・`scripts/` で、この 3 ファイルを含まない。
用語「語」の呼び名は [#88](https://github.com/shuhei1101/alias-inject/issues/88)（[PR #89](https://github.com/shuhei1101/alias-inject/pull/89)）で「単語」へ変更すると決まった。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
