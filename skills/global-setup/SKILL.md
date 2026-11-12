---
name: global-setup
description: 端末ごとに 1 回、alias-inject の設定ファイルを作るか今の構造へ移し、引用の文脈が追加されることを確認する。入れ直し・端末の移行のあとにも使う
---

# global-setup

質問は AskUserQuestion で、既定値を推奨の選択肢にして聞く。

## 手順

1. 設定ファイルのパスを決める。
   - `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` の `env` の `ALIAS_INJECT_CONFIG`、環境変数 `ALIAS_INJECT_CONFIG`、`${XDG_CONFIG_HOME:-~/.config}/alias-inject/settings.yaml` の順に、最初に値があるパス
   - 先頭の `~` はホームに展開する
   - そのパスにファイルが無ければ、そのパスを推奨の選択肢にして場所を聞き、答えた場所を設定ファイルのパスにする

2. 設定ファイルがある場合、`global.aliases` と `projects[].aliases` に旧い構造の要素が残っていないかを確認する。
   - 旧い構造は `type`・`fields` を持つ要素と、行の `alias_type` を持たず `metadata.alias_type` を持つ要素
   - 残っていれば、`docs/guide/設定の移し替え.md`（`${CLAUDE_SKILL_DIR}/../../docs/guide/設定の移し替え.md`）の手順で移す内容を示し、移してよいかを聞く
   - 断られたら、設定ファイルと `settings.json` を変えずに止まる
   - 許されたら、同じ手順のとおりバックアップを取って移す
   - 残っていなければ、書き換えずに手順 4 へ進む

3. 設定ファイルが無い場合、設定ファイルを作る。
   - 読むリポジトリの `project-index.yaml` のパスと、用語集の YAML のパスを聞く
   - `${CLAUDE_SKILL_DIR}/../../settings.sample.yaml` を元に、`global.repositories` と `global.aliases` を聞いた値にした設定ファイルを作る

4. 設定ファイルのパスが既定のパスと違うか、`settings.json` の `env` の `ALIAS_INJECT_CONFIG` が別のパスを指していれば、`env` の `ALIAS_INJECT_CONFIG` に設定ファイルのパスを記載する。
   - `env` のほかのキーと、ファイルのほかの内容は変えない

5. 引用の文脈が追加されることを確認する。
   - 設定ファイルの `global.aliases` の `paths`、または `global.repositories` の `project-index.yaml` の `documents` のうち `alias_type` を持つ行の `paths` が指す YAML から、語を 1 つ取得する
   - 語を取得できなければ、照合する語を聞く
   - `claude -p --debug-file {一時ファイル} "{語}の説明を 1 文で答えてください"` を実行し、回答に語の `description` の内容が反映されるかを確認する
   - 反映されなければ、一時ファイルの `alias-inject:` で始まる行を示し、行の理由に沿った直し方を示して止まる。理由の行が無ければ、プラグインが有効か（`claude plugin list`）を確認するよう示して止まる

6. 結果を示す。
   - 作った・移した設定ファイルのパス、`env` に記載したキー、手順 5 の結果
   - リポジトリを追加するときは、設定ファイルの `global.repositories` に行を追加する
