import type { EngineInterface } from 'claude-code'
import type { Selection } from './context'

// `$.state` に置く、会話ごとの記録の名前
const RECORDED = { plugin: 'alias-inject', key: 'recorded' } as const

/** 記録の書き込みで ifVersion が外れたときに、読み直して書き直す回数の上限 */
export const RECORD_WRITE_ATTEMPTS = 3

/** 記録の書き込みが上限の回数まで ifVersion で外れた */
export class RecordConflictError extends Error {
  constructor(recordId: string) {
    super(`記録 ${recordId} の書き込みが ${RECORD_WRITE_ATTEMPTS} 回続けて他の書き込みと重なりました`)
    this.name = 'RecordConflictError'
  }
}

/** 会話の記録の ID を返す。メインの会話はセッション ID、サブエージェントはセッション ID と agentId の組 */
export function recordIdOf({ sessionId, agentId }: { sessionId: string; agentId: string | undefined }): string {
  return agentId === undefined ? sessionId : `${sessionId}/${agentId}`
}

/** 会話の記録済みのキーと、記録のバージョンを返す */
export async function readRecorded($: EngineInterface, recordId: string): Promise<{ keys: Set<string>; version: number }> {
  const { value, version } = await $.state.get({ ...RECORDED, id: recordId })
  const keys = new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [])
  return { keys, version }
}

/** 記録済みのキーから select で語を選び、選んだ語のキーを会話の記録に追加する。選ぶ語が無ければ書かずに null を返す */
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
  // undefined は書けないため、空の並びを書く
  await $.state.set({ ...RECORDED, id: recordId }, [])
}
