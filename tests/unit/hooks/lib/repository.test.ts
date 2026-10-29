import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import { clearCache } from '../../../../hooks/lib/loader'
import { RepositoryError, loadRepositoryAliases, parseRepository } from '../../../../hooks/lib/repository'
import { createFakeEngine } from '../support/engine'
import { MemoryFs } from '../support/memory-fs'
import { thrown, thrownAsync } from '../support/thrown'

const HOME = '/home/u'
const DEV_DOCS = '/repo/knowledge/dev-docs.yaml'

// documents の 1 行の YAML。`metadata` に足したい行を渡せる
function termRowYaml(id: string, paths: string, extraMetadata: string[] = []): string[] {
  return [
    `  - id: ${id}`,
    `    paths: [${paths}]`,
    '    alias_type: term',
    ...(extraMetadata.length === 0 ? [] : ['    metadata:', ...extraMetadata.map((line) => `      ${line}`)]),
  ]
}

// dev-docs.yaml の文字列
function devDocs(...rowBlocks: string[][]): string {
  return ['documents:', ...rowBlocks.flat(), ''].join('\n')
}

// `documents` の `alias_type` を持つ行の `paths` を dev-docs.yaml のフォルダから解決し、他の行とキーは読まない（正常系）
test('test_parse_repository', () => {
  // 準備
  const text = [
    'enabled: false',
    devDocs(termRowYaml('terms', 'terms/*.yaml'), ['  - id: doc-a', '    paths: [docs/*.yaml]', '    metadata:', '      tags: tags']),
  ].join('\n')

  // 実行
  const result = parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME })

  // 検証
  expect(result.aliases.length).toBe(1)
  expect(result.aliases[0]?.id).toBe('terms')
  expect(result.aliases[0]?.patterns).toEqual(['/repo/knowledge/terms/*.yaml'])
  expect(result.aliases[0]?.origin).toBe(DEV_DOCS)
  expect(result.warnings).toEqual([])
})

// `documents` を持たない・空の dev-docs.yaml は行 0 件になり、トップレベルの `aliases` は読まない（正常系）
test('test_parse_repository_when_documents_missing', () => {
  // 準備
  const legacy = [
    'aliases:',
    '  - id: terms',
    '    type: term',
    '    paths: [terms/*.yaml]',
    '    fields:',
    '      id: id',
    '      match: [name]',
    '      description: description',
    '',
  ].join('\n')
  const texts = [legacy, '']

  // 実行
  const results = texts.map((text) => parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME }))

  // 検証
  expect(results).toEqual([
    { aliases: [], warnings: [] },
    { aliases: [], warnings: [] },
  ])
})

// スキーマに合わない行・旧い構造の行・id の重なった行を外す（正常系）
test('test_parse_repository_when_alias_invalid', () => {
  // 準備
  const unknownRow = ['  - id: unknown', '    paths: [unknown/*.yaml]', '    alias_type: glossary']
  const oldRow = [
    '  - id: old',
    '    paths: [old/*.yaml]',
    '    metadata:',
    '      alias_type:',
    '        type: custom',
    '        value: term',
  ]
  const text = devDocs(
    termRowYaml('terms', 'terms/*.yaml'),
    termRowYaml('bad', 'bad/*.yaml', ["name: ''"]),
    unknownRow,
    oldRow,
    termRowYaml('terms', 'other/*.yaml'),
  )

  // 実行
  const result = parseRepository({ text, path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME })

  // 検証
  expect(result.aliases.map((alias) => alias.patterns)).toEqual([['/repo/knowledge/terms/*.yaml']])
  expect(result.warnings.length).toBe(4)
  expect(result.warnings.some((warning) => warning.startsWith('documents[1]') && warning.includes('bad'))).toBe(true)
  expect(result.warnings.some((warning) => warning.startsWith('documents[2]') && warning.includes('unknown'))).toBe(true)
  expect(result.warnings.some((warning) => warning.startsWith('documents[3]') && warning.includes('old'))).toBe(true)
  expect(result.warnings.some((warning) => warning.includes('terms'))).toBe(true)
})

// 書式の誤り・`documents` が並びでない・最上位が並びなら例外を投げる（異常系）
test('test_parse_repository_when_malformed', () => {
  // 準備
  const texts = ['documents: [a', 'documents: terms', '[a]']

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
  const fs = new MemoryFs({ [DEV_DOCS]: devDocs(termRowYaml('terms', 'terms/*.yaml')) })
  const { $ } = createFakeEngine({ fs })
  const args = { path: DEV_DOCS, schema: ALIAS_SCHEMA, home: HOME }

  // 実行
  const first = await loadRepositoryAliases($, args)
  const second = await loadRepositoryAliases($, args)
  fs.write(DEV_DOCS, devDocs(termRowYaml('terms', 'terms/*.yaml'), termRowYaml('urls', 'urls/*.yaml')))
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
