import type { EngineInterface } from 'claude-code'
import type { AliasFields, AliasType, ResolvedAlias } from './alias'
import { type YamlResult, expandFiles, parseYaml, readIfChanged } from './loader'
import { normalize } from './match'

/** `aliases` の要素が指す YAML の 1 項目。照合する語と、文脈に並べる列 */
export type Entry = {
  /** 読む `aliases` の要素の並びでの位置 */
  aliasIndex: number
  /** 要素の中の項目の並び（ファイルのパスの順、ファイルの中の順） */
  itemIndex: number
  /** 要素を書いた `dev-docs.yaml` か設定ファイルの絶対パス */
  origin: string
  aliasId: string
  type: AliasType
  id: string
  /** 文脈に出す語 */
  word: string
  /** 照合する語を正規化したもの。空文字と重複を除く */
  keys: string[]
  /** 文脈の箇条書きの子に並べる列。type ごとの順で、値のあるものだけ */
  fields: { name: string; value: string }[]
}

/** 1 つの `aliases` の要素から作った語と、読めなかった YAML */
export type LoadedEntries = {
  entries: Entry[]
  /** 読めない・書式の誤った YAML の絶対パスと理由。呼び出し元が debug log に出す */
  failures: { path: string; reason: string }[]
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

/** 1 つの YAML のパースの結果から、ID と照合する語を持つ項目を取り出す */
export function parseItems(value: unknown, fields: AliasFields): Item[] {
  const items = isItem(value) ? [value] : Array.isArray(value) ? value.filter(isItem) : []
  return items.filter((item) => {
    const id = item[fields.id]
    const hasId = (typeof id === 'string' && id.trim() !== '') || typeof id === 'number'
    return hasId && fields.match.some((column) => stringsOf(item[column]).length > 0)
  })
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

// type ごとに、文脈に並べる列を決められた順で作る
function buildFields(item: Item, alias: ResolvedAlias, wordOfId: Map<string, string>) {
  const { fields } = alias
  const column = (name: string | undefined) => (name === undefined ? undefined : textOf(item[name]))
  const candidates: [string, string | undefined][] = []
  switch (alias.type) {
    case 'term':
      candidates.push(['description', column(fields.description)])
      candidates.push(['related', fields.related === undefined ? undefined : relatedText(item[fields.related], wordOfId)])
      break
    case 'doc':
      candidates.push(['description', column(fields.description)])
      break
    case 'command': {
      const command = column(fields.command)
      candidates.push(['command', command === undefined ? undefined : `\`${command}\``])
      candidates.push(['cwd', column(fields.cwd)])
      candidates.push(['description', column(fields.description)])
      break
    }
    case 'url':
      candidates.push(['url', column(fields.url)])
      candidates.push(['description', column(fields.description)])
      break
  }
  return candidates.flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }]))
}

/** 1 つの `aliases` の要素の全ての項目から、照合する語と文脈に並べる列を持つ語を作る */
export function buildEntries(items: Item[], alias: ResolvedAlias, aliasIndex: number): Entry[] {
  // 照合する語を match の列の順に集める。文脈に出す語は title の列の値で、無ければ集めた最初の語
  const collected = items.map((item) => alias.fields.match.flatMap((column) => stringsOf(item[column])))
  const wordOf = items.map((item, index) => {
    const title = alias.fields.title === undefined ? [] : stringsOf(item[alias.fields.title])
    return title[0] ?? collected[index]?.[0] ?? ''
  })

  const wordOfId = new Map<string, string>()
  items.forEach((item, index) => wordOfId.set(String(item[alias.fields.id]), wordOf[index] ?? ''))

  return items.map((item, index) => ({
    aliasIndex,
    itemIndex: index,
    origin: alias.origin,
    aliasId: alias.id,
    type: alias.type,
    id: String(item[alias.fields.id]),
    word: wordOf[index] ?? '',
    keys: [...new Set((collected[index] ?? []).map(normalize).filter((key) => key !== ''))],
    fields: buildFields(item, alias, wordOfId),
  }))
}

/** `aliases` の要素の `patterns` に当たる YAML を更新時刻が変わったものだけ読み直し、語の一覧を返す */
export async function loadAliasEntries($: EngineInterface, alias: ResolvedAlias, aliasIndex: number): Promise<LoadedEntries> {
  const stamps = new Map<string, { path: string; mtimeMs: number }>()
  for (const pattern of alias.patterns) {
    for (const stamp of await expandFiles($, { pattern })) stamps.set(stamp.path, stamp)
  }
  const files = [...stamps.values()].sort((a, b) => (a.path < b.path ? -1 : 1))

  const items: Item[] = []
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
    items.push(...parseItems(result.value, alias.fields))
  }
  return { entries: buildEntries(items, alias, aliasIndex), failures }
}
