/** 種類 */
export type FsKind = 'file' | 'dir' | 'other'

/** `$.fs.list` の 1 項目 */
export type ListedEntry = {
  name: string
  kind: FsKind
  size: number
  mtimeMs: number
  isLink: boolean
}

/** `$.fs.stat` の結果 */
export type StatResult = {
  kind: FsKind
  size: number
  mtimeMs: number
  isLink: boolean
  realPath?: string
}

type StoredFile = { text: string; mtimeMs: number }
type StoredLink = { target: string; mtimeMs: number }

// 更新のたびに進める時刻。同じ（パス, 更新時刻）がテストをまたいで現れないようにする
let clock = 1_000

const MAX_LINK_DEPTH = 32

/** メモリ上のファイル表。ファイル・フォルダ・シンボリックリンクを持つ */
export class MemoryFs {
  /** `read` に渡されたパス（呼ばれた順） */
  readonly reads: string[] = []

  private readonly files = new Map<string, StoredFile>()
  private readonly links = new Map<string, StoredLink>()
  private readonly dirs = new Set<string>(['/'])

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.write(path, text)
  }

  /** ファイルを置く。置き直すと更新時刻が進む */
  write(path: string, text: string): void {
    this.files.set(path, { text, mtimeMs: ++clock })
    this.addAncestors(path)
  }

  /** ファイルを消す */
  remove(path: string): void {
    this.files.delete(path)
  }

  /** シンボリックリンクを置く */
  link(path: string, target: string): void {
    this.links.set(path, { target, mtimeMs: ++clock })
    this.addAncestors(path)
  }

  /** ファイルの今の更新時刻 */
  mtime(path: string): number {
    const file = this.files.get(path)
    if (file === undefined) throw new Error(`no such file: ${path}`)
    return file.mtimeMs
  }

  /** ファイルをテキストで読む。無ければ例外 */
  read(path: string): string {
    this.reads.push(path)
    const file = this.files.get(this.resolve(path))
    if (file === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    return file.text
  }

  /** 種類と更新時刻を調べる。`resolve` が true ならリンクの指す先を調べる。無ければ例外 */
  stat(path: string, resolve = false): StatResult {
    const link = this.links.get(path)
    if (link !== undefined && !resolve) {
      return { kind: 'other', size: 0, mtimeMs: link.mtimeMs, isLink: true }
    }
    const real = this.resolve(path)
    const info = this.describe(real)
    if (info === undefined) throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    return {
      kind: info.kind,
      size: info.size,
      mtimeMs: info.mtimeMs,
      isLink: link !== undefined,
      ...(resolve ? { realPath: real } : {}),
    }
  }

  /** フォルダの直下の項目を名前の順に返す。フォルダが無ければ例外 */
  list(path: string): ListedEntry[] {
    const real = this.resolve(path)
    if (!this.dirs.has(real)) throw new Error(`ENOENT: no such file or directory, scandir '${path}'`)
    const prefix = real === '/' ? '/' : `${real}/`
    const entries = new Map<string, ListedEntry>()
    const collect = (childPath: string, make: (name: string) => ListedEntry): void => {
      if (!childPath.startsWith(prefix)) return
      const name = childPath.slice(prefix.length)
      if (name === '' || name.includes('/')) return
      entries.set(name, make(name))
    }
    for (const dir of this.dirs) {
      collect(dir, (name) => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }))
    }
    for (const [file, stored] of this.files) {
      collect(file, (name) => ({
        name,
        kind: 'file',
        size: stored.text.length,
        mtimeMs: stored.mtimeMs,
        isLink: false,
      }))
    }
    for (const [link, stored] of this.links) {
      collect(link, (name) => ({ name, kind: 'other', size: 0, mtimeMs: stored.mtimeMs, isLink: true }))
    }
    return [...entries.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
  }

  // リンクをたどった先のパスを返す。パスの途中のフォルダがリンクのときも置き換える
  private resolve(path: string): string {
    let current = path
    for (let depth = 0; depth < MAX_LINK_DEPTH; depth += 1) {
      const hit = this.findLinkPrefix(current)
      if (hit === undefined) return current
      current = hit.target + current.slice(hit.prefix.length)
    }
    throw new Error(`ELOOP: too many symbolic links encountered, '${path}'`)
  }

  private findLinkPrefix(path: string): { prefix: string; target: string } | undefined {
    let best: { prefix: string; target: string } | undefined
    for (const [link, stored] of this.links) {
      if (path === link || path.startsWith(`${link}/`)) {
        if (best === undefined || link.length > best.prefix.length) {
          best = { prefix: link, target: stored.target }
        }
      }
    }
    return best
  }

  private describe(path: string): { kind: FsKind; size: number; mtimeMs: number } | undefined {
    const file = this.files.get(path)
    if (file !== undefined) return { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs }
    if (this.dirs.has(path)) return { kind: 'dir', size: 0, mtimeMs: 0 }
    return undefined
  }

  private addAncestors(path: string): void {
    const parts = path.split('/').slice(1, -1)
    let current = ''
    for (const part of parts) {
      current = `${current}/${part}`
      this.dirs.add(current)
    }
  }
}
