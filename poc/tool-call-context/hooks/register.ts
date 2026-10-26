import type { Register } from 'claude-code'

const REFERENCE = /!\{([A-Za-z_][A-Za-z0-9_]*)\}/g

// env -0 の出力を名前 → 値へ分ける。値に改行を含んでも NUL で区切れる
function parseEnv(stdout: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const entry of stdout.split('\0')) {
    const at = entry.indexOf('=')
    if (at > 0) values.set(entry.slice(0, at), entry.slice(at + 1))
  }
  return values
}

function argvFor(mode: string | undefined): { argv: string[]; timeoutMs?: number } {
  if (mode === 'exitcode') return { argv: ['sh', '-c', 'exit 3'] }
  if (mode === 'nostart') return { argv: ['poc-no-such-command'] }
  if (mode === 'timeout') return { argv: ['sleep', '5'], timeoutMs: 500 }
  return { argv: ['env', '-0'] }
}

export const register: Register = (on) => {
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.isError || typeof r.text !== 'string') return r
    const names = [...new Set([...r.text.matchAll(REFERENCE)].map((m) => m[1]))]
    if (names.length === 0) return r
    const mode = await $.env.get('POC_MODE')
    try {
      const lines: string[] = []
      if (mode === 'timing') {
        const ms: number[] = []
        for (let i = 0; i < 10; i++) {
          const start = Date.now()
          await $.process.run(['env', '-0'])
          ms.push(Date.now() - start)
        }
        lines.push(`POC 所要時間(ms): ${ms.join(',')}`)
      }
      const { argv, timeoutMs } = argvFor(mode)
      const run = await $.process.run(argv, timeoutMs === undefined ? undefined : { timeoutMs })
      if (run.exitCode !== 0) {
        $.ui.log(`poc: env の終了コード ${run.exitCode}`, { to: 'debug' })
        return r
      }
      const values = parseEnv(run.stdout)
      for (const name of names) {
        const value = values.get(name)
        lines.push(value === undefined ? `変数参照の値: !{${name}} は環境変数が設定されていない` : `変数参照の値: !{${name}} = ${JSON.stringify(value)}`)
      }
      return { ...r, context: [...(r.context ?? []), lines.join('\n')] }
    } catch (error) {
      $.ui.log(`poc: 値を引けない: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
      return r
    }
  })
}
