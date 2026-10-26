/** `env -0` の子プロセスを待つ上限（ms） */
export const VARIABLE_REFERENCE_TIMEOUT_MS = 20

/** 1 回に値の行を作る名前の数の上限 */
export const MAX_VARIABLE_REFERENCES = 50

/** 1 つの値を書く文字数の上限 */
export const MAX_VARIABLE_REFERENCE_VALUE_CHARS = 1000

// `!{名前}` の名前。名前は英字かアンダースコアで始まる
const REFERENCE = /!\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** 本文の `!{名前}` の名前を出た順に、重なりを除いて返す */
export function findReferenceNames(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(REFERENCE)) {
    // 括弧の 1 つ目は必ず当たるが、型は未定義を含むため外す
    if (match[1] !== undefined) names.add(match[1])
  }
  return [...names]
}

/** `env -0` の出力を名前 → 値に分ける */
export function parseEnvOutput(stdout: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const entry of stdout.split('\0')) {
    // 値は `=` を含んでもよいため、最初の `=` で分ける。`=` が無いか先頭にある要素は飛ばす
    const separator = entry.indexOf('=')
    if (separator <= 0) continue
    values.set(entry.slice(0, separator), entry.slice(separator + 1))
  }
  return values
}

// 設定されている名前の行。上限を超える値は先頭だけにし、改行を含む値は JSON の文字列で 1 行に収める
function formatValueLine(name: string, value: string): string {
  // 文字数はコードポイントで数え、サロゲートペアの途中で切らない
  const chars = [...value]
  const cut = chars.length > MAX_VARIABLE_REFERENCE_VALUE_CHARS
  const shown = cut ? chars.slice(0, MAX_VARIABLE_REFERENCE_VALUE_CHARS).join('') : value
  const text = shown.includes('\n') ? JSON.stringify(shown) : shown
  const note = cut ? `（${chars.length} 文字のうち先頭 ${MAX_VARIABLE_REFERENCE_VALUE_CHARS} 文字）` : ''
  return `変数参照の値: !{${name}} = ${text}${note}`
}

/** 名前ごとに値の行を作り、改行でつないで返す */
export function formatReferenceLines(names: string[], values: Map<string, string>): string {
  const lines = names.slice(0, MAX_VARIABLE_REFERENCES).map((name) => {
    const value = values.get(name)
    return value === undefined ? `変数参照の値: !{${name}} は環境変数が設定されていない` : formatValueLine(name, value)
  })
  // 上限で外した名前は行を作らず、件数だけを最後に置く
  const skipped = names.length - MAX_VARIABLE_REFERENCES
  if (skipped > 0) lines.push(`変数参照の値: ほか ${skipped} 件の変数参照は値を追加していない`)
  return lines.join('\n')
}
