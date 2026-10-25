import { expect, test } from 'claude-code/testing'
import { installWorld, submit } from '../../unit/hooks/support/engine'
import { MemoryFs } from '../../unit/hooks/support/memory-fs'
import { CONFIG_PATH, SETTINGS, TERMS_DIR, makeConfig, makeFs, termYaml } from './support/fixtures'

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

// 当たった projects のソースを global に重ね、同じ語を両方のセクションに追加する（正常系）
test('test_normal_when_project_matched', async ($, on) => {
  // 準備
  const config = makeConfig({
    projects: [
      '- match: sample',
      '  sources:',
      '    - label: コマンド',
      '      type: command',
      '      files: docs/command/*.yaml',
      '      id: id',
      '      words: [name]',
      '      command: command',
      '- match: other',
      '  sources:',
      '    - label: 別',
      '      type: command',
      '      files: docs/other/*.yaml',
      '      id: id',
      '      words: [name]',
      '      command: command',
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
  // term-a の説明を書き換え、同じフォルダに term-c を足す
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
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH))
  expect(logged.length).toBeGreaterThan(0)
})

// 書式の誤った YAML のソースだけを外し、他のソースの文脈は追加する（異常系）
test('test_error_when_yaml_malformed', async ($, on) => {
  // 準備
  const config = makeConfig({
    sourcesExtra: ['- label: URL', '  type: url', '  files: urls/*.yaml', '  id: id', '  words: [name]', '  url: url'],
  })
  const fs = makeFs(config)
  const brokenPath = '/home/u/.config/alias-inject/urls/term-a.yaml'
  fs.write(brokenPath, 'id: [url-a\nname: term-a\n')
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  const context = result.context?.[0] ?? ''
  expect(context).toContain('## 用語')
  expect(context).toContain('Term-A')
  expect(context).not.toContain('## URL')
  const logged = world.logs.filter((line) => line.to === 'debug' && line.text.includes(brokenPath))
  expect(logged.length).toBeGreaterThan(0)
})
