import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { COMPACTED_MESSAGE, installWorld, submit, userSettingsWithConfig } from './support/engine'
import type { LogLine } from './support/engine'
import { MemoryFs } from './support/memory-fs'

const CONFIG_DIR = '/home/u/.config/alias-inject'
const CONFIG_PATH = `${CONFIG_DIR}/settings.yaml`
const DEV_DOCS_PATH = '/home/u/knowledge/dev-docs.yaml'
const SETTINGS = userSettingsWithConfig('~/.config/alias-inject/settings.yaml')

// term の aliases の要素の YAML の行。`- id:` を `indent` 個の空白で始める
function termAliasLines(id: string, paths: string, indent: number): string[] {
  const pad = ' '.repeat(indent)
  return [
    `${pad}- id: ${id}`,
    `${pad}  type: term`,
    `${pad}  paths: ['${paths}']`,
    `${pad}  fields:`,
    `${pad}    id: id`,
    `${pad}    match: [name, aliases]`,
    `${pad}    title: name`,
    `${pad}    description: description`,
  ]
}

type FsOptions = {
  /** 設定ファイルの `global` に足す行（字下げなし） */
  globalExtra?: string[]
  /** 設定ファイルの `global.aliases` に足す行（字下げ込み） */
  extraAliases?: string[]
  /** 置くと設定ファイルの `global.repositories` が指す dev-docs.yaml の行 */
  devDocs?: string[]
  /** 設定ファイルの `global.aliases` の term の要素の `paths` */
  termPaths?: string
}

// 設定ファイルと用語の YAML（term-a・term-b）を持つファイル表
function makeFs(options: FsOptions = {}): MemoryFs {
  const config = [
    'global:',
    ...(options.globalExtra ?? []).map((line) => `  ${line}`),
    ...(options.devDocs === undefined ? [] : ['  repositories:', '    - config: ~/knowledge/dev-docs.yaml']),
    '  aliases:',
    ...termAliasLines('terms', options.termPaths ?? 'terms/*.yaml', 4),
    ...(options.extraAliases ?? []),
  ].join('\n')
  const fs = new MemoryFs({
    [CONFIG_PATH]: config,
    [`${CONFIG_DIR}/terms/term-a.yaml`]: 'id: term-a\nname: Term-A\naliases: [用語エー]\ndescription: 説明 A\n',
    [`${CONFIG_DIR}/terms/term-b.yaml`]: 'id: term-b\nname: Term-B\ndescription: 説明 B\n',
  })
  if (options.devDocs !== undefined) fs.write(DEV_DOCS_PATH, options.devDocs.join('\n'))
  return fs
}

// 指定したパスとキーを両方含む debug log の行
function debugLines(logs: LogLine[], path: string, key: string): LogLine[] {
  return logs.filter((line) => line.to === 'debug' && line.text.includes(path) && line.text.includes(key))
}

// enabled が false のときはそのまま渡す（正常系）
test('test_handle_prompt_submit_when_disabled', async ($, on) => {
  // 準備
  const fs = makeFs({
    globalExtra: ['enabled: false'],
    devDocs: ['aliases:', ...termAliasLines('repo-terms', 'terms/*.yaml', 2)],
  })
  fs.write('/home/u/knowledge/terms/term-c.yaml', 'id: term-c\nname: Term-C\ndescription: 説明 C\n')
  installWorld(on, { fs, settings: SETTINGS })

  // 実行
  const result = await submit($, 'term-a とは')

  // 検証
  expect(result.text).toBe('term-a とは')
  expect(result.context ?? []).toEqual([])
  expect(fs.reads).toContain(CONFIG_PATH)
  expect(fs.reads.filter((path) => path !== CONFIG_PATH)).toEqual([])
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

// 外した設定の値と aliases の要素は、読み込みの結果が変わらないうち 1 回だけ debug log に出す（正常系）
test('test_handle_prompt_submit_when_settings_warned', async ($, on) => {
  // 準備
  const memoAlias = [
    '    - id: memo',
    '      type: memo',
    "      paths: ['memo/*.yaml']",
    '      fields:',
    '        id: id',
    '        match: [name]',
  ]
  const badAlias = [
    '  - id: bad',
    '    type: term',
    "    paths: ['terms/*.yaml']",
    '    fields:',
    '      id: id',
    '      match: [name]',
    '      description: description',
    '      mcp: rule-inject',
  ]
  const fs = makeFs({ extraAliases: memoAlias, devDocs: ['aliases:', ...badAlias] })
  const world = installWorld(on, { fs, settings: SETTINGS })

  // 実行
  await submit($, 'term-a とは')
  await submit($, 'term-b とは')

  // 検証
  expect(debugLines(world.logs, CONFIG_PATH, 'type').length).toBe(1)
  expect(debugLines(world.logs, DEV_DOCS_PATH, 'mcp').length).toBe(1)
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

// aliases の要素の glob が設定ファイルに当たっても、その要素の他の語の文脈を追加する（正常系）
test('test_handle_prompt_submit_when_alias_paths_match_config', async ($, on) => {
  // 準備
  // 設定ファイルと同じフォルダに term-a.yaml を置き、paths: '*.yaml' が設定ファイル自身にも当たるようにする
  const fs = makeFs({ termPaths: '*.yaml' })
  fs.write(`${CONFIG_DIR}/term-a.yaml`, 'id: term-a\nname: Term-A\n')
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

type ToolWorld = {
  /** `tool.call` の一番下の処理が返すツールの結果 */
  answer: unknown
  /** `process.run` の応答。`{ value }` は子プロセスの結果、`{ deny }` は例外 */
  run: unknown
  /** `process.run` に届いた argv と待ちの上限 */
  runs: { argv: readonly string[]; timeoutMs: number | undefined }[]
  /** `$.ui.log` に届いた行 */
  logs: LogLine[]
}

// ツールの結果と子プロセスの応答をテストの `on` へ登録する。応答はテストの途中で書き換えられる
function installToolWorld(on: On): ToolWorld {
  const world: ToolWorld = { answer: { result: 'r' }, run: { value: { exitCode: 0, stdout: '' } }, runs: [], logs: [] }
  on('tool.call', () => world.answer as never)
  on('process.run', (_, e) => {
    world.runs.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs })
    return world.run as never
  })
  on('ui.log', (_, e) => {
    world.logs.push({ text: e.text, to: e.to })
    return { value: undefined }
  })
  return world
}

// ツールを呼び、返ったツールの結果を返す
async function callTool($: Engine) {
  return $.tool.call({ tool: 'Read', input: { file_path: '/repo/sample/note.md' } })
}

// 他のフックが追加した文脈を残し、本文と ref を変えずに末尾に追加する（正常系）
test('test_handle_tool_call_when_context_given', async ($, on) => {
  // 準備
  const world = installToolWorld(on)
  world.answer = { result: 'r', text: '本文 !{VALUE_A}', ref: 'ref1', context: ['other'] }
  world.run = { value: { exitCode: 0, stdout: 'VALUE_A=value-a\0' } }

  // 実行
  const result = await callTool($)

  // 検証
  expect(result.context).toEqual(['other', '変数参照の値: !{VALUE_A} = value-a'])
  expect(result.text).toBe('本文 !{VALUE_A}')
  expect(result.ref).toBe('ref1')
  expect(world.runs).toEqual([{ argv: ['env', '-0'], timeoutMs: 20 }])
})

// deny・エラーの結果・本文が無い結果・変数参照が無い結果は子プロセスを起こさずそのまま返す（正常系）
test('test_handle_tool_call_when_skipped', async ($, on) => {
  // 準備
  const world = installToolWorld(on)
  const answers = [
    { deny: 'no' },
    { result: 'r', text: '本文 !{VALUE_A}', isError: true },
    { result: 'r' },
    { result: 'r', text: '変数参照の無い本文' },
  ]

  for (const answer of answers) {
    // 実行
    world.answer = answer
    const result = await callTool($)

    // 検証
    expect(result).toEqual(answer)
  }
  expect(world.runs).toEqual([])
})

// 終了コードが 0 以外・例外のときは debug log に出してそのまま返す（異常系）
test('test_handle_tool_call_when_process_failed', async ($, on) => {
  // 準備
  const world = installToolWorld(on)
  const answer = { result: 'r', text: '本文 !{VALUE_A}' }
  world.answer = answer
  const debugLines = () => world.logs.filter((line) => line.to === 'debug')

  // 実行
  // 終了コード 3 で終わる
  world.run = { value: { exitCode: 3, stdout: '' } }
  const exited = await callTool($)
  const exitLogs = debugLines().filter((line) => line.text.includes('3'))
  world.logs.length = 0
  // 子プロセスの例外（起動できない）
  world.run = { deny: 'spawn env ENOENT' }
  const failed = await callTool($)
  const failedLogs = debugLines().filter((line) => line.text.includes('spawn env ENOENT'))

  // 検証
  expect(exited).toEqual(answer)
  expect(exitLogs.length).toBe(1)
  expect(failed).toEqual(answer)
  expect(failedLogs.length).toBe(1)
})
