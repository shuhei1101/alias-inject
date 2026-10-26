import { expect, test } from 'claude-code/testing'
import { installWorld, submit } from '../../unit/hooks/support/engine'
import { MemoryFs } from '../../unit/hooks/support/memory-fs'
import {
  CONFIG_DIR,
  CONFIG_PATH,
  DEV_DOCS_PATH,
  KNOWLEDGE_DIR,
  SETTINGS,
  TERMS_DIR,
  aliasLines,
  indent,
  makeConfig,
  makeDevDocs,
  makeFs,
  termAliasLines,
  termYaml,
} from './support/fixtures'

// 初めて出た語の文脈を追加し、記録に入れる（正常系）
test('test_normal', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })

  // 実行
  // エイリアスで当てる
  const first = await submit($, '用語エーを説明して')
  // 大文字を含む語 Term-A が正規化で当たり、記録済みで追加されない
  const second = await submit($, 'term-a とは')

  // 検証
  expect(first.text).toBe('用語エーを説明して')
  expect(first.context?.length).toBe(1)
  const context = first.context?.[0] ?? ''
  expect(context).toContain('# この発言に出る用語')
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).toContain('id: term-a')
  expect(context).toContain('description: 説明 Term-A')
  expect(context).not.toContain('Term-B')
  expect(second.context ?? []).toEqual([])
})

// 入力に先に出た語から max_items 語だけを追加し、外れた語は記録しない（正常系）
test('test_normal_when_over_item_limit', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['max_items: 1'] })), settings: SETTINGS })

  // 実行
  const first = await submit($, 'term-a と term-b の違い')
  const second = await submit($, 'term-b について')

  // 検証
  expect(first.context?.[0]).toContain('Term-A')
  expect(first.context?.[0]).not.toContain('Term-B')
  expect(second.context?.[0]).toContain('Term-B')
})

// 足すと max_chars を超える語を飛ばし、後ろの収まる語を追加する（正常系）
test('test_normal_when_over_char_limit', async ($, on) => {
  // 準備
  const fs = makeFs(makeConfig({ globalExtra: ['max_chars: 300'] }))
  fs.write(`${TERMS_DIR}/term-long.yaml`, termYaml({ id: 'term-long', name: 'Term-Long', description: 'あ'.repeat(500) }))
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const first = await submit($, 'term-a・term-long・term-b を比べて')
  // 上限を 4000 に戻すと、飛ばした語が追加される
  fs.write(CONFIG_PATH, makeConfig({ globalExtra: ['max_chars: 4000'] }))
  const second = await submit($, 'term-long とは')

  // 検証
  const added = first.context?.[0] ?? ''
  expect(added).toContain('Term-A')
  expect(added).toContain('Term-B')
  expect(added).not.toContain('Term-Long')
  expect([...added].length).toBeLessThanOrEqual(300)
  expect(second.context?.[0]).toContain('Term-Long')
})

// origins に対応づかない出所の入力はそのまま渡す（正常系）
test('test_normal_when_origin_excluded', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['origins: [plugin]'] })), settings: SETTINGS })

  // 実行
  const fromComposer = await submit($, 'term-a とは', { kind: 'composer' })
  // 同じセッションで出所が plugin の入力を送ると、前の入力で記録されていないため追加される
  const fromPlugin = await submit($, 'term-a とは', { kind: 'plugin' })

  // 検証
  expect(fromComposer.text).toBe('term-a とは')
  expect(fromComposer.context ?? []).toEqual([])
  expect(fromPlugin.context?.[0]).toContain('Term-A')
})

// スラッシュコマンドの行は照合せずにそのまま渡す（正常系）
test('test_normal_when_slash_command', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })

  // 実行
  const command = await submit($, '/review term-a', { command: { name: 'review', args: 'term-a' } })
  // term-a が記録に入っていないため、続けて送る入力で文脈が追加される
  const after = await submit($, 'term-a とは')

  // 検証
  expect(command.text).toBe('/review term-a')
  expect(command.context ?? []).toEqual([])
  expect(after.context?.[0]).toContain('Term-A')
})

// ALIAS_INJECT_CONFIG が無いときはそのまま渡す（正常系）
test('test_normal_when_config_path_missing', async ($, on) => {
  // 準備
  const fs = makeFs()
  const world = installWorld(on, { fs, settings: { env: {} } })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  expect(fs.reads).toEqual([])
  expect(world.logs).toEqual([])
})

// 当たった projects の aliases を global に重ね、同じ語を type ごとの両方のセクションに追加する（正常系）
test('test_normal_when_project_matched', async ($, on) => {
  // 準備
  const config = makeConfig({
    projects: [
      '- match: sample',
      '  aliases:',
      ...indent(aliasLines({ id: 'commands', type: 'command', paths: 'docs/command/*.yaml' }), 4),
      '- match: other',
      '  aliases:',
      ...indent(aliasLines({ id: 'others', type: 'command', paths: 'docs/other/*.yaml' }), 4),
    ],
  })
  const fs = makeFs(config)
  fs.write('/repo/sample/docs/command/term-a.yaml', 'id: cmd-term-a\nname: term-a\ncommand: make term-a\n')
  fs.write('/repo/sample/docs/other/term-a.yaml', 'id: other-term-a\nname: term-a\ncommand: make other\n')
  installWorld(on, { fs, settings: SETTINGS, projectRoot: '/repo/sample' })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('## コマンド')
  expect(context).toContain('- Term-A（id: term-a）')
  expect(context).toContain('- term-a（id: cmd-term-a）')
  expect(context).toContain('command: `make term-a`')
  expect(fs.reads).not.toContain('/repo/sample/docs/other/term-a.yaml')
})

// 更新時刻が変わった設定ファイルと YAML だけを読み直し、増えたファイルも読む（正常系）
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
  expect(first.context?.[0]).toContain('Term-B')
  const context = second.context?.[0] ?? ''
  expect(context).toContain('description: 書き換え後の説明')
  expect(context).toContain('Term-C')
  expect(fs.reads).toEqual([`${TERMS_DIR}/term-a.yaml`, `${TERMS_DIR}/term-c.yaml`])
})

// 別のリポジトリが同じ aliases の id と項目の ID を使っても、両方を追加して記録する（正常系）
test('test_normal_when_same_id_across_repositories', async ($, on) => {
  // 準備
  const otherDevDocsPath = '/repo/other/dev-docs.yaml'
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

// enabled: false の repositories の要素と aliases の要素を読まずに照合する（正常系）
test('test_normal_when_disabled', async ($, on) => {
  // 準備
  const otherDevDocsPath = '/repo/other/dev-docs.yaml'
  const config = makeConfig({ repositories: [`- config: ${DEV_DOCS_PATH}`, `- config: ${otherDevDocsPath}`, '  enabled: false'] })
  const fs = makeFs(config, makeDevDocs({ aliasesExtra: termAliasLines({ id: 'drafts', paths: 'drafts/*.yaml', enabled: false }) }))
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

// 更新時刻が変わった dev-docs.yaml を読み直し、追加した aliases の要素で照合する（正常系）
test('test_normal_when_repository_config_changed', async ($, on) => {
  // 準備
  const fs = makeFs()
  fs.write(`${KNOWLEDGE_DIR}/commands/cmd-a.yaml`, 'id: cmd-a\nname: cmd-a\ncommand: make cmd-a\n')
  installWorld(on, { fs, settings: SETTINGS })
  const first = await submit($, 'term-a とは')

  // 実行
  // dev-docs.yaml の aliases にコマンドの要素を追加する
  fs.write(DEV_DOCS_PATH, makeDevDocs({ aliasesExtra: aliasLines({ id: 'commands', type: 'command', paths: 'commands/*.yaml' }) }))
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

// skill・tool・path・env・avoid の要素の語を、種類ごとのセクションと列で追加する（正常系）
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
  const headings = ['## 用語', '## スキル', '## ツール', '## パス', '## 環境', '## 避ける語']
  const positions = headings.map((heading) => context.indexOf(heading))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  expect(context).toContain('- skill-a（id: skill-a）\n  - skill: `code-review`')
  expect(context).toContain('- tool-a（id: tool-a）\n  - tool: `search_design_docs`')
  expect(context).toContain('- path-a（id: path-a）\n  - path: `~/.config/ai-monitor/settings.yaml`')
  expect(context).toContain('- env-a（id: env-a）\n  - url: http://127.0.0.1:8000\n  - port: 8000\n  - description: 開発サーバー')
  expect(context).toContain('- env-b（id: env-b）\n  - port: 5432\n\n## 避ける語')
  expect(context).toContain('- avoid-a（id: avoid-a）\n  - replacement: term-a')
  expect(world.logs).toEqual([])
})

// 設定ファイルが読めないときは何も追加せずに渡す（異常系）
test('test_error_when_config_unreadable', async ($, on) => {
  // 準備
  // 設定ファイルが無い（fs.stat と fs.read が例外になる）
  const world = installWorld(on, { fs: new MemoryFs(), settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  // 設定ファイルのパスと、読めなかった理由（ファイルが無い例外のメッセージ）を含む行が debug log に届く
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH))
  expect(logged.length).toBeGreaterThan(0)
  expect(logged.some((line) => line.text.includes('ENOENT: no such file or directory'))).toBe(true)
})

// 読めない dev-docs.yaml のリポジトリだけを外し、他のリポジトリの文脈は追加する（異常系）
test('test_error_when_repository_unreadable', async ($, on) => {
  // 準備
  // /repo/missing/dev-docs.yaml が無い（fs.stat と fs.read が例外になる）
  const missingPath = '/repo/missing/dev-docs.yaml'
  const config = makeConfig({ repositories: [`- config: ${missingPath}`, `- config: ${DEV_DOCS_PATH}`] })
  const world = installWorld(on, { fs: makeFs(config), settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  // dev-docs.yaml のパスと、読めなかった理由（ファイルが無い例外のメッセージ）を含む行が debug log に届く
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(missingPath))
  expect(logged.length).toBeGreaterThan(0)
  expect(logged.some((line) => line.text.includes('ENOENT: no such file or directory'))).toBe(true)
})

// スキーマに合わない要素と id の重なった後の要素だけを外し、他の要素の文脈は追加する（異常系）
test('test_error_when_alias_invalid', async ($, on) => {
  // 準備
  // fields にスキーマに無いキー mcp を持つ id: bad の要素と、id: terms が重なる後の要素
  const devDocs = makeDevDocs({
    aliasesExtra: [
      ...aliasLines({ id: 'bad', type: 'term', paths: 'bad/*.yaml', fields: ['mcp: rule-inject'] }),
      ...termAliasLines({ id: 'terms', paths: 'dup/*.yaml' }),
    ],
  })
  const fs = makeFs(makeConfig(), devDocs)
  fs.write(`${KNOWLEDGE_DIR}/bad/term-x.yaml`, termYaml({ id: 'term-x', name: 'Term-X' }))
  fs.write(`${KNOWLEDGE_DIR}/dup/term-z.yaml`, termYaml({ id: 'term-z', name: 'Term-Z' }))
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a・term-x・term-z')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('Term-A')
  expect(context).not.toContain('Term-X')
  expect(context).not.toContain('Term-Z')
  // dev-docs.yaml のパス・要素の id・理由を含む行と、id の重なりの行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(DEV_DOCS_PATH))
  expect(debugLines.some((line) => line.text.includes('bad') && line.text.includes('mcp'))).toBe(true)
  expect(debugLines.some((line) => line.text.includes('terms') && line.text.includes('重なり'))).toBe(true)
})

// 書式の誤った YAML の項目だけを外し、他の aliases の要素の文脈は追加する（異常系）
test('test_error_when_yaml_malformed', async ($, on) => {
  // 準備
  const config = makeConfig({ aliases: aliasLines({ id: 'urls', type: 'url', paths: 'urls/*.yaml' }) })
  const fs = makeFs(config)
  const brokenPath = `${CONFIG_DIR}/urls/term-a.yaml`
  fs.write(brokenPath, 'id: [url-a\nname: term-a\n')
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
  expect(logged.some((line) => line.text.includes('YAML を読めません') && /\d+:\d+/.test(line.text))).toBe(true)
})

// fields に url も port も無い env の要素をスキーマに合わない要素として外し、他の要素の文脈は追加する（異常系）
test('test_error_when_env_without_endpoint', async ($, on) => {
  // 準備
  // fields に url も port も無い id: envs の要素
  const config = makeConfig({
    aliases: aliasLines({ id: 'envs', type: 'env', paths: 'envs/*.yaml', columns: ['match: [name]', 'description: description'] }),
  })
  const fs = makeFs(config)
  fs.write(`${CONFIG_DIR}/envs/env-x.yaml`, 'id: env-x\nname: env-x\nurl: http://127.0.0.1:8000\nport: 8000\ndescription: 開発サーバー\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a と env-x')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).not.toContain('## 環境')
  expect(context).not.toContain('env-x')
  // 設定ファイルのパス・要素の id・理由を含む行が debug log に届く
  const debugLines = world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH))
  expect(debugLines.some((line) => line.text.includes('envs') && line.text.includes('必須のキーがありません'))).toBe(true)
})
