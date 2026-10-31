import { expect, test } from 'claude-code/testing'
import type { ToolCallInput } from 'claude-code'
import type { Entry } from '../../../../hooks/lib/entry'
import type { Hit } from '../../../../hooks/lib/match'
import { collectArgumentStrings, documentPathOf, excludeReadingDocuments } from '../../../../hooks/lib/tool'

const HOME = '/home/u'
const SEARCH_DOCS = 'mcp__plugin_dev-docs_dev-docs__search_docs'

// テスト用の語。上書きしたいキーだけ渡す
function makeEntry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    aliasIndex: 0,
    itemIndex: 0,
    origin: '/repo/knowledge/dev-docs.yaml',
    aliasId: 'terms',
    type: 'term',
    id,
    word: id,
    keys: [id],
    fields: [],
    path: `/repo/knowledge/terms/${id}.yaml`,
    bodyFile: undefined,
    ...overrides,
  }
}

// 照合の結果の形にする
function makeHit(entry: Entry): Hit {
  return { entry, position: 0, length: entry.word.length, count: 1 }
}

// tool.call の入力の形にする
function toolInput(value: Record<string, unknown>): ToolCallInput {
  return value as unknown as ToolCallInput
}

// 入れ子のオブジェクトと並びの文字列を集め、予約したキーは集めない（正常系）
test('test_collect_argument_strings', () => {
  // 準備
  const e = toolInput({
    tool: SEARCH_DOCS,
    tool_use_id: 't1',
    agentId: 'agent-1',
    source: 'knowledge',
    filter: { and: [{ field: 'id', op: 'eq', values: ['term-a'] }] },
    limit: 5,
  })

  // 実行
  const strings = collectArgumentStrings(e)

  // 検証
  expect([...strings].sort()).toEqual(['eq', 'id', 'knowledge', 'term-a'])
})

// body_file の無い語は YAML のパス、ある語は語を取り出した YAML のフォルダから解決したパスにする（正常系）
test('test_document_path_of', () => {
  // 準備
  const yamlEntry = makeEntry('term-a')
  const bodyFileEntry = makeEntry('hooks', { path: '/repo/knowledge/hooks/files.yaml', bodyFile: 'hooks.json' })

  // 実行
  const yamlPath = documentPathOf(yamlEntry, { home: HOME })
  const bodyFilePath = documentPathOf(bodyFileEntry, { home: HOME })

  // 検証
  expect(yamlPath).toBe('/repo/knowledge/terms/term-a.yaml')
  expect(bodyFilePath).toBe('/repo/knowledge/hooks/hooks.json')
})

// Read は文書のパスが file_path と一致する語を外す（正常系）
test('test_exclude_reading_documents_when_read', () => {
  // 準備
  const hits = [makeHit(makeEntry('term-a')), makeHit(makeEntry('term-b'))]
  const e = toolInput({ tool: 'Read', tool_use_id: 't1', file_path: '/repo/knowledge/terms/term-a.yaml' })

  // 実行
  const remaining = excludeReadingDocuments(hits, { e, home: HOME })

  // 検証
  expect(remaining.map((hit) => hit.entry.id)).toEqual(['term-b'])
})

// MCP のツールは引数の文字列に ID がある語を外す（正常系）
test('test_exclude_reading_documents_when_mcp', () => {
  // 準備
  const hits = [makeHit(makeEntry('term-a')), makeHit(makeEntry('term-b'))]
  const e = toolInput({ tool: SEARCH_DOCS, tool_use_id: 't1', filter: { field: 'id', op: 'eq', values: ['term-a'] } })

  // 実行
  const remaining = excludeReadingDocuments(hits, { e, home: HOME })

  // 検証
  expect(remaining.map((hit) => hit.entry.id)).toEqual(['term-b'])
})

// Read と MCP 以外のツールは外さない（正常系）
test('test_exclude_reading_documents_when_other_tool', () => {
  // 準備
  const hits = [makeHit(makeEntry('term-a')), makeHit(makeEntry('term-b'))]
  const e = toolInput({ tool: 'Bash', tool_use_id: 't1', command: 'cat /repo/knowledge/terms/term-a.yaml' })

  // 実行
  const remaining = excludeReadingDocuments(hits, { e, home: HOME })

  // 検証
  expect(remaining.map((hit) => hit.entry.id)).toEqual(['term-a', 'term-b'])
})
