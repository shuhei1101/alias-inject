import type { EngineInterface } from 'claude-code'
import { dedupeAliases, parseAliases } from './alias'
import type { ResolvedAlias } from './alias'
import { parentDir, parseYaml, readIfChanged, resolvePath } from './loader'

/** 1 つの `dev-docs.yaml` から取り出した `aliases` の要素と、外した要素の理由 */
export type RepositoryAliases = {
  /** 有効で検証を通った要素（並びの順）。`origin` は `dev-docs.yaml` の絶対パス */
  aliases: ResolvedAlias[]
  /** スキーマに合わない要素と `id` の重なった要素の理由。呼び出し元が debug log に出す */
  warnings: string[]
}

/** `dev-docs.yaml` が無い・読めない・書式が誤っていることを、パスと理由つきで伝える例外 */
export class RepositoryError extends Error {
  readonly path: string
  readonly reason: string

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`)
    this.name = 'RepositoryError'
    this.path = path
    this.reason = reason
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `dev-docs.yaml` の文字列から `aliases` だけを取り出し、`paths` をそのフォルダから解決する */
export function parseRepository({
  text,
  path,
  schema,
  home,
}: {
  text: string
  path: string
  schema: Record<string, unknown>
  home: string
}): RepositoryAliases {
  const parsed = parseYaml(text)
  if (!parsed.ok) throw new RepositoryError(path, parsed.reason)

  // 空の入力と `aliases` を持たないマッピングは、要素 0 件として扱う
  const { value } = parsed
  if (value === null) return { aliases: [], warnings: [] }
  if (!isRecord(value)) throw new RepositoryError(path, '最上位がマッピングではありません')
  if (!Object.prototype.hasOwnProperty.call(value, 'aliases')) return { aliases: [], warnings: [] }
  if (!Array.isArray(value.aliases)) throw new RepositoryError(path, 'aliases が並びではありません')

  const parsedAliases = parseAliases({ items: value.aliases, schema, path: 'aliases' })
  const deduped = dedupeAliases(parsedAliases.aliases)
  const baseDir = parentDir(path)
  return {
    aliases: deduped.aliases.map((alias) => ({
      ...alias,
      origin: path,
      patterns: alias.paths.map((pattern) => resolvePath({ path: pattern, home, baseDir })),
    })),
    warnings: [...parsedAliases.warnings, ...deduped.warnings],
  }
}

/** `dev-docs.yaml` を更新時刻が変わったときだけ読み直し、取り出した `aliases` を返す */
export async function loadRepositoryAliases(
  $: EngineInterface,
  { path, schema, home }: { path: string; schema: Record<string, unknown>; home: string },
): Promise<RepositoryAliases> {
  try {
    const stat = await $.fs.stat(path)
    return await readIfChanged($, {
      file: { path, mtimeMs: stat.mtimeMs },
      kind: 'repository',
      convert: (text) => parseRepository({ text, path, schema, home }),
    })
  } catch (error) {
    // 検証の失敗はそのまま伝え、`$.fs` の失敗はパスつきの例外にする
    if (error instanceof RepositoryError) throw error
    throw new RepositoryError(path, error instanceof Error ? error.message : String(error))
  }
}
