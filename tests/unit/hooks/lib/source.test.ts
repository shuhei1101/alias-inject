import { expect, test } from 'claude-code/testing'
import type { SourceConfig } from '../../../../hooks/lib/config'
import { clearCache } from '../../../../hooks/lib/loader'
import { SourceError, buildEntries, loadSourceEntries, parseItems } from '../../../../hooks/lib/source'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'

// テスト用のソースの設定。上書きしたいキーだけ渡す
function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    label: '用語',
    type: 'term',
    files: ['/d/term/*.yaml'],
    baseDir: 'config',
    id: 'id',
    words: ['name', 'aliases'],
    ...overrides,
  }
}

// 最上位のマッピングは 1 項目になる（正常系）
test('test_parse_items_when_mapping', () => {
  // 実行
  const items = parseItems({ id: 'term-a', name: 'Term-A' }, makeSource())

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
    makeSource(),
  )

  // 検証
  expect(items.length).toBe(2)
})

// ID か照合する語の無い項目と空の入力は外す（正常系）
test('test_parse_items_when_id_or_words_missing', () => {
  // 準備
  const values: unknown[] = [
    { name: 'Term-A' },
    { id: 'term-a', name: '' },
    { id: 'term-a', aliases: [] },
    null,
  ]

  // 実行
  const results = values.map((value) => parseItems(value, makeSource()))

  // 検証
  expect(results).toEqual([[], [], [], []])
})

// term は description と、名前を引いた related を並べる（正常系）
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
  const source = makeSource({ description: 'description', related: 'related' })

  // 実行
  const entries = buildEntries(items, source, 0)

  // 検証
  expect(entries[0]?.id).toBe('term-a')
  expect(entries[0]?.word).toBe('Term-A')
  expect(entries[0]?.keys).toEqual(['term-a', '用語エー'])
  expect(entries[0]?.fields).toEqual([
    { name: 'description', value: '説明 A' },
    { name: 'related', value: 'term-b（Term-B）, tpl-x' },
  ])
})

// command は command・cwd・description の順で、値のある列だけを並べる（正常系）
test('test_build_entries_when_command', () => {
  // 準備
  const items = [{ id: 'cmd-setup', name: 'セットアップ', command: 'uv sync', description: '依存を入れる' }]
  const source = makeSource({
    type: 'command',
    words: ['name'],
    command: 'command',
    cwd: 'cwd',
    description: 'description',
  })

  // 実行
  const entries = buildEntries(items, source, 0)

  // 検証
  expect(entries[0]?.fields).toEqual([
    { name: 'command', value: '`uv sync`' },
    { name: 'description', value: '依存を入れる' },
  ])
})

// doc は設定の mcp の値を、url は url の列を並べる（正常系）
test('test_build_entries_when_doc_and_url', () => {
  // 準備
  const docItems = [{ id: 'doc-a', name: 'Doc-A' }]
  const urlItems = [{ id: 'url-a', name: 'Url-A', url: 'https://example.com/a' }]

  // 実行
  const docEntries = buildEntries(docItems, makeSource({ type: 'doc', words: ['name'], mcp: 'rule-inject' }), 0)
  const urlEntries = buildEntries(urlItems, makeSource({ type: 'url', words: ['name'], url: 'url' }), 1)

  // 検証
  expect(docEntries[0]?.fields).toEqual([{ name: 'mcp', value: 'rule-inject' }])
  expect(urlEntries[0]?.fields).toEqual([{ name: 'url', value: 'https://example.com/a' }])
})

// glob に当たる全ての YAML の項目を語にする（正常系）
test('test_load_source_entries', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\n',
    '/d/term/term-b.yaml': 'id: term-b\nname: Term-B\n',
  })
  const { $ } = createFakeEngine({ fs })
  const source = { ...makeSource({ words: ['name'] }), patterns: ['/d/term/*.yaml'] }

  // 実行
  const entries = await loadSourceEntries($, source, 0)

  // 検証
  expect(entries.map((entry) => entry.word)).toEqual(['Term-A', 'Term-B'])
})

// 書式の誤った YAML があればパスつきで例外を投げる（異常系）
test('test_load_source_entries_when_yaml_malformed', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\n',
    '/d/term/term-b.yaml': 'id: [term-b\nname: Term-B\n',
  })
  const { $ } = createFakeEngine({ fs })
  const source = { ...makeSource({ words: ['name'] }), patterns: ['/d/term/*.yaml'] }

  // 実行
  const error = await loadSourceEntries($, source, 0).then(
    () => null,
    (thrown: unknown) => thrown,
  )

  // 検証
  expect(error).toBeInstanceOf(SourceError)
  expect((error as SourceError).path).toBe('/d/term/term-b.yaml')
  expect((error as SourceError).reason).toMatch(/\d+:\d+/)
})
