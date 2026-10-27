import type { Entry } from './entry'

/** 入力に当たった語と、最初に出た位置 */
export type Hit = {
  entry: Entry
  /** 正規化した入力で、その語の keys のどれかが最初に出た位置 */
  position: number
  /** その位置で当たった key のうち最も長いものの長さ */
  length: number
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
    for (const key of entry.keys) {
      if (excluded.has(key)) continue
      const position = normalizedText.indexOf(key)
      if (position < 0) continue
      if (best === undefined || position < best.position || (position === best.position && key.length > best.length)) {
        best = { position, length: key.length }
      }
    }
    if (best !== undefined) hits.push({ entry, ...best })
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
