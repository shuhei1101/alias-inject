import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { dedupeAliases, isAliasType, missingKeys, parseAliases, resolveMetadata } from '../../../../hooks/lib/alias'
import type { AliasKey, AliasMetadata } from '../../../../hooks/lib/alias'

// `alias_type` を custom で固定する metadata の値
function customType(value: string) {
  return { type: 'custom', value }
}

// スキーマに合う term の行（設定ファイルや dev-docs.yaml の documents に記載する構造）。
// 行の `enabled` と `type`、`metadata` の `tags` はエイリアスの元の行が持たないキーで、取り出すときに外れる
const TERM_ROW = {
  id: 'terms',
  enabled: true,
  type: 'yaml',
  paths: ['terms/*.yaml'],
  metadata: { alias_type: customType('term'), tags: { type: 'ref', field: 'tags' } },
}

// スキーマに合う command の行。`records` と、列から取る `name` を持つ
const COMMAND_ROW = {
  id: 'commands',
  paths: ['docs/command.yaml'],
  records: 'commands',
  metadata: { alias_type: customType('command'), name: { type: 'ref', field: 'title' } },
}

// 解決した値の表。書いたキー以外は持たない
function resolved(values: Record<string, unknown>): Record<AliasKey, unknown> {
  return values as Record<AliasKey, unknown>
}

// スキーマに合う行を並びの順に取り出し、metadata はエイリアスのキーだけを持つ（正常系）
test('test_parse_aliases', () => {
  // 実行
  const result = parseAliases({ items: [TERM_ROW, COMMAND_ROW], schema: ALIAS_SCHEMA, path: 'aliases' })

  // 検証
  expect(result.aliases).toEqual([
    { id: 'terms', paths: ['terms/*.yaml'], metadata: { alias_type: customType('term') } },
    {
      id: 'commands',
      paths: ['docs/command.yaml'],
      records: 'commands',
      metadata: { alias_type: customType('command'), name: { type: 'ref', field: 'title' } },
    },
  ])
  expect(result.warnings).toEqual([])
})

// `enabled: false` の行は検証せずに飛ばす（正常系）
test('test_parse_aliases_when_disabled', () => {
  // 準備
  const disabled = { id: 'off', enabled: false, paths: ['terms/*.yaml'] }

  // 実行
  const result = parseAliases({ items: [disabled], schema: ALIAS_SCHEMA, path: 'aliases' })

  // 検証
  expect(result).toEqual({ aliases: [], warnings: [] })
})

// aliasTypeOnly のとき `alias_type` を持たない行は飛ばし、位置は元の並びで数える（正常系）
test('test_parse_aliases_when_alias_type_only', () => {
  // 準備
  const withoutMetadata = { id: 'doc-a', paths: ['docs/*.yaml'] }
  const withoutAliasType = { id: 'doc-b', paths: ['docs/*.yaml'], metadata: { tags: { type: 'ref', field: 'tags' } } }
  const invalid = {
    id: 'bad',
    paths: ['bad/*.yaml'],
    metadata: { alias_type: customType('term'), name: 'title' },
  }

  // 実行
  const result = parseAliases({
    items: [withoutMetadata, withoutAliasType, invalid],
    schema: ALIAS_SCHEMA,
    path: 'documents',
    aliasTypeOnly: true,
  })

  // 検証
  expect(result.aliases).toEqual([])
  expect(result.warnings.length).toBe(1)
  expect(result.warnings[0]).toMatch(/^documents\[2\]（id: bad）/)
})

// スキーマに合わない行は外し、位置と id つきの理由を残す（正常系）
test('test_parse_aliases_when_invalid', () => {
  // 準備
  const legacy = {
    id: 'urls',
    type: 'url',
    paths: ['urls/*.yaml'],
    fields: { id: 'id', match: ['name'], url: 'url' },
  }
  const unknownType = { id: 'memo', paths: ['memo/*.yaml'], metadata: { alias_type: customType('memo') } }
  const withoutId = { paths: ['terms/*.yaml'], metadata: { alias_type: customType('term') } }

  // 実行
  const result = parseAliases({
    items: [legacy, unknownType, withoutId, 'x'],
    schema: ALIAS_SCHEMA,
    path: 'global.aliases',
  })

  // 検証
  expect(result.aliases).toEqual([])
  expect(result.warnings.length).toBe(4)
  expect(result.warnings[0]).toMatch(/^global\.aliases\[0\]（id: urls）/)
  expect(result.warnings[0]).toContain('metadata')
  expect(result.warnings[1]?.startsWith('global.aliases[1]')).toBe(true)
  expect(result.warnings[2]?.startsWith('global.aliases[2]')).toBe(true)
  expect(result.warnings[3]?.startsWith('global.aliases[3]')).toBe(true)
})

// 後の重なった要素だけを外す（正常系）
test('test_dedupe_aliases', () => {
  // 準備
  const aliases = [
    { id: 'terms', order: 1 },
    { id: 'urls', order: 2 },
    { id: 'terms', order: 3 },
  ]

  // 実行
  const result = dedupeAliases(aliases)

  // 検証
  expect(result.aliases).toEqual([
    { id: 'terms', order: 1 },
    { id: 'urls', order: 2 },
  ])
  expect(result.warnings.length).toBe(1)
  expect(result.warnings[0]).toContain('terms')
})

// ref は列、custom は値、書かないキーは同じ名前の列から取る（正常系）
test('test_resolve_metadata', () => {
  // 準備
  const metadata = {
    alias_type: customType('term'),
    name: { type: 'ref', field: 'title' },
  } as AliasMetadata
  const document = { id: 'term-a', title: 'Term-A', name: 'x', description: 'd' }

  // 実行
  const values = resolveMetadata(metadata, document)

  // 検証
  expect(values.alias_type).toBe('term')
  expect(values.name).toBe('Term-A')
  expect(values.id).toBe('term-a')
  expect(values.description).toBe('d')
  expect(values.command).toBeUndefined()
})

// 種類の必須のキーで値が空のものを返す（正常系）
test('test_missing_keys', () => {
  // 準備
  const termValues = resolved({ id: 'term-a', name: 'Term-A', description: '' })
  const commandValues = resolved({ id: 1, name: 'セットアップ', command: 'uv sync' })

  // 実行
  const termMissing = missingKeys('term', termValues)
  const commandMissing = missingKeys('command', commandValues)

  // 検証
  expect(termMissing).toEqual(['description'])
  expect(commandMissing).toEqual([])
})

// env は url・port の 1 つ以上を求める（正常系）
test('test_missing_keys_when_env', () => {
  // 準備
  const portOnly = resolved({ id: 'env-a', name: 'Env-A', port: 5432 })
  const neither = resolved({ id: 'env-b', name: 'Env-B' })

  // 実行
  const portOnlyMissing = missingKeys('env', portOnly)
  const neitherMissing = missingKeys('env', neither)

  // 検証
  expect(portOnlyMissing).toEqual([])
  expect(neitherMissing).toEqual(['url', 'port'])
})

// 9 つの値だけを通す（正常系）
test('test_is_alias_type', () => {
  // 準備
  const values: unknown[] = ['term', 'avoid', 'memo', 1, undefined]

  // 実行
  const results = values.map((value) => isAliasType(value))

  // 検証
  expect(results).toEqual([true, true, false, false, false])
})
