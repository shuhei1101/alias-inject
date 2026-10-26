import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { SchemaError, checkKeywords, loadAliasSchema, validateSchema } from '../../../../hooks/lib/schema'
import { thrown } from '../support/thrown'

type Json = Record<string, unknown>

// 種類ごとのスキーマに合う aliases の要素。上書きしたいキーだけ渡す
function makeItem(overrides: Json = {}): Json {
  return {
    id: 'terms',
    type: 'term',
    paths: ['terms/*.yaml'],
    fields: { id: 'id', match: ['name'], description: 'description' },
    ...overrides,
  }
}

// aliases の 1 要素を、同梱のスキーマで検証する
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

// スキーマに合う要素は空を返す（正常系）
test('test_validate_schema', () => {
  // 準備
  const items = [
    makeItem(),
    makeItem({ type: 'doc', fields: { id: 'id', match: ['name'], description: 'summary', title: 'title' } }),
    makeItem({
      type: 'command',
      enabled: true,
      fields: { id: 'id', match: ['name'], command: 'command', cwd: 'cwd', description: 'description' },
    }),
    makeItem({ type: 'url', fields: { id: 'id', match: ['name'], url: 'url' } }),
    makeItem({ type: 'skill', fields: { id: 'id', match: ['name'], skill: 'skill', description: 'description' } }),
    makeItem({ type: 'tool', fields: { id: 'id', match: ['name'], tool: 'tool', description: 'description' } }),
    makeItem({ type: 'path', fields: { id: 'id', match: ['name'], path: 'path', description: 'description' } }),
    makeItem({ type: 'env', fields: { id: 'id', match: ['name'], url: 'url' } }),
    makeItem({ type: 'env', fields: { id: 'id', match: ['name'], port: 'port' } }),
    makeItem({ type: 'avoid', fields: { id: 'id', match: ['name'], replacement: 'replacement', title: 'title' } }),
  ]

  // 実行
  const results = items.map((item) => validateItem(item))

  // 検証
  expect(results).toEqual(items.map(() => []))
})

// 無い必須のキーをパスつきで返す（正常系）
test('test_validate_schema_when_required_missing', () => {
  // 準備
  const withoutFields = { id: 'terms', type: 'term', paths: ['terms/*.yaml'] }
  const withoutCommand = makeItem({ type: 'command', fields: { id: 'id', match: ['name'] } })

  // 実行
  const fieldsReasons = validateItem(withoutFields)
  const commandReasons = validateItem(withoutCommand)

  // 検証
  expect(fieldsReasons.some((reason) => reason.includes('aliases[0].fields'))).toBe(true)
  expect(commandReasons.some((reason) => reason.includes('aliases[0].fields.command'))).toBe(true)
})

// 型・列挙・最小の数と長さに合わない値を返す（正常系）
test('test_validate_schema_when_type_mismatch', () => {
  // 準備
  const cases: [string, Json][] = [
    ['aliases[0].id', makeItem({ id: 5 })],
    ['aliases[0].type', makeItem({ type: 'memo' })],
    ['aliases[0].paths', makeItem({ paths: [] })],
    ['aliases[0].id', makeItem({ id: '' })],
  ]

  // 実行・検証
  for (const [path, item] of cases) {
    const reasons = validateItem(item)
    expect(reasons.some((reason) => reason.includes(path))).toBe(true)
  }
})

// 書けないキーを返す（正常系）
test('test_validate_schema_when_additional_property', () => {
  // 準備
  const withMcp = makeItem({ fields: { id: 'id', match: ['name'], description: 'description', mcp: 'rule-inject' } })
  const withLabel = makeItem({ label: '用語' })

  // 実行
  const mcpReasons = validateItem(withMcp)
  const labelReasons = validateItem(withLabel)

  // 検証
  expect(mcpReasons.some((reason) => reason.includes('aliases[0].fields.mcp'))).toBe(true)
  expect(labelReasons.some((reason) => reason.includes('aliases[0].label'))).toBe(true)
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
  const withoutUrlAndPort = makeItem({
    type: 'env',
    fields: { id: 'id', match: ['name'], description: 'description' },
  })
  const withUrlAndPort = makeItem({
    type: 'env',
    fields: { id: 'id', match: ['name'], url: 'url', port: 'port' },
  })

  // 実行
  const notMatchedReasons = validateItem(withoutUrlAndPort)
  const matchedReasons = validateItem(withUrlAndPort)

  // 検証
  expect(notMatchedReasons.some((reason) => reason.includes('aliases[0].fields.url'))).toBe(true)
  expect(notMatchedReasons.some((reason) => reason.includes('aliases[0].fields.port'))).toBe(true)
  expect(matchedReasons).toEqual([])
})
