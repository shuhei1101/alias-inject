import { expect, test } from 'claude-code/testing'
import { entryKey, renderContext, selectEntries } from '../../../../hooks/lib/context'
import type { Hit } from '../../../../hooks/lib/match'
import type { Entry } from '../../../../hooks/lib/source'

const HEADING = 'この発言に出る用語'

// テスト用の語。説明を渡すと description の列を持つ
function makeEntry(id: string, options: { sourceIndex?: number; label?: string; description?: string } = {}): Entry {
  return {
    sourceIndex: options.sourceIndex ?? 0,
    itemIndex: 0,
    label: options.label ?? '用語',
    id,
    word: id,
    keys: [id],
    fields: options.description === undefined ? [] : [{ name: 'description', value: options.description }],
  }
}

// 照合の結果の形にする
function makeHit(entry: Entry, position: number): Hit {
  return { entry, position, length: entry.word.length }
}

const LIMITS = { heading: HEADING, maxItems: 20, maxChars: 4000 }

// label と ID の組が違えばキーも違う（正常系）
test('test_entry_key', () => {
  // 準備
  const first = makeEntry('c', { label: 'a b' })
  const second = makeEntry('b c', { label: 'a' })

  // 実行
  const keys = [entryKey(first), entryKey(second)]

  // 検証
  expect(keys[0]).not.toBe(keys[1])
})

// 見出し・ソースごとのセクション・語ごとの箇条書きの Markdown にする（正常系）
test('test_render_context', () => {
  // 準備
  const usecase: Entry = {
    sourceIndex: 0,
    itemIndex: 0,
    label: 'knowledge の用語',
    id: 'term-single-usecase',
    word: '単一ユースケース',
    keys: ['単一ユースケース'],
    fields: [
      { name: 'description', value: '1 つの操作を始めから終わりまで書くシナリオの単位' },
      { name: 'related', value: 'tpl-scenario（シナリオのテンプレート）' },
    ],
  }
  const setup: Entry = {
    sourceIndex: 1,
    itemIndex: 0,
    label: 'ai-monitor のコマンド',
    id: 'cmd-setup',
    word: 'セットアップ',
    keys: ['セットアップ'],
    fields: [
      { name: 'command', value: '`uv sync`' },
      { name: 'cwd', value: '/mnt/c/Users/shuhe/repo/ai-monitor' },
      { name: 'description', value: '依存を入れる' },
    ],
  }

  // 実行
  const text = renderContext(HEADING, [usecase, setup])

  // 検証
  expect(text).toBe(
    [
      '# この発言に出る用語',
      '',
      '## knowledge の用語',
      '',
      '- 単一ユースケース（id: term-single-usecase）',
      '  - description: 1 つの操作を始めから終わりまで書くシナリオの単位',
      '  - related: tpl-scenario（シナリオのテンプレート）',
      '',
      '## ai-monitor のコマンド',
      '',
      '- セットアップ（id: cmd-setup）',
      '  - command: `uv sync`',
      '  - cwd: /mnt/c/Users/shuhe/repo/ai-monitor',
      '  - description: 依存を入れる',
    ].join('\n'),
  )
})

// 同じ語が別のソースにあれば両方のセクションに並べる（正常系）
test('test_render_context_when_same_word_in_sources', () => {
  // 準備
  const later = makeEntry('term-a', { sourceIndex: 1, label: '後のソース' })
  const earlier = makeEntry('term-a', { sourceIndex: 0, label: '前のソース' })

  // 実行
  const text = renderContext(HEADING, [later, earlier])

  // 検証
  expect(text.indexOf('## 前のソース')).toBeLessThan(text.indexOf('## 後のソース'))
  expect(text.split('- term-a（id: term-a）').length - 1).toBe(2)
})

// 記録済みの語を除いて選ぶ（正常系）
test('test_select_entries', () => {
  // 準備
  const termA = makeEntry('term-a')
  const termB = makeEntry('term-b')
  const hits = [makeHit(termA, 0), makeHit(termB, 10)]

  // 実行
  const selection = selectEntries(hits, new Set([entryKey(termA)]), { limits: LIMITS })

  // 検証
  expect(selection?.keys).toEqual([entryKey(termB)])
  expect(selection?.text).toContain('term-b')
  expect(selection?.text).not.toContain('term-a')
})

// maxItems 語で止める（正常系）
test('test_select_entries_when_over_item_limit', () => {
  // 準備
  const entries = ['term-a', 'term-b', 'term-c'].map((id) => makeEntry(id))
  const hits = entries.map((entry, index) => makeHit(entry, index * 10))

  // 実行
  const selection = selectEntries(hits, new Set(), { limits: { ...LIMITS, maxItems: 2 } })

  // 検証
  expect(selection?.keys).toEqual([entryKey(entries[0]!), entryKey(entries[1]!)])
})

// 足すと maxChars を超える語を飛ばし、後ろの収まる語を足す（正常系）
test('test_select_entries_when_over_char_limit', () => {
  // 準備
  const termA = makeEntry('term-a', { description: '短い説明' })
  const termLong = makeEntry('term-long', { description: 'あ'.repeat(500) })
  const termB = makeEntry('term-b', { description: '短い説明' })
  const hits = [makeHit(termA, 0), makeHit(termLong, 10), makeHit(termB, 20)]

  // 実行
  const selection = selectEntries(hits, new Set(), { limits: { ...LIMITS, maxChars: 300 } })

  // 検証
  expect(selection?.keys).toEqual([entryKey(termA), entryKey(termB)])
  expect([...(selection?.text ?? '')].length).toBeLessThanOrEqual(300)
})

// 選ぶ語が無ければ null を返す（正常系）
test('test_select_entries_when_nothing_selected', () => {
  // 準備
  const termA = makeEntry('term-a')

  // 実行
  const noHits = selectEntries([], new Set(), { limits: LIMITS })
  const allRecorded = selectEntries([makeHit(termA, 0)], new Set([entryKey(termA)]), { limits: LIMITS })
  const headingOnly = selectEntries([makeHit(termA, 0)], new Set(), { limits: { ...LIMITS, maxChars: 5 } })

  // 検証
  expect(noHits).toBeNull()
  expect(allRecorded).toBeNull()
  expect(headingOnly).toBeNull()
})
