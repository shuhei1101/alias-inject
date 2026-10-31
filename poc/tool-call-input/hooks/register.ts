import type { Register } from 'claude-code'

// tool.call の入口と next(e) の後で、時刻と e を 1 呼び出し 1 ファイルずつ書き出す（並列の呼び出しで書き込みが競合しないように）
export const register: Register = (on) => {
  on('tool.call', async ($, e, next) => {
    const dir = await $.env.get('POC_LOG_DIR')
    const id = (e as { tool_use_id?: string }).tool_use_id ?? 'unknown'
    const enteredAt = Date.now()
    const r = await next(e)
    const leftAt = Date.now()
    if (dir !== undefined) {
      await $.fs.write(`${dir}/${id}.json`, JSON.stringify({ enteredAt, leftAt, e, isError: r.isError ?? false, hasText: typeof r.text === 'string' }))
    }
    if (r.deny !== undefined || r.isError || typeof r.text !== 'string') return r
    return { ...r, context: [...(r.context ?? []), `POC-MARK-QUOTE-${id.slice(-6)}`, `POC-MARK-VAR-${id.slice(-6)}`] }
  })
}
