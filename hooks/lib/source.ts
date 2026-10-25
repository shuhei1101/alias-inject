import type { EngineInterface } from 'claude-code'
import type { Settings, SourceConfig } from './config'
import { type YamlResult, expandFiles, parseYaml, readIfChanged } from './loader'
import { normalize } from './match'

/** ソースの 1 項目。照合する語と、文脈に並べる列 */
export type Entry = {
  /** 実効の設定の sources での並びの位置 */
  sourceIndex: number
  /** ソースの中の項目の並び（ファイルのパスの順、ファイルの中の順） */
  itemIndex: number
  label: string
  id: string
  /** 文脈に出す語 */
  word: string
  /** 照合する語を正規化したもの。空文字と重複を除く */
  keys: string[]
  /** 文脈の箇条書きの子に並べる列。type ごとの順で、値のあるものだけ */
  fields: { name: string; value: string }[]
}

type Item = Record<string, unknown>

/** ソースの YAML が読めない・書式が誤っていることを、YAML のパスと理由つきで伝える例外 */
export class SourceError extends Error {
  readonly path: string
  readonly reason: string

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`)
    this.name = 'SourceError'
    this.path = path
    this.reason = reason
  }
}

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
export function parseItems(value: unknown, source: SourceConfig): Item[] {
  const items = isItem(value) ? [value] : Array.isArray(value) ? value.filter(isItem) : []
  return items.filter((item) => {
    const id = item[source.id]
    const hasId = (typeof id === 'string' && id.trim() !== '') || typeof id === 'number'
    return hasId && source.words.some((column) => stringsOf(item[column]).length > 0)
  })
}

// term の related の各要素の `to` を `{ID}（{名前}）` にして `, ` でつなぐ
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
function buildFields(item: Item, source: SourceConfig, wordOfId: Map<string, string>) {
  const column = (name: string | undefined) => (name === undefined ? undefined : textOf(item[name]))
  const candidates: [string, string | undefined][] = []
  switch (source.type) {
    case 'term':
      candidates.push(['description', column(source.description)])
      candidates.push(['related', source.related === undefined ? undefined : relatedText(item[source.related], wordOfId)])
      break
    case 'doc':
      candidates.push(['description', column(source.description)])
      candidates.push(['mcp', source.mcp])
      break
    case 'command': {
      const command = column(source.command)
      candidates.push(['command', command === undefined ? undefined : `\`${command}\``])
      candidates.push(['cwd', column(source.cwd)])
      candidates.push(['description', column(source.description)])
      break
    }
    case 'url':
      candidates.push(['url', column(source.url)])
      candidates.push(['description', column(source.description)])
      break
  }
  return candidates.flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }]))
}

/** 1 つのソースの全ての項目から、照合する語と文脈に並べる列を持つ語を作る */
export function buildEntries(items: Item[], source: SourceConfig, sourceIndex: number): Entry[] {
  // 照合する語を words の列の順に集める。文脈に出す語は最初の列の値で、無ければ集めた最初の語
  const collected = items.map((item) => source.words.flatMap((column) => stringsOf(item[column])))
  const wordOf = items.map((item, index) => stringsOf(item[source.words[0] ?? ''])[0] ?? collected[index]?.[0] ?? '')

  const wordOfId = new Map<string, string>()
  items.forEach((item, index) => wordOfId.set(String(item[source.id]), wordOf[index] ?? ''))

  return items.map((item, index) => ({
    sourceIndex,
    itemIndex: index,
    label: source.label,
    id: String(item[source.id]),
    word: wordOf[index] ?? '',
    keys: [...new Set((collected[index] ?? []).map(normalize).filter((key) => key !== ''))],
    fields: buildFields(item, source, wordOfId),
  }))
}

/** ソースの patterns に当たる YAML を更新時刻が変わったものだけ読み直し、語の一覧を返す */
export async function loadSourceEntries(
  $: EngineInterface,
  source: Settings['sources'][number],
  sourceIndex: number,
): Promise<Entry[]> {
  const stamps = new Map<string, { path: string; mtimeMs: number }>()
  for (const pattern of source.patterns) {
    for (const stamp of await expandFiles($, { pattern })) stamps.set(stamp.path, stamp)
  }
  const files = [...stamps.values()].sort((a, b) => (a.path < b.path ? -1 : 1))

  const items: Item[] = []
  for (const file of files) {
    let result: YamlResult
    try {
      result = await readIfChanged($, { file, convert: parseYaml })
    } catch (error) {
      throw new SourceError(file.path, error instanceof Error ? error.message : String(error))
    }
    if (!result.ok) throw new SourceError(file.path, result.reason)
    items.push(...parseItems(result.value, source))
  }
  return buildEntries(items, source, sourceIndex)
}
