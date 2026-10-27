import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { SchemaError, checkKeywords, loadAliasSchema, validateSchema } from '../../../../hooks/lib/schema'
import { thrown } from '../support/thrown'

type Json = Record<string, unknown>

// `alias_type` を custom で固定する metadata の値
function customType(value: string): Json {
  return { type: 'custom', value }
}

// スキーマに合う行。上書きしたいキーだけ渡す
function makeItem(overrides: Json = {}): Json {
  return {
    id: 'terms',
    paths: ['terms/*.yaml'],
    metadata: { alias_type: customType('term') },
    ...overrides,
  }
}

// `alias_type` だけを指定した metadata を持つ行
function makeTypedItem(aliasType: string): Json {
  return makeItem({ metadata: { alias_type: customType(aliasType) } })
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
    makeItem({ metadata: { alias_type: { type: 'ref', field: 'kind' } } }),
    makeItem({
      enabled: true,
      type: 'yaml',
      records: 'terms',
      metadata: { alias_type: customType('term'), tags: { type: 'ref', field: 'tags' } },
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
  const withoutMetadata = { id: 'terms', paths: ['terms/*.yaml'] }
  const withoutAliasType = makeItem({ metadata: { name: { type: 'ref', field: 'title' } } })

  // 実行
  const metadataReasons = validateItem(withoutMetadata)
  const aliasTypeReasons = validateItem(withoutAliasType)

  // 検証
  expect(metadataReasons.some((reason) => reason.includes('aliases[0].metadata'))).toBe(true)
  expect(aliasTypeReasons.some((reason) => reason.includes('aliases[0].metadata.alias_type'))).toBe(true)
})

// 型・列挙・最小の数と長さに合わない値を返す（正常系）
test('test_validate_schema_when_type_mismatch', () => {
  // 準備
  const cases: [string, Json][] = [
    ['aliases[0].id', makeItem({ id: 5 })],
    ['aliases[0].metadata.alias_type', makeTypedItem('memo')],
    ['aliases[0].paths', makeItem({ paths: [] })],
    ['aliases[0].id', makeItem({ id: '' })],
  ]

  // 実行・検証
  for (const [path, item] of cases) {
    const reasons = validateItem(item)
    expect(reasons.some((reason) => reason.includes(path))).toBe(true)
  }
})

// 値の型に書けないキーを返し、行と metadata の他のキーは許す（正常系）
test('test_validate_schema_when_additional_property', () => {
  // 準備
  const withLabelInValue = makeItem({
    metadata: { alias_type: customType('term'), name: { type: 'ref', field: 'title', label: 'x' } },
  })
  const withOtherKeys = makeItem({
    label: '用語',
    metadata: { alias_type: customType('term'), tags: { type: 'ref', field: 'tags' } },
  })

  // 実行
  const valueReasons = validateItem(withLabelInValue)
  const otherReasons = validateItem(withOtherKeys)

  // 検証
  expect(valueReasons.some((reason) => reason.includes('aliases[0].metadata.name.label'))).toBe(true)
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
  const withStringName = makeItem({ metadata: { alias_type: customType('term'), name: 'Term-A' } })
  const withRefName = makeItem({
    metadata: { alias_type: customType('term'), name: { type: 'ref', field: 'title' } },
  })

  // 実行
  const notMatchedReasons = validateItem(withStringName)
  const matchedReasons = validateItem(withRefName)

  // 検証
  expect(notMatchedReasons.some((reason) => reason.includes('aliases[0].metadata.name'))).toBe(true)
  expect(matchedReasons).toEqual([])
})
