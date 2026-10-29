import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { SchemaError, checkKeywords, loadAliasSchema, validateSchema } from '../../../../hooks/lib/schema'
import { thrown } from '../support/thrown'

type Json = Record<string, unknown>

// スキーマに合う行。上書きしたいキーだけ渡す
function makeItem(overrides: Json = {}): Json {
  return {
    id: 'terms',
    paths: ['terms/*.yaml'],
    alias_type: 'term',
    ...overrides,
  }
}

// 行の `alias_type` だけを指定した行
function makeTypedItem(aliasType: string): Json {
  return makeItem({ alias_type: aliasType })
}

// aliases の 1 行を、同梱のスキーマで検証する
function validateItem(value: unknown): string[] {
  return validateSchema({ root: ALIAS_SCHEMA, schema: ALIAS_SCHEMA.items, value, path: 'aliases[0]' })
}

// 同梱のスキーマの `$defs.alias.properties.id` を書き換えた複製を返す
function withIdSchema(idSchema: Json): Json {
  const copy = JSON.parse(JSON.stringify(ALIAS_SCHEMA)) as { $defs: { alias: { properties: { id: Json } } } }
  copy.$defs.alias.properties.id = idSchema
  return copy as unknown as Json
}

// 同梱のスキーマを返す（正常系）
test('test_load_alias_schema', () => {
  // 実行
  const schema = loadAliasSchema()

  // 検証
  expect(schema.items).toEqual({ $ref: '#/$defs/alias' })
})

// リポジトリのスキーマは例外にならない（正常系）
test('test_check_keywords', () => {
  // 実行・検証
  expect(thrown(() => checkKeywords(ALIAS_SCHEMA))).toBeNull()
})

// 解釈しないキーワードと解けない `$ref` は例外を投げる（異常系）
test('test_check_keywords_when_unsupported', () => {
  // 準備
  const unsupported = withIdSchema({ type: 'string', pattern: '^a' })
  const unsupportedInAnyOf = withIdSchema({ anyOf: [{ type: 'string', pattern: '^a' }, { type: 'number' }] })
  const unresolved = withIdSchema({ $ref: '#/$defs/none' })

  // 実行
  const unsupportedError = thrown(() => checkKeywords(unsupported))
  const unsupportedInAnyOfError = thrown(() => checkKeywords(unsupportedInAnyOf))
  const unresolvedError = thrown(() => checkKeywords(unresolved))

  // 検証
  expect(unsupportedError).toBeInstanceOf(SchemaError)
  expect((unsupportedError as SchemaError).message).toContain('pattern')
  expect(unsupportedInAnyOfError).toBeInstanceOf(SchemaError)
  expect((unsupportedInAnyOfError as SchemaError).message).toContain('pattern')
  expect((unsupportedInAnyOfError as SchemaError).message).toContain('anyOf')
  expect(unresolvedError).toBeInstanceOf(SchemaError)
  expect((unresolvedError as SchemaError).message).toContain('#/$defs/none')
})

// スキーマに合う行は空を返す（正常系）
test('test_validate_schema', () => {
  // 準備
  const items = [
    ...['term', 'doc', 'command', 'url', 'skill', 'tool', 'path', 'env', 'avoid'].map((aliasType) =>
      makeTypedItem(aliasType),
    ),
    makeItem({ metadata: { name: 'title', description: 'meta.summary' } }),
    makeItem({
      enabled: true,
      schema: 'terms.schema.yaml',
      records: 'terms',
      body_file: 'path',
      metadata: { name: 'title', tags: 'tags' },
    }),
  ]

  // 実行
  const results = items.map((item) => validateItem(item))

  // 検証
  expect(results).toEqual(items.map(() => []))
})

// 無い必須のキーをパスつきで返す（正常系）
test('test_validate_schema_when_required_missing', () => {
  // 準備
  const withoutAliasType = { id: 'terms', paths: ['terms/*.yaml'] }
  const withoutPaths = { id: 'terms', alias_type: 'term' }

  // 実行
  const aliasTypeReasons = validateItem(withoutAliasType)
  const pathsReasons = validateItem(withoutPaths)

  // 検証
  expect(aliasTypeReasons.some((reason) => reason.includes('aliases[0].alias_type'))).toBe(true)
  expect(pathsReasons.some((reason) => reason.includes('aliases[0].paths'))).toBe(true)
})

// 型・列挙・最小の数と長さに合わない値を返す（正常系）
test('test_validate_schema_when_type_mismatch', () => {
  // 準備
  const cases: [string, Json][] = [
    ['aliases[0].id', makeItem({ id: 5 })],
    ['aliases[0].alias_type', makeTypedItem('memo')],
    ['aliases[0].paths', makeItem({ paths: [] })],
    ['aliases[0].metadata.name', makeItem({ metadata: { name: '' } })],
  ]

  // 実行・検証
  for (const [path, item] of cases) {
    const reasons = validateItem(item)
    expect(reasons.some((reason) => reason.includes(path))).toBe(true)
  }
})

// `additionalProperties: false` のスキーマは書けないキーを返し、行と metadata の他のキーは許す（正常系）
test('test_validate_schema_when_additional_property', () => {
  // 準備
  const closed: Json = { type: 'object', additionalProperties: false, properties: { a: { type: 'integer' } } }
  const withOtherKeys = makeItem({ label: '用語', metadata: { tags: 'tags' } })

  // 実行
  const closedReasons = validateSchema({ root: closed, schema: closed, value: { a: 1, b: 2 }, path: 'aliases[0]' })
  const otherReasons = validateItem(withOtherKeys)

  // 検証
  expect(closedReasons.some((reason) => reason.includes('aliases[0].b'))).toBe(true)
  expect(otherReasons).toEqual([])
})

// `if` に合わないときは `then` を使わない（正常系）
test('test_validate_schema_when_if_not_matched', () => {
  // 準備
  const schema: Json = {
    allOf: [{ if: { properties: { type: { const: 'url' } } }, then: { required: ['url'] } }],
  }

  // 実行
  const reasons = validateSchema({ root: schema, schema, value: { type: 'term' }, path: 'aliases[0]' })

  // 検証
  expect(reasons).toEqual([])
})

// `anyOf` のどの要素にも合わないときだけ理由を返す（正常系）
test('test_validate_schema_when_any_of_not_matched', () => {
  // 準備
  const schema: Json = { anyOf: [{ type: 'string' }, { type: 'integer' }] }

  // 実行
  const notMatchedReasons = validateSchema({ root: schema, schema, value: true, path: 'aliases[0]' })
  const matchedReasons = validateSchema({ root: schema, schema, value: 'a', path: 'aliases[0]' })

  // 検証
  expect(notMatchedReasons.length).toBe(2)
  expect(notMatchedReasons.some((reason) => reason.includes('string'))).toBe(true)
  expect(notMatchedReasons.some((reason) => reason.includes('integer'))).toBe(true)
  expect(matchedReasons).toEqual([])
})
