import { validateSchema } from './schema'

/** `aliases` の要素の `type`。文脈に並べる列とセクションが種類ごとに決まる */
export type AliasType = 'term' | 'doc' | 'command' | 'url' | 'skill' | 'tool' | 'path' | 'env' | 'avoid'

/** `aliases` の要素の `fields`。項目のどの列を使うかの対応 */
export type AliasFields = {
  /** 項目の ID の列の名前 */
  id: string
  /** 照合する列の名前（1 つ以上） */
  match: string[]
  /** 文脈に出す語の列の名前 */
  title?: string | undefined
  description?: string | undefined
  /** 関連する項目の列の名前（term） */
  related?: string | undefined
  /** 避ける言い方の列の名前（term）。読むが文脈には使わない */
  avoid?: string | undefined
  command?: string | undefined
  cwd?: string | undefined
  url?: string | undefined
  /** スキル名の列の名前（skill） */
  skill?: string | undefined
  /** MCP のツール名の列の名前（tool） */
  tool?: string | undefined
  /** パスの列の名前（path） */
  path?: string | undefined
  /** ポートの列の名前（env） */
  port?: string | undefined
  /** やめた言い方に代えて使う正しい語の列の名前（avoid） */
  replacement?: string | undefined
}

/** スキーマの検証を通った有効な `aliases` の 1 要素 */
export type AliasConfig = {
  id: string
  type: AliasType
  /** 読む YAML のパスか glob。書いたまま（解決は読む側が行う） */
  paths: string[]
  fields: AliasFields
}

/** 出所を持ち、`paths` を絶対パスにした `aliases` の要素 */
export type ResolvedAlias = AliasConfig & {
  /** 要素を書いた `dev-docs.yaml` か設定ファイルの絶対パス */
  origin: string
  /** `paths` を解決した絶対パスの glob */
  patterns: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `aliases` の各要素をスキーマで検証し、有効な要素を取り出す。合わない要素は外して理由を残す */
export function parseAliases({
  items,
  schema,
  path,
}: {
  items: readonly unknown[]
  schema: Record<string, unknown>
  path: string
}): { aliases: AliasConfig[]; warnings: string[] } {
  const aliases: AliasConfig[] = []
  const warnings: string[] = []

  for (const [index, item] of items.entries()) {
    // `enabled: false` の要素は検証せずに飛ばす
    if (isRecord(item) && item.enabled === false) continue

    const itemPath = `${path}[${index}]`
    const reasons = validateSchema({ root: schema, schema: schema.items, value: item, path: itemPath })
    if (reasons.length > 0) {
      const id = isRecord(item) && typeof item.id === 'string' && item.id !== '' ? `（id: ${item.id}）` : ''
      warnings.push(`${itemPath}${id}: ${reasons.join('、')}`)
      continue
    }

    // スキーマの検証を通っているため、必須のキーは型どおりに揃っている
    const valid = item as Record<string, unknown>
    aliases.push({
      id: valid.id as string,
      type: valid.type as AliasType,
      paths: valid.paths as string[],
      fields: valid.fields as AliasFields,
    })
  }
  return { aliases, warnings }
}

/** 同じ出所の `aliases` の要素のうち、先の要素と `id` が重なる要素を外す */
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
