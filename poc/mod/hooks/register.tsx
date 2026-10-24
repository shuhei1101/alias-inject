import type { EngineInterface, FsEntry, Register } from 'claude-code'

import { load } from './vendor/js-yaml.mjs'

// PoC: 設定ファイルの場所・ファイルと更新時刻・glob・YAML・セッションの記録・圧縮と /clear・出所・待ち時間を確かめる

const injected = { plugin: 'alias-inject-poc', key: 'injected' } as const

type Term = { id: string; words: string[] }
type Cached = { mtimeMs: number; terms: Term[] }
type Engine = EngineInterface

const BENCH_RUNS = 2000

let logPath: string | undefined
let logLines: string[] | undefined
let submitPending = false
let configCache: { path: string; mtimeMs: number; files: string[] } | undefined
const termCache = new Map<string, Cached>()

/** 照合の前に NFKC・英字の小文字・前後の空白の除去でそろえる */
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().trim()

/** 検証のログを JSON Lines で書き足す */
const log = async ($: Engine, ev: string, data: Record<string, unknown>) => {
  if (logPath === undefined) {
    const home = await $.env.get('HOME')
    logPath = `${home}/.cache/alias-inject-poc/log.jsonl`
  }
  if (logLines === undefined) {
    const old = await $.fs.read(logPath).catch(() => '')
    logLines = old === '' ? [] : old.trimEnd().split('\n')
  }
  const lines = logLines
  lines.push(JSON.stringify({ at: await $.clock.now(), ev, ...data }))
  await $.fs.write(logPath, `${lines.join('\n')}\n`)
}

/** `{dir}/*.yaml` だけを受ける最小の glob */
const expandGlob = async ($: Engine, pattern: string) => {
  const cut = pattern.lastIndexOf('/')
  const dir = pattern.slice(0, cut)
  const suffix = pattern.slice(cut + 2)
  const entries = await $.fs.list(dir)
  return entries.filter((x: FsEntry) => x.kind === 'file' && x.name.endsWith(suffix)).map((x: FsEntry) => `${dir}/${x.name}`)
}

/** 更新時刻が変わったときだけ用語の YAML を読み直す */
const loadTerms = async ($: Engine, path: string): Promise<Cached> => {
  const stat = await $.fs.stat(path)
  const hit = termCache.get(path)
  if (hit !== undefined && hit.mtimeMs === stat.mtimeMs) return hit
  const doc = load(await $.fs.read(path)) as { terms?: { id: string; name?: string; aliases?: string[] }[] }
  const terms = (doc.terms ?? []).map(t => ({
    id: t.id,
    words: [t.name, ...(t.aliases ?? [])].filter((w): w is string => Boolean(w)).map(normalize),
  }))
  const next = { mtimeMs: stat.mtimeMs, terms }
  termCache.set(path, next)
  return next
}

/** 入力に語のどれかを部分文字列として含む用語を返す */
const match = (text: string, terms: Term[]) => {
  const t = normalize(text)
  return terms.filter(term => term.words.some(w => t.includes(w)))
}

/** n 語の照合の処理時間の分布を測る */
const bench = (n: number) => {
  const terms: Term[] = Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    words: [normalize(`用語${i}`), normalize(`alias-${i}`)],
  }))
  const text = '単一ユースケースで書いて、セットアップしてから用語42 と alias-7 を確かめる'
  const samples: number[] = []
  for (let i = 0; i < BENCH_RUNS; i++) {
    const s = performance.now()
    match(text, terms)
    samples.push(performance.now() - s)
  }
  samples.sort((a, b) => a - b)
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))]
  return { n, p50: at(0.5), p999: at(0.999), max: samples.at(-1) }
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    await log($, 'turn.start', { turnId: e.turnId, text: e.text.slice(0, 40) })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (submitPending) {
      submitPending = false
      await log($, 'plugin.submit', {})
      await $.prompt.submit({ text: 'プラグインから送った入力です。poc-gamma の話です。返事は OK だけでよいです。' })
    }
    return result
  })

  on('session.compact', async ($, e, next) => {
    await log($, 'session.compact.before', { trigger: e.trigger })
    const result = await next(e)
    const sessionId = await $.session.id()
    const held = await $.state.get(injected)
    // precompute は圧縮が起きないので記録を残す
    if (e.trigger !== 'precompute') {
      await $.state.set(injected, { ...(held.value ?? {}), [sessionId]: [] })
    }
    await log($, 'session.compact.after', {
      trigger: e.trigger,
      sessionId,
      skipped: 'skip' in result,
      cleared: e.trigger !== 'precompute',
    })
    return result
  })

  on('session.end', async ($, e, next) => {
    const held = await $.state.get(injected)
    const value = { ...(held.value ?? {}) }
    delete value[e.sessionId]
    await $.state.set(injected, value)
    await log($, 'session.end', { reason: e.reason, sessionId: e.sessionId, stateKeys: Object.keys(held.value ?? {}) })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined) {
      await log($, 'prompt.submit.command', { origin: e.origin })
      return next(e)
    }
    const started = performance.now()
    const fromEnv = await $.env.get('ALIAS_INJECT_CONFIG')
    const user = (await $.settings.read({ source: 'user' })) as { env?: Record<string, string> }
    const fromSettings = user.env?.ALIAS_INJECT_CONFIG
    const home = await $.env.get('HOME')
    const sessionId = await $.session.id()
    const held = await $.state.get(injected)
    await log($, 'prompt.submit', {
      origin: e.origin,
      turnId: e.turnId,
      fromEnv,
      fromSettings,
      home,
      sessionId,
      held: held.value?.[sessionId] ?? null,
      stateKeys: Object.keys(held.value ?? {}),
    })
    if (e.text.includes('ALIAS-POC-SUBMIT-PLUGIN')) {
      // prompt.submit の中からは送れないため、ターンの終わりに送る
      submitPending = true
    }
    if (e.text.includes('ALIAS-POC-BENCH')) {
      const words = Number(e.text.match(/ALIAS-POC-BENCH (\d+)/)?.[1] ?? '300')
      await log($, 'bench', { results: [bench(words), bench(words * 10)] })
    }
    const raw = fromSettings ?? fromEnv
    if (raw === undefined) return next(e)
    const path = raw.startsWith('~/') ? `${home}${raw.slice(1)}` : raw
    const stat = await $.fs.stat(path)
    if (configCache === undefined || configCache.path !== path || configCache.mtimeMs !== stat.mtimeMs) {
      const doc = load(await $.fs.read(path)) as { global: { sources: { files: string }[] } }
      configCache = { path, mtimeMs: stat.mtimeMs, files: doc.global.sources.map(s => s.files) }
      await log($, 'config.reload', { path, mtimeMs: stat.mtimeMs, files: configCache.files })
    }
    const files = (await Promise.all(configCache.files.map(f => expandGlob($, f)))).flat()
    const all = (await Promise.all(files.map(f => loadTerms($, f)))).flatMap(c => c.terms)
    const already = held.value?.[sessionId] ?? []
    const hits = match(e.text, all).filter(t => !already.includes(t.id))
    await log($, 'match', { files, hits: hits.map(h => h.id), already, ms: performance.now() - started })
    if (hits.length === 0) return next(e)
    await $.state.set(injected, { ...(held.value ?? {}), [sessionId]: [...already, ...hits.map(h => h.id)] })
    const block = `ALIAS-POC の文脈: ${hits.map(h => h.id).join(', ')}`
    return next({ ...e, context: [...(e.context ?? []), block] })
  })
}
