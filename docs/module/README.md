# module

クラス / 関数 / 関数型 インデックス（単体テストの元）

## 目次

<!-- table: data -->

| ページ | 概要 |
| --- | --- |
| [プラグイン / イベントの処理 / handlers.ts](./MOD-1.ts.yaml) | 入口が `prompt.submit`・`session.compact`・`session.end`・`tool.call` に登録するイベントの処理 |
| [プラグイン / エイリアス / alias.ts](./MOD-2.ts.yaml) | 設定ファイルの `aliases` の行と `project-index.yaml` の `documents` の行をスキーマで検証して取り出し、`id` の重なった行を外す。文書ごとに `metadata` の値を解決し、種類ごとの必須のキーを確かめる |
| [プラグイン / スキーマ / schema.ts](./MOD-3.ts.yaml) | `schemas/aliases.schema.yaml` から生成して同梱するスキーマのオブジェクトで、エイリアスの元の行（設定ファイルの `aliases` と `project-index.yaml` の `documents` の行）を検証する。検証はスキーマが使うキーワードだけを解釈し、外部のライブラリを使わない |
| [プラグイン / スキーマの生成 / gen-aliases-schema.mjs](./MOD-4.mjs.yaml) | `schemas/aliases.schema.yaml` から `hooks/lib/aliases-schema.ts` を生成し、一致を確かめるスクリプト |
| [プラグイン / ツール / tool.ts](./MOD-5.ts.yaml) | ツールの呼び出しの引数から、読んでいる文書そのものの語を照合の結果から外す |
| [プラグイン / リポジトリ / repository.ts](./MOD-6.ts.yaml) | 読むリポジトリの `project-index.yaml` を更新時刻が変わったときだけ読み、`documents` のうち `alias_type` を持つ行だけを取り出して `paths` をそのフォルダから解決する |
| [プラグイン / 入口 / register.tsx](./MOD-7.tsx.yaml) | Claude Code が `hooks/hooks.json` の `modules` から読む hooks モジュールの入口と、プラグイン・マーケットプレイス・型の確認の定義ファイル |
| [プラグイン / 変数参照 / variable.ts](./MOD-8.ts.yaml) | ツールの結果の本文から `!{名前}` の名前を拾い、`env -0` の出力から値を引いて、文脈に追加する値の行を組み立てる |
| [プラグイン / 文脈 / context.ts](./MOD-9.ts.yaml) | 当たった語から記録済みの語を除き、`max_items`・`max_chars` に収まる語を選んで、追加する文脈の文字列を組み立てる |
| [プラグイン / 照合 / match.ts](./MOD-10.ts.yaml) | 入力と語を同じ正規化でそろえ、部分文字列として含まれる語を返し、出た位置か出た回数の順に並べる。正規表現は使わない |
| [プラグイン / 照合条件 / condition.ts](./MOD-11.ts.yaml) | 文書の `inject_when` の値を照合条件として検査し、照合した本文で評価して、照合条件に当たらない語を当たった語から外す |
| [プラグイン / 状態の型 / index.d.ts](./MOD-12.ts.yaml) | `$.state` に置く値の型の契約。`.claude-plugin/plugin.json` の `types` が指す |
| [プラグイン / 生成したスキーマ / aliases-schema.ts](./MOD-13.ts.yaml) | `schemas/aliases.schema.yaml` から生成して同梱するスキーマのオブジェクト。手で書き換えない |
| [プラグイン / 記録 / record.ts](./MOD-14.ts.yaml) | 会話ごとに文脈を追加した語のキーを `$.state` に持ち、読み・追加・消去を行う。会話はメインの会話がセッション、サブエージェントがセッションと `agentId` の組 |
| [プラグイン / 設定 / config.ts](./MOD-15.ts.yaml) | 設定ファイルのパスの取得、設定ファイルの検証と既定値の適用、起動したプロジェクトに当たる `projects` を重ねた実効の設定の組み立て、入力の出所の判定 |
| [プラグイン / 読み込み / loader.ts](./MOD-16.ts.yaml) | パスの展開・glob の展開・更新時刻で変わったファイルだけの読み込みと、YAML のパース。設定ファイル・スキーマ・`project-index.yaml`・`aliases` の要素が指す YAML が使う |
| [プラグイン / 項目 / entry.ts](./MOD-17.ts.yaml) | エイリアスの元の行の `paths` に当たる YAML を読み、文書ごとに `metadata` の値を解決して、照合する語と文脈に並べる列を持つ語の一覧を作る |

<!-- /table -->
