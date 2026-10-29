import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { dedupeAliases, missingKeys, parseAliases, resolveMetadata } from '../../../../hooks/lib/alias'
import type { AliasKey, AliasMetadata } from '../../../../hooks/lib/alias'

// スキーマに合う term の行（設定ファイルや dev-docs.yaml の documents に記載する構造）。
// 行の `enabled` と `schema`、`metadata` の `tags` はエイリアスの元の行が持たないキーで、取り出すときに外れる
const TERM_ROW = {
  id: 'terms',
  enabled: true,
  schema: 'terms.schema.yaml',
  paths: ['terms/*.yaml'],
  alias_type: 'term',
  metadata: { tags: 'tags' },
}

// スキーマに合う doc の行。`records` と `body_file` と、列から取る `name` を持つ
const DOC_ROW = {
  id: 'guides',
  paths: ['docs/files.yaml'],
  alias_type: 'doc',
  records: 'files',
  body_file: 'path',
  metadata: { name: 'title' },
}

// 解決した値の表。書いたキー以外は持たない
function resolved(values: Record<string, unknown>): Record<AliasKey, unknown> {
  return values as Record<AliasKey, unknown>
}

// スキーマに合う行を並びの順に取り出し、metadata はエイリアスのキーだけを持つ（正常系）
test('test_parse_aliases', () => {
  // 実行
  const result = parseAliases({ items: [TERM_ROW, DOC_ROW], schema: ALIAS_SCHEMA, path: 'aliases' })

  // 検証
  expect(result.aliases).toEqual([
    { id: 'terms', paths: ['terms/*.yaml'], alias_type: 'term', metadata: {} },
    {
      id: 'guides',
      paths: ['docs/files.yaml'],
      alias_type: 'doc',
      records: 'files',
      body_file: 'path',
      metadata: { name: 'title' },
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

// aliasTypeOnly のとき alias_type を持たない行は飛ばし、metadata.alias_type を持つ行は旧い構造として外す。位置は元の並びで数える（正常系）
test('test_parse_aliases_when_alias_type_only', () => {
  // 準備
  const withoutMetadata = { id: 'doc-a', paths: ['docs/*.yaml'] }
  const withoutAliasType = { id: 'doc-b', paths: ['docs/*.yaml'], metadata: { tags: 'tags' } }
  const old = {
    id: 'old',
    paths: ['old/*.yaml'],
    metadata: { alias_type: { type: 'custom', value: 'term' } },
  }
  const invalid = { id: 'bad', paths: ['bad/*.yaml'], alias_type: 'term', metadata: { name: '' } }

  // 実行
  const result = parseAliases({
    items: [withoutMetadata, withoutAliasType, old, invalid],
    schema: ALIAS_SCHEMA,
    path: 'documents',
    aliasTypeOnly: true,
  })

  // 検証
  expect(result.aliases).toEqual([])
  expect(result.warnings.length).toBe(2)
  expect(result.warnings[0]).toMatch(/^documents\[2\]（id: old）/)
  expect(result.warnings[0]).toContain('metadata.alias_type')
  expect(result.warnings[1]).toMatch(/^documents\[3\]（id: bad）/)
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
  const metadataAliasType = {
    id: 'old-terms',
    paths: ['old/*.yaml'],
    metadata: { alias_type: { type: 'custom', value: 'term' } },
  }
  const unknownType = { id: 'memo', paths: ['memo/*.yaml'], alias_type: 'memo' }
  const refName = {
    id: 'ref-name',
    paths: ['terms/*.yaml'],
    alias_type: 'term',
    metadata: { name: { type: 'ref', field: 'title' } },
  }

  // 実行
  const result = parseAliases({
    items: [legacy, metadataAliasType, unknownType, refName, 'x'],
    schema: ALIAS_SCHEMA,
    path: 'global.aliases',
  })

  // 検証
  expect(result.aliases).toEqual([])
  expect(result.warnings.length).toBe(5)
  expect(result.warnings[0]).toMatch(/^global\.aliases\[0\]（id: urls）/)
  expect(result.warnings[1]?.startsWith('global.aliases[1]')).toBe(true)
  expect(result.warnings[2]?.startsWith('global.aliases[2]')).toBe(true)
  expect(result.warnings[3]?.startsWith('global.aliases[3]')).toBe(true)
  expect(result.warnings[4]?.startsWith('global.aliases[4]')).toBe(true)
  for (const warning of result.warnings.slice(0, 3)) expect(warning).toContain('alias_type')
  expect(result.warnings[3]).toContain('metadata.name')
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

// 書いたキーは指した列、書かないキーは同じ名前の列から取る（正常系）
test('test_resolve_metadata', () => {
  // 準備
  const metadata: AliasMetadata = { name: 'title' }
  const document = { id: 'term-a', title: 'Term-A', name: 'x', description: 'd' }

  // 実行
  const values = resolveMetadata(metadata, document)

  // 検証
  expect(values.name).toBe('Term-A')
  expect(values.id).toBe('term-a')
  expect(values.description).toBe('d')
  expect(values.command).toBeUndefined()
})

// `.` でつないだ列の名前は入れ子の列をたどる（正常系）
test('test_resolve_metadata_when_nested', () => {
  // 準備
  const metadata: AliasMetadata = { description: 'meta.summary', url: 'meta.link.href' }
  const document = { meta: { summary: 's', link: 'x' } }

  // 実行
  const values = resolveMetadata(metadata, document)

  // 検証
  expect(values.description).toBe('s')
  expect(values.url).toBeUndefined()
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
