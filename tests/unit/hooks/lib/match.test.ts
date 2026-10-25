import { expect, test } from 'claude-code/testing'
import { findHits, normalize } from '../../../../hooks/lib/match'
import type { Entry } from '../../../../hooks/lib/source'

// テスト用の語。照合に使う `keys` は正規化済みで渡す
function makeEntry(id: string, word: string, keys: string[], itemIndex = 0): Entry {
  return { sourceIndex: 0, itemIndex, label: '用語', id, word, keys, fields: [] }
}

// 全角・大文字・前後の空白をそろえる（正常系）
test('test_normalize', () => {
  // 実行
  const fullWidth = normalize('　Ｔｅｒｍ－Ａ ')
  const halfWidthKana = normalize('ﾊﾟﾝ')

  // 検証
  expect(fullWidth).toBe('term-a')
  expect(halfWidthKana).toBe('パン')
})

// 入力に先に出た語から並べる（正常系）
test('test_find_hits', () => {
  // 準備
  const termA = makeEntry('term-a', 'Term-A', ['term-a', '用語エー'])
  const termB = makeEntry('term-b', 'Term-B', ['term-b'], 1)

  // 実行
  const hits = findHits('term-b と 用語エー の違い', [termA, termB], [])

  // 検証
  expect(hits.map((hit) => hit.entry.id)).toEqual(['term-b', 'term-a'])
})

// 同じ位置なら長い語が先になる（正常系）
test('test_find_hits_when_same_position', () => {
  // 準備
  const short = makeEntry('review', 'レビュー', ['レビュー'])
  const long = makeEntry('review-thread', 'レビュースレッド', ['レビュースレッド'], 1)

  // 実行
  const hits = findHits('レビュースレッドの扱い', [short, long], [])

  // 検証
  expect(hits.map((hit) => hit.entry.id)).toEqual(['review-thread', 'review'])
})

// exclude の語は照合しない（正常系）
test('test_find_hits_when_excluded', () => {
  // 準備
  const termA = makeEntry('term-a', 'Term-A', ['term-a', '用語エー'])
  const text = 'term-a と用語エー'

  // 実行
  const hits = findHits(text, [termA], ['ＴＥＲＭ－Ａ'])

  // 検証
  expect(hits.length).toBe(1)
  expect(hits[0]?.position).toBe(text.indexOf('用語エー'))
})

// 当たる語が無ければ空を返す（正常系）
test('test_find_hits_when_no_match', () => {
  // 準備
  const termA = makeEntry('term-a', 'Term-A', ['term-a', '用語エー'])

  // 実行
  const hits = findHits('こんにちは', [termA], [])

  // 検証
  expect(hits).toEqual([])
})
