import { expect, test } from 'claude-code/testing'
import { COMPACTED_MESSAGE, installWorld, submit, userSettingsWithConfig } from './support/engine'
import { MemoryFs } from './support/memory-fs'

const CONFIG_PATH = '/home/u/.config/alias-inject/settings.yaml'
const SETTINGS = userSettingsWithConfig('~/.config/alias-inject/settings.yaml')

// 設定ファイルと用語の YAML（term-a・term-b）を持つファイル表。設定ファイルの global に足す行を渡せる
function makeFs(globalExtra: string[] = [], extraSources: string[] = []): MemoryFs {
  const config = [
    'global:',
    ...globalExtra.map((line) => `  ${line}`),
    '  sources:',
    '    - label: 用語',
    '      type: term',
    '      files: terms/*.yaml',
    '      id: id',
    '      words: [name, aliases]',
    '      description: description',
    ...extraSources.map((line) => `    ${line}`),
  ].join('\n')
  return new MemoryFs({
    [CONFIG_PATH]: config,
    '/home/u/.config/alias-inject/terms/term-a.yaml': 'id: term-a\nname: Term-A\naliases: [用語エー]\ndescription: 説明 A\n',
    '/home/u/.config/alias-inject/terms/term-b.yaml': 'id: term-b\nname: Term-B\ndescription: 説明 B\n',
  })
}

// enabled が false のときはそのまま渡す（正常系）
test('test_handle_prompt_submit_when_disabled', async ($, on) => {
  // 準備
  const fs = makeFs(['enabled: false'])
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  expect(fs.reads).toContain(CONFIG_PATH)
  expect(fs.reads.filter((path) => path.includes('/terms/'))).toEqual([])
})

// 他のフックが追加した文脈を残して末尾に追加する（正常系）
test('test_handle_prompt_submit_when_context_given', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは', { context: ['other'] })

  // 検証
  expect(result.context?.length).toBe(2)
  expect(result.context?.[0]).toBe('other')
  expect(result.context?.[1]).toContain('Term-A')
})

// 外した設定の値は設定ファイルを読んだときだけ debug log に出す（正常系）
test('test_handle_prompt_submit_when_settings_warned', async ($, on) => {
  // 準備
  const fs = makeFs([], ['- label: メモ', '  type: memo', '  files: memo/*.yaml', '  id: id', '  words: [name]'])
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  await submit($, 'term-a とは')
  await submit($, 'term-b とは')

  // 検証
  const warned = world.logs.filter((line) => line.to === 'debug' && line.text.includes('type'))
  expect(warned.length).toBe(1)
})

// 圧縮されたら記録を消去する（正常系）
test('test_handle_session_compact', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })
  await submit($, 'term-a とは')

  for (const trigger of ['manual', 'auto', 'plugin'] as const) {
    // 実行
    const compacted = await $.session.compact({ trigger, messages: [COMPACTED_MESSAGE] })
    const after = await submit($, 'term-a とは')

    // 検証
    expect(compacted.skip).toBeUndefined()
    expect(compacted.messages).toEqual([COMPACTED_MESSAGE])
    expect(after.context?.length).toBe(1)
  }
})

// 圧縮されなかったとき・サブエージェントの圧縮では記録を残す（正常系）
test('test_handle_session_compact_when_not_compacted', async ($, on) => {
  // 準備
  const world = installWorld(on, { fs: makeFs(), settings: SETTINGS })
  const before = await submit($, 'term-a とは')

  // 実行
  // 圧縮の事前の計算、圧縮の見送り、サブエージェントの圧縮の 3 通りを順に起こす
  await $.session.compact({ trigger: 'precompute', messages: [COMPACTED_MESSAGE] })
  world.compactResult = { skip: 'not compacted' }
  const skipped = await $.session.compact({ trigger: 'manual', messages: [COMPACTED_MESSAGE] })
  world.compactResult = { messages: [COMPACTED_MESSAGE] }
  await $.session.compact({ trigger: 'auto', agentId: 'sub1', messages: [COMPACTED_MESSAGE] })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(before.context?.length).toBe(1)
  expect(skipped.skip).toBe('not compacted')
  expect(after.context ?? []).toEqual([])
})

// ソースの glob が設定ファイルに当たっても、そのソースの他の語の文脈を追加する（正常系）
test('test_handle_prompt_submit_when_source_matches_config', async ($, on) => {
  // 準備
  // 設定ファイルと同じフォルダに term-a.yaml を置き、files: '*.yaml' が設定ファイル自身にも当たるようにする
  const config = [
    'global:',
    '  sources:',
    '    - label: 用語',
    '      type: term',
    "      files: '*.yaml'",
    '      id: id',
    '      words: [name]',
  ].join('\n')
  const fs = new MemoryFs({
    [CONFIG_PATH]: config,
    '/home/u/.config/alias-inject/term-a.yaml': 'id: term-a\nname: Term-A\n',
  })
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.context?.length).toBe(1)
  expect(result.context?.[0]).toContain('Term-A')
  expect(world.logs.filter((line) => line.text.includes('YAML を読めません'))).toEqual([])
})

// `clear` のときだけ、終わるセッション（e.sessionId）の記録を消去する（正常系）
test('test_handle_session_end_when_clear', async ($, on) => {
  // 準備
  // s1 と s2 の記録に term-a を入れ、$.session.id() は s1 に戻す
  const world = installWorld(on, { fs: makeFs(), settings: SETTINGS })
  await submit($, 'term-a とは')
  world.sessionId = 's2'
  await submit($, 'term-a とは')
  world.sessionId = 's1'

  // 実行
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's2', resume: { id: 's2' } })
  world.sessionId = 's2'
  const s2AfterExit = await submit($, 'term-a とは')
  world.sessionId = 's1'
  await $.session.end({ reason: 'clear', sessionId: 's2', resume: { id: 's2' } })
  const s1AfterClear = await submit($, 'term-a とは')
  world.sessionId = 's2'
  const s2AfterClear = await submit($, 'term-a とは')

  // 検証
  // prompt_input_exit では s2 の記録が残り、文脈は追加されない
  expect(s2AfterExit.context ?? []).toEqual([])
  // clear では s2 だけが消え、s1 の記録は残る
  expect(s1AfterClear.context ?? []).toEqual([])
  expect(s2AfterClear.context?.length).toBe(1)
})
