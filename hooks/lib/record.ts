import type { EngineInterface } from 'claude-code'

// `$.state` に置く、セッションごとの記録の名前
const RECORDED = { plugin: 'alias-inject', key: 'recorded' } as const

/** セッションの記録済みのキーを返す */
export async function readRecorded($: EngineInterface, sessionId: string): Promise<Set<string>> {
  const { value } = await $.state.get({ ...RECORDED, id: sessionId })
  return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [])
}

/** セッションの記録にキーを追加する */
export async function addRecorded($: EngineInterface, sessionId: string, keys: string[]): Promise<void> {
  const merged = await readRecorded($, sessionId)
  for (const key of keys) merged.add(key)
  await $.state.set({ ...RECORDED, id: sessionId }, [...merged])
}

/** セッションの記録を空にする */
export async function clearRecorded($: EngineInterface, sessionId: string): Promise<void> {
  // undefined は書けないため、空の並びを書く
  await $.state.set({ ...RECORDED, id: sessionId }, [])
}
