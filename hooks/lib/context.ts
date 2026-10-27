import type { AliasType } from './alias'
import type { Entry } from './entry'
import type { Hit } from './match'

/** 追加する文脈と、記録に入れる語のキー */
export type Selection = {
  text: string
  keys: string[]
}

/** 引用の種類ごとのセクションの見出し。並びがセクションの順 */
export const SECTION_HEADINGS: Record<AliasType, string> = {
  term: '用語',
  doc: '文書',
  command: 'コマンド',
  url: 'URL',
}

/** 出所・`aliases` の要素の `id`・項目の ID の組を 1 つの文字列にする */
export function entryKey(entry: Entry): string {
  return `${entry.origin}\u0000${entry.aliasId}\u0000${entry.id}`
}

/** 選んだ語を、見出し・引用の種類ごとのセクション・語ごとの箇条書きの Markdown にする */
export function renderContext(heading: string, entries: Entry[]): string {
  const lines = [`# ${heading}`]
  // セクションの順に種類で分ける。セクションの中は選んだ順で、出所や aliases の要素が違っても同じセクションに並べる
  for (const [type, sectionHeading] of Object.entries(SECTION_HEADINGS)) {
    const section = entries.filter((entry) => entry.type === type)
    if (section.length === 0) continue
    lines.push('', `## ${sectionHeading}`, '')
    for (const entry of section) {
      lines.push(`- ${entry.word}（id: ${entry.id}）`)
      for (const field of entry.fields) lines.push(`  - ${field.name}: ${field.value}`)
    }
  }
  return lines.join('\n')
}

/** 当たった語から記録済みの語を除き、語の数と文字数の上限に収まる語を選んで文脈にする */
export function selectEntries(
  hits: Hit[],
  recorded: ReadonlySet<string>,
  { limits }: { limits: { heading: string; maxItems: number; maxChars: number } },
): Selection | null {
  const selected: Entry[] = []
  const keys = new Set<string>()
  let text = ''

  for (const hit of hits) {
    const key = entryKey(hit.entry)
    if (recorded.has(key) || keys.has(key)) continue

    // 加えると文字数（コードポイントの数）が上限を超える語は、加えずに次の語へ進む
    const candidate = renderContext(limits.heading, [...selected, hit.entry])
    if ([...candidate].length > limits.maxChars) continue

    selected.push(hit.entry)
    keys.add(key)
    text = candidate
    if (selected.length >= limits.maxItems) break
  }

  return selected.length === 0 ? null : { text, keys: [...keys] }
}
