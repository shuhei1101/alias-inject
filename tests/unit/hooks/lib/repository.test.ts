import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { clearCache } from '../../../../hooks/lib/loader'
import { RepositoryError, loadRepositoryAliases, parseRepository } from '../../../../hooks/lib/repository'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'
import { thrown, thrownAsync } from '../support/thrown'

const HOME = '/home/u'
const DEV_DOCS = '/repo/knowledge/dev-docs.yaml'

// aliases の 1 要素の YAML の行。`fields` に足したい行を渡せる
function aliasYaml(id: string, paths: string, extraFields: string[] = []): string[] {
  return [
    `  - id: ${id}`,
    '    type: term',
    `    paths: [${paths}]`,
    '    fields:',
    '      id: id',
    '      match: [name]',
    '      description: description',
    ...extraFields.map((line) => `      ${line}`),
  ]
}

// dev-docs.yaml の文字列
function devDocs(...aliasBlocks: string[][]): string {
  return ['aliases:', ...aliasBlocks.flat(), ''].join('\n')
}

// `aliases` の `paths` を dev-docs.yaml のフォルダから解決し、他のキーは読まない（正常系）
test('test_parse_repository', () => {
  // 準備
  const text = ['enabled: false', 'documents:', '  - id: doc-a', devDocs(aliasYaml('terms', 'terms/*.yaml'))].join('\n')

  // 実行
  const result = parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME })

  // 検証
  expect(result.aliases.length).toBe(1)
  expect(result.aliases[0]?.id).toBe('terms')
  expect(result.aliases[0]?.patterns).toEqual(['/repo/knowledge/terms/*.yaml'])
  expect(result.aliases[0]?.origin).toBe(DEV_DOCS)
  expect(result.warnings).toEqual([])
})

// `aliases` を持たない・空の dev-docs.yaml は要素 0 件になる（正常系）
test('test_parse_repository_when_aliases_missing', () => {
  // 準備
  const texts = ['documents:\n  - id: doc-a\n', '']

  // 実行
  const results = texts.map((text) => parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME }))

  // 検証
  expect(results).toEqual([
    { aliases: [], warnings: [] },
    { aliases: [], warnings: [] },
  ])
})

// スキーマに合わない要素と id の重なった要素を外す（正常系）
test('test_parse_repository_when_alias_invalid', () => {
  // 準備
  const text = devDocs(
    aliasYaml('terms', 'terms/*.yaml'),
    aliasYaml('bad', 'bad/*.yaml', ['mcp: rule-inject']),
    aliasYaml('terms', 'other/*.yaml'),
  )

  // 実行
  const result = parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME })

  // 検証
  expect(result.aliases.map((alias) => alias.patterns)).toEqual([['/repo/knowledge/terms/*.yaml']])
  expect(result.warnings.some((warning) => warning.includes('bad'))).toBe(true)
  expect(result.warnings.some((warning) => warning.includes('terms'))).toBe(true)
})

// 書式の誤り・`aliases` が並びでない・最上位が並びなら例外を投げる（異常系）
test('test_parse_repository_when_malformed', () => {
  // 準備
  const texts = ['aliases: [a', 'aliases: terms', '[a]']

  // 実行
  const errors = texts.map((text) =>
    thrown(() => parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME })),
  )

  // 検証
  for (const error of errors) {
    expect(error).toBeInstanceOf(RepositoryError)
    expect((error as RepositoryError).path).toBe(DEV_DOCS)
  }
})

// 更新時刻が同じうちは読み直さず、変わると読み直す（正常系）
test('test_load_repository_aliases', async () => {
  // 準備
  clearCache()
  const fs = new MemoryFs({ [DEV_DOCS]: devDocs(aliasYaml('terms', 'terms/*.yaml')) })
  const { $ } = createFakeEngine({ fs })
  const args = { path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME }

  // 実行
  const first = await loadRepositoryAliases($, args)
  const second = await loadRepositoryAliases($, args)
  fs.write(DEV_DOCS, devDocs(aliasYaml('terms', 'terms/*.yaml'), aliasYaml('urls', 'urls/*.yaml')))
  const third = await loadRepositoryAliases($, args)

  // 検証
  expect(fs.reads).toEqual([DEV_DOCS, DEV_DOCS])
  expect(second).toBe(first)
  expect(third.aliases.map((alias) => alias.id)).toEqual(['terms', 'urls'])
})

// 無い dev-docs.yaml はパスつきで例外を投げる（異常系）
test('test_load_repository_aliases_when_missing', async () => {
  // 準備
  clearCache()
  const { $ } = createFakeEngine({ fs: new MemoryFs() })
  const path = '/repo/missing/dev-docs.yaml'

  // 実行
  const error = await thrownAsync(() => loadRepositoryAliases($, { path, schema: ALIAS_SCHEMA, home: HOME }))

  // 検証
  expect(error).toBeInstanceOf(RepositoryError)
  expect((error as RepositoryError).path).toBe(path)
})
