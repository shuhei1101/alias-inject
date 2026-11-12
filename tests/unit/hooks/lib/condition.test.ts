import { expect, test } from 'claude-code/testing'
import { evaluateCondition, filterByCondition, parseCondition } from '../../../../hooks/lib/condition'
import type { Condition } from '../../../../hooks/lib/condition'
import type { Entry } from '../../../../hooks/lib/entry'
import type { Hit } from '../../../../hooks/lib/match'

// テスト用の条件。上書きしたいキーだけ渡す
function term(op: 'contains' | 'not_contains', values: string[], match: 'any' | 'all' = 'any', caseSensitive = false): Condition {
  return { op, values, match, caseSensitive }
}

// テスト用の当たった語
function makeHit(id: string, condition: Condition | undefined, position: number): Hit {
  const entry: Entry = {
    aliasIndex: 0,
    itemIndex: position,
    origin: '/a/project-index.yaml',
    aliasId: 'terms',
    type: 'term',
    id,
    word: id,
    keys: [id],
    fields: [],
    path: `/a/terms/${id}.yaml`,
    bodyFile: undefined,
    condition,
    avoid: undefined,
  }
  return { entry, position, length: id.length, count: 1 }
}

// 条件と 3 レイヤーまでの束を照合条件にし、既定を補う（正常系）
test('test_parse_condition', () => {
  // 準備
  const single = { field: 'text', op: 'contains', values: ['Ｒｅａｃｔ'] }
  const nested = { and: [{ or: [{ not: { field: 'text', op: 'not_contains', values: ['python'] } }] }] }

  // 実行
  const singleResult = parseCondition(single)
  const nestedResult = parseCondition(nested)

  // 検証
  expect(singleResult).toEqual({ ok: true, condition: term('contains', ['react']) })
  expect(nestedResult).toEqual({ ok: true, condition: { and: [{ or: [{ not: term('not_contains', ['python']) }] }] } })
})

// 誤りの箇所と理由を返す（正常系）
test('test_parse_condition_when_invalid', () => {
  // 準備
  const valid = { field: 'text', op: 'contains', values: ['a'] }
  const cases: [unknown, string][] = [
    [{ and: [] }, 'inject_when.and'],
    [{ and: [{ field: 'text', op: 'regex', values: ['f'] }] }, 'inject_when.and[0].op'],
    [{ and: [valid], or: [valid] }, 'inject_when'],
    [{ field: 'name', op: 'contains', values: ['a'] }, 'inject_when.field'],
    [{ field: 'text', op: 'contains', values: [] }, 'inject_when.values'],
    [{ field: 'text', op: 'not_contains', values: [' '] }, 'inject_when.values'],
    [{ ...valid, match: 'some' }, 'inject_when.match'],
    [{ ...valid, case_sensitive: 'yes' }, 'inject_when.case_sensitive'],
    [{ ...valid, value: 'b' }, 'inject_when.value'],
    [{ and: [{ or: [{ not: { and: [valid] } }] }] }, 'inject_when.and[0].or[0].not'],
  ]

  // 実行・検証
  for (const [value, path] of cases) {
    const result = parseCondition(value)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.path).toBe(path)
    expect(!result.ok && result.reason.length > 0).toBe(true)
  }
})

// contains・not_contains と match・case_sensitive で比べる（正常系）
test('test_evaluate_condition', () => {
  // 準備
  const text = 'React と TSX'

  // 実行
  const results = [
    evaluateCondition(term('contains', ['react', 'vue']), text),
    evaluateCondition(term('contains', ['react', 'vue'], 'all'), text),
    evaluateCondition(term('not_contains', ['python']), text),
    evaluateCondition(term('contains', ['tsx'], 'any', true), text),
  ]

  // 検証
  expect(results).toEqual([true, false, true, false])
})

// and・or・not の束を評価する（正常系）
test('test_evaluate_condition_when_bundle', () => {
  // 準備
  const text = 'React と Python'
  const react = term('contains', ['react'])
  const notPython = term('not_contains', ['python'])

  // 実行
  const results = [
    evaluateCondition({ and: [react, notPython] }, text),
    evaluateCondition({ or: [react, notPython] }, text),
    evaluateCondition({ not: term('contains', ['python']) }, text),
  ]

  // 検証
  expect(results).toEqual([false, true, false])
})

// 照合条件を持たない語は残し、照合条件に当たらない語を外す（正常系）
test('test_filter_by_condition', () => {
  // 準備
  const hits = [makeHit('term-a', undefined, 0), makeHit('term-c', term('not_contains', ['python']), 9)]

  // 実行
  const remaining = filterByCondition(hits, 'term-a と term-c を Python で')

  // 検証
  expect(remaining.map((hit) => hit.entry.id)).toEqual(['term-a'])
})
