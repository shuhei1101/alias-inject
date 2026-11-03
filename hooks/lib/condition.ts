import { normalize } from './match'
import type { Hit } from './match'

/** 照合した本文と値を 1 つの比べ方で比べる条件 */
export type ConditionTerm = {
  /** `not_contains` は同じ `values`・`match` の `contains` の否定 */
  op: 'contains' | 'not_contains'
  /** 比べる値。`caseSensitive` が false なら照合の正規化に通したもの */
  values: string[]
  /** `values` のどれか（any）か全て（all）を本文が含めば当たる */
  match: 'any' | 'all'
  /** true なら本文と値を正規化せずに比べる */
  caseSensitive: boolean
}

/** 条件か、`and`・`or`・`not` の束 */
export type Condition = ConditionTerm | { and: Condition[] } | { or: Condition[] } | { not: Condition }

/** 最上位の束を 1 レイヤーとした束の入れ子の上限 */
export const MAX_CONDITION_DEPTH = 3

type ParseResult = { ok: true; condition: Condition } | { ok: false; path: string; reason: string }

const BUNDLE_KEYS = ['and', 'or', 'not'] as const
const TERM_KEYS = ['field', 'op', 'values', 'match', 'case_sensitive']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(path: string, reason: string): ParseResult {
  return { ok: false, path, reason }
}

// 束を検査する。depth は親の束の数
function parseBundle(value: Record<string, unknown>, path: string, depth: number): ParseResult {
  const keys = Object.keys(value)
  if (keys.length !== 1) return failure(path, '束は and・or・not のどれか 1 つだけを持ちます')
  if (depth + 1 > MAX_CONDITION_DEPTH) return failure(path, `入れ子が ${MAX_CONDITION_DEPTH} レイヤーを超えています`)

  if ('not' in value) {
    const inner = parseNode(value.not, `${path}.not`, depth + 1)
    return inner.ok ? { ok: true, condition: { not: inner.condition } } : inner
  }
  const key = 'and' in value ? 'and' : 'or'
  const list = value[key]
  const listPath = `${path}.${key}`
  if (!Array.isArray(list)) return failure(listPath, '並びではありません')
  if (list.length === 0) return failure(listPath, '空の束です')
  const conditions: Condition[] = []
  for (const [index, element] of list.entries()) {
    const inner = parseNode(element, `${listPath}[${index}]`, depth + 1)
    if (!inner.ok) return inner
    conditions.push(inner.condition)
  }
  return { ok: true, condition: key === 'and' ? { and: conditions } : { or: conditions } }
}

// 条件を検査する
function parseTerm(value: Record<string, unknown>, path: string): ParseResult {
  const unknownKey = Object.keys(value).find((key) => !TERM_KEYS.includes(key))
  if (unknownKey !== undefined) return failure(`${path}.${unknownKey}`, `${unknownKey} は書けません`)
  if (value.field !== 'text') return failure(`${path}.field`, 'field は text だけを書けます')
  if (value.op !== 'contains' && value.op !== 'not_contains') {
    return failure(`${path}.op`, 'op は contains・not_contains だけを書けます')
  }
  const values = value.values
  if (!Array.isArray(values) || values.length === 0 || !values.every((element) => typeof element === 'string' && element !== '')) {
    return failure(`${path}.values`, 'values は 1 つ以上の空でない文字列の並びで書きます')
  }
  const match = value.match ?? 'any'
  if (match !== 'any' && match !== 'all') return failure(`${path}.match`, 'match は any・all だけを書けます')
  const caseSensitive = value.case_sensitive ?? false
  if (typeof caseSensitive !== 'boolean') return failure(`${path}.case_sensitive`, 'case_sensitive は真偽値で書きます')

  const strings = caseSensitive ? (values as string[]) : (values as string[]).map(normalize)
  // 正規化で空になる値（空白だけの値）は、どの本文にも含まれるため空の値と同じく誤りにする
  if (strings.includes('')) return failure(`${path}.values`, 'values は 1 つ以上の空でない文字列の並びで書きます')
  return { ok: true, condition: { op: value.op, values: strings, match, caseSensitive } }
}

function parseNode(value: unknown, path: string, depth: number): ParseResult {
  if (!isRecord(value)) return failure(path, 'マッピングではありません')
  if (BUNDLE_KEYS.some((key) => key in value)) return parseBundle(value, path, depth)
  return parseTerm(value, path)
}

/** `inject_when` の値を検査し、照合条件にするか、誤りの箇所と理由を返す */
export function parseCondition(value: unknown): ParseResult {
  return parseNode(value, 'inject_when', 0)
}

/** 照合条件を照合した本文で評価する */
export function evaluateCondition(condition: Condition, text: string): boolean {
  if ('and' in condition) return condition.and.every((inner) => evaluateCondition(inner, text))
  if ('or' in condition) return condition.or.some((inner) => evaluateCondition(inner, text))
  if ('not' in condition) return !evaluateCondition(condition.not, text)

  const target = condition.caseSensitive ? text : normalize(text)
  const contains = (value: string) => target.includes(value)
  const matched = condition.match === 'all' ? condition.values.every(contains) : condition.values.some(contains)
  return condition.op === 'contains' ? matched : !matched
}

/** 当たった語のうち、照合条件に当たらない語を外す */
export function filterByCondition(hits: Hit[], text: string): Hit[] {
  return hits.filter(({ entry }) => entry.condition === undefined || evaluateCondition(entry.condition, text))
}
