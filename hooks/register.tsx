import type { Register } from 'claude-code'

// PoC: turn.step で $.session.append の後に呼んだ $.ui.log の transcript が利用者の画面に出て、
// モデルの入力に入らず、追加した user の行が次の要求でモデルに届くかを確認する
const run = Date.now().toString(36)
let seq = 0

const token = (kind: string, where: string): string => {
  seq += 1
  return `TOKEN-${kind}-${run}-${seq}-${where}`
}

export const register: Register = (on) => {
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (typeof result.answer !== 'string' || result.answer === '') return result

    const where = e.agentId === undefined ? 'main' : `agent-${e.agentId}`
    const appended = await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: `PoC の追加の行: ${token('B', where)}` }] },
      ...(e.agentId === undefined ? {} : { agentId: e.agentId }),
    })
    if (appended.deny !== undefined) $.ui.log(`append denied: ${appended.deny}`, { to: 'debug' })
    $.ui.log(token('A', where), { to: 'transcript' })
    return result
  })
}
