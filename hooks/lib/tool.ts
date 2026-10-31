import type { ToolCallInput } from 'claude-code'
import type { Entry } from './entry'
import { parentDir, resolvePath } from './loader'
import type { Hit } from './match'

// ツールの引数ではない、tool.call の入力のキー
const RESERVED_KEYS = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta'])

/** ツールの引数に出る文字列を、入れ子のオブジェクトと並びの中まで集める */
export function collectArgumentStrings(e: ToolCallInput): Set<string> {
  const strings = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string') strings.add(value)
    else if (Array.isArray(value)) for (const element of value) collect(element)
    else if (typeof value === 'object' && value !== null) for (const child of Object.values(value)) collect(child)
  }
  for (const [key, value] of Object.entries(e)) {
    if (!RESERVED_KEYS.has(key)) collect(value)
  }
  return strings
}

/** 語の文書のパスを返す。body_file の値があれば、語を取り出した YAML のフォルダから解決する */
export function documentPathOf(entry: Entry, { home }: { home: string }): string {
  if (entry.bodyFile === undefined) return entry.path
  return resolvePath({ path: entry.bodyFile, home, baseDir: parentDir(entry.path) })
}

/** ツールが読んでいる文書の語を外す。Read は file_path、MCP のツールは引数の文字列で判定する */
export function excludeReadingDocuments(hits: Hit[], { e, home }: { e: ToolCallInput; home: string }): Hit[] {
  if (e.tool === 'Read') {
    const filePath = (e as Record<string, unknown>).file_path
    if (typeof filePath !== 'string') return hits
    return hits.filter((hit) => documentPathOf(hit.entry, { home }) !== filePath)
  }
  if (e.tool.startsWith('mcp__')) {
    const strings = collectArgumentStrings(e)
    return hits.filter((hit) => !strings.has(hit.entry.id))
  }
  return hits
}
