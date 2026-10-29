import { validateSchema } from './schema'

const ALIAS_TYPES = ['term', 'doc', 'command', 'url', 'skill', 'tool', 'path', 'env', 'avoid'] as const

/** 行の `alias_type` の値。文脈に並べる列とセクションが種類ごとに決まる */
export type AliasType = (typeof ALIAS_TYPES)[number]

/** `metadata` に書けるエイリアスのキー */
export const ALIAS_KEYS = [
  'id',
  'name',
  'aliases',
  'description',
  'related',
  'command',
  'cwd',
  'url',
  'avoid',
  'skill',
  'tool',
  'path',
  'port',
  'replacement',
] as const

export type AliasKey = (typeof ALIAS_KEYS)[number]

/** 種類ごとに、文書で値が空であってはならないキー。env の `url`・`port` の 1 つ以上は含めず、`missingKeys` が別に確かめる */
export const REQUIRED_KEYS: Record<AliasType, readonly AliasKey[]> = {
  term: ['id', 'name', 'description'],
  doc: ['id', 'name', 'description'],
  command: ['id', 'name', 'command'],
  url: ['id', 'name', 'url'],
  skill: ['id', 'name', 'skill'],
  tool: ['id', 'name', 'tool'],
  path: ['id', 'name', 'path'],
  env: ['id', 'name'],
  avoid: ['id', 'name', 'replacement'],
}

/** 行の `metadata` のうち、エイリアスのキーだけを持つもの。各キーの値は値を取る文書の列の名前（入れ子の列は `.` でつなぐ）。書かないキーは同じ名前の列から取る */
export type AliasMetadata = Partial<Record<AliasKey, string>>

/** スキーマの検証を通った有効なエイリアスの元の行 */
export type AliasConfig = {
  id: string
  /** 読む YAML のパスか glob。書いたまま（解決は読む側が行う） */
  paths: string[]
  /** 行の引用の種類 */
  alias_type: AliasType
  /** 文書の並びを持つ配列のキー。書かないときは各ファイルが 1 件の文書 */
  records?: string | undefined
  /** `records` の要素の本文のファイルのパスを持つ列の名前。`name` が空の要素の名前に使う */
  body_file?: string | undefined
  metadata: AliasMetadata
}

/** 出所を持ち、`paths` を絶対パスにしたエイリアスの元の行 */
export type ResolvedAlias = AliasConfig & {
  /** 行を書いた `dev-docs.yaml` か設定ファイルの絶対パス */
  origin: string
  /** `paths` を解決した絶対パスの glob */
  patterns: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 値が空でない文字列・数値・真偽値のいずれかか
function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  return typeof value === 'number' || typeof value === 'boolean'
}

/** 行の並びの各行をスキーマで検証し、有効な行を取り出す。合わない行は外して理由を残す */
export function parseAliases({
  items,
  schema,
  path,
  aliasTypeOnly = false,
}: {
  items: readonly unknown[]
  schema: Record<string, unknown>
  path: string
  /** true のとき、`alias_type` を持たない行を検証せずに飛ばし、`alias_type` を持たず `metadata.alias_type` を持つ行を旧い構造として外す */
  aliasTypeOnly?: boolean
}): { aliases: AliasConfig[]; warnings: string[] } {
  const aliases: AliasConfig[] = []
  const warnings: string[] = []

  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${index}]`
    const id = isRecord(item) && typeof item.id === 'string' && item.id !== '' ? `（id: ${item.id}）` : ''
    if (aliasTypeOnly && !(isRecord(item) && 'alias_type' in item)) {
      // `metadata.alias_type` を持つ行は旧い構造のため、移し替えが要ることが分かる理由を残す。それ以外はエイリアスの行ではない
      if (isRecord(item) && isRecord(item.metadata) && 'alias_type' in item.metadata) {
        warnings.push(`${itemPath}${id}: 旧い構造の行です。metadata.alias_type を行の alias_type へ移してください`)
      }
      continue
    }
    // `enabled: false` の行は検証せずに飛ばす
    if (isRecord(item) && item.enabled === false) continue

    const reasons = validateSchema({ root: schema, schema: schema.items, value: item, path: itemPath })
    if (reasons.length > 0) {
      warnings.push(`${itemPath}${id}: ${reasons.join('、')}`)
      continue
    }

    // スキーマの検証を通っているため、必須のキーは型どおりに揃っている
    const valid = item as Record<string, unknown>
    const written = (valid.metadata ?? {}) as Record<string, unknown>
    const metadata: Record<string, unknown> = {}
    for (const key of ALIAS_KEYS) {
      if (key in written) metadata[key] = written[key]
    }
    aliases.push({
      id: valid.id as string,
      paths: valid.paths as string[],
      alias_type: valid.alias_type as AliasType,
      records: valid.records as string | undefined,
      body_file: valid.body_file as string | undefined,
      metadata: metadata as AliasMetadata,
    })
  }
  return { aliases, warnings }
}

/** 同じ出所の行のうち、先の行と `id` が重なる行を外す */
export function dedupeAliases<T extends { id: string }>(aliases: readonly T[]): { aliases: T[]; warnings: string[] } {
  const kept: T[] = []
  const warnings: string[] = []
  const ids = new Set<string>()

  for (const alias of aliases) {
    if (ids.has(alias.id)) {
      warnings.push(`${alias.id}: id が先の要素と重なります`)
      continue
    }
    ids.add(alias.id)
    kept.push(alias)
  }
  return { aliases: kept, warnings }
}

/** 文書から列の名前が指す値を取る。`.` を含む列の名前は入れ子の列をたどり、途中でマッピングでない値に当たれば undefined */
export function getColumn(document: Record<string, unknown>, column: string): unknown {
  let value: unknown = document
  for (const part of column.split('.')) value = isRecord(value) ? value[part] : undefined
  return value
}

/** 1 件の文書について、エイリアスのキーごとの値を行の `metadata` が指す列から取る。書かないキーは同じ名前の列から取る */
export function resolveMetadata(metadata: AliasMetadata, document: Record<string, unknown>): Record<AliasKey, unknown> {
  const values = {} as Record<AliasKey, unknown>
  for (const key of ALIAS_KEYS) values[key] = getColumn(document, metadata[key] ?? key)
  return values
}

/** 解決した値のうち、種類の必須のキーで値が空のものを返す */
export function missingKeys(type: AliasType, values: Record<AliasKey, unknown>): string[] {
  const missing: string[] = REQUIRED_KEYS[type].filter((key) => !hasValue(values[key]))
  // env は url・port の 1 つ以上を求める
  if (type === 'env' && !hasValue(values.url) && !hasValue(values.port)) missing.push('url', 'port')
  return missing
}
