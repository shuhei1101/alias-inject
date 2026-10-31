import type { Entry } from './entry'

/** 入力に当たった語と、最初に出た位置 */
export type Hit = {
  entry: Entry
  /** 正規化した入力で、その語の keys のどれかが最初に出た位置 */
  position: number
  /** その位置で当たった key のうち最も長いものの長さ */
  length: number
  /** 正規化した入力で、その語の keys のどれかが始まる位置の数（同じ位置は 1 回） */
  count: number
}

/** NFKC・英字の小文字・前後の空白の除去でそろえる */
export function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim()
}

/** 入力に含まれる語を、最初に出た位置の順に返す */
export function findHits(text: string, entries: Entry[], exclude: string[]): Hit[] {
  const normalizedText = normalize(text)
  const excluded = new Set(exclude.map(normalize))

  const hits: Hit[] = []
  for (const entry of entries) {
    let best: { position: number; length: number } | undefined
    const positions = new Set<number>()
    for (const key of entry.keys) {
      if (excluded.has(key) || key === '') continue
      for (let position = normalizedText.indexOf(key); position >= 0; position = normalizedText.indexOf(key, position + 1)) {
        positions.add(position)
        if (best === undefined || position < best.position || (position === best.position && key.length > best.length)) {
          best = { position, length: key.length }
        }
      }
    }
    if (best !== undefined) hits.push({ entry, ...best, count: positions.size })
  }

  // 位置の昇順、同じ位置なら長い語が先、それも同じなら aliasIndex・itemIndex の順
  return hits.sort(
    (a, b) =>
      a.position - b.position ||
      b.length - a.length ||
      a.entry.aliasIndex - b.entry.aliasIndex ||
      a.entry.itemIndex - b.entry.itemIndex,
  )
}

/** 当たった語を、出た位置の数の降順に並べた複製を返す */
export function sortByCount(hits: Hit[]): Hit[] {
  // 数が同じなら、位置の昇順・長い語が先・aliasIndex・itemIndex の順
  return [...hits].sort(
    (a, b) =>
      b.count - a.count ||
      a.position - b.position ||
      b.length - a.length ||
      a.entry.aliasIndex - b.entry.aliasIndex ||
      a.entry.itemIndex - b.entry.itemIndex,
  )
}
