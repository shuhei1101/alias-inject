import type { EngineInterface } from 'claude-code'
import { isAliasType, missingKeys, resolveMetadata } from './alias'
import type { AliasKey, AliasType, ResolvedAlias } from './alias'
import { type YamlResult, expandFiles, parseYaml, readIfChanged } from './loader'
import { normalize } from './match'

/** 行が指す YAML の 1 文書。照合する語と、文脈に並べる列 */
export type Entry = {
  /** 読む行の並びでの位置 */
  aliasIndex: number
  /** 行の中の文書の並び（ファイルのパスの順、ファイルの中の `records` の順） */
  itemIndex: number
  /** 行を書いた `dev-docs.yaml` か設定ファイルの絶対パス */
  origin: string
  aliasId: string
  type: AliasType
  id: string
  /** 文脈に出す語 */
  word: string
  /** 照合する語（`name` と `aliases`）を正規化したもの。空文字と重複を除く */
  keys: string[]
  /** 文脈の箇条書きの子に並べる列。type ごとの順で、値のあるものだけ */
  fields: { name: string; value: string }[]
}

/** 1 つの行から作った語と、読めなかった YAML・外した文書 */
export type LoadedEntries = {
  entries: Entry[]
  /** 読めない・書式の誤った YAML と、必須の値が空の文書の、YAML の絶対パスと理由。呼び出し元が debug log に出す */
  failures: { path: string; reason: string }[]
}

/** YAML から取り出した 1 件の文書と、その出所 */
export type SourceDocument = {
  /** 文書を持つ YAML の絶対パス */
  path: string
  /** `records` の並びでの位置。ファイルを 1 件の文書にしたときは null */
  index: number | null
  /** 文書（ファイルの最上位か `records` の要素のマッピング） */
  value: Record<string, unknown>
}

type Item = Record<string, unknown>

function isItem(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 列の値から空でない文字列を取り出す。並びなら要素ごと
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value]
  if (Array.isArray(value)) return value.filter((element): element is string => typeof element === 'string' && element.trim() !== '')
  return []
}

// 文脈の値にする文字列。数値・真偽値は文字列にし、改行は空白 1 つにする
function textOf(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
  const flattened = text?.replace(/\s*\r?\n\s*/g, ' ').trim()
  return flattened === undefined || flattened === '' ? undefined : flattened
}

/** 1 つの YAML のパースの結果から、行の `records` に沿って文書を取り出す */
export function parseDocuments(
  value: unknown,
  records: string | undefined,
): { ok: true; documents: Item[] } | { ok: false; reason: string } {
  if (records === undefined) {
    return isItem(value) ? { ok: true, documents: [value] } : { ok: false, reason: '最上位がマッピングではありません' }
  }
  const list = isItem(value) ? value[records] : undefined
  if (!Array.isArray(list)) return { ok: false, reason: `${records} の並びがありません` }
  return { ok: true, documents: list.filter(isItem) }
}

// related の各要素の `to` を `{ID}（{名前}）` にして `, ` でつなぐ
function relatedText(value: unknown, wordOfId: Map<string, string>): string | undefined {
  if (!Array.isArray(value)) return undefined
  const texts = value
    .map((element) => (isItem(element) ? textOf(element.to) : undefined))
    .filter((to): to is string => to !== undefined)
    .map((to) => {
      const name = wordOfId.get(to)
      return name === undefined ? to : `${to}（${name}）`
    })
  return texts.length === 0 ? undefined : texts.join(', ')
}

// 種類ごとに、文脈に並べる列を決められた順で作る
function buildFields(type: AliasType, values: Record<AliasKey, unknown>, wordOfId: Map<string, string>) {
  const column = (key: AliasKey) => textOf(values[key])
  // 値をバッククォートで囲んだ列の値
  const code = (key: AliasKey) => {
    const value = column(key)
    return value === undefined ? undefined : `\`${value}\``
  }
  const candidates: [string, string | undefined][] = []
  switch (type) {
    case 'term':
      candidates.push(['description', column('description')])
      candidates.push(['related', relatedText(values.related, wordOfId)])
      break
    case 'doc':
      candidates.push(['description', column('description')])
      break
    case 'command':
      candidates.push(['command', code('command')])
      candidates.push(['cwd', column('cwd')])
      candidates.push(['description', column('description')])
      break
    case 'url':
      candidates.push(['url', column('url')])
      candidates.push(['description', column('description')])
      break
    case 'skill':
      candidates.push(['skill', code('skill')])
      candidates.push(['description', column('description')])
      break
    case 'tool':
      candidates.push(['tool', code('tool')])
      candidates.push(['description', column('description')])
      break
    case 'path':
      candidates.push(['path', code('path')])
      candidates.push(['description', column('description')])
      break
    case 'env':
      candidates.push(['url', column('url')])
      candidates.push(['port', column('port')])
      candidates.push(['description', column('description')])
      break
    case 'avoid':
      candidates.push(['replacement', column('replacement')])
      break
  }
  return candidates.flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }]))
}

// 拡張子を除いたファイル名
function baseName(path: string): string {
  const file = path.split('/').pop() ?? ''
  const dot = file.lastIndexOf('.')
  return dot <= 0 ? file : file.slice(0, dot)
}

/** 1 つの行の全ての文書から `metadata` の値を解決し、照合する語と文脈に並べる列を持つ語を作る。必須の値が空の文書は外す */
export function buildEntries(documents: SourceDocument[], alias: ResolvedAlias, aliasIndex: number): LoadedEntries {
  const failures: LoadedEntries['failures'] = []
  const kept: { itemIndex: number; type: AliasType; values: Record<AliasKey, unknown> }[] = []

  for (const [itemIndex, document] of documents.entries()) {
    const values = resolveMetadata(alias.metadata, document.value)
    // name が空なら、ファイルの文書はファイル名、records の要素は id を使う
    if (textOf(values.name) === undefined) values.name = document.index === null ? baseName(document.path) : values.id

    const id = textOf(values.id)
    const label = id ?? (alias.records !== undefined && document.index !== null ? `${alias.records}[${document.index}]` : 'id')
    if (!isAliasType(values.alias_type)) {
      failures.push({ path: document.path, reason: `${label}: alias_type の値 ${String(values.alias_type)} は引用の種類にありません` })
      continue
    }
    const missing = missingKeys(values.alias_type, values)
    if (missing.length > 0) {
      failures.push({ path: document.path, reason: `${label}: ${missing.join('、')} が空です` })
      continue
    }
    kept.push({ itemIndex, type: values.alias_type, values })
  }

  // 関連する文書の名前を引くため、この行の残った文書の ID から語を引く表を作る
  const wordOfId = new Map<string, string>()
  for (const { values } of kept) wordOfId.set(String(values.id), textOf(values.name) ?? '')

  const entries = kept.map(({ itemIndex, type, values }) => ({
    aliasIndex,
    itemIndex,
    origin: alias.origin,
    aliasId: alias.id,
    type,
    id: String(values.id),
    word: textOf(values.name) ?? '',
    keys: [...new Set([...stringsOf(values.name), ...stringsOf(values.aliases)].map(normalize).filter((key) => key !== ''))],
    fields: buildFields(type, values, wordOfId),
  }))
  return { entries, failures }
}

/** 行の `patterns` に当たる YAML を更新時刻が変わったものだけ読み直し、語の一覧を返す */
export async function loadAliasEntries($: EngineInterface, alias: ResolvedAlias, aliasIndex: number): Promise<LoadedEntries> {
  const stamps = new Map<string, { path: string; mtimeMs: number }>()
  for (const pattern of alias.patterns) {
    for (const stamp of await expandFiles($, { pattern })) stamps.set(stamp.path, stamp)
  }
  const files = [...stamps.values()].sort((a, b) => (a.path < b.path ? -1 : 1))

  const documents: SourceDocument[] = []
  const failures: LoadedEntries['failures'] = []
  for (const file of files) {
    // 読めない・書式の誤った YAML だけを外して続ける
    let result: YamlResult
    try {
      result = await readIfChanged($, { file, convert: parseYaml, kind: 'alias' })
    } catch (error) {
      failures.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (!result.ok) {
      failures.push({ path: file.path, reason: result.reason })
      continue
    }
    // records の配列が無い YAML も、その YAML だけを外す
    const parsed = parseDocuments(result.value, alias.records)
    if (!parsed.ok) {
      failures.push({ path: file.path, reason: parsed.reason })
      continue
    }
    for (const [index, value] of parsed.documents.entries()) {
      documents.push({ path: file.path, index: alias.records === undefined ? null : index, value })
    }
  }

  const built = buildEntries(documents, alias, aliasIndex)
  return { entries: built.entries, failures: [...failures, ...built.failures] }
}
