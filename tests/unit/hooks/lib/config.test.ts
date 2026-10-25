import { expect, test } from 'claude-code/testing'
import {
  ConfigError,
  isOriginAllowed,
  matchProject,
  parseConfig,
  parseSource,
  readConfigPath,
  resolveSettings,
} from '../../../../hooks/lib/config'
import { createFakeEngine, userSettingsWithConfig } from '../support/engine'

// 指定したラベルの term ソース（設定ファイルに書く形）
function rawSource(label: string, files: string) {
  return { label, type: 'term', files, id: 'id', words: ['name'] }
}

const WHERE = {
  configDir: '/home/u/.config/alias-inject',
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
  const value = {
    global: {
      enabled: false,
      sources: [
        {
          label: '用語',
          type: 'term',
          files: 'a/*.yaml',
          id: 'id',
          words: ['name', 'aliases'],
          description: 'description',
          related: 'related',
        },
      ],
      origins: ['user', 'plugin'],
      max_items: 5,
      max_chars: 100,
      exclude: ['x'],
      heading: '見出し',
    },
    projects: [{ match: 'sample', sources: [rawSource('コマンド', 'docs/*.yaml')] }],
  }

  // 実行
  const config = parseConfig(value)

  // 検証
  expect(config.enabled).toBe(false)
  expect(config.sources).toEqual([
    {
      label: '用語',
      type: 'term',
      files: ['a/*.yaml'],
      baseDir: 'config',
      id: 'id',
      words: ['name', 'aliases'],
      description: 'description',
      related: 'related',
    },
  ])
  expect(config.origins).toEqual(['user', 'plugin'])
  expect(config.maxItems).toBe(5)
  expect(config.maxChars).toBe(100)
  expect(config.exclude).toEqual(['x'])
  expect(config.heading).toBe('見出し')
  expect(config.projects.length).toBe(1)
  expect(config.projects[0]?.match).toBe('sample')
  expect(config.projects[0]?.sources[0]?.baseDir).toBe('project')
  expect(config.warnings).toEqual([])
})

// 書かないキーは既定値になる（正常系）
test('test_parse_config_when_keys_omitted', () => {
  // 実行
  const config = parseConfig({ global: { sources: [] } })

  // 検証
  expect(config.enabled).toBe(true)
  expect(config.origins).toBeNull()
  expect(config.maxItems).toBe(20)
  expect(config.maxChars).toBe(4000)
  expect(config.exclude).toEqual([])
  expect(config.heading).toBe('この発言に出る用語')
  expect(config.projects).toEqual([])
})

// 空の並び・許す値の無い並びはすべての出所が対象になる（正常系）
test('test_parse_config_when_origins_empty', () => {
  // 実行
  const empty = parseConfig({ global: { origins: [] } })
  const unknownOnly = parseConfig({ global: { origins: ['foo'] } })
  const mixed = parseConfig({ global: { origins: ['user', 'foo', 'user'] } })

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
  const itemConfigs = invalidItems.map((value) => parseConfig({ global: { max_items: value } }))
  const charConfig = parseConfig({ global: { max_chars: 0 } })

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
  const config = parseConfig({
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
  expect(project?.sources).toEqual([])
  expect(project?.exclude).toEqual([])
  expect(config.warnings.some((warning) => warning.includes('match'))).toBe(true)
  expect(config.warnings.some((warning) => warning.includes('max_chars'))).toBe(true)
})

// 最上位がマッピングでなければ例外を投げる（異常系）
test('test_parse_config_when_not_mapping', () => {
  // 実行・検証
  expect(() => parseConfig(null)).toThrow(ConfigError)
  expect(() => parseConfig([])).toThrow(ConfigError)
  expect(() => parseConfig('text')).toThrow(ConfigError)
})

// 必須と任意のキーを読む（正常系）
test('test_parse_source', () => {
  // 準備
  const value = {
    label: '用語',
    type: 'term',
    files: 'a/*.yaml',
    id: 'id',
    words: ['name', 'aliases'],
    description: 'description',
    related: 'related',
  }

  // 実行
  const result = parseSource(value, 'config')

  // 検証
  expect(result).toEqual({
    label: '用語',
    type: 'term',
    files: ['a/*.yaml'],
    baseDir: 'config',
    id: 'id',
    words: ['name', 'aliases'],
    description: 'description',
    related: 'related',
  })
})

// 必須のキーが欠けた要素は、欠けたキーの名前を含む理由を返す（正常系）
test('test_parse_source_when_required_missing', () => {
  // 準備
  const base = { label: '用語', type: 'term', files: 'a/*.yaml', id: 'id', words: ['name'] }
  const cases: [string, unknown][] = [
    ['label', { ...base, label: undefined }],
    ['type', { ...base, type: 'memo' }],
    ['files', { ...base, files: [] }],
    ['words', { ...base, words: [] }],
  ]

  // 実行・検証
  for (const [key, value] of cases) {
    const result = parseSource(value, 'config')
    expect(typeof result).toBe('string')
    expect(String(result)).toContain(key)
  }
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

// 当たった projects のソースだけを後ろに重ねる（正常系）
test('test_resolve_settings', () => {
  // 準備
  const config = parseConfig({
    global: { sources: [rawSource('global', 'g/*.yaml')] },
    projects: [
      { match: 'sample', sources: [rawSource('sample', 's/*.yaml')] },
      { match: 'other', sources: [rawSource('other', 'o/*.yaml')] },
    ],
  })

  // 実行
  const settings = resolveSettings(config, { where: WHERE })

  // 検証
  expect(settings.sources.map((source) => source.label)).toEqual(['global', 'sample'])
})

// 相対パスは global では設定ファイルのフォルダ、projects では起動したプロジェクトの直下から解決する（正常系）
test('test_resolve_settings_when_relative_files', () => {
  // 準備
  const config = parseConfig({
    global: { sources: [rawSource('global', 'terms/*.yaml')] },
    projects: [{ match: 'sample', sources: [rawSource('sample', 'docs/command/*.yaml')] }],
  })

  // 実行
  const settings = resolveSettings(config, { where: { ...WHERE, projectRoot: '/repo/sample/wt' } })

  // 検証
  expect(settings.sources[0]?.patterns).toEqual(['/home/u/.config/alias-inject/terms/*.yaml'])
  expect(settings.sources[1]?.patterns).toEqual(['/repo/sample/wt/docs/command/*.yaml'])
})

// 当たった要素の exclude は追加し、max_items は置き換え、書かないキーは global のままにする（正常系）
test('test_resolve_settings_when_project_overrides', () => {
  // 準備
  const config = parseConfig({
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
