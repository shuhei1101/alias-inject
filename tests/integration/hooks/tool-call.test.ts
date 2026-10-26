import { expect, test } from 'claude-code/testing'
import { callTool, installToolWorld, numberedNames } from '../../unit/hooks/support/engine'

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
