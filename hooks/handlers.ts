import type {
  EngineInterface,
  PromptSubmitInput,
  PromptSubmitResult,
  SessionCompactInput,
  SessionCompactResult,
  SessionEndInput,
  SessionEndResult,
} from 'claude-code'
import { ConfigError, isOriginAllowed, parseConfig, readConfigPath, resolveSettings } from './lib/config'
import type { Config } from './lib/config'
import { selectEntries } from './lib/context'
import type { Selection } from './lib/context'
import { parseYaml, readIfChanged } from './lib/loader'
import { findHits } from './lib/match'
import { addRecorded, clearRecorded, readRecorded } from './lib/record'
import { SourceError, loadSourceEntries } from './lib/source'
import type { Entry } from './lib/source'

type Next<Input, Result> = (e: Input) => Promise<Result>

// 外した設定の値を debug log に出し終えた設定ファイルの読み込み結果
const warnedConfigs = new WeakSet<object>()

// debug log に出す。入力の送信を止めないため、ログの失敗は呼び出し元に伝えない
function logDebug($: EngineInterface, text: string): void {
  $.ui.log(`alias-inject: ${text}`, { to: 'debug' })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 設定ファイルを更新時刻が変わったときだけ読み直す。外した値は読み直したときだけ debug log に出す
async function loadConfig($: EngineInterface, configPath: string): Promise<Config> {
  const stat = await $.fs.stat(configPath)
  const loaded = await readIfChanged($, {
    file: { path: configPath, mtimeMs: stat.mtimeMs },
    convert: (text) => {
      const parsed = parseYaml(text)
      if (!parsed.ok) throw new ConfigError(parsed.reason)
      return { config: parseConfig(parsed.value) }
    },
  })
  if (!warnedConfigs.has(loaded)) {
    warnedConfigs.add(loaded)
    for (const warning of loaded.config.warnings) logDebug($, `設定の値を外しました: ${warning}`)
  }
  return loaded.config
}

// 入力に追加する文脈を選ぶ。追加するものが無いとき、読めない設定のときは null
async function selectContext(
  $: EngineInterface,
  e: PromptSubmitInput,
): Promise<{ selection: Selection; sessionId: string } | null> {
  const configPath = await readConfigPath($)
  if (configPath === null) return null

  let config: Config
  try {
    config = await loadConfig($, configPath)
  } catch (error) {
    logDebug($, `設定ファイルを読めません（${configPath}）: ${describe(error)}`)
    return null
  }

  const home = (await $.env.get('HOME')) ?? ''
  const projectRoot = await $.session.root()
  const settings = resolveSettings(config, {
    where: {
      configDir: configPath.slice(0, Math.max(configPath.lastIndexOf('/'), 0)),
      projectRoot,
      repoRoot: (await $.session.repo())?.root ?? projectRoot,
      home,
    },
  })
  if (!settings.enabled || !isOriginAllowed(settings.origins, e.origin.kind)) return null

  // 読めない YAML のソースだけを照合から外す
  const entries: Entry[] = []
  for (const [index, source] of settings.sources.entries()) {
    try {
      entries.push(...(await loadSourceEntries($, source, index)))
    } catch (error) {
      if (!(error instanceof SourceError)) throw error
      logDebug($, `YAML を読めません（${error.path}）: ${error.reason}`)
    }
  }

  const hits = findHits(e.text, entries, settings.exclude)
  const sessionId = await $.session.id()
  const recorded = await readRecorded($, sessionId)
  const selection = selectEntries(hits, recorded, {
    limits: { heading: settings.heading, maxItems: settings.maxItems, maxChars: settings.maxChars },
  })
  return selection === null ? null : { selection, sessionId }
}

/** 入力を設定の YAML の語と照合し、そのセッションで初めて出た語の文脈を `context` の末尾に追加して渡す */
export async function handlePromptSubmit(
  $: EngineInterface,
  e: PromptSubmitInput,
  next: Next<PromptSubmitInput, PromptSubmitResult>,
): Promise<PromptSubmitResult> {
  if (e.command !== undefined) return next(e)

  let added: { selection: Selection; sessionId: string } | null
  try {
    added = await selectContext($, e)
    if (added !== null) await addRecorded($, added.sessionId, added.selection.keys)
  } catch (error) {
    // 想定しない例外でも入力の送信は止めない
    logDebug($, `文脈を追加できません: ${describe(error)}`)
    return next(e)
  }
  if (added === null) return next(e)
  return next({ ...e, context: [...(e.context ?? []), added.selection.text] })
}

/** メインの会話が圧縮された後に、そのセッションの記録を消去する */
export async function handleSessionCompact(
  $: EngineInterface,
  e: SessionCompactInput,
  next: Next<SessionCompactInput, SessionCompactResult>,
): Promise<SessionCompactResult> {
  const result = await next(e)
  if (e.trigger !== 'precompute' && e.agentId === undefined && result.skip === undefined) {
    await clearRecorded($, await $.session.id())
  }
  return result
}

/** `/clear` でセッションが終わったとき、そのセッションの記録を消去する */
export async function handleSessionEnd(
  $: EngineInterface,
  e: SessionEndInput,
  next: Next<SessionEndInput, SessionEndResult>,
): Promise<SessionEndResult> {
  if (e.reason === 'clear') await clearRecorded($, e.sessionId)
  return next(e)
}
