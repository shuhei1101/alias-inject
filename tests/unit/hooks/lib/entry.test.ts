import { expect, test } from 'claude-code/testing'
import type { ResolvedAlias } from '../../../../hooks/lib/alias'
import { buildEntries, loadAliasEntries, parseDocuments } from '../../../../hooks/lib/entry'
import type { SourceDocument } from '../../../../hooks/lib/entry'
import { clearCache } from '../../../../hooks/lib/loader'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'

const ORIGIN = '/home/u/.config/alias-inject/settings.yaml'

// テスト用の行。上書きしたいキーだけ渡す
function makeAlias(overrides: Partial<ResolvedAlias> = {}): ResolvedAlias {
  return {
    id: 'terms',
    paths: ['/d/term/*.yaml'],
    alias_type: 'term',
    metadata: {},
    origin: ORIGIN,
    patterns: ['/d/term/*.yaml'],
    ...overrides,
  }
}

// ファイルを 1 件の文書にしたときの文書
function fileDocument(value: Record<string, unknown>, path = '/d/term/doc.yaml'): SourceDocument {
  return { path, index: null, value }
}

// `records` の要素を文書にしたときの文書
function recordDocument(value: Record<string, unknown>, index: number, path = '/d/command.yaml'): SourceDocument {
  return { path, index, value }
}

// records の無い行は最上位のマッピングを 1 件の文書にする（正常系）
test('test_parse_documents_when_file', () => {
  // 実行
  const result = parseDocuments({ id: 'term-a', name: 'Term-A' }, undefined)

  // 検証
  expect(result.ok).toBe(true)
  expect(result.ok && result.documents.length).toBe(1)
})

// records の配列のマッピングの要素を文書にする（正常系）
test('test_parse_documents_when_records', () => {
  // 準備
  const value = { terms: [{ id: 'term-a' }, { id: 'term-b' }, 'text'] }

  // 実行
  const result = parseDocuments(value, 'terms')

  // 検証
  expect(result.ok).toBe(true)
  expect(result.ok && result.documents.length).toBe(2)
})

// 構造が合わなければ理由を返す（正常系）
test('test_parse_documents_when_unmatched', () => {
  // 準備
  const cases: [unknown, string | undefined, string][] = [
    [['term-a'], undefined, '最上位がマッピングではありません'],
    [null, undefined, '最上位がマッピングではありません'],
    [{ other: [] }, 'terms', 'terms の並びがありません'],
    [{ terms: 'text' }, 'terms', 'terms の並びがありません'],
  ]

  // 実行・検証
  for (const [value, records, reason] of cases) {
    const result = parseDocuments(value, records)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe(reason)
  }
})

// term は name を語にし、description と名前を引いた related を並べる（正常系）
test('test_build_entries_when_term', () => {
  // 準備
  const documents = [
    fileDocument({
      id: 'term-a',
      name: 'Term-A',
      aliases: ['用語エー'],
      description: '説明 A',
      related: [{ to: 'term-b' }, { to: 'tpl-x' }],
    }),
    fileDocument({ id: 'term-b', name: 'Term-B', description: '説明 B' }),
  ]

  // 実行
  const { entries, failures } = buildEntries(documents, makeAlias(), 2)

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
  expect(failures).toEqual([])
})

// metadata が指す列から値を取り、type は行の alias_type にする（正常系）
test('test_build_entries_when_metadata_column', () => {
  // 準備
  const alias = makeAlias({
    alias_type: 'command',
    metadata: { name: 'title', description: 'meta.summary' },
  })
  const documents = [
    fileDocument({ id: 'sync', title: 'Sync', command: 'uv sync', meta: { summary: '依存を入れる' } }),
  ]

  // 実行
  const { entries } = buildEntries(documents, alias, 0)

  // 検証
  expect(entries[0]?.type).toBe('command')
  expect(entries[0]?.word).toBe('Sync')
  expect(entries[0]?.fields).toEqual([
    { name: 'command', value: '`uv sync`' },
    { name: 'description', value: '依存を入れる' },
  ])
})

// name が空なら、ファイルの文書はファイル名、records の要素は body_file の列のファイル名、それも空なら id を語にする（正常系）
test('test_build_entries_when_name_missing', () => {
  // 準備
  const documents = [
    fileDocument({ id: 'term-b', description: '説明 B' }, '/d/term/term-b.yaml'),
    recordDocument({ id: 'doc-a', path: 'docs/使い方/セットアップ.md', description: '説明 C' }, 0, '/d/files.yaml'),
    recordDocument({ id: 'cmd-a', name: '', description: '説明 D' }, 1, '/d/files.yaml'),
  ]

  // 実行
  const { entries } = buildEntries(documents, makeAlias({ records: 'files', body_file: 'path' }), 0)

  // 検証
  expect(entries.map((entry) => entry.word)).toEqual(['term-b', 'セットアップ', 'cmd-a'])
  expect(entries.map((entry) => entry.bodyFile)).toEqual([undefined, 'docs/使い方/セットアップ.md', undefined])
  expect(entries.map((entry) => entry.path)).toEqual(['/d/term/term-b.yaml', '/d/files.yaml', '/d/files.yaml'])
})

// 必須の値が空の文書は外し、理由を返す（正常系）
test('test_build_entries_when_required_missing', () => {
  // 準備
  const documents = [
    fileDocument({ id: 'term-n', name: 'Term-N' }, '/d/term-n.yaml'),
    recordDocument({ name: 'No-Id' }, 1, '/d/terms.yaml'),
  ]

  // 実行
  const { entries, failures } = buildEntries(documents, makeAlias({ records: 'terms' }), 0)

  // 検証
  expect(entries).toEqual([])
  expect(failures.length).toBe(2)
  expect(failures[0]?.path).toBe('/d/term-n.yaml')
  expect(failures[0]?.reason).toContain('term-n: description が空です')
  expect(failures[1]?.path).toBe('/d/terms.yaml')
  expect(failures[1]?.reason).toContain('terms[1]: id、description が空です')
})

// command は command・cwd・description の順で、値のある列だけを並べる（正常系）
test('test_build_entries_when_command', () => {
  // 準備
  const documents = [
    fileDocument({ id: 'cmd-setup', name: 'セットアップ', command: 'uv sync', description: '依存を入れる' }),
  ]
  const alias = makeAlias({ alias_type: 'command' })

  // 実行
  const { entries } = buildEntries(documents, alias, 0)

  // 検証
  expect(entries[0]?.fields).toEqual([
    { name: 'command', value: '`uv sync`' },
    { name: 'description', value: '依存を入れる' },
  ])
})

// doc は description だけを、url は url・description を並べる（正常系）
test('test_build_entries_when_doc_and_url', () => {
  // 準備
  const docDocuments = [fileDocument({ id: 'doc-a', name: 'Doc-A', description: '文書 A', mcp: 'rule-inject' })]
  const urlDocuments = [fileDocument({ id: 'url-a', name: 'Url-A', url: 'https://example.com/a' })]

  // 実行
  const docEntries = buildEntries(docDocuments, makeAlias({ alias_type: 'doc' }), 0).entries
  const urlEntries = buildEntries(urlDocuments, makeAlias({ alias_type: 'url' }), 1).entries

  // 検証
  expect(docEntries[0]?.fields).toEqual([{ name: 'description', value: '文書 A' }])
  expect(urlEntries[0]?.fields).toEqual([{ name: 'url', value: 'https://example.com/a' }])
})

// skill・tool・path は値をバッククォートで囲んだ列と description を並べる（正常系）
test('test_build_entries_when_skill_tool_path', () => {
  // 準備
  const skillDocuments = [
    fileDocument({ id: 'skill-a', name: 'Skill-A', skill: 'code-review', description: 'レビューする' }),
  ]
  const toolDocuments = [
    fileDocument({ id: 'tool-a', name: 'Tool-A', tool: 'search_design_docs', description: '設計書を引く' }),
  ]
  const pathDocuments = [
    fileDocument({ id: 'path-a', name: 'Path-A', path: '~/.config/ai-monitor/settings.yaml', description: '設定' }),
  ]

  // 実行
  const skillEntries = buildEntries(skillDocuments, makeAlias({ alias_type: 'skill' }), 0).entries
  const toolEntries = buildEntries(toolDocuments, makeAlias({ alias_type: 'tool' }), 1).entries
  const pathEntries = buildEntries(pathDocuments, makeAlias({ alias_type: 'path' }), 2).entries

  // 検証
  expect(skillEntries[0]?.fields).toEqual([
    { name: 'skill', value: '`code-review`' },
    { name: 'description', value: 'レビューする' },
  ])
  expect(toolEntries[0]?.fields).toEqual([
    { name: 'tool', value: '`search_design_docs`' },
    { name: 'description', value: '設計書を引く' },
  ])
  expect(pathEntries[0]?.fields).toEqual([
    { name: 'path', value: '`~/.config/ai-monitor/settings.yaml`' },
    { name: 'description', value: '設定' },
  ])
})

// env は url・port・description の順で値のある列だけを、avoid は replacement を並べる（正常系）
test('test_build_entries_when_env_and_avoid', () => {
  // 準備
  const envDocuments = [
    fileDocument({ id: 'env-a', name: 'Env-A', url: 'http://127.0.0.1:8000', port: 8000, description: '開発サーバー' }),
    fileDocument({ id: 'env-b', name: 'Env-B', port: 5432 }),
  ]
  const avoidDocuments = [fileDocument({ id: 'avoid-a', name: '旧用語', replacement: 'term-a' })]

  // 実行
  const envEntries = buildEntries(envDocuments, makeAlias({ alias_type: 'env' }), 0).entries
  const avoidEntries = buildEntries(avoidDocuments, makeAlias({ alias_type: 'avoid' }), 1).entries

  // 検証
  expect(envEntries[0]?.fields).toEqual([
    { name: 'url', value: 'http://127.0.0.1:8000' },
    { name: 'port', value: '8000' },
    { name: 'description', value: '開発サーバー' },
  ])
  expect(envEntries[1]?.fields).toEqual([{ name: 'port', value: '5432' }])
  expect(avoidEntries[0]?.fields).toEqual([{ name: 'replacement', value: 'term-a' }])
})

// glob に当たる全ての YAML を 1 件ずつの文書にして語にする（正常系）
test('test_load_alias_entries', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\ndescription: 説明 A\n',
    '/d/term/term-b.yaml': 'id: term-b\nname: Term-B\ndescription: 説明 B\n',
  })
  const { $ } = createFakeEngine({ fs })

  // 実行
  const result = await loadAliasEntries($, makeAlias(), 0)

  // 検証
  expect(result.entries.map((entry) => entry.word)).toEqual(['Term-A', 'Term-B'])
  expect(
    result.entries.every((entry) => entry.origin === ORIGIN && entry.aliasId === 'terms' && entry.type === 'term'),
  ).toBe(true)
  expect(result.failures).toEqual([])
})

// records を書いた行はその配列の要素を文書にする（正常系）
test('test_load_alias_entries_when_records', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({
    '/d/command.yaml': [
      'commands:',
      '  - id: cmd-a',
      '    name: Sync',
      '    command: uv sync',
      '  - id: cmd-b',
      '    name: Test',
      '    command: uv run pytest',
      '',
    ].join('\n'),
  })
  const { $ } = createFakeEngine({ fs })
  const alias = makeAlias({
    records: 'commands',
    alias_type: 'command',
    paths: ['/d/command.yaml'],
    patterns: ['/d/command.yaml'],
  })

  // 実行
  const result = await loadAliasEntries($, alias, 0)

  // 検証
  expect(result.entries.map((entry) => entry.word)).toEqual(['Sync', 'Test'])
  expect(result.entries.map((entry) => entry.itemIndex)).toEqual([0, 1])
})

// 書式の誤った YAML・records の配列の無い YAML だけを外し、パスと理由を返す（正常系）
test('test_load_alias_entries_when_yaml_malformed', async () => {
  // 準備
  clearCache()
  const malformedFs = new MemoryFs({
    '/d/term/term-a.yaml': 'id: term-a\nname: Term-A\ndescription: 説明 A\n',
    '/d/term/term-b.yaml': 'id: [term-b\nname: Term-B\n',
  })
  const noRecordsFs = new MemoryFs({ '/d/terms.yaml': 'other:\n  - id: term-a\n' })
  const noRecordsAlias = makeAlias({ records: 'terms', paths: ['/d/terms.yaml'], patterns: ['/d/terms.yaml'] })

  // 実行
  const malformed = await loadAliasEntries(createFakeEngine({ fs: malformedFs }).$, makeAlias(), 0)
  clearCache()
  const noRecords = await loadAliasEntries(createFakeEngine({ fs: noRecordsFs }).$, noRecordsAlias, 0)

  // 検証
  expect(malformed.entries.map((entry) => entry.word)).toEqual(['Term-A'])
  expect(malformed.failures.length).toBe(1)
  expect(malformed.failures[0]?.path).toBe('/d/term/term-b.yaml')
  expect(malformed.failures[0]?.reason).toMatch(/\d+:\d+/)
  expect(noRecords.entries).toEqual([])
  expect(noRecords.failures).toEqual([{ path: '/d/terms.yaml', reason: 'terms の並びがありません' }])
})
