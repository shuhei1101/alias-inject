import { expect, test } from 'claude-code/testing'
import {
  clearCache,
  expandFiles,
  expandHome,
  matchSegment,
  parentDir,
  parseYaml,
  readIfChanged,
  resolvePath,
} from '../../../../hooks/lib/loader'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'

// 先頭の `~/` をホームに展開する（正常系）
test('test_expand_home', () => {
  // 実行
  const result = expandHome({ path: '~/.config/a.yaml', home: '/home/u' })

  // 検証
  expect(result).toBe('/home/u/.config/a.yaml')
})

// `~` だけはホームになる（正常系）
test('test_expand_home_when_tilde_only', () => {
  // 実行
  const result = expandHome({ path: '~', home: '/home/u' })

  // 検証
  expect(result).toBe('/home/u')
})

// `~` で始まらないパスと `~user` は変えない（正常系）
test('test_expand_home_when_not_tilde', () => {
  // 実行
  const absolute = expandHome({ path: '/etc/a.yaml', home: '/home/u' })
  const otherUser = expandHome({ path: '~other/a.yaml', home: '/home/u' })

  // 検証
  expect(absolute).toBe('/etc/a.yaml')
  expect(otherUser).toBe('~other/a.yaml')
})

// 相対パスを基準のフォルダから解決する（正常系）
test('test_resolve_path', () => {
  // 実行
  const result = resolvePath({ path: './docs/command/*.yaml', home: '/home/u', baseDir: '/repo/sample/' })

  // 検証
  expect(result).toBe('/repo/sample/docs/command/*.yaml')
})

// 絶対パスと `~` は基準のフォルダを使わない（正常系）
test('test_resolve_path_when_absolute', () => {
  // 実行
  const absolute = resolvePath({ path: '/a/b.yaml', home: '/home/u', baseDir: '/repo/sample' })
  const home = resolvePath({ path: '~/b.yaml', home: '/home/u', baseDir: '/repo/sample' })

  // 検証
  expect(absolute).toBe('/a/b.yaml')
  expect(home).toBe('/home/u/b.yaml')
})

// `.`・`..` の区切りを畳む（正常系）
test('test_resolve_path_when_dot_segments', () => {
  // 実行
  const relative = resolvePath({
    path: '../knowledge/./dev-docs.yaml',
    home: '/home/u',
    baseDir: '/home/u/.config/alias-inject',
  })
  const aboveRoot = resolvePath({ path: '/../a/**/*.yaml', home: '/home/u', baseDir: '/repo/sample' })

  // 検証
  expect(relative).toBe('/home/u/.config/knowledge/dev-docs.yaml')
  expect(aboveRoot).toBe('/a/**/*.yaml')
})

// `*` が任意の文字列に当たる（正常系）
test('test_match_segment', () => {
  // 実行
  const results = ['term-a.yaml', 'term-.yaml', 'rule-a.yaml', 'term-a.yml'].map((name) =>
    matchSegment(name, 'term-*.yaml'),
  )

  // 検証
  expect(results).toEqual([true, true, false, false])
})

// 複数の `*` は順に重ならずに当てる（正常系）
test('test_match_segment_when_multiple_stars', () => {
  // 実行
  const results = ['axbyc', 'abc', 'acb'].map((name) => matchSegment(name, 'a*b*c'))

  // 検証
  expect(results).toEqual([true, true, false])
})

// 区切りの `*` に当たるファイルだけを、パスの順に更新時刻つきで返す（正常系）
test('test_expand_files', async () => {
  // 準備
  const fs = new MemoryFs({
    '/d/term/a.yaml': 'a',
    '/d/term/b.yaml': 'b',
    '/d/term/c.md': 'c',
    '/d/term/x.yaml/inner.txt': 'x',
  })
  const { $ } = createFakeEngine({ fs })

  // 実行
  const result = await expandFiles($, { pattern: '/d/term/*.yaml' })

  // 検証
  expect(result).toEqual([
    { path: '/d/term/a.yaml', mtimeMs: fs.mtime('/d/term/a.yaml') },
    { path: '/d/term/b.yaml', mtimeMs: fs.mtime('/d/term/b.yaml') },
  ])
})

// `**` は 0 階層以上のフォルダに当たる（正常系）
test('test_expand_files_when_double_star', async () => {
  // 準備
  const fs = new MemoryFs({
    '/d/a.yaml': 'a',
    '/d/x/b.yaml': 'b',
    '/d/x/y/c.yaml': 'c',
  })
  const { $ } = createFakeEngine({ fs })

  // 実行
  const result = await expandFiles($, { pattern: '/d/**/*.yaml' })

  // 検証
  expect(result.map((file) => file.path)).toEqual(['/d/a.yaml', '/d/x/b.yaml', '/d/x/y/c.yaml'])
})

// `*` の無いパスはそのファイルだけを返す（正常系）
test('test_expand_files_when_no_star', async () => {
  // 準備
  const fs = new MemoryFs({ '/d/a.yaml': 'a', '/d/dir/inner.yaml': 'i' })
  const { $ } = createFakeEngine({ fs })

  // 実行
  const existing = await expandFiles($, { pattern: '/d/a.yaml' })
  const missing = await expandFiles($, { pattern: '/d/none.yaml' })
  const folder = await expandFiles($, { pattern: '/d/dir' })

  // 検証
  expect(existing.map((file) => file.path)).toEqual(['/d/a.yaml'])
  expect(missing).toEqual([])
  expect(folder).toEqual([])
})

// 起点のフォルダが無いときは空を返す（正常系）
test('test_expand_files_when_dir_missing', async () => {
  // 準備
  const { $ } = createFakeEngine({ fs: new MemoryFs({ '/d/a.yaml': 'a' }) })

  // 実行
  const result = await expandFiles($, { pattern: '/none/*.yaml' })

  // 検証
  expect(result).toEqual([])
})

// シンボリックリンクは指す先の種類で判定し、無限にたどらない（正常系）
test('test_expand_files_when_symlink', async () => {
  // 準備
  const fs = new MemoryFs({
    '/t/target.yaml': 'target',
    '/t/folder/b.yaml': 'b',
  })
  // ファイルへのリンク・フォルダへのリンク・指す先の無いリンク・自分の親へのリンク
  fs.link('/d/a.yaml', '/t/target.yaml')
  fs.link('/d/x', '/t/folder')
  fs.link('/d/c.yaml', '/t/none.yaml')
  fs.link('/d/loop', '/d')
  const { $ } = createFakeEngine({ fs })

  // 実行
  const result = await expandFiles($, { pattern: '/d/**/*.yaml' })

  // 検証
  expect(result.map((file) => file.path)).toEqual(['/d/a.yaml', '/d/x/b.yaml'])
  expect(result[0]?.mtimeMs).toBe(fs.mtime('/t/target.yaml'))
})

// 更新時刻が同じうちは読み直さない（正常系）
test('test_read_if_changed', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({ '/d/a.yaml': 'one' })
  const { $ } = createFakeEngine({ fs })
  const file = { path: '/d/a.yaml', mtimeMs: fs.mtime('/d/a.yaml') }
  const convert = (text: string) => ({ text })

  // 実行
  const first = await readIfChanged($, { file, convert, kind: 'alias' })
  const second = await readIfChanged($, { file, convert, kind: 'alias' })

  // 検証
  expect(fs.reads).toEqual(['/d/a.yaml'])
  expect(second).toBe(first)
})

// 更新時刻が変わると読み直す（正常系）
test('test_read_if_changed_when_mtime_changed', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({ '/d/a.yaml': 'one' })
  const { $ } = createFakeEngine({ fs })
  const convert = (text: string) => ({ text })
  const first = await readIfChanged($, { file: { path: '/d/a.yaml', mtimeMs: fs.mtime('/d/a.yaml') }, convert, kind: 'alias' })

  // 実行
  fs.write('/d/a.yaml', 'two')
  const second = await readIfChanged($, { file: { path: '/d/a.yaml', mtimeMs: fs.mtime('/d/a.yaml') }, convert, kind: 'alias' })

  // 検証
  expect(first.text).toBe('one')
  expect(second.text).toBe('two')
  expect(fs.reads).toEqual(['/d/a.yaml', '/d/a.yaml'])
})

// 種類が違えば同じファイルでも別に読んで変換する（正常系）
test('test_read_if_changed_when_kind_differs', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({ '/d/a.yaml': 'one' })
  const { $ } = createFakeEngine({ fs })
  const file = { path: '/d/a.yaml', mtimeMs: fs.mtime('/d/a.yaml') }

  // 実行
  const asConfig = await readIfChanged($, { file, convert: (text) => ({ config: text }), kind: 'config' })
  const asAlias = await readIfChanged($, { file, convert: (text) => ({ ok: true, value: text }), kind: 'alias' })

  // 検証
  expect(fs.reads).toEqual(['/d/a.yaml', '/d/a.yaml'])
  expect(asConfig).toEqual({ config: 'one' })
  expect(asAlias).toEqual({ ok: true, value: 'one' })
})

// ブロック・フロー・複数行の文字列を読む（正常系）
test('test_parse_yaml', () => {
  // 準備
  const text = ['a: |', '  line1', '  line2', 'b: >-', '  folded', '  text', 'c: [1, two, {k: v}]'].join('\n')

  // 実行
  const result = parseYaml(text)

  // 検証
  expect(result).toEqual({
    ok: true,
    value: { a: 'line1\nline2\n', b: 'folded text', c: [1, 'two', { k: 'v' }] },
  })
})

// 空・コメントだけ・BOM だけの入力は null になる（正常系）
test('test_parse_yaml_when_empty', () => {
  // 準備
  const inputs = ['', '# only comment\n', '  # indented\n', '---\n# memo\n...\n', '﻿']

  // 実行
  const results = inputs.map((input) => parseYaml(input))

  // 検証
  for (const result of results) expect(result).toEqual({ ok: true, value: null })
})

// 書式の誤りは行と列つきの理由で返し、例外にならない（異常系）
test('test_parse_yaml_when_malformed', () => {
  // 準備
  const inputs = ['a: [1, 2', 'a: 1\na: 2', 'a: !foo bar']

  // 実行
  const results = inputs.map((input) => parseYaml(input))

  // 検証
  for (const result of results) {
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/\d+:\d+/)
  }
})

// `__proto__` のキーで `Object.prototype` を汚染しない（正常系）
test('test_parse_yaml_when_proto_key', () => {
  // 実行
  parseYaml('__proto__: {polluted: 1}')

  // 検証
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

// ファイルを置いたフォルダを返す（正常系）
test('test_parent_dir', () => {
  // 実行
  const nested = parentDir('/repo/knowledge/dev-docs.yaml')
  const root = parentDir('/dev-docs.yaml')

  // 検証
  expect(nested).toBe('/repo/knowledge')
  expect(root).toBe('/')
})
