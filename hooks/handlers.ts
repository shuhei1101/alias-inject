import type {
  EngineInterface,
  PromptSubmitInput,
  PromptSubmitResult,
  SessionCompactInput,
  SessionCompactResult,
  SessionEndInput,
  SessionEndResult,
  ToolCallInput,
  ToolCallResult,
} from 'claude-code'
import type { ResolvedAlias } from './lib/alias'
import { ConfigError, isOriginAllowed, parseConfig, readConfigPath, resolveSettings } from './lib/config'
import type { Config } from './lib/config'
import { selectEntries } from './lib/context'
import type { Selection } from './lib/context'
import { loadAliasEntries } from './lib/entry'
import type { Entry } from './lib/entry'
import { parseYaml, readIfChanged } from './lib/loader'
import { findHits } from './lib/match'
import { addRecorded, clearRecorded, readRecorded } from './lib/record'
import { RepositoryError, loadRepositoryAliases } from './lib/repository'
import { loadAliasSchema } from './lib/schema'
import { VARIABLE_REFERENCE_TIMEOUT_MS, findReferenceNames, formatReferenceLines, parseEnvOutput } from './lib/variable'

type Next<Input, Result> = (e: Input) => Promise<Result>

// debug log に出し終えた理由。読み込みの結果（設定ファイルの検証した設定・dev-docs.yaml から取り出した aliases）ごとに持つ
const loggedWarnings = new WeakMap<object, Set<string>>()

// debug log に出す。入力の送信を止めないため、ログの失敗は呼び出し元に伝えない
function logDebug($: EngineInterface, text: string): void {
  $.ui.log(`alias-inject: ${text}`, { to: 'debug' })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 外した要素と無視した値の理由を、読み込みの結果が変わらないうち 1 回だけ debug log に出す
function logWarningsOnce($: EngineInterface, owner: object, path: string, warnings: string[]): void {
  const logged = loggedWarnings.get(owner) ?? new Set<string>()
  loggedWarnings.set(owner, logged)
  for (const warning of warnings) {
    if (logged.has(warning)) continue
    logged.add(warning)
    logDebug($, `設定の値を外しました（${path}）: ${warning}`)
  }
}

// 設定ファイルを更新時刻が変わったときだけ読み直す
async function loadConfig($: EngineInterface, configPath: string, schema: Record<string, unknown>): Promise<Config> {
  const stat = await $.fs.stat(configPath)
  const loaded = await readIfChanged($, {
    file: { path: configPath, mtimeMs: stat.mtimeMs },
    kind: 'config',
    convert: (text) => {
      const parsed = parseYaml(text)
      if (!parsed.ok) throw new ConfigError(parsed.reason)
      return { config: parseConfig(parsed.value, schema) }
    },
  })
  return loaded.config
}

// 読むリポジトリの aliases を repositories の順に並べる。読めない dev-docs.yaml は、そのリポジトリだけを外す
async function loadRepositories(
  $: EngineInterface,
  repositories: string[],
  schema: Record<string, unknown>,
  home: string,
): Promise<ResolvedAlias[]> {
  const aliases: ResolvedAlias[] = []
  for (const path of repositories) {
    try {
      const loaded = await loadRepositoryAliases($, { path, schema, home })
      logWarningsOnce($, loaded, path, loaded.warnings)
      aliases.push(...loaded.aliases)
    } catch (error) {
      if (!(error instanceof RepositoryError)) throw error
      logDebug($, `dev-docs.yaml を読めません（${error.path}）: ${error.reason}`)
    }
  }
  return aliases
}

// 入力に追加する文脈を選ぶ。追加するものが無いとき、読めない設定のときは null
async function selectContext(
  $: EngineInterface,
  e: PromptSubmitInput,
): Promise<{ selection: Selection; sessionId: string } | null> {
  const configPath = await readConfigPath($)
  if (configPath === null) return null

  const schema = loadAliasSchema()
  let config: Config
  try {
    config = await loadConfig($, configPath, schema)
  } catch (error) {
    logDebug($, `設定ファイルを読めません（${configPath}）: ${describe(error)}`)
    return null
  }

  const home = await $.env.get('HOME')
  if (home === undefined) throw new Error('環境変数 HOME がありません')
  const projectRoot = await $.session.root()
  const settings = resolveSettings(config, {
    where: { configPath, projectRoot, repoRoot: (await $.session.repo())?.root ?? projectRoot, home },
  })
  logWarningsOnce($, config, configPath, [...config.warnings, ...settings.warnings])
  if (!settings.enabled || !isOriginAllowed(settings.origins, e.origin.kind)) return null

  // 読むリポジトリの aliases の後ろに、設定ファイルの aliases を並べる。読めない YAML だけを外す
  const aliases = [...(await loadRepositories($, settings.repositories, schema, home)), ...settings.aliases]
  const entries: Entry[] = []
  for (const [index, alias] of aliases.entries()) {
    const loaded = await loadAliasEntries($, alias, index)
    for (const failure of loaded.failures) logDebug($, `YAML を読めません（${failure.path}）: ${failure.reason}`)
    entries.push(...loaded.entries)
  }

  const hits = findHits(e.text, entries, settings.exclude)
  const sessionId = await $.session.id()
  const recorded = await readRecorded($, sessionId)
  const selection = selectEntries(hits, recorded, {
    limits: { heading: settings.heading, maxItems: settings.maxItems, maxChars: settings.maxChars },
  })
  return selection === null ? null : { selection, sessionId }
}

/** 入力を読むリポジトリと設定ファイルの `aliases` が指す YAML の語と照合し、そのセッションで初めて出た語の文脈を `context` の末尾に追加して渡す */
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

/** ツールの結果の本文の `!{名前}` に、同じ名前の環境変数の値を `context` の末尾に追加して返す */
export async function handleToolCall(
  $: EngineInterface,
  e: ToolCallInput,
  next: Next<ToolCallInput, ToolCallResult>,
): Promise<ToolCallResult> {
  const result = await next(e)
  if (result.deny !== undefined || result.isError || typeof result.text !== 'string') return result

  const names = findReferenceNames(result.text)
  if (names.length === 0) return result

  try {
    const run = await $.process.run(['env', '-0'], { timeoutMs: VARIABLE_REFERENCE_TIMEOUT_MS })
    if (run.exitCode !== 0) {
      logDebug($, `変数参照の値を引けません: env の終了コード ${run.exitCode}`)
      return result
    }
    const lines = formatReferenceLines(names, parseEnvOutput(run.stdout))
    return { ...result, context: [...(result.context ?? []), lines] }
  } catch (error) {
    // 起動できない・待ちの上限の超過を含め、値を引けなくてもツールの結果は止めない
    logDebug($, `変数参照の値を引けません: ${describe(error)}`)
    return result
  }
}
