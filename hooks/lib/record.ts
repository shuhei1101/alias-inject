import type { EngineInterface } from 'claude-code'
import type { Selection } from './context'

// `$.state` に配置する、会話ごとの記録の名前
const RECORDED = { plugin: 'alias-inject', key: 'recorded' } as const

/** 記録の書き込みで ifVersion が一致しなかったときに、再読み込みして書き込みを再試行する回数の上限 */
export const RECORD_WRITE_ATTEMPTS = 3

/** 記録の書き込みが上限の回数まで ifVersion で一致しなかった */
export class RecordConflictError extends Error {
  constructor(recordId: string) {
    super(`記録 ${recordId} の書き込みが ${RECORD_WRITE_ATTEMPTS} 回続けて他の書き込みと重なりました`)
    this.name = 'RecordConflictError'
  }
}

/** 会話の記録の ID を返却する。メインの会話はセッション ID、サブエージェントはセッション ID と agentId の組 */
export function recordIdOf({ sessionId, agentId }: { sessionId: string; agentId: string | undefined }): string {
  return agentId === undefined ? sessionId : `${sessionId}/${agentId}`
}

/** 会話の記録済みのキーと、記録のバージョンを返却する */
export async function readRecorded($: EngineInterface, recordId: string): Promise<{ keys: Set<string>; version: number }> {
  const { value, version } = await $.state.get({ ...RECORDED, id: recordId })
  const keys = new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [])
  return { keys, version }
}

/** 記録済みのキーから select で単語を選び、選んだ単語のキーを会話の記録に追加する。選ぶ単語が無ければ書き込まずに null を返却する */
export async function addRecorded(
  $: EngineInterface,
  { recordId, select }: { recordId: string; select: (recorded: ReadonlySet<string>) => Selection | null },
): Promise<Selection | null> {
  for (let attempt = 0; attempt < RECORD_WRITE_ATTEMPTS; attempt++) {
    const { keys, version } = await readRecorded($, recordId)
    const selection = select(keys)
    if (selection === null) return null
    const { isSet } = await $.state.set({ ...RECORDED, id: recordId }, [...keys, ...selection.keys], { ifVersion: version })
    if (isSet) return selection
  }
  throw new RecordConflictError(recordId)
}

/** 会話の記録を空にする */
export async function clearRecorded($: EngineInterface, recordId: string): Promise<void> {
  // undefined は書き込めないため、空の並びを書き込む
  await $.state.set({ ...RECORDED, id: recordId }, [])
}
