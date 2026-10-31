import type { EngineInterface, PromptOrigin } from 'claude-code'
import { dedupeAliases, parseAliases } from './alias'
import type { AliasConfig, ResolvedAlias } from './alias'
import { expandHome, parentDir, resolvePath } from './loader'

const DEFAULT_MAX_ITEMS = 20
const DEFAULT_MAX_CHARS = 4000
const DEFAULT_HEADING = 'この発言に出る用語'

const ORIGIN_KEYS = ['user', 'plugin'] as const

/** 設定の `origins` に書ける値 */
export type OriginKey = (typeof ORIGIN_KEYS)[number]

/** 検証を通った有効な `repositories` の 1 要素 */
export type RepositoryConfig = {
  /** `dev-docs.yaml` のパス。設定ファイルに書いたまま（解決は実効の設定の組み立てで行う） */
  config: string
  /** 相対パスの基準。`global` の要素は設定ファイルのフォルダ、`projects` の要素は起動したプロジェクトの直下 */
  baseDir: 'config' | 'project'
}

/** 検証したプロジェクトの設定。書いたキーだけが値を持つ */
export type ProjectConfig = {
  match: string
  enabled: boolean | undefined
  repositories: RepositoryConfig[]
  aliases: AliasConfig[]
  origins: OriginKey[] | null | undefined
  maxItems: number | undefined
  maxChars: number | undefined
  exclude: string[]
  heading: string | undefined
  /** 後ろに追加する結果を照合しないツールの名前 */
  excludeTools: string[]
}

/** 検証して既定値を当てた設定ファイルの内容 */
export type Config = {
  enabled: boolean
  repositories: RepositoryConfig[]
  aliases: AliasConfig[]
  origins: OriginKey[] | null
  maxItems: number
  maxChars: number
  exclude: string[]
  heading: string
  /** 結果を照合しないツールの名前 */
  excludeTools: string[]
  projects: ProjectConfig[]
  /** 外した要素と無視した値の理由。呼び出し元が debug log に出す */
  warnings: string[]
}

/** 起動したプロジェクトに当たる projects を重ね、パスを絶対パスにした設定 */
export type Settings = {
  enabled: boolean
  /** 読む `dev-docs.yaml` の絶対パス。global の後ろに当たった projects を並べ、同じパスは先の 1 つだけを残す */
  repositories: string[]
  /** 設定ファイルの `aliases` の要素。global の後ろに当たった projects を並べ、先の要素と `id` が重なる要素を外したもの */
  aliases: ResolvedAlias[]
  origins: OriginKey[] | null
  maxItems: number
  maxChars: number
  exclude: string[]
  heading: string
  /** 結果を照合しないツールの名前。global の後ろに当たった projects を並べたもの */
  excludeTools: string[]
  /** `id` が重なって外した `aliases` の要素の理由。呼び出し元が debug log に出す */
  warnings: string[]
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

/** `repositories` の 1 要素を検証し、有効なら RepositoryConfig を返す。`enabled: false` のときは null、外すときは理由を返す */
export function parseRepositoryConfig(value: unknown, baseDir: 'config' | 'project'): RepositoryConfig | null | string {
  if (!isRecord(value)) return 'repositories の要素がマッピングではありません'
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return 'enabled が真偽値ではありません'
  if (value.enabled === false) return null
  if (!isNonEmptyString(value.config)) return 'config が空でない文字列ではありません'
  return { config: value.config, baseDir }
}

// `repositories` の並びを検証する。外した要素と並びでない値の理由は warnings に入れる
function parseRepositories(
  value: unknown,
  baseDir: 'config' | 'project',
  prefix: string,
  warnings: string[],
): RepositoryConfig[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push(`${prefix}repositories が並びではないため、読むリポジトリを使いません`)
    return []
  }
  const repositories: RepositoryConfig[] = []
  for (const [index, raw] of value.entries()) {
    const parsed = parseRepositoryConfig(raw, baseDir)
    if (typeof parsed === 'string') warnings.push(`${prefix}repositories[${index}] を外しました: ${parsed}`)
    else if (parsed !== null) repositories.push(parsed)
  }
  return repositories
}

// `aliases` の並びをスキーマで検証する。外した要素と並びでない値の理由は warnings に入れる
function parseAliasList(value: unknown, schema: Record<string, unknown>, prefix: string, warnings: string[]): AliasConfig[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push(`${prefix}aliases が並びではないため、端末のエイリアスを使いません`)
    return []
  }
  const parsed = parseAliases({ items: value, schema, path: `${prefix}aliases` })
  warnings.push(...parsed.warnings)
  return parsed.aliases
}

// `global` と `projects` の 1 要素に共通のキーを検証する。書かないキー・誤った値は undefined
function parseScope(
  scope: Record<string, unknown>,
  { baseDir, prefix, schema, warnings }: { baseDir: 'config' | 'project'; prefix: string; schema: Record<string, unknown>; warnings: string[] },
) {
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

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  return {
    enabled: typeof scope.enabled === 'boolean' ? scope.enabled : undefined,
    repositories: parseRepositories(scope.repositories, baseDir, prefix, warnings),
    aliases: parseAliasList(scope.aliases, schema, prefix, warnings),
    origins,
    maxItems: limit('max_items'),
    maxChars: limit('max_chars'),
    exclude: strings(scope.exclude),
    excludeTools: strings(scope.exclude_tools),
    heading: isNonEmptyString(scope.heading) ? scope.heading : undefined,
  }
}

/** パースした設定ファイルの値を検証し、既定値を当てる。誤った要素は外して理由を残す */
export function parseConfig(value: unknown, schema: Record<string, unknown>): Config {
  if (!isRecord(value)) throw new ConfigError('設定ファイルの最上位がマッピングではありません')
  const warnings: string[] = []
  const global = parseScope(isRecord(value.global) ? value.global : {}, { baseDir: 'config', prefix: 'global.', schema, warnings })

  const projects: ProjectConfig[] = []
  if (Array.isArray(value.projects)) {
    for (const [index, raw] of value.projects.entries()) {
      if (!isRecord(raw) || !isNonEmptyString(raw.match)) {
        warnings.push(`projects[${index}] を外しました: match が空でない文字列ではありません`)
        continue
      }
      const prefix = `projects[${index}].`
      projects.push({ match: raw.match, ...parseScope(raw, { baseDir: 'project', prefix, schema, warnings }) })
    }
  }

  return {
    enabled: global.enabled ?? true,
    repositories: global.repositories,
    aliases: global.aliases,
    origins: global.origins ?? null,
    maxItems: global.maxItems ?? DEFAULT_MAX_ITEMS,
    maxChars: global.maxChars ?? DEFAULT_MAX_CHARS,
    exclude: global.exclude,
    heading: global.heading ?? DEFAULT_HEADING,
    excludeTools: global.excludeTools,
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

/** 当たった projects の要素を global に重ね、`repositories` と `aliases` のパスを絶対パスに解決する */
export function resolveSettings(
  config: Config,
  { where }: { where: { configPath: string; projectRoot: string; repoRoot: string; home: string } },
): Settings {
  const matched = config.projects.filter((project) => matchProject(project.match, where.repoRoot, where.home))

  let { enabled, origins, maxItems, maxChars, heading } = config
  const exclude = [...config.exclude]
  const excludeTools = [...config.excludeTools]
  const repositories = [...config.repositories]
  // 相対パスの基準を決めるため、aliases は書いた場所（global か projects）とあわせて持つ
  const scopedAliases: { alias: AliasConfig; baseDir: 'config' | 'project' }[] = config.aliases.map((alias) => ({
    alias,
    baseDir: 'config',
  }))
  // repositories・aliases・exclude・excludeTools は後ろに追加し、それ以外は書いた値で置き換える
  for (const project of matched) {
    repositories.push(...project.repositories)
    scopedAliases.push(...project.aliases.map((alias) => ({ alias, baseDir: 'project' as const })))
    exclude.push(...project.exclude)
    excludeTools.push(...project.excludeTools)
    if (project.enabled !== undefined) enabled = project.enabled
    if (project.origins !== undefined) origins = project.origins
    if (project.maxItems !== undefined) maxItems = project.maxItems
    if (project.maxChars !== undefined) maxChars = project.maxChars
    if (project.heading !== undefined) heading = project.heading
  }

  const baseDirOf = (baseDir: 'config' | 'project') => (baseDir === 'config' ? parentDir(where.configPath) : where.projectRoot)
  const resolvedAliases: ResolvedAlias[] = scopedAliases.map(({ alias, baseDir }) => ({
    ...alias,
    origin: where.configPath,
    patterns: alias.paths.map((path) => resolvePath({ path, home: where.home, baseDir: baseDirOf(baseDir) })),
  }))
  const deduped = dedupeAliases(resolvedAliases)

  return {
    enabled,
    repositories: [
      ...new Set(
        repositories.map((repository) =>
          resolvePath({ path: repository.config, home: where.home, baseDir: baseDirOf(repository.baseDir) }),
        ),
      ),
    ],
    aliases: deduped.aliases,
    origins,
    maxItems,
    maxChars,
    exclude,
    heading,
    excludeTools,
    warnings: deduped.warnings,
  }
}

/** 入力の出所が `origins` の対象かを判定する */
export function isOriginAllowed(origins: OriginKey[] | null, kind: PromptOrigin['kind']): boolean {
  if (origins === null) return true
  if (kind === 'composer' || kind === 'bridge' || kind === 'sdk') return origins.includes('user')
  if (kind === 'plugin') return origins.includes('plugin')
  return false
}
