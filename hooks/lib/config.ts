import type { EngineInterface, PromptOrigin } from 'claude-code'
import { expandHome, resolvePath } from './loader'

const DEFAULT_MAX_ITEMS = 20
const DEFAULT_MAX_CHARS = 4000
const DEFAULT_HEADING = 'この発言に出る用語'

const SOURCE_TYPES = ['term', 'doc', 'command', 'url'] as const
const ORIGIN_KEYS = ['user', 'plugin'] as const
const OPTIONAL_COLUMNS = ['description', 'related', 'mcp', 'command', 'cwd', 'url'] as const

/** ソースが追加する列と書式の種類 */
export type SourceType = (typeof SOURCE_TYPES)[number]

/** 設定の `origins` に書ける値 */
export type OriginKey = (typeof ORIGIN_KEYS)[number]

/** 検証を通った 1 つのソースの設定 */
export type SourceConfig = {
  label: string
  type: SourceType
  files: string[]
  baseDir: 'config' | 'project'
  id: string
  words: string[]
  description?: string
  related?: string
  mcp?: string
  command?: string
  cwd?: string
  url?: string
}

/** 検証したプロジェクトの設定。書いたキーだけが値を持つ */
export type ProjectConfig = {
  match: string
  enabled: boolean | undefined
  sources: SourceConfig[]
  origins: OriginKey[] | null | undefined
  maxItems: number | undefined
  maxChars: number | undefined
  exclude: string[]
  heading: string | undefined
}

/** 検証して既定値を当てた設定ファイルの内容 */
export type Config = {
  enabled: boolean
  sources: SourceConfig[]
  origins: OriginKey[] | null
  maxItems: number
  maxChars: number
  exclude: string[]
  heading: string
  projects: ProjectConfig[]
  warnings: string[]
}

/** 起動したプロジェクトに当たる projects を重ね、files を絶対パスにした設定 */
export type Settings = {
  enabled: boolean
  sources: (SourceConfig & { patterns: string[] })[]
  origins: OriginKey[] | null
  maxItems: number
  maxChars: number
  exclude: string[]
  heading: string
}

/** 設定ファイルの最上位がマッピングでないことを伝える例外 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** ユーザースコープの settings の `env.ALIAS_INJECT_CONFIG` を読み、`~` を展開した絶対パスを返す */
export async function readConfigPath($: EngineInterface): Promise<string | null> {
  const settings: unknown = await $.settings.read({ source: 'user' })
  const env = isRecord(settings) ? settings.env : undefined
  const value = isRecord(env) ? env.ALIAS_INJECT_CONFIG : undefined
  if (!isNonEmptyString(value)) return null
  const home = await $.env.get('HOME')
  if (home === undefined) throw new Error('環境変数 HOME がありません')
  return expandHome({ path: value, home })
}

/** `sources` の 1 要素を検証し、必須のキーが揃えば SourceConfig を返す。揃わなければ外す理由を返す */
export function parseSource(value: unknown, baseDir: 'config' | 'project'): SourceConfig | string {
  if (!isRecord(value)) return 'sources の要素がマッピングではありません'
  const { label, id, type, files, words } = value
  if (!isNonEmptyString(label)) return 'label が空でない文字列ではありません'
  if (!isNonEmptyString(id)) return 'id が空でない文字列ではありません'
  if (!SOURCE_TYPES.includes(type as SourceType)) return `type が term・doc・command・url のどれでもありません（${String(type)}）`
  const fileList = typeof files === 'string' ? [files] : files
  if (!Array.isArray(fileList) || fileList.length === 0 || !fileList.every(isNonEmptyString)) {
    return 'files が空でない文字列か、その並びではありません'
  }
  const wordList = Array.isArray(words) ? words.filter(isNonEmptyString) : []
  if (wordList.length === 0) return 'words が空でない文字列を 1 つ以上含む並びではありません'

  const source: SourceConfig = {
    label,
    type: type as SourceType,
    files: fileList,
    baseDir,
    id,
    words: wordList,
  }
  for (const column of OPTIONAL_COLUMNS) {
    const columnName = value[column]
    if (isNonEmptyString(columnName)) source[column] = columnName
  }
  return source
}

// `global` と `projects` の 1 要素に共通のキーを検証する。書かないキー・誤った値は undefined
function parseScope(scope: Record<string, unknown>, baseDir: 'config' | 'project', prefix: string, warnings: string[]) {
  const sources: SourceConfig[] = []
  if (Array.isArray(scope.sources)) {
    for (const [index, raw] of scope.sources.entries()) {
      const parsed = parseSource(raw, baseDir)
      if (typeof parsed === 'string') warnings.push(`${prefix}sources[${index}] を外しました: ${parsed}`)
      else sources.push(parsed)
    }
  }

  let origins: OriginKey[] | null | undefined
  if ('origins' in scope && scope.origins !== undefined) {
    const kept: OriginKey[] = []
    if (Array.isArray(scope.origins)) {
      for (const origin of scope.origins) {
        if (ORIGIN_KEYS.includes(origin as OriginKey)) {
          if (!kept.includes(origin as OriginKey)) kept.push(origin as OriginKey)
        } else {
          warnings.push(`${prefix}origins の値 ${JSON.stringify(origin)} は無視しました`)
        }
      }
    } else {
      warnings.push(`${prefix}origins が並びではないため、すべての出所を対象にします`)
    }
    origins = kept.length > 0 ? kept : null
  }

  const limit = (key: 'max_items' | 'max_chars'): number | undefined => {
    const value = scope[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value
    if (value !== undefined) warnings.push(`${prefix}${key} が 1 以上の整数ではないため、既定値を使います`)
    return undefined
  }

  return {
    enabled: typeof scope.enabled === 'boolean' ? scope.enabled : undefined,
    sources,
    origins,
    maxItems: limit('max_items'),
    maxChars: limit('max_chars'),
    exclude: Array.isArray(scope.exclude) ? scope.exclude.filter((word): word is string => typeof word === 'string') : [],
    heading: isNonEmptyString(scope.heading) ? scope.heading : undefined,
  }
}

/** パースした設定ファイルの値を検証し、既定値を当てる。誤った要素は外して理由を残す */
export function parseConfig(value: unknown): Config {
  if (!isRecord(value)) throw new ConfigError('設定ファイルの最上位がマッピングではありません')
  const warnings: string[] = []
  const global = parseScope(isRecord(value.global) ? value.global : {}, 'config', 'global.', warnings)

  const projects: ProjectConfig[] = []
  if (Array.isArray(value.projects)) {
    for (const [index, raw] of value.projects.entries()) {
      const prefix = `projects[${index}].`
      if (!isRecord(raw) || !isNonEmptyString(raw.match)) {
        warnings.push(`projects[${index}] を外しました: match が空でない文字列ではありません`)
        continue
      }
      projects.push({ match: raw.match, ...parseScope(raw, 'project', prefix, warnings) })
    }
  }

  return {
    enabled: global.enabled ?? true,
    sources: global.sources,
    origins: global.origins ?? null,
    maxItems: global.maxItems ?? DEFAULT_MAX_ITEMS,
    maxChars: global.maxChars ?? DEFAULT_MAX_CHARS,
    exclude: global.exclude,
    heading: global.heading ?? DEFAULT_HEADING,
    projects,
    warnings,
  }
}

/** `projects[].match` が起動したプロジェクトに当たるかを判定する */
export function matchProject(match: string, repoRoot: string, home: string): boolean {
  const expanded = expandHome({ path: match, home }).replace(/\/+$/, '')
  const root = repoRoot.replace(/\/+$/, '')
  if (expanded.startsWith('/')) return root === expanded || root.startsWith(`${expanded}/`)
  return root.split('/').pop() === expanded
}

/** 当たった projects の要素を global に重ね、files を絶対パスに解決する */
export function resolveSettings(
  config: Config,
  {
    where,
  }: { where: { configDir: string; projectRoot: string; repoRoot: string; home: string } },
): Settings {
  const matched = config.projects.filter((project) => matchProject(project.match, where.repoRoot, where.home))

  let { enabled, origins, maxItems, maxChars, heading } = config
  const exclude = [...config.exclude]
  const sources = [...config.sources]
  // sources と exclude は後ろに追加し、それ以外は書いた値で置き換える
  for (const project of matched) {
    sources.push(...project.sources)
    exclude.push(...project.exclude)
    if (project.enabled !== undefined) enabled = project.enabled
    if (project.origins !== undefined) origins = project.origins
    if (project.maxItems !== undefined) maxItems = project.maxItems
    if (project.maxChars !== undefined) maxChars = project.maxChars
    if (project.heading !== undefined) heading = project.heading
  }

  return {
    enabled,
    sources: sources.map((source) => ({
      ...source,
      patterns: source.files.map((path) =>
        resolvePath({
          path,
          home: where.home,
          baseDir: source.baseDir === 'config' ? where.configDir : where.projectRoot,
        }),
      ),
    })),
    origins,
    maxItems,
    maxChars,
    exclude,
    heading,
  }
}

/** 入力の出所が `origins` の対象かを判定する */
export function isOriginAllowed(origins: OriginKey[] | null, kind: PromptOrigin['kind']): boolean {
  if (origins === null) return true
  if (kind === 'composer' || kind === 'bridge' || kind === 'sdk') return origins.includes('user')
  if (kind === 'plugin') return origins.includes('plugin')
  return false
}
