import { expect, test } from 'claude-code/testing'
import { ALIAS_SCHEMA } from '../../../../hooks/lib/aliases-schema'
import {
  ConfigError,
  isOriginAllowed,
  matchProject,
  parseConfig,
  parseRepositoryConfig,
  readConfigPath,
  resolveSettings,
} from '../../../../hooks/lib/config'
import { createFakeEngine, userSettingsWithConfig } from '../support/engine'
import { thrown } from '../support/thrown'

// 指定した id と paths の term の aliases の行（設定ファイルに記載する構造）
function rawAlias(id: string, path: string) {
  return {
    id,
    paths: [path],
    alias_type: 'term',
  }
}

// 設定ファイルの値を検証して Config にする
function parse(value: unknown) {
  return parseConfig(value, ALIAS_SCHEMA)
}

const WHERE = {
  configPath: '/home/u/.config/alias-inject/settings.yaml',
  projectRoot: '/repo/sample',
  repoRoot: '/repo/sample',
  home: '/home/u',
}

// `~` を展開したパスを返す（正常系）
test('test_read_config_path', async () => {
  // 準備
  const { $ } = createFakeEngine({
    settings: userSettingsWithConfig('~/.config/alias-inject/settings.yaml'),
    home: '/home/u',
  })

  // 実行
  const result = await readConfigPath($)

  // 検証
  expect(result).toBe('/home/u/.config/alias-inject/settings.yaml')
})

// 値が無い・空・文字列でないときは null を返す（正常系）
test('test_read_config_path_when_missing', async () => {
  // 準備
  const settingsList = [{}, { env: {} }, { env: { ALIAS_INJECT_CONFIG: '' } }, { env: { ALIAS_INJECT_CONFIG: 5 } }]

  // 実行
  const results = []
  for (const settings of settingsList) {
    results.push(await readConfigPath(createFakeEngine({ settings }).$))
  }

  // 検証
  expect(results).toEqual([null, null, null, null])
})

// 全キーを書いた設定を読む（正常系）
test('test_parse_config', () => {
  // 準備
  const termAlias = {
    id: 'glossary',
    paths: ['terms/*.yaml'],
    alias_type: 'term',
    records: 'terms',
    body_file: 'path',
    metadata: {
      name: 'title',
      aliases: 'aliases',
      description: 'description',
      related: 'related',
      avoid: 'avoid',
    },
  }
  const value = {
    global: {
      enabled: false,
      repositories: [{ config: '../knowledge/dev-docs.yaml' }, { config: '~/old/dev-docs.yaml', enabled: false }],
      aliases: [termAlias],
      origins: ['user', 'plugin'],
      max_items: 5,
      max_chars: 100,
      exclude: ['x'],
      heading: '見出し',
    },
    projects: [
      {
        match: 'sample',
        repositories: [{ config: 'dev-docs.yaml' }],
        aliases: [rawAlias('commands', 'docs/*.yaml')],
      },
    ],
  }

  // 実行
  const config = parse(value)

  // 検証
  expect(config.enabled).toBe(false)
  expect(config.repositories).toEqual([{ config: '../knowledge/dev-docs.yaml', baseDir: 'config' }])
  expect(config.aliases).toEqual([termAlias])
  expect(config.origins).toEqual(['user', 'plugin'])
  expect(config.maxItems).toBe(5)
  expect(config.maxChars).toBe(100)
  expect(config.exclude).toEqual(['x'])
  expect(config.heading).toBe('見出し')
  expect(config.projects.length).toBe(1)
  expect(config.projects[0]?.match).toBe('sample')
  expect(config.projects[0]?.repositories).toEqual([{ config: 'dev-docs.yaml', baseDir: 'project' }])
  expect(config.projects[0]?.aliases.map((alias) => alias.id)).toEqual(['commands'])
  expect(config.warnings).toEqual([])
})

// 書かないキーは既定値になる（正常系）
test('test_parse_config_when_keys_omitted', () => {
  // 実行
  const config = parse({ global: {} })

  // 検証
  expect(config.enabled).toBe(true)
  expect(config.repositories).toEqual([])
  expect(config.aliases).toEqual([])
  expect(config.origins).toBeNull()
  expect(config.maxItems).toBe(20)
  expect(config.maxChars).toBe(4000)
  expect(config.exclude).toEqual([])
  expect(config.heading).toBe('この発言に出る用語')
  expect(config.projects).toEqual([])
  expect(config.warnings).toEqual([])
})

// スキーマに合わない aliases の要素と、並びでない repositories・aliases は外して理由を残す（正常系）
test('test_parse_config_when_alias_invalid', () => {
  // 準備
  const invalid = { id: 'bad', paths: ['a.yaml'], alias_type: 'memo' }

  // 実行
  const config = parse({
    global: { aliases: [invalid, rawAlias('good', 'a.yaml')] },
    projects: [{ match: 'sample', repositories: 'a', aliases: 'b' }],
  })

  // 検証
  expect(config.aliases.map((alias) => alias.id)).toEqual(['good'])
  expect(config.projects[0]?.repositories).toEqual([])
  expect(config.projects[0]?.aliases).toEqual([])
  expect(config.warnings.some((warning) => warning.includes('global.aliases[0]'))).toBe(true)
  expect(config.warnings.some((warning) => warning.includes('repositories'))).toBe(true)
  expect(
    config.warnings.some((warning) => !warning.includes('global.aliases[0]') && warning.includes('aliases')),
  ).toBe(true)
})

// 空の並び・許す値の無い並びはすべての出所が対象になる（正常系）
test('test_parse_config_when_origins_empty', () => {
  // 実行
  const empty = parse({ global: { origins: [] } })
  const unknownOnly = parse({ global: { origins: ['foo'] } })
  const mixed = parse({ global: { origins: ['user', 'foo', 'user'] } })

  // 検証
  expect(empty.origins).toBeNull()
  expect(unknownOnly.origins).toBeNull()
  expect(unknownOnly.warnings.some((warning) => warning.includes('foo'))).toBe(true)
  expect(mixed.origins).toEqual(['user'])
  expect(mixed.warnings.some((warning) => warning.includes('foo'))).toBe(true)
})

// 誤った上限は既定値を使い、理由を warnings に残す（正常系）
test('test_parse_config_when_limit_invalid', () => {
  // 準備
  const invalidItems = [0, -1, 1.5, '10']

  // 実行
  const itemConfigs = invalidItems.map((value) => parse({ global: { max_items: value } }))
  const charConfig = parse({ global: { max_chars: 0 } })

  // 検証
  for (const config of itemConfigs) {
    expect(config.maxItems).toBe(20)
    expect(config.warnings.length).toBeGreaterThan(0)
  }
  expect(charConfig.maxChars).toBe(4000)
  expect(charConfig.warnings.length).toBeGreaterThan(0)
})

// `match` の無い projects の要素は外し、残した要素は書いたキーだけを持つ（正常系）
test('test_parse_config_when_project_without_match', () => {
  // 実行
  const config = parse({
    global: {},
    projects: [{ max_items: 3 }, { match: 'sample', max_items: 5, max_chars: 0 }],
  })

  // 検証
  expect(config.projects.length).toBe(1)
  const project = config.projects[0]
  expect(project?.match).toBe('sample')
  expect(project?.maxItems).toBe(5)
  expect(project?.maxChars).toBeUndefined()
  expect(project?.heading).toBeUndefined()
  expect(project?.origins).toBeUndefined()
  expect(project?.enabled).toBeUndefined()
  expect(project?.repositories).toEqual([])
  expect(project?.aliases).toEqual([])
  expect(project?.exclude).toEqual([])
  expect(config.warnings.some((warning) => warning.includes('match'))).toBe(true)
  expect(config.warnings.some((warning) => warning.includes('max_chars'))).toBe(true)
})

// 最上位がマッピングでなければ例外を投げる（異常系）
test('test_parse_config_when_not_mapping', () => {
  // 実行
  const errors = [null, [], 'text'].map((value) => thrown(() => parse(value)))

  // 検証
  for (const error of errors) expect(error).toBeInstanceOf(ConfigError)
})

// 絶対パスは同じパスと配下に当たる（正常系）
test('test_match_project_when_absolute', () => {
  // 実行
  const results = ['/repo/sample', '/repo/sample/sub', '/repo/sample2'].map((repoRoot) =>
    matchProject('/repo/sample', repoRoot, '/home/u'),
  )

  // 検証
  expect(results).toEqual([true, true, false])
})

// プロジェクト名はフォルダ名の一致で当たる（正常系）
test('test_match_project_when_name', () => {
  // 実行
  const results = ['/repo/sample', '/repo/other'].map((repoRoot) => matchProject('sample', repoRoot, '/home/u'))

  // 検証
  expect(results).toEqual([true, false])
})

// 当たった projects の repositories と aliases だけを後ろに重ねる（正常系）
test('test_resolve_settings', () => {
  // 準備
  const config = parse({
    global: {
      repositories: [{ config: '/repo/g/dev-docs.yaml' }],
      aliases: [rawAlias('global', 'g/*.yaml')],
    },
    projects: [
      {
        match: 'sample',
        repositories: [{ config: '/repo/s/dev-docs.yaml' }],
        aliases: [rawAlias('sample', 's/*.yaml')],
      },
      {
        match: 'other',
        repositories: [{ config: '/repo/o/dev-docs.yaml' }],
        aliases: [rawAlias('other', 'o/*.yaml')],
      },
    ],
  })

  // 実行
  const settings = resolveSettings(config, { where: WHERE })

  // 検証
  expect(settings.repositories).toEqual(['/repo/g/dev-docs.yaml', '/repo/s/dev-docs.yaml'])
  expect(settings.aliases.map((alias) => alias.id)).toEqual(['global', 'sample'])
  expect(settings.aliases.every((alias) => alias.origin === WHERE.configPath)).toBe(true)
  expect(settings.warnings).toEqual([])
})

// 相対パスは global では設定ファイルのフォルダ、projects では起動したプロジェクトの直下から解決する（正常系）
test('test_resolve_settings_when_relative_paths', () => {
  // 準備
  const config = parse({
    global: {
      repositories: [{ config: '../knowledge/dev-docs.yaml' }],
      aliases: [rawAlias('global', 'terms/*.yaml')],
    },
    projects: [
      {
        match: 'sample',
        repositories: [{ config: 'dev-docs.yaml' }],
        aliases: [rawAlias('sample', 'docs/command/*.yaml')],
      },
    ],
  })

  // 実行
  const settings = resolveSettings(config, { where: { ...WHERE, projectRoot: '/repo/sample/wt' } })

  // 検証
  expect(settings.repositories).toEqual(['/home/u/.config/knowledge/dev-docs.yaml', '/repo/sample/wt/dev-docs.yaml'])
  expect(settings.aliases[0]?.patterns).toEqual(['/home/u/.config/alias-inject/terms/*.yaml'])
  expect(settings.aliases[1]?.patterns).toEqual(['/repo/sample/wt/docs/command/*.yaml'])
})

// 同じ dev-docs.yaml は 1 つにし、同じ id の aliases の要素は後を外す（正常系）
test('test_resolve_settings_when_duplicated', () => {
  // 準備
  const config = parse({
    global: {
      repositories: [{ config: '/repo/knowledge/dev-docs.yaml' }],
      aliases: [rawAlias('terms', 'g/*.yaml')],
    },
    projects: [
      {
        match: 'sample',
        repositories: [{ config: '/repo/sample/../knowledge/dev-docs.yaml' }],
        aliases: [rawAlias('terms', 's/*.yaml')],
      },
    ],
  })

  // 実行
  const settings = resolveSettings(config, { where: WHERE })

  // 検証
  expect(settings.repositories).toEqual(['/repo/knowledge/dev-docs.yaml'])
  expect(settings.aliases.length).toBe(1)
  expect(settings.aliases[0]?.patterns).toEqual(['/home/u/.config/alias-inject/g/*.yaml'])
  expect(settings.warnings.length).toBe(1)
  expect(settings.warnings[0]).toContain('terms')
})

// 当たった要素の exclude は追加し、max_items は置き換え、書かないキーは global のままにする（正常系）
test('test_resolve_settings_when_project_overrides', () => {
  // 準備
  const config = parse({
    global: { exclude: ['a'], origins: ['user'] },
    projects: [
      { match: 'sample', exclude: ['b'], max_items: 5 },
      { match: 'sample', max_items: 3, origins: [] },
    ],
  })

  // 実行
  const settings = resolveSettings(config, { where: WHERE })

  // 検証
  expect(settings.exclude).toEqual(['a', 'b'])
  expect(settings.maxItems).toBe(3)
  expect(settings.origins).toBeNull()
  expect(settings.heading).toBe('この発言に出る用語')
})

// 出所を origins に対応づける（正常系）
test('test_is_origin_allowed', () => {
  // 実行
  const pluginOnly = (['composer', 'plugin', 'bridge'] as const).map((kind) => isOriginAllowed(['plugin'], kind))
  const userOnly = (['sdk', 'task-notification'] as const).map((kind) => isOriginAllowed(['user'], kind))

  // 検証
  expect(pluginOnly).toEqual([false, true, false])
  expect(userOnly).toEqual([true, false])
})

// origins を書かないときはすべての出所が対象になる（正常系）
test('test_is_origin_allowed_when_origins_null', () => {
  // 実行
  const results = (['composer', 'plugin', 'task-notification'] as const).map((kind) => isOriginAllowed(null, kind))

  // 検証
  expect(results).toEqual([true, true, true])
})

// `config` を読み、`enabled` を書かない要素は有効になる（正常系）
test('test_parse_repository_config', () => {
  // 実行
  const withoutEnabled = parseRepositoryConfig({ config: '../knowledge/dev-docs.yaml' }, 'config')
  const withEnabled = parseRepositoryConfig({ config: '../knowledge/dev-docs.yaml', enabled: true }, 'config')

  // 検証
  expect(withoutEnabled).toEqual({ config: '../knowledge/dev-docs.yaml', baseDir: 'config' })
  expect(withEnabled).toEqual({ config: '../knowledge/dev-docs.yaml', baseDir: 'config' })
})

// `enabled: false` は null を返す（正常系）
test('test_parse_repository_config_when_disabled', () => {
  // 実行
  const result = parseRepositoryConfig({ config: '../knowledge/dev-docs.yaml', enabled: false }, 'config')

  // 検証
  expect(result).toBeNull()
})

// 誤った要素は、無い・誤ったキーの名前を含む理由を返す（正常系）
test('test_parse_repository_config_when_invalid', () => {
  // 準備
  const cases: [unknown, string | null][] = [
    ['a', null],
    [{}, 'config'],
    [{ config: '' }, 'config'],
    [{ config: '../knowledge/dev-docs.yaml', enabled: 'no' }, 'enabled'],
  ]

  // 実行・検証
  for (const [value, key] of cases) {
    const result = parseRepositoryConfig(value, 'config')
    expect(typeof result).toBe('string')
    if (key !== null) expect(String(result)).toContain(key)
  }
})
