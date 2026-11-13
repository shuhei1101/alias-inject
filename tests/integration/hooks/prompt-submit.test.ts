import { expect, test } from 'claude-code/testing'
import { installWorld, submit, userSettingsWithConfig } from '../../unit/hooks/support/engine'
import { MemoryFs } from '../../unit/hooks/support/memory-fs'
import {
  CONFIG_DIR,
  CONFIG_PATH,
  DEV_DOCS_PATH,
  DOCS_DIR,
  KNOWLEDGE_DIR,
  SCOPED_LINKS,
  SCOPED_PROJECT_ROOT,
  SETTINGS,
  TERMS_DIR,
  TERM_C_WITH_CONDITION,
  aliasLines,
  indent,
  linksYaml,
  makeConfig,
  makeCwdScopedFs,
  makeDevDocs,
  makeFs,
  termAliasLines,
  termYaml,
} from './support/fixtures'

// 読み込まれると何も追加しない設定ファイル。読み込んだ設定ファイルが違うことを文脈の有無で確認する
const DISABLED_CONFIG = 'global: { enabled: false }\n'

// 環境変数 ALIAS_INJECT_CONFIG が指す設定ファイル
const SHELL_CONFIG_PATH = '/shell/settings.yaml'

// 初めて出た単語の文脈を追加し、記録に入れる（正常系）
test('test_normal', async ($, on) => {
  // 準備
  const fs = makeFs()
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  // エイリアスでヒットさせる。alias_type を持たない行の YAML（doc-z）は読み込まない
  const first = await submit($, '用語エーと doc-z を説明して')
  // 大文字を含む単語 Term-A が正規化でヒットし、記録済みで追加されない
  const second = await submit($, 'term-a とは')

  // 検証
  expect(first.text).toBe('用語エーと doc-z を説明して')
  expect(first.context?.length).toBe(1)
  const context = first.context?.[0] ?? ''
  expect(context).toContain('# この発言に出る用語')
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).toContain('id: term-a')
  expect(context).toContain('description: 説明 Term-A')
  expect(context).not.toContain('term-b')
  expect(context).not.toContain('doc-z')
  expect(fs.reads).not.toContain(`${DOCS_DIR}/doc-z.yaml`)
  expect(second.context ?? []).toEqual([])
})

// 入力に先に出た単語から max_items 個の単語だけを追加し、上限から漏れた単語は記録しない（正常系）
test('test_normal_when_over_item_limit', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['max_items: 1'] })), settings: SETTINGS })

  // 実行
  const first = await submit($, 'term-a と term-b の違い')
  const second = await submit($, 'term-b について')

  // 検証
  expect(first.context?.[0]).toContain('Term-A')
  expect(first.context?.[0]).not.toContain('id: term-b')
  expect(second.context?.[0]).toContain('id: term-b')
})

// 追加すると max_chars を超える単語を飛ばし、後ろの収まる単語を追加する（正常系）
test('test_normal_when_over_char_limit', async ($, on) => {
  // 準備
  const fs = makeFs(makeConfig({ globalExtra: ['max_chars: 300'] }))
  fs.write(`${TERMS_DIR}/term-long.yaml`, termYaml({ id: 'term-long', name: 'Term-Long', description: 'あ'.repeat(500) }))
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const first = await submit($, 'term-a・term-long・term-b を比べて')
  // 上限を 4000 に戻すと、飛ばした単語が追加される
  fs.write(CONFIG_PATH, makeConfig({ globalExtra: ['max_chars: 4000'] }))
  const second = await submit($, 'term-long とは')

  // 検証
  const added = first.context?.[0] ?? ''
  expect(added).toContain('Term-A')
  expect(added).toContain('id: term-b')
  expect(added).not.toContain('Term-Long')
  expect([...added].length).toBeLessThanOrEqual(300)
  expect(second.context?.[0]).toContain('Term-Long')
})

// origins に対応づかない出所の入力はそのまま返却する（正常系）
test('test_normal_when_origin_excluded', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['origins: [plugin]'] })), settings: SETTINGS })

  // 実行
  const fromComposer = await submit($, 'term-a とは', { kind: 'composer' })
  // 同じセッションで出所が plugin の入力を送信すると、前の入力で記録されていないため追加される
  const fromPlugin = await submit($, 'term-a とは', { kind: 'plugin' })

  // 検証
  expect(fromComposer.text).toBe('term-a とは')
  expect(fromComposer.context ?? []).toEqual([])
  expect(fromPlugin.context?.[0]).toContain('Term-A')
})

// スラッシュコマンドの行は照合せずにそのまま返却する（正常系）
test('test_normal_when_slash_command', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })

  // 実行
  const command = await submit($, '/review term-a', { command: { name: 'review', args: 'term-a' } })
  // term-a が記録に入っていないため、続けて送信する入力で文脈が追加される
  const after = await submit($, 'term-a とは')

  // 検証
  expect(command.text).toBe('/review term-a')
  expect(command.context ?? []).toEqual([])
  expect(after.context?.[0]).toContain('Term-A')
})

// ALIAS_INJECT_CONFIG が無く、既定のパスにも設定ファイルが無いときはそのまま返却する（正常系）
test('test_normal_when_config_path_missing', async ($, on) => {
  // 準備
  const fs = new MemoryFs()
  const world = installWorld(on, { fs, settings: { env: {} } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  expect(fs.reads).toEqual([])
  expect(world.logs).toEqual([])
})

// 該当した projects の aliases の行を global に重ね、同じ単語を alias_type ごとの両方のセクションに追加する（正常系）
test('test_normal_when_project_matched', async ($, on) => {
  // 準備
  const config = makeConfig({
    projects: [
      '- match: sample',
      '  aliases:',
      ...indent(aliasLines({ id: 'commands', type: 'command', paths: 'docs/command.yaml', records: 'commands' }), 4),
      '- match: other',
      '  aliases:',
      ...indent(aliasLines({ id: 'others', type: 'command', paths: 'docs/other.yaml', records: 'commands' }), 4),
    ],
  })
  const fs = makeFs(config)
  fs.write('/repo/sample/docs/command.yaml', 'commands:\n  - id: term-a\n    command: make term-a\n')
  fs.write('/repo/sample/docs/other.yaml', 'commands:\n  - id: other-a\n    command: make other\n')
  installWorld(on, { fs, settings: SETTINGS, projectRoot: '/repo/sample' })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('## コマンド')
  expect(context).toContain('- Term-A（id: term-a）')
  expect(context).toContain('- term-a（id: term-a）')
  expect(context).toContain('command: `make term-a`')
  expect(fs.reads).not.toContain('/repo/sample/docs/other.yaml')
})

// 更新時刻が変わった設定ファイルと YAML だけを再読み込みし、増えたファイルも読み込む（正常系）
test('test_normal_when_files_changed', async ($, on) => {
  // 準備
  const fs = makeFs()
  installWorld(on, { fs, settings: SETTINGS })
  const first = await submit($, 'term-b とは')

  // 実行
  // term-a の説明を書き換え、同じフォルダに term-c を追加する
  fs.write(`${TERMS_DIR}/term-a.yaml`, termYaml({ id: 'term-a', name: 'Term-A', description: '書き換え後の説明' }))
  fs.write(`${TERMS_DIR}/term-c.yaml`, termYaml({ id: 'term-c', name: 'Term-C' }))
  fs.reads.length = 0
  const second = await submit($, 'term-a と term-c')

  // 検証
  expect(first.context?.[0]).toContain('id: term-b')
  const context = second.context?.[0] ?? ''
  expect(context).toContain('description: 書き換え後の説明')
  expect(context).toContain('Term-C')
  expect(fs.reads).toEqual([`${TERMS_DIR}/term-a.yaml`, `${TERMS_DIR}/term-c.yaml`])
})

// 別のリポジトリが同じ aliases の id と項目の ID を使用しても、両方を追加して記録する（正常系）
test('test_normal_when_same_id_across_repositories', async ($, on) => {
  // 準備
  const otherDevDocsPath = '/repo/other/project-index.yaml'
  const config = makeConfig({ repositories: [`- config: ${DEV_DOCS_PATH}`, `- config: ${otherDevDocsPath}`] })
  const fs = makeFs(config)
  fs.write(otherDevDocsPath, makeDevDocs())
  fs.write('/repo/other/terms/term-a.yaml', termYaml({ id: 'term-a', name: 'Term-A', description: '別のリポジトリの説明' }))
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const first = await submit($, 'term-a とは')
  const second = await submit($, 'term-a とは')

  // 検証
  const context = first.context?.[0] ?? ''
  expect(context).toContain('description: 説明 Term-A')
  expect(context).toContain('description: 別のリポジトリの説明')
  expect(context.split('- Term-A（id: term-a）').length - 1).toBe(2)
  expect(second.context ?? []).toEqual([])
})

// enabled: false の repositories の要素と documents の行を読み込まずに照合する（正常系）
test('test_normal_when_disabled', async ($, on) => {
  // 準備
  const otherDevDocsPath = '/repo/other/project-index.yaml'
  const config = makeConfig({ repositories: [`- config: ${DEV_DOCS_PATH}`, `- config: ${otherDevDocsPath}`, '  enabled: false'] })
  const fs = makeFs(config, makeDevDocs({ documentsExtra: termAliasLines({ id: 'drafts', paths: 'drafts/*.yaml', enabled: false }) }))
  fs.write(`${KNOWLEDGE_DIR}/drafts/term-x.yaml`, termYaml({ id: 'term-x', name: 'Term-X' }))
  fs.write(otherDevDocsPath, makeDevDocs())
  fs.write('/repo/other/terms/term-y.yaml', termYaml({ id: 'term-y', name: 'Term-Y' }))
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・term-x・term-y')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('Term-X')
  expect(context).not.toContain('Term-Y')
  expect(fs.reads).not.toContain(otherDevDocsPath)
  expect(fs.reads).not.toContain('/repo/other/terms/term-y.yaml')
  expect(fs.reads).not.toContain(`${KNOWLEDGE_DIR}/drafts/term-x.yaml`)
})

// 更新時刻が変わった project-index.yaml を再読み込みし、追加した documents の行で照合する（正常系）
test('test_normal_when_repository_config_changed', async ($, on) => {
  // 準備
  const fs = makeFs()
  fs.write(`${KNOWLEDGE_DIR}/commands/cmd-a.yaml`, 'id: cmd-a\nname: cmd-a\ncommand: make cmd-a\n')
  installWorld(on, { fs, settings: SETTINGS })
  const first = await submit($, 'term-a とは')

  // 実行
  // project-index.yaml の documents にコマンドの行を追加する
  fs.write(DEV_DOCS_PATH, makeDevDocs({ documentsExtra: aliasLines({ id: 'commands', type: 'command', paths: 'commands/*.yaml' }) }))
  fs.reads.length = 0
  const second = await submit($, 'term-a と cmd-a')

  // 検証
  expect(first.context?.[0]).toContain('Term-A')
  const context = second.context?.[0] ?? ''
  expect(context).toContain('## コマンド')
  expect(context).toContain('cmd-a')
  expect(context).toContain('command: `make cmd-a`')
  expect(context).not.toContain('Term-A')
  expect(fs.reads).toEqual([DEV_DOCS_PATH, `${KNOWLEDGE_DIR}/commands/cmd-a.yaml`])
})

// skill・tool・path・env・avoid の行の単語を、種類ごとのセクションとキーで追加する（正常系）
test('test_normal_when_added_types', async ($, on) => {
  // 準備
  const config = makeConfig({
    aliases: [
      ...aliasLines({ id: 'skills', type: 'skill', paths: 'skills/*.yaml' }),
      ...aliasLines({ id: 'tools', type: 'tool', paths: 'tools/*.yaml' }),
      ...aliasLines({ id: 'paths', type: 'path', paths: 'paths/*.yaml' }),
      ...aliasLines({ id: 'envs', type: 'env', paths: 'envs/*.yaml' }),
      ...aliasLines({ id: 'avoids', type: 'avoid', paths: 'avoids/*.yaml' }),
    ],
  })
  const fs = makeFs(config)
  fs.write(`${CONFIG_DIR}/skills/skill-a.yaml`, 'id: skill-a\nname: skill-a\nskill: code-review\n')
  fs.write(`${CONFIG_DIR}/tools/tool-a.yaml`, 'id: tool-a\nname: tool-a\ntool: search_design_docs\n')
  fs.write(`${CONFIG_DIR}/paths/path-a.yaml`, 'id: path-a\nname: path-a\npath: ~/.config/ai-monitor/settings.yaml\n')
  fs.write(`${CONFIG_DIR}/envs/env-a.yaml`, 'id: env-a\nname: env-a\nurl: http://127.0.0.1:8000\nport: 8000\ndescription: 開発サーバー\n')
  fs.write(`${CONFIG_DIR}/envs/env-b.yaml`, 'id: env-b\nname: env-b\nport: 5432\n')
  fs.write(`${CONFIG_DIR}/avoids/avoid-a.yaml`, 'id: avoid-a\nname: avoid-a\nreplacement: term-a\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・skill-a・tool-a・path-a・env-a・env-b・avoid-a')

  // 検証
  const context = result.context?.[0] ?? ''
  const headings = ['## 用語', '## スキル', '## ツール', '## パス', '## 環境', '## 使用しない単語']
  const positions = headings.map((heading) => context.indexOf(heading))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  expect(context).toContain('- skill-a（id: skill-a）\n  - skill: `code-review`')
  expect(context).toContain('- tool-a（id: tool-a）\n  - tool: `search_design_docs`')
  expect(context).toContain('- path-a（id: path-a）\n  - path: `~/.config/ai-monitor/settings.yaml`')
  expect(context).toContain('- env-a（id: env-a）\n  - url: http://127.0.0.1:8000\n  - port: 8000\n  - description: 開発サーバー')
  expect(context).toContain('- env-b（id: env-b）\n  - port: 5432\n\n## 使用しない単語')
  expect(context).toContain('- avoid-a（id: avoid-a）\n  - replacement: term-a')
  expect(world.logs).toEqual([])
})

// 設定ファイルを読み込めないときは何も追加せずに返却する（異常系）
test('test_error_when_config_unreadable', async ($, on) => {
  // 準備
  // ALIAS_INJECT_CONFIG が指す設定ファイルが無い（fs.stat と fs.read が例外になる）。既定のパスには term-a を照合できる設定ファイルがある
  const missingPath = '/missing/settings.yaml'
  const world = installWorld(on, { fs: makeFs(), settings: userSettingsWithConfig(missingPath) })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  // 設定ファイルのパスと、読み込めなかった理由（ファイルが無い例外のメッセージ）を含む行が debug log に届く
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(missingPath))
  expect(logged.length).toBeGreaterThan(0)
  expect(logged.some((line) => line.text.includes('ENOENT: no such file or directory'))).toBe(true)
})

// 読み込めない project-index.yaml のリポジトリだけを除外し、他のリポジトリの文脈は追加する（異常系）
test('test_error_when_repository_unreadable', async ($, on) => {
  // 準備
  // /repo/missing/project-index.yaml が無い（fs.stat と fs.read が例外になる）
  const missingPath = '/repo/missing/project-index.yaml'
  const config = makeConfig({ repositories: [`- config: ${missingPath}`, `- config: ${DEV_DOCS_PATH}`] })
  const world = installWorld(on, { fs: makeFs(config), settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  // project-index.yaml のパスと、読み込めなかった理由（ファイルが無い例外のメッセージ）を含む行が debug log に届く
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(missingPath))
  expect(logged.length).toBeGreaterThan(0)
  expect(logged.some((line) => line.text.includes('ENOENT: no such file or directory'))).toBe(true)
})

// スキーマに合わない行・id の重なった後の行だけを除外し、他の行の文脈は追加する（異常系）
test('test_error_when_alias_invalid', async ($, on) => {
  // 準備
  // metadata.name を空の文字列で記載した id: bad の行、alias_type が glossary の id: unknown の行、id: terms が重なる後の行
  const devDocs = makeDevDocs({
    documentsExtra: [
      ...aliasLines({ id: 'bad', type: 'term', paths: 'bad/*.yaml', metadata: ["name: ''"] }),
      ...aliasLines({ id: 'unknown', type: 'glossary', paths: 'unknown/*.yaml' }),
      ...termAliasLines({ id: 'terms', paths: 'dup/*.yaml' }),
    ],
  })
  const fs = makeFs(makeConfig(), devDocs)
  fs.write(`${KNOWLEDGE_DIR}/bad/term-x.yaml`, termYaml({ id: 'term-x', name: 'Term-X' }))
  fs.write(`${KNOWLEDGE_DIR}/unknown/term-v.yaml`, termYaml({ id: 'term-v', name: 'Term-V' }))
  fs.write(`${KNOWLEDGE_DIR}/dup/term-z.yaml`, termYaml({ id: 'term-z', name: 'Term-Z' }))
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・term-x・term-v・term-z')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('Term-X')
  expect(context).not.toContain('Term-V')
  expect(context).not.toContain('Term-Z')
  // project-index.yaml のパス・行の id・理由（bad は metadata.name、unknown は alias_type）を含む行と、id の重なりの行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(DEV_DOCS_PATH))
  expect(debugLines.some((line) => line.text.includes('id: bad') && line.text.includes('metadata.name'))).toBe(true)
  expect(debugLines.some((line) => line.text.includes('id: unknown') && line.text.includes('alias_type'))).toBe(true)
  expect(debugLines.some((line) => line.text.includes('terms') && line.text.includes('重なり'))).toBe(true)
})

// 書式の誤った YAML の文書だけを除外し、他の行の文脈は追加する（異常系）
test('test_error_when_yaml_malformed', async ($, on) => {
  // 準備
  const config = makeConfig({ aliases: aliasLines({ id: 'urls', type: 'url', paths: 'urls/*.yaml', metadata: ['name: title'] }) })
  const fs = makeFs(config)
  const brokenPath = `${CONFIG_DIR}/urls/site.yaml`
  fs.write(brokenPath, 'id: [url-a\ntitle: Site\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).not.toContain('## URL')
  // YAML のパスと、パースに失敗した理由（行と列を含む）の行が debug log に届く
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(brokenPath))
  expect(logged.length).toBeGreaterThan(0)
  expect(logged.some((line) => line.text.includes('照合から外しました') && /\d+:\d+/.test(line.text))).toBe(true)
})

// 解決した url も port も空の env の文書を除外し、同じ行の他の文書の文脈は追加する（異常系）
test('test_error_when_env_without_endpoint', async ($, on) => {
  // 準備
  const config = makeConfig({ aliases: aliasLines({ id: 'envs', type: 'env', paths: 'envs/*.yaml' }) })
  const fs = makeFs(config)
  const withoutEndpointPath = `${CONFIG_DIR}/envs/env-x.yaml`
  fs.write(withoutEndpointPath, 'id: env-x\nname: env-x\ndescription: 開発サーバー\n')
  fs.write(`${CONFIG_DIR}/envs/env-a.yaml`, 'id: env-a\nname: env-a\nurl: http://127.0.0.1:8000\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・env-a・env-x')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).toContain('## 環境')
  expect(context).toContain('- env-a（id: env-a）')
  expect(context).not.toContain('env-x')
  // env-x の YAML のパス・文書の id・空のキーを含む行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(withoutEndpointPath))
  expect(debugLines.some((line) => line.text.includes('env-x') && line.text.includes('url') && line.text.includes('port'))).toBe(true)
})

// 設定ファイルの旧構造の要素と project-index.yaml の metadata.alias_type を持つ行を除外し、project-index.yaml のトップレベルの aliases は読み込まない（異常系）
test('test_error_when_legacy_aliases', async ($, on) => {
  // 準備
  // metadata を持たない旧構造の要素と、行の alias_type を持たず metadata.alias_type を持つ要素
  const legacyUrlRow = ['- id: urls', '  type: url', '  paths: [urls/*.yaml]', '  fields:', '    id: id', '    match: [name]', '    url: url']
  const metadataAliasTypeRow = ['- id: old-terms', '  paths: [old/*.yaml]', '  metadata:', '    alias_type:', '      type: custom', '      value: term']
  const oldDocsRow = ['- id: old-docs', '  paths: [old-docs/*.yaml]', '  metadata:', '    alias_type:', '      type: custom', '      value: term']
  const legacyTermRow = ['- id: legacy', '  type: term', '  paths: [legacy/*.yaml]']
  const fs = makeFs(
    makeConfig({ aliases: [...legacyUrlRow, ...metadataAliasTypeRow] }),
    makeDevDocs({ documentsExtra: oldDocsRow, rootExtra: ['aliases:', ...indent(legacyTermRow, 2)] }),
  )
  fs.write(`${CONFIG_DIR}/urls/link-a.yaml`, 'id: link-a\nname: link-a\nurl: https://example.com\n')
  fs.write(`${CONFIG_DIR}/old/term-w.yaml`, termYaml({ id: 'term-w', name: 'Term-W' }))
  fs.write(`${KNOWLEDGE_DIR}/old-docs/term-v.yaml`, termYaml({ id: 'term-v', name: 'Term-V' }))
  fs.write(`${KNOWLEDGE_DIR}/legacy/term-y.yaml`, termYaml({ id: 'term-y', name: 'Term-Y' }))
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・link-a・term-y・term-w・term-v')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('link-a')
  expect(context).not.toContain('Term-Y')
  expect(context).not.toContain('Term-W')
  expect(context).not.toContain('Term-V')
  // 設定ファイルのパス・行の id・理由を含む行と、project-index.yaml のパス・old-docs・metadata.alias_type を含む行が debug log に届く
  const configLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH))
  expect(configLines.some((line) => line.text.includes('urls'))).toBe(true)
  expect(configLines.some((line) => line.text.includes('old-terms'))).toBe(true)
  const devDocsLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(DEV_DOCS_PATH))
  expect(devDocsLines.some((line) => line.text.includes('old-docs') && line.text.includes('metadata.alias_type'))).toBe(true)
  expect(fs.reads).not.toContain(`${CONFIG_DIR}/urls/link-a.yaml`)
  expect(fs.reads).not.toContain(`${CONFIG_DIR}/old/term-w.yaml`)
  expect(fs.reads).not.toContain(`${KNOWLEDGE_DIR}/old-docs/term-v.yaml`)
  expect(fs.reads).not.toContain(`${KNOWLEDGE_DIR}/legacy/term-y.yaml`)
})

// 必須のキーの値が空の文書だけを除外し、同じ行の他の文書の文脈は追加する（異常系）
test('test_error_when_required_value_missing', async ($, on) => {
  // 準備
  // description を持たない term-n
  const fs = makeFs()
  const missingPath = `${TERMS_DIR}/term-n.yaml`
  fs.write(missingPath, 'id: term-n\nname: term-n\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a と term-n')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('term-n')
  // term-n の YAML のパス・文書の id・空のキーを含む行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(missingPath))
  expect(debugLines.some((line) => line.text.includes('term-n') && line.text.includes('description'))).toBe(true)
})

// body_file の列のファイル名を単語にした records の行の文書を、alias_type の文書として追加する（正常系）
test('test_normal_when_records_body_file', async ($, on) => {
  // 準備
  // id・name を持たない管理用の YAML の要素を、metadata.id の path の列で id にする
  const config = makeConfig({
    aliases: aliasLines({
      id: 'guides',
      type: 'doc',
      paths: 'files.yaml',
      records: 'files',
      bodyFile: 'path',
      metadata: ['id: path', 'description: meta.summary'],
    }),
  })
  const fs = makeFs(config)
  fs.write(`${CONFIG_DIR}/files.yaml`, 'files:\n  - path: docs/使い方/セットアップ.md\n    meta:\n      summary: 前提と手順\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'セットアップとは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 文書')
  expect(context).toContain('- セットアップ（id: docs/使い方/セットアップ.md）')
  expect(context).toContain('description: 前提と手順')
  expect(world.logs).toEqual([])
})

// 名前が該当した文書のうち、照合条件に該当しない文書を除外する（正常系）
test('test_normal_when_inject_condition', async ($, on) => {
  // 準備
  const fs = makeFs()
  fs.write(`${TERMS_DIR}/term-c.yaml`, TERM_C_WITH_CONDITION)
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  // contains に該当し、not_contains で除外される
  const first = await submit($, 'term-a と term-c を React と Python で')
  // 大文字の TSX が正規化で tsx にヒットする
  const second = await submit($, 'term-c を TSX で')

  // 検証
  const firstContext = first.context?.[0] ?? ''
  expect(firstContext).toContain('Term-A')
  expect(firstContext).not.toContain('term-c')
  expect(second.context?.[0] ?? '').toContain('id: term-c')
  expect(world.logs).toEqual([])
})

// 用語の avoid のやめた言い方を使用しない単語のセクションに追加し、exclude の単語と照合条件に該当しない用語のやめた言い方は追加しない（正常系）
test('test_normal_when_term_avoid', async ($, on) => {
  // 準備
  const fs = makeFs(makeConfig({ globalExtra: ['exclude: [旧ビー]'] }))
  fs.write(`${TERMS_DIR}/term-a.yaml`, `${termYaml({ id: 'term-a', name: 'Term-A', aliases: ['用語エー'] })}avoid: [旧エー, OldA]\n`)
  fs.write(`${TERMS_DIR}/term-b.yaml`, `${termYaml({ id: 'term-b' })}avoid: 旧ビー\n`)
  fs.write(`${TERMS_DIR}/term-c.yaml`, `${TERM_C_WITH_CONDITION}avoid: 旧シー\n`)
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  // oldA は正規化で OldA にヒットする。旧シー の term-c は React・tsx を含まないため照合条件に該当しない
  const first = await submit($, '旧エーと oldA と旧ビーと旧シーと term-b')
  const second = await submit($, '旧エーとは')

  // 検証
  const context = first.context?.[0] ?? ''
  const [terms = '', avoids = ''] = context.split('## 使用しない単語')
  expect(terms).toContain('## 用語')
  expect(terms).toContain('term-b（id: term-b）')
  expect(terms).not.toContain('Term-A')
  expect(avoids).toContain('- 旧エー（id: term-a）\n  - replacement: Term-A\n- OldA（id: term-a）\n  - replacement: Term-A')
  expect(context).not.toContain('旧ビー')
  expect(context).not.toContain('旧シー')
  expect(second.context ?? []).toEqual([])
  expect(world.logs).toEqual([])
})

// 照合条件の誤った文書だけを除外し、同じ行の他の文書の文脈は追加する（異常系）
test('test_error_when_inject_condition_invalid', async ($, on) => {
  // 準備
  const fs = makeFs()
  const emptyBundlePath = `${TERMS_DIR}/term-e.yaml`
  const unknownOpPath = `${TERMS_DIR}/term-f.yaml`
  fs.write(emptyBundlePath, `${termYaml({ id: 'term-e', name: 'term-e' })}inject_when:\n  and: []\n`)
  fs.write(unknownOpPath, `${termYaml({ id: 'term-f', name: 'term-f' })}inject_when:\n  field: text\n  op: regex\n  values: [f]\n`)
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a と term-e と term-f')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('term-e')
  expect(context).not.toContain('term-f')
  // YAML のパス・文書の id・誤りの箇所を含む行が debug log に届く
  const debugOf = (path: string) => world.logs.filter((line) => line.to === 'debug' && line.text.includes(path))
  expect(debugOf(emptyBundlePath).some((line) => line.text.includes('term-e') && line.text.includes('inject_when'))).toBe(true)
  expect(debugOf(unknownOpPath).some((line) => line.text.includes('term-f') && line.text.includes('op'))).toBe(true)
})

// 作業場所が scope.cwd の glob に該当しない行を、YAML を読み込まずに照合から除外する（正常系）
test('test_normal_when_cwd_scoped', async ($, on) => {
  // 準備
  // worktree のセッションは worktree のパスで判定する
  const fs = makeCwdScopedFs()
  const world = installWorld(on, { fs, settings: SETTINGS, projectRoot: SCOPED_PROJECT_ROOT })

  // 実行
  const result = await submit($, 'term-a と link-a と link-b と link-c')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).toContain('link-a')
  expect(context).not.toContain('link-b')
  // /** を付けない /repo/sample は、配下の worktree に該当しない
  expect(context).not.toContain('link-c')
  expect(fs.reads).not.toContain(SCOPED_LINKS.other)
  expect(fs.reads).not.toContain(SCOPED_LINKS.root)
  expect(world.logs).toEqual([])
})

// scope.cwd が 1 つ以上の文字列の並びでない行を、スキーマに合わない行として照合から除外する（異常系）
test('test_error_when_cwd_scope_invalid', async ($, on) => {
  // 準備
  const emptyPath = `${CONFIG_DIR}/links/empty.yaml`
  const stringPath = `${CONFIG_DIR}/links/string.yaml`
  const config = makeConfig({
    aliases: [
      ...aliasLines({ id: 'empty-scope', type: 'url', paths: emptyPath, records: 'links' }),
      '  scope:',
      '    cwd: []',
      ...aliasLines({ id: 'string-scope', type: 'url', paths: stringPath, records: 'links' }),
      '  scope:',
      '    cwd: /repo/sample/**',
    ],
  })
  const fs = makeFs(config)
  fs.write(emptyPath, linksYaml('link-e'))
  fs.write(stringPath, linksYaml('link-f'))
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a と link-e と link-f')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('link-e')
  expect(context).not.toContain('link-f')
  // 設定ファイルのパス・行の id・scope.cwd を含む行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH))
  expect(debugLines.some((line) => line.text.includes('empty-scope') && line.text.includes('scope.cwd'))).toBe(true)
  expect(debugLines.some((line) => line.text.includes('string-scope') && line.text.includes('scope.cwd'))).toBe(true)
})

// ALIAS_INJECT_CONFIG が無いとき、XDG_CONFIG_HOME の下の設定ファイルを読み込む（正常系）
test('test_normal_when_default_config_path', async ($, on) => {
  // 準備
  const fs = makeFs(DISABLED_CONFIG)
  fs.write('/xdg/alias-inject/settings.yaml', makeConfig())
  installWorld(on, { fs, settings: { env: {} }, env: { XDG_CONFIG_HOME: '/xdg' } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context?.[0]).toContain('Term-A')
  expect(result.context?.[0]).toContain('term-a')
  expect(result.context?.[0]).toContain('説明 Term-A')
})

// XDG_CONFIG_HOME が空のときは ~/.config の下の設定ファイルを読み込む（正常系）
test('test_normal_when_xdg_config_home_empty', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: { env: {} }, env: { XDG_CONFIG_HOME: '' } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.context?.[0]).toContain('Term-A')
  expect(result.context?.[0]).toContain('term-a')
  expect(result.context?.[0]).toContain('説明 Term-A')
})

// settings に値が無いとき、環境変数 ALIAS_INJECT_CONFIG が指す設定ファイルを読み込む（正常系）
test('test_normal_when_config_from_shell_env', async ($, on) => {
  // 準備
  const fs = makeFs(DISABLED_CONFIG)
  fs.write(SHELL_CONFIG_PATH, makeConfig())
  installWorld(on, { fs, settings: { env: {} }, env: { ALIAS_INJECT_CONFIG: SHELL_CONFIG_PATH } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.context?.[0]).toContain('Term-A')
  expect(result.context?.[0]).toContain('term-a')
  expect(result.context?.[0]).toContain('説明 Term-A')
})

// settings と環境変数の両方に値があるときは settings の値を使用する（正常系）
test('test_normal_when_settings_env_preferred', async ($, on) => {
  // 準備
  const fs = makeFs()
  fs.write(SHELL_CONFIG_PATH, DISABLED_CONFIG)
  installWorld(on, { fs, settings: SETTINGS, env: { ALIAS_INJECT_CONFIG: SHELL_CONFIG_PATH } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.context?.[0]).toContain('Term-A')
  expect(result.context?.[0]).toContain('term-a')
  expect(result.context?.[0]).toContain('説明 Term-A')
  expect(fs.reads).not.toContain(SHELL_CONFIG_PATH)
})
