import type { EngineInterface } from 'claude-code'

// PoC #136: 応答の文のイベントの観測。観測した入力・結果を JSON Lines で書き出す
const LOG = '/tmp/poc136/events.jsonl'

async function record($: EngineInterface, row: Record<string, unknown>): Promise<void> {
  let prev = ''
  try {
    prev = await $.fs.read(LOG)
  } catch {
    prev = ''
  }
  await $.fs.write(LOG, prev + JSON.stringify({ at: Date.now(), ...row }) + '\n')
  $.ui.log(`poc136: ${JSON.stringify(row)}`, { to: 'debug' })
}

// 1 回のモデルへの要求ごとの応答（途中の文を含む）
export async function* pocTurnStep($: EngineInterface, e: any, next: any): AsyncGenerator<any, any> {
  const result = yield* next(e)
  await record($, { event: 'turn.step', agentId: e.agentId ?? null, turnId: e.turnId, index: e.index, answer: result.answer, toolUses: (result.toolUses ?? []).map((t: any) => t.name) })
  if (typeof result.answer === 'string' && result.answer.includes('ZEBRA')) {
    const marker = `POCMARK-STEP-${String(e.index)}-${e.agentId ? 'SUB' : 'MAIN'}`
    const appended = await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: `PoC の目印: ${marker}` }] },
      ...(e.agentId ? { agentId: e.agentId } : {}),
    })
    await record($, { event: 'session.append(call)', marker, agentId: e.agentId ?? null, result: appended })
  }
  return result
}

// ターンの最後の応答
export async function pocTurnComplete($: EngineInterface, e: any, next: any): Promise<any> {
  const result = await next(e)
  await record($, { event: 'turn.complete', agentId: e.agentId ?? null, turnId: e.turnId, reason: e.reason, answer: e.answer })
  return result
}

// 会話に追加される行（応答の行）
export async function pocSessionAppend($: EngineInterface, e: any, next: any): Promise<any> {
  const result = await next(e)
  if (e.door === 'response') {
    const text = (e.message?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    await record($, { event: 'session.append', door: e.door, agentId: e.agentId ?? null, text })
  }
  return result
}
