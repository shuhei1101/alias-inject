import type { EngineInterface, On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { MemoryFs } from './memory-fs'

/** 既定のホーム */
export const HOME = '/home/u'

/** 設定ファイルのパスを指定するユーザースコープの settings */
export function userSettingsWithConfig(path: string): unknown {
  return { env: { ALIAS_INJECT_CONFIG: path } }
}

/** `$.ui.log` に届いた行 */
export type LogLine = { text: string; to: string }

type StateRef = { plugin: string; key: string; id?: string }

/** `$.state.set` の結果 */
export type FakeStateSetResult = { isSet: boolean; version: number }

/** `$.state.set` の 1 回の呼び出し */
export type FakeStateWrite = { ref: StateRef; value: unknown; ifVersion: number | undefined }

/** `$.state.set` を横取りする処理。`store` を呼ぶとメモリの記録へ書く（`ifVersion` を渡すと、その version のときだけ書く） */
export type FakeStateSetHook = (
  write: FakeStateWrite,
  store: (value: unknown, ifVersion: number | undefined) => FakeStateSetResult,
) => FakeStateSetResult

// settings.read の結果から、ドットでつないだキーの値を取り出す
function pick(settings: unknown, key: string | undefined): unknown {
  if (key === undefined) return settings
  let current: unknown = settings
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export type FakeEngineOptions = {
  fs?: MemoryFs
  settings?: unknown
  home?: string
  sessionId?: string
  projectRoot?: string
  /** 渡すと `$.state.set` の呼び出しごとに呼ぶ */
  onStateSet?: FakeStateSetHook
}

export type FakeEngine = {
  $: EngineInterface
  fs: MemoryFs
  logs: LogLine[]
}

/** プラグインの `$` の代わりになる、メモリ上の `$`。ライブラリの関数を直接呼ぶ単体テストで使う */
export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const fs = options.fs ?? new MemoryFs()
  const home = options.home ?? HOME
  const logs: LogLine[] = []
  const versions = new Map<string, { value: unknown; version: number }>()
  const stateKey = (ref: StateRef): string => `${ref.plugin}\u0000${ref.key}\u0000${ref.id ?? ''}`

  const fake = {
    env: { get: async (name: string) => (name === 'HOME' ? home : undefined) },
    settings: {
      read: async (args?: { source?: string; key?: string }) => pick(options.settings ?? {}, args?.key),
    },
    fs: {
      read: async (path: string) => fs.read(path),
      stat: async (path: string, opts?: { resolve: boolean }) => fs.stat(path, opts?.resolve ?? false),
      list: async (path: string) => fs.list(path),
    },
    state: {
      get: async (ref: StateRef) => versions.get(stateKey(ref)) ?? { value: undefined, version: 0 },
      set: async (ref: StateRef, value: unknown, opts?: { ifVersion?: number }) => {
        const store = (stored: unknown, ifVersion: number | undefined): FakeStateSetResult => {
          const current = versions.get(stateKey(ref))?.version ?? 0
          // ifVersion が今の version と違えば書かない
          if (ifVersion !== undefined && ifVersion !== current) return { isSet: false, version: current }
          versions.set(stateKey(ref), { value: stored, version: current + 1 })
          return { isSet: true, version: current + 1 }
        }
        const write = { ref, value, ifVersion: opts?.ifVersion }
        return options.onStateSet === undefined ? store(value, write.ifVersion) : options.onStateSet(write, store)
      },
    },
    session: {
      id: async () => options.sessionId ?? 's1',
      root: async () => options.projectRoot ?? '/repo/sample',
      repo: async () => null,
    },
    ui: { log: (text: string, opts?: { to?: string }) => void logs.push({ text, to: opts?.to ?? 'transcript' }) },
  }
  return { $: fake as unknown as EngineInterface, fs, logs }
}

export type WorldOptions = {
  fs: MemoryFs
  /** `$.settings.read` が返すユーザースコープの settings */
  settings: unknown
  home?: string
  sessionId?: string
  projectRoot?: string
}

/** 圧縮の後に残る 1 件のメッセージ（圧縮の結果は 1 件以上のメッセージを持つ決まり） */
export const COMPACTED_MESSAGE = { role: 'user' as const, text: '要約', toolUses: [] }

export type World = {
  /** `$.ui.log` に届いた行 */
  logs: LogLine[]
  /** `$.session.id()` が返すセッション ID。テストの途中で書き換えられる */
  sessionId: string
  /** 圧縮の結果（`session.compact` の一番下の処理が返す値） */
  compactResult: { messages: (typeof COMPACTED_MESSAGE)[] } | { skip: string }
}

/** エンジンの代わりに、プラグインが呼ぶ `$` の呼び出しを応答する処理をテストの `on` へ登録する */
export function installWorld(on: On, options: WorldOptions): World {
  const { fs } = options
  const world: World = { logs: [], sessionId: options.sessionId ?? 's1', compactResult: { messages: [COMPACTED_MESSAGE] } }

  mock.env(on, { HOME: options.home ?? HOME })
  on('settings.read', () => ({ value: options.settings }) as never)
  on('fs.read', (_, e) => {
    try {
      return { value: fs.read(e.path) }
    } catch (error) {
      return { deny: (error as Error).message }
    }
  })
  on('fs.stat', (_, e) => {
    try {
      return { value: fs.stat(e.path, e.resolve) }
    } catch (error) {
      return { deny: (error as Error).message }
    }
  })
  on('fs.list', (_, e) => {
    try {
      return { value: fs.list(e.path) }
    } catch (error) {
      return { deny: (error as Error).message }
    }
  })
  on('session.id', () => ({ value: world.sessionId }))
  on('session.root', () => ({ value: options.projectRoot ?? '/repo/sample' }))
  on('session.repo', () => ({ value: null }))
  on('ui.log', (_, e) => {
    world.logs.push({ text: e.text, to: e.to })
    return { value: undefined }
  })

  // 一番下の処理は、届いた入力をそのまま返す
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('session.compact', () => world.compactResult as never)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  return world
}

/** 入力を送信して、返った `text` と `context` を返す */
export async function submit(
  $: Engine,
  text: string,
  extra: { context?: readonly string[]; kind?: 'composer' | 'plugin'; command?: { name: string; args: string } } = {},
) {
  const origin = extra.kind === 'plugin' ? { kind: 'plugin' as const, name: 'test' } : { kind: 'composer' as const }
  return $.prompt.submit({
    text,
    wait: false,
    origin,
    ...(extra.context === undefined ? {} : { context: extra.context }),
    ...(extra.command === undefined ? {} : { command: extra.command }),
  })
}

/** `process.run` に届いた argv と待ちの上限 */
export type ProcessRun = { argv: readonly string[]; timeoutMs: number | undefined }

export type ToolWorld = {
  /** `tool.call` の一番下の処理が返すツールの結果 */
  answer: unknown
  /** `process.run` の応答。`{ value }` は子プロセスの結果、`{ deny }` は例外 */
  run: unknown
  /** `process.run` に届いた argv と待ちの上限 */
  runs: ProcessRun[]
  /** `$.ui.log` に届いた行 */
  logs: LogLine[]
}

/** ツールの結果と子プロセスの応答をテストの `on` へ登録する。応答はテストの途中で書き換えられる。`options` を渡すと設定ファイルと YAML のファイル表も登録し、渡さないと設定ファイルのパスの無い settings を返す */
export function installToolWorld(on: On, options?: WorldOptions): ToolWorld {
  const fileWorld = options === undefined ? undefined : installWorld(on, options)
  const world: ToolWorld = {
    answer: { result: 'r' },
    run: { value: { exitCode: 0, stdout: '' } },
    runs: [],
    logs: fileWorld?.logs ?? [],
  }
  on('tool.call', () => world.answer as never)
  on('process.run', (_, e) => {
    world.runs.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs })
    return world.run as never
  })
  if (fileWorld === undefined) {
    on('settings.read', () => ({ value: {} }) as never)
    on('ui.log', (_, e) => {
      world.logs.push({ text: e.text, to: e.to })
      return { value: undefined }
    })
  }
  return world
}

/** ツールを呼び、返ったツールの結果を返す。`input` を渡さないと Read の呼び出しにする */
export async function callTool($: Engine, input: Record<string, unknown> = { tool: 'Read', file_path: '/repo/sample/note.md' }) {
  return $.tool.call(input as never)
}

/** `NAME_01` の形の名前を `count` 個並べる */
export function numberedNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `NAME_${String(index + 1).padStart(2, '0')}`)
}
