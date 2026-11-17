# テスト実行方法の run_runner で、起動した run を参照できるまで待ってから gh run watch を呼ぶ

## 概要

テスト実行方法の `run_runner` で単体・結合テストをランナーで回したときに、起動の直後でもランナーの集計の行を受け取れるようにする。

## 背景

[Issue #123](https://github.com/shuhei1101/alias-inject/issues/123) の要望。
[docs/test-procedure/TP-1.yaml](https://github.com/shuhei1101/alias-inject/blob/a953844/docs/test-procedure/TP-1.yaml) の `run_runner` は `gh workflow run` の直後に `gh run watch "$run_id"` を呼ぶため、run がまだ GitHub の API で参照できない間は `failed to get run: HTTP 404` で終わる。
同じ修正を project-index の [PR #139](https://github.com/shuhei1101/project-index/pull/139) と claude-balancer の TP-275-1 が入れている。

## 計画書

| ファイル | 中身 |
| --- | --- |
| [要件](./要件.md) | 要望の整理と変更箇所の由来 |
| [プラグイン](./プラグイン.md) | プラグインの計画書 |
