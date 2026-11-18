import type { Register } from 'claude-code'

// PoC: $.ui.log の transcript が利用者の画面に出て、モデルの入力に入らないかを確かめる
const run = Date.now().toString(36)
let seq = 0

function token(kind: string): string {
  seq += 1
  return `alias-inject-poc: TOKEN-${run}-${seq}-${kind}`
}

export const register: Register = (on) => {
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) $.ui.log(token('prompt'), { to: 'transcript' })
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const where = e.agentId === undefined ? 'main' : `agent-${e.agentId}`
    $.ui.log(token(`tool-${e.tool}-${where}`), { to: 'transcript' })
    return result
  })
}
