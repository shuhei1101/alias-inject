import type { EngineInterface } from 'claude-code'
import { YAMLException, load } from '../vendor/js-yaml.mjs'

/** glob を展開して見つけたファイルのパスと更新時刻 */
export type FileStamp = {
  path: string
  mtimeMs: number
}

/** パースした値か、読めなかった理由 */
export type YamlResult = { ok: true; value: unknown } | { ok: false; reason: string }

type CacheEntry = { mtimeMs: number; value: unknown }

// 変わったファイルの読み込みのキャッシュ（パス → 更新時刻と変換した値）
const cache = new Map<string, CacheEntry>()

const BOM = '﻿'

/** 変わったファイルの読み込みのキャッシュを空にする */
export function clearCache(): void {
  cache.clear()
}

/** 先頭の `~` をホームのパスへ置き換える */
export function expandHome({ path, home }: { path: string; home: string }): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return `${home}${path.slice(1)}`
  return path
}

/** `~` を展開し、相対パスを基準のフォルダからの絶対パスにする */
export function resolvePath({ path, home, baseDir }: { path: string; home: string; baseDir: string }): string {
  const expanded = expandHome({ path, home })
  if (expanded.startsWith('/')) return expanded
  const base = baseDir.replace(/\/+$/, '')
  const relative = expanded.replace(/^(\.\/)+/, '')
  return `${base}/${relative}`
}

/** ファイル名が `*` を含む glob の 1 区切りに当たるかを判定する */
export function matchSegment(name: string, segment: string): boolean {
  const pieces = segment.split('*')
  if (pieces.length === 1) return name === segment
  const first = pieces[0] ?? ''
  const last = pieces[pieces.length - 1] ?? ''
  if (name.length < first.length + last.length) return false
  if (!name.startsWith(first) || !name.endsWith(last)) return false
  // 間の片を、先頭の片と末尾の片に重ならない範囲で順に探す
  const end = name.length - last.length
  let position = first.length
  for (const piece of pieces.slice(1, -1)) {
    const found = name.indexOf(piece, position)
    if (found < 0 || found + piece.length > end) return false
    position = found + piece.length
  }
  return true
}

// リンクの指す先まで調べた項目の種類と更新時刻。指す先が無いリンクは undefined
async function inspect(
  $: EngineInterface,
  path: string,
  entry: { kind: 'file' | 'dir' | 'other'; mtimeMs: number; isLink: boolean },
): Promise<{ kind: 'file' | 'dir' | 'other'; mtimeMs: number; realPath: string } | undefined> {
  if (!entry.isLink) return { kind: entry.kind, mtimeMs: entry.mtimeMs, realPath: path }
  try {
    const target = await $.fs.stat(path, { resolve: true })
    return { kind: target.kind, mtimeMs: target.mtimeMs, realPath: target.realPath ?? path }
  } catch {
    return undefined
  }
}

// 一覧が取れないフォルダは、その枝を空として扱う
async function listOrEmpty($: EngineInterface, folder: string) {
  try {
    return await $.fs.list(folder)
  } catch {
    return []
  }
}

// フォルダ自身と配下の全てのフォルダ。同じ実体（realPath）のフォルダは 2 度たどらない
async function withDescendants($: EngineInterface, root: string, visited: Set<string>): Promise<string[]> {
  let real: string
  try {
    real = (await $.fs.stat(root, { resolve: true })).realPath ?? root
  } catch {
    return []
  }
  if (visited.has(real)) return []
  visited.add(real)
  const folders = [root]
  for (const entry of await listOrEmpty($, root)) {
    const child = `${root === '/' ? '' : root}/${entry.name}`
    const info = await inspect($, child, entry)
    if (info?.kind !== 'dir') continue
    folders.push(...(await withDescendants($, child, visited)))
  }
  return folders
}

/** 絶対パスの glob に当たるファイルを、更新時刻つきでパスの順に返す */
export async function expandFiles($: EngineInterface, { pattern }: { pattern: string }): Promise<FileStamp[]> {
  if (!pattern.includes('*')) {
    try {
      const stat = await $.fs.stat(pattern, { resolve: true })
      return stat.kind === 'file' ? [{ path: pattern, mtimeMs: stat.mtimeMs }] : []
    } catch {
      return []
    }
  }

  // `*` を含む最初の区切りより前を起点のフォルダ、それ以降を区切りの並びとする
  const parts = pattern.split('/')
  const firstStar = parts.findIndex((part) => part.includes('*'))
  const base = parts.slice(0, firstStar).join('/') || '/'
  const segments = parts.slice(firstStar)

  let folders = [base]
  const files = new Map<string, FileStamp>()
  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1
    const next: string[] = []
    const visited = new Set<string>()
    for (const folder of folders) {
      if (segment === '**') {
        next.push(...(await withDescendants($, folder, visited)))
        continue
      }
      for (const entry of await listOrEmpty($, folder)) {
        const matched = segment.includes('*') ? matchSegment(entry.name, segment) : entry.name === segment
        if (!matched) continue
        const path = `${folder === '/' ? '' : folder}/${entry.name}`
        const info = await inspect($, path, entry)
        if (info === undefined) continue
        if (isLast && info.kind === 'file') files.set(path, { path, mtimeMs: info.mtimeMs })
        if (!isLast && info.kind === 'dir') next.push(path)
      }
    }
    folders = [...new Set(next)]
  }
  return [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
}

/** 更新時刻が前回と同じファイルは読まずに前回の値を返し、変わったときだけ読んで変換する */
export async function readIfChanged<T>(
  $: EngineInterface,
  { file, convert }: { file: FileStamp; convert: (text: string) => T },
): Promise<T> {
  const cached = cache.get(file.path)
  if (cached !== undefined && cached.mtimeMs === file.mtimeMs) return cached.value as T
  const text = await $.fs.read(file.path)
  const value = convert(text)
  cache.set(file.path, { mtimeMs: file.mtimeMs, value })
  return value
}

// 空・コメントだけの入力は js-yaml の load が例外を投げるため、呼ぶ前に見分ける
function isBlankYaml(text: string): boolean {
  return text.split('\n').every((line) => {
    const trimmed = line.trim()
    return trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...'
  })
}

/** YAML の文字列を値にし、書式の誤りを例外ではなく理由で返す */
export function parseYaml(text: string): YamlResult {
  const body = text.startsWith(BOM) ? text.slice(1) : text
  if (isBlankYaml(body)) return { ok: true, value: null }
  try {
    return { ok: true, value: load(body) }
  } catch (error) {
    if (error instanceof YAMLException && error.mark !== undefined) {
      return { ok: false, reason: `${error.reason}（${error.mark.line + 1}:${error.mark.column + 1}）` }
    }
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
