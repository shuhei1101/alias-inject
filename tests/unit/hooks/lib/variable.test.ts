import { expect, test } from 'claude-code/testing'
import { findReferenceNames, formatReferenceLines, parseEnvOutput } from '../../../../hooks/lib/variable'
import { numberedNames } from '../support/engine'

// 名前を出た順に重なりを除いて返す（正常系）
test('test_find_reference_names', () => {
  // 準備
  const text = '!{B} !{A} !{B}'

  // 実行
  const names = findReferenceNames(text)

  // 検証
  expect(names).toEqual(['B', 'A'])
})

// 名前の書式に合わないものを拾わない（正常系）
test('test_find_reference_names_when_not_name', () => {
  // 準備
  const text = '!{} !{1ABC} !{A-B} {A} ${A}'

  // 実行
  const names = findReferenceNames(text)

  // 検証
  expect(names).toEqual([])
})

// 値に `=` や改行を含んでも崩さずに分ける（正常系）
test('test_parse_env_output', () => {
  // 準備
  // `=` が無い要素・名前が空の要素は飛ばされる
  const stdout = 'A=1\0B=x=y\0C=line1\nline2\0\0=bad\0'

  // 実行
  const values = parseEnvOutput(stdout)

  // 検証
  expect(values.size).toBe(3)
  expect(values.get('A')).toBe('1')
  expect(values.get('B')).toBe('x=y')
  expect(values.get('C')).toBe('line1\nline2')
})

// 設定されている名前と設定されていない名前を並べる（正常系）
test('test_format_reference_lines', () => {
  // 準備
  const values = new Map([['A', 'value-a']])

  // 実行
  const lines = formatReferenceLines(['A', 'B'], values)

  // 検証
  expect(lines.split('\n')).toEqual(['変数参照の値: !{A} = value-a', '変数参照の値: !{B} は環境変数が設定されていない'])
})

// 改行を含む値を JSON の文字列で 1 行に収める（正常系）
test('test_format_reference_lines_when_multiline', () => {
  // 準備
  const values = new Map([['C', 'line1\nline2']])

  // 実行
  const lines = formatReferenceLines(['C'], values)

  // 検証
  expect(lines).toBe('変数参照の値: !{C} = "line1\\nline2"')
})

// 上限を超える値は先頭だけを書き、全体の文字数を添える（正常系）
test('test_format_reference_lines_when_value_too_long', () => {
  // 準備
  const over = new Map([['L', 'x'.repeat(1001)]])
  const exact = new Map([['L', 'x'.repeat(1000)]])

  // 実行
  const overLines = formatReferenceLines(['L'], over)
  const exactLines = formatReferenceLines(['L'], exact)

  // 検証
  // 1001 文字では先頭の 1000 文字に切り、全体の文字数を添える
  expect(overLines).toBe(`変数参照の値: !{L} = ${'x'.repeat(1000)}（1001 文字のうち先頭 1000 文字）`)
  // 1000 文字ちょうどでは切らず、添えない
  expect(exactLines).toBe(`変数参照の値: !{L} = ${'x'.repeat(1000)}`)
})

// 上限を超えた名前は行を作らず件数を添える（正常系）
test('test_format_reference_lines_when_too_many', () => {
  // 準備
  const over = numberedNames(51)
  const exact = numberedNames(50)
  const values = new Map(over.map((name) => [name, 'v']))

  // 実行
  const overLines = formatReferenceLines(over, values).split('\n')
  const exactLines = formatReferenceLines(exact, values).split('\n')

  // 検証
  // 51 個では 50 行の後ろに、外した件数の行が付く
  expect(overLines.length).toBe(51)
  expect(overLines[0]).toBe('変数参照の値: !{NAME_01} = v')
  expect(overLines[49]).toBe('変数参照の値: !{NAME_50} = v')
  expect(overLines[50]).toBe('変数参照の値: ほか 1 件の変数参照は値を追加していない')
  // 50 個ちょうどでは 50 行だけ
  expect(exactLines.length).toBe(50)
  expect(exactLines.at(-1)).toBe('変数参照の値: !{NAME_50} = v')
})
