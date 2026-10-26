import { expect, test } from 'claude-code/testing'
import type { AliasFields, ResolvedAlias } from '../../../../hooks/lib/alias'
import { buildEntries, loadAliasEntries, parseItems } from '../../../../hooks/lib/entry'
import { clearCache } from '../../../../hooks/lib/loader'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'

const ORIGIN = '/home/u/.config/alias-inject/settings.yaml'

// テスト用の term の列の対応。上書きしたいキーだけ渡す
function makeFields(overrides: Partial<AliasFields> = {}): AliasFields {
  return { id: 'id', match: ['name', 'aliases'], description: 'description', ...overrides }
}

// テスト用の aliases の要素。上書きしたいキーだけ渡す
function makeAlias(overrides: Partial<ResolvedAlias> = {}): ResolvedAlias {
  return {
    id: 'terms',
    type: 'term',
    paths: ['/d/term/*.yaml'],
    fields: makeFields(),
    origin: ORIGIN,
    patterns: ['/d/term/*.yaml'],
    ...overrides,
  }
}

// 最上位のマッピングは 1 項目になる（正常系）
test('test_parse_items_when_mapping', () => {
  // 実行
  const items = parseItems({ id: 'term-a', name: 'Term-A' }, makeFields({ match: ['name'] }))

  // 検証
  expect(items.length).toBe(1)
})

// 最上位の並びはマッピングの要素ごとに 1 項目になる（正常系）
test('test_parse_items_when_sequence', () => {
  // 実行
  const items = parseItems(
    [
      { id: 'term-a', name: 'Term-A' },
      { id: 'term-b', name: 'Term-B' },
      'text',
    ],
    makeFields({ match: ['name'] }),
  )

  // 検証
  expect(items.length).toBe(2)
})

// ID か照合する語の無い項目と空の入力は外す（正常系）
test('test_parse_items_when_id_or_match_missing', () => {
  // 準備
  const values: unknown[] = [
    { name: 'Term-A' },
    { id: 'term-a', name: '' },
    { id: 'term-a', aliases: [] },
    null,
  ]

  // 実行
  const results = values.map((value) => parseItems(value, makeFields()))

  // 検証
  expect(results).toEqual([[], [], [], []])
})

// term は title を語にし、description と名前を引いた related を並べる（正常系）
test('test_build_entries_when_term', () => {
  // 準備
  const items = [
    {
      id: 'term-a',
      name: 'Term-A',
      aliases: ['用語エー'],
      description: '説明 A',
      related: [{ to: 'term-b' }, { to: 'tpl-x' }],
    },
    { id: 'term-b', name: 'Term-B' },
  ]
  const alias = makeAlias({ fields: makeFields({ title: 'name', related: 'related' }) })

  // 実行
  const entries = buildEntries(items, alias, 2)

  // 検証
  expect(entries[0]?.id).toBe('term-a')
  expect(entries[0]?.word).toBe('Term-A')
  expect(entries[0]?.keys).toEqual(['term-a', '用語エー'])
  expect(entries[0]?.fields).toEqual([
    { name: 'description', value: '説明 A' },
    { name: 'related', value: 'term-b（Term-B）, tpl-x' },
  ])
  expect(entries[0]?.aliasIndex).toBe(2)
  expect(entries[0]?.origin).toBe(ORIGIN)
  expect(entries[0]?.aliasId).toBe('terms')
  expect(entries[0]?.type).toBe('term')
})

// title の列が無い・値が空なら、照合する最初の語を語にする（正常系）
test('test_build_entries_when_title_missing', () => {
  // 準備
  const items = [{ id: 'term-a', name: '', aliases: ['用語エー'], description: '説明 A' }]
  const withoutTitle = makeAlias()
  const emptyTitle = makeAlias({ fields: makeFields({ title: 'name' }) })

  // 実行
  const withoutTitleEntries = buildEntries(items, withoutTitle, 0)
  const emptyTitleEntries = buildEntries(items, emptyTitle, 0)

  // 検証
  expect(withoutTitleEntries[0]?.word).toBe('用語エー')
  expect(emptyTitleEntries[0]?.word).toBe('用語エー')
})

// command は command・cwd・description の順で、値のある列だけを並べる（正常系）
test('test_build_entries_when_command', () => {
  // 準備
  const items = [{ id: 'cmd-setup', name: 'セットアップ', command: 'uv sync', description: '依存を入れる' }]
  const alias = makeAlias({
    type: 'command',
    fields: { id: 'id', match: ['name'], command: 'command', cwd: 'cwd', description: 'description' },
  })

  // 実行
  const entries = buildEntries(items, alias, 0)

  // 検証
  expect(entries[0]?.fields).toEqual([
    { name: 'command', value: '`uv sync`' },
    { name: 'description', value: '依存を入れる' },
  ])
})

// doc は description だけを、url は url・description を並べる（正常系）
test('test_build_entries_when_doc_and_url', () => {
  // 準備
  const docItems = [{ id: 'doc-a', name: 'Doc-A', description: '文書 A', mcp: 'rule-inject' }]
  const urlItems = [{ id: 'url-a', name: 'Url-A', url: 'https://example.com/a' }]
  const docAlias = makeAlias({ type: 'doc', fields: { id: 'id', match: ['name'], description: 'description' } })
  const urlAlias = makeAlias({ type: 'url', fields: { id: 'id', match: ['name'], url: 'url' } })

  // 実行
  const docEntries = buildEntries(docItems, docAlias, 0)
  const urlEntries = buildEntries(urlItems, urlAlias, 1)

  // 検証
  expect(docEntries[0]?.fields).toEqual([{ name: 'description', value: '文書 A' }])
  expect(urlEntries[0]?.fields).toEqual([{ name: 'url', value: 'https://example.com/a' }])
})

// glob に当たる全ての YAML の項目を語にする（正常系）
test('test_load_alias_entries', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\ndescription: 説明 A\n',
    '/d/term/term-b.yaml': 'id: term-b\nname: Term-B\ndescription: 説明 B\n',
  })
  const { $ } = createFakeEngine({ fs })
  const alias = makeAlias({ fields: makeFields({ match: ['name'] }) })

  // 実行
  const result = await loadAliasEntries($, alias, 0)

  // 検証
  expect(result.entries.map((entry) => entry.word)).toEqual(['Term-A', 'Term-B'])
  expect(result.entries.every((entry) => entry.origin === ORIGIN && entry.aliasId === 'terms' && entry.type === 'term')).toBe(true)
  expect(result.failures).toEqual([])
})

// 書式の誤った YAML だけを外し、パスと理由を返す（正常系）
test('test_load_alias_entries_when_yaml_malformed', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\ndescription: 説明 A\n',
    '/d/term/term-b.yaml': 'id: [term-b\nname: Term-B\n',
  })
  const { $ } = createFakeEngine({ fs })
  const alias = makeAlias({ fields: makeFields({ match: ['name'] }) })

  // 実行
  const result = await loadAliasEntries($, alias, 0)

  // 検証
  expect(result.entries.map((entry) => entry.word)).toEqual(['Term-A'])
  expect(result.failures.length).toBe(1)
  expect(result.failures[0]?.path).toBe('/d/term/term-b.yaml')
  expect(result.failures[0]?.reason).toMatch(/\d+:\d+/)
})
