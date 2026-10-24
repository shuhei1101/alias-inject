import type { Register } from 'claude-code'

/** PoC でモデルへ届いたかを判定する目印 */
const POC_MARKER = 'ALIAS-INJECT-POC-7f3a'

/** 入力の送信に目印の文脈を追加する */
export const register: Register = on => {
  on('prompt.submit', ($, e, next) =>
    next({ ...e, context: [...(e.context ?? []), `目印: ${POC_MARKER}`] }),
  )
}
