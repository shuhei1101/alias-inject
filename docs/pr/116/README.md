# テストの全件実行の workflow の E2E テストを作り、本物の GitHub Actions でフローごとに回す

## 概要

テストの全件実行の workflow（`.github/workflows/test.yml`）を、インターフェース定義 IF-6 のフローごとに本物の GitHub Actions で起動して確認する E2E テストを `tests/e2e/workflow/` に作る。

## 背景

[Issue #111](https://github.com/shuhei1101/alias-inject/issues/111) の要望。
[PR #109](https://github.com/shuhei1101/alias-inject/pull/109)（起点 [Issue #99](https://github.com/shuhei1101/alias-inject/issues/99)）で workflow と IF-6 を追加したが、`workflow_dispatch` は develop にある workflow だけを起動できるため、PR #109 では E2E テストを作れなかった。
[PR #112](https://github.com/shuhei1101/alias-inject/pull/112)（起点 [Issue #110](https://github.com/shuhei1101/alias-inject/issues/110)）で正常系をランナーで初めて回したが、異常系のフローの確認と、それで観測する GitHub Actions のキーの動作確認は、この Issue へ回した。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
