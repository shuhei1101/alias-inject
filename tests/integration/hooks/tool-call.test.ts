import { describe, expect, test } from 'claude-code/testing'
import { callTool, installToolWorld, numberedNames, submit } from '../../unit/hooks/support/engine'
import { CONFIG_PATH, SETTINGS, TERMS_DIR, makeConfig, makeFs } from './support/fixtures'

// `env -0` の出力。名前と値の組を NUL で区切る
function envOutput(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([name, value]) => `${name}=${value}\0`)
    .join('')
}

// `env -0` が終了コード 0 で返す応答
function envRun(entries: Record<string, string>): unknown {
  return { value: { exitCode: 0, stdout: envOutput(entries) } }
}

describe('読んだ本文への変数参照の値の追加', () => {
  // 本文に出た名前ごとに 1 行の値を context に追加する（正常系）
  test('test_normal', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    world.answer = { result: 'r', text: '本文 !{VALUE_A} と !{VALUE_A}', ref: 'ref1', context: ['other'] }
    world.run = envRun({ VALUE_A: 'value-a' })

    // 実行
    const result = await callTool($)

    // 検証
    expect(result.context?.length).toBe(2)
    expect(result.context?.[0]).toBe('other')
    expect(result.context?.[1]).toBe('変数参照の値: !{VALUE_A} = value-a')
    expect(result.text).toBe('本文 !{VALUE_A} と !{VALUE_A}')
    expect(world.runs).toEqual([{ argv: ['env', '-0'], timeoutMs: 20 }])
  })

  // env -0 の出力に無い名前は、設定されていない旨の行にする（正常系）
  test('test_normal_when_unset', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    world.answer = { result: 'r', text: '!{VALUE_A} と !{UNSET_B}' }
    world.run = envRun({ VALUE_A: 'value-a' })

    // 実行
    const result = await callTool($)

    // 検証
    expect(result.context?.length).toBe(1)
    expect(result.context?.[0]?.split('\n')).toEqual([
      '変数参照の値: !{VALUE_A} = value-a',
      '変数参照の値: !{UNSET_B} は環境変数が設定されていない',
    ])
  })

  // 変数参照が無い結果は子プロセスを起こさずそのまま返す（正常系）
  test('test_normal_when_no_reference', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    const answer = { result: 'r', text: '名前の書式に合わない !{} と !{1ABC} だけ' }
    world.answer = answer

    // 実行
    const result = await callTool($)

    // 検証
    expect(result).toEqual(answer)
    expect(world.runs).toEqual([])
  })

  // エラーの結果と deny は本文に変数参照があってもそのまま返す（正常系）
  test('test_normal_when_error_result', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    const answers = [{ result: 'r', text: '!{VALUE_A}', isError: true }, { deny: 'no' }]

    for (const answer of answers) {
      // 実行
      world.answer = answer
      const result = await callTool($)

      // 検証
      expect(result).toEqual(answer)
    }
    expect(world.runs).toEqual([])
  })

  // 本文に出た順で 50 名前までの行を作り、残りの件数の行を置く（正常系）
  test('test_normal_when_over_reference_limit', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    const names = numberedNames(52)
    world.answer = { result: 'r', text: names.map((name) => `!{${name}}`).join(' ') }
    world.run = envRun(Object.fromEntries(names.map((name) => [name, 'v'])))

    // 実行
    const result = await callTool($)

    // 検証
    const lines = result.context?.at(-1)?.split('\n') ?? []
    expect(lines.length).toBe(51)
    expect(lines[0]).toBe('変数参照の値: !{NAME_01} = v')
    expect(lines[49]).toBe('変数参照の値: !{NAME_50} = v')
    expect(lines.some((line) => line.includes('NAME_51') || line.includes('NAME_52'))).toBe(false)
    expect(lines[50]).toBe('変数参照の値: ほか 2 件の変数参照は値を追加していない')
  })

  // 1000 文字を超える値は先頭だけを書き、改行を含む値は JSON の文字列で 1 行に収める（正常系）
  test('test_normal_when_over_value_limit', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    world.answer = { result: 'r', text: '!{LONG_C} と !{MULTI_D}' }
    world.run = envRun({ LONG_C: 'x'.repeat(1200), MULTI_D: 'line1\nline2' })

    // 実行
    const result = await callTool($)

    // 検証
    const lines = result.context?.at(-1)?.split('\n') ?? []
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe(`変数参照の値: !{LONG_C} = ${'x'.repeat(1000)}（1200 文字のうち先頭 1000 文字）`)
    expect(lines[1]).toBe('変数参照の値: !{MULTI_D} = "line1\\nline2"')
  })

  // env -0 が 0 以外で終わったときは文脈を追加せずそのまま返す（異常系）
  test('test_error_when_nonzero_exit', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    const answer = { result: 'r', text: '本文 !{VALUE_A}' }
    world.answer = answer
    world.run = { value: { exitCode: 3, stdout: '' } }

    // 実行
    const result = await callTool($)

    // 検証
    expect(result).toEqual(answer)
    expect(world.logs.filter((line) => line.to === 'debug' && line.text.includes('3')).length).toBe(1)
  })

  // 起動できない・待ちの上限を超えたときは文脈を追加せずそのまま返す（異常系）
  test('test_error_when_process_failed', async ($, on) => {
    // 準備
    const world = installToolWorld(on)
    const answer = { result: 'r', text: '本文 !{VALUE_A}' }
    world.answer = answer
    const reasons = ['spawn env ENOENT', 'env still running after 20ms']

    for (const reason of reasons) {
      // 実行
      world.logs.length = 0
      world.run = { deny: reason }
      const result = await callTool($)

      // 検証
      expect(result).toEqual(answer)
      expect(world.logs.filter((line) => line.to === 'debug' && line.text.includes(reason)).length).toBe(1)
    }
  })
})

// 変数参照の値の行
const VALUE_A_LINE = '変数参照の値: !{VALUE_A} = value-a'

// Read の呼び出し。agentId を渡すとサブエージェントの中の呼び出しにする
function readInput(agentId?: string): Record<string, unknown> {
  return { tool: 'Read', file_path: '/work/note.md', ...(agentId === undefined ? {} : { agentId }) }
}

describe('ツールの結果への引用の文脈の追加', () => {
  // 初めて出た語の文脈を追加し、メインの会話の記録に入れる（正常系）
  test('test_normal', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = { result: 'r', text: '用語エーの説明', context: ['other'] }

    // 実行
    const result = await callTool($, readInput())
    const after = await submit($, 'term-a とは')

    // 検証
    expect(result.context?.length).toBe(2)
    expect(result.context?.[0]).toBe('other')
    const context = result.context?.[1] ?? ''
    expect(context).toContain('# この発言に出る用語')
    expect(context).toContain('## 用語')
    expect(context).toContain('Term-A')
    expect(result.text).toBe('用語エーの説明')
    expect(after.context ?? []).toEqual([])
    expect(world.runs).toEqual([])
  })

  // exclude_tools のツールの結果は照合しない（正常系）
  test('test_normal_when_tool_excluded', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['exclude_tools: [Bash]'] })), settings: SETTINGS })
    const answer = { result: 'r', text: 'term-a を表示' }
    world.answer = answer

    // 実行
    const bash = await callTool($, { tool: 'Bash', command: 'cat term-a.yaml' })
    const read = await callTool($, readInput())

    // 検証
    expect(bash).toEqual(answer)
    expect(read.context?.[0]).toContain('Term-A')
  })

  // Read の file_path と MCP の引数の ID に当たる語を外す（正常系）
  test('test_normal_when_reading_own_document', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = { result: 'r', text: 'Term-A と term-b' }

    // 実行
    const read = await callTool($, { tool: 'Read', file_path: `${TERMS_DIR}/term-a.yaml` })
    // 記録を分けるため、別のセッションで呼ぶ
    if (world.files !== undefined) world.files.sessionId = 's2'
    const mcp = await callTool($, {
      tool: 'mcp__plugin_dev-docs_dev-docs__search_docs',
      filter: { field: 'id', op: 'eq', values: ['term-a'] },
    })

    // 検証
    for (const result of [read, mcp]) {
      expect(result.context?.[0]).toContain('id: term-b')
      expect(result.context?.[0]).not.toContain('id: term-a')
    }
  })

  // 出た回数の多い語から max_items 語だけを追加する（正常系）
  test('test_normal_when_over_limit', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['max_items: 1'] })), settings: SETTINGS })
    // 最初に出た位置は term-a が早く、出た回数は term-b が多い
    world.answer = { result: 'r', text: 'term-a、term-b、term-b、term-b' }

    // 実行
    const result = await callTool($, readInput())
    const after = await submit($, 'term-a とは')

    // 検証
    expect(result.context?.[0]).toContain('id: term-b')
    expect(result.context?.[0]).not.toContain('id: term-a')
    expect(after.context?.[0]).toContain('Term-A')
  })

  // agentId のある呼び出しはメインの会話と別の記録で照合する（正常系）
  test('test_normal_when_in_subagent', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    await submit($, 'term-a とは')
    const answer = { result: 'r', text: 'term-a と term-b' }
    world.answer = answer

    // 実行
    const first = await callTool($, readInput('agent-1'))
    const second = await callTool($, readInput('agent-1'))
    const after = await submit($, 'term-b とは')

    // 検証
    expect(first.context?.[0]).toContain('Term-A')
    expect(first.context?.[0]).toContain('id: term-b')
    expect(second).toEqual(answer)
    expect(after.context?.[0]).toContain('id: term-b')
  })

  // エラーの結果・deny・本文の無い結果は照合しない（正常系）
  test('test_normal_when_not_matched_result', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    const answers = [{ result: 'r', text: 'term-a', isError: true }, { deny: 'no' }, { result: 'r' }]

    for (const answer of answers) {
      // 実行
      world.answer = answer
      const result = await callTool($, readInput())

      // 検証
      expect(result).toEqual(answer)
    }
    const after = await submit($, 'term-a とは')
    expect(after.context?.[0]).toContain('Term-A')
  })

  // 引用の文脈を先に、変数参照の値の行を後に追加する（正常系）
  test('test_normal_when_variable_reference_added', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = { result: 'r', text: 'term-a と !{VALUE_A}' }
    world.run = envRun({ VALUE_A: 'value-a' })

    // 実行
    const result = await callTool($, readInput())

    // 検証
    expect(result.context?.length).toBe(2)
    expect(result.context?.[0]).toContain('Term-A')
    expect(result.context?.[1]).toBe(VALUE_A_LINE)
  })

  // ifVersion が外れたら読み直し、他の呼び出しで記録された語を除いて追加する（正常系）
  test('test_normal_when_record_conflicted', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = { result: 'r', text: 'term-a と term-b' }
    // 1 回目の書き込みの前に、同じ記録へ入力の送信で term-a を書き込んで version を進める
    let injected = false
    on('state.set', async (_, e, next) => {
      if (!injected) {
        injected = true
        await submit($, 'term-a とは')
      }
      return next(e)
    })

    // 実行
    const result = await callTool($, readInput())
    const after = await submit($, 'term-a と term-b')

    // 検証
    expect(result.context?.[0]).toContain('id: term-b')
    expect(result.context?.[0]).not.toContain('id: term-a')
    expect(after.context ?? []).toEqual([])
  })

  // 設定ファイルが読めないときは引用の文脈を追加せずに返す（異常系）
  test('test_error_when_config_unreadable', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs('global: ['), settings: SETTINGS })
    const answer = { result: 'r', text: '用語エーの説明', context: ['other'] }
    world.answer = answer

    // 実行
    const result = await callTool($, readInput())

    // 検証
    expect(result).toEqual(answer)
    expect(world.logs.filter((line) => line.to === 'debug' && line.text.includes(CONFIG_PATH)).length).toBeGreaterThan(0)
  })

  // ifVersion が 3 回続けて外れたら引用の文脈を追加せずに返す（異常系）
  test('test_error_when_record_conflicts_exhausted', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    const answer = { result: 'r', text: '用語エーの説明', context: ['other'] }
    world.answer = answer
    // ifVersion を付けた書き込みには常に外れたと返す
    let setCalls = 0
    on('state.set', (_, e, next) => {
      setCalls += 1
      if (e.ifVersion !== undefined) return { value: { isSet: false, version: e.ifVersion + 1 } }
      return next(e)
    })

    // 実行
    const result = await callTool($, readInput())

    // 検証
    expect(result).toEqual(answer)
    expect(setCalls).toBe(3)
    expect(world.logs.filter((line) => line.to === 'debug').length).toBeGreaterThan(0)
  })

  // 照合の途中の例外では引用の文脈を追加せず、変数参照の値の行だけを追加する（異常系）
  test('test_error_when_unexpected_exception', async ($, on) => {
    // 準備
    const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = { result: 'r', text: 'term-a と !{VALUE_A}' }
    world.run = envRun({ VALUE_A: 'value-a' })
    on('state.get', () => ({ deny: 'state broken' }))

    // 実行
    const result = await callTool($, readInput())

    // 検証
    expect(result.context).toEqual([VALUE_A_LINE])
    expect(world.logs.filter((line) => line.to === 'debug' && line.text.includes('state broken')).length).toBe(1)
  })
})
