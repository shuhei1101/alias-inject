import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { dedupeAliases, parseAliases } from '../../../../hooks/lib/alias'

// スキーマに合う term の要素（設定ファイルや dev-docs.yaml に書く形）
const TERM_ALIAS = {
  id: 'terms',
  type: 'term',
  paths: ['terms/*.yaml'],
  fields: { id: 'id', match: ['name', 'aliases'], description: 'description', related: 'related' },
}

// スキーマに合う command の要素。`enabled: true` を書く
const COMMAND_ALIAS = {
  id: 'commands',
  type: 'command',
  enabled: true,
  paths: ['docs/command/*.yaml'],
  fields: { id: 'id', match: ['name'], command: 'command', cwd: 'cwd' },
}

// スキーマに合う要素を並びの順に取り出す（正常系）
test('test_parse_aliases', () => {
  // 実行
  const result = parseAliases({ items: [TERM_ALIAS, COMMAND_ALIAS], schema: ALIAS_SCHEMA, path: 'aliases' })

  // 検証
  expect(result.aliases).toEqual([
    TERM_ALIAS,
    {
      id: 'commands',
      type: 'command',
      paths: ['docs/command/*.yaml'],
      fields: { id: 'id', match: ['name'], command: 'command', cwd: 'cwd' },
    },
  ])
  expect(result.warnings).toEqual([])
})

// `enabled: false` の要素は検証せずに飛ばす（正常系）
test('test_parse_aliases_when_disabled', () => {
  // 準備
  const disabled = { id: 'off', type: 'term', enabled: false, paths: ['terms/*.yaml'] }

  // 実行
  const result = parseAliases({ items: [disabled], schema: ALIAS_SCHEMA, path: 'aliases' })

  // 検証
  expect(result).toEqual({ aliases: [], warnings: [] })
})

// スキーマに合わない要素は外し、位置と id つきの理由を残す（正常系）
test('test_parse_aliases_when_invalid', () => {
  // 準備
  const withMcp = {
    id: 'bad',
    type: 'term',
    paths: ['terms/*.yaml'],
    fields: { id: 'id', match: ['name'], description: 'description', mcp: 'rule-inject' },
  }
  const withoutId = { type: 'term', paths: ['terms/*.yaml'], fields: TERM_ALIAS.fields }

  // 実行
  const result = parseAliases({ items: [withMcp, withoutId, 'x'], schema: ALIAS_SCHEMA, path: 'global.aliases' })

  // 検証
  expect(result.aliases).toEqual([])
  expect(result.warnings.length).toBe(3)
  expect(result.warnings[0]).toMatch(/^global\.aliases\[0\]（id: bad）/)
  expect(result.warnings[1]?.startsWith('global.aliases[1]')).toBe(true)
  expect(result.warnings[2]?.startsWith('global.aliases[2]')).toBe(true)
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
