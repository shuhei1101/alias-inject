import type { Register } from 'claude-code'

const TIMEOUT_MS = 2000

/** 子プロセスへ届く PATH と、名前で起動した env の結果を、ツールの結果の後ろの文脈に返す */
export const register: Register = (on) => {
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const lines: string[] = []

    // 絶対パスで起動し、子プロセスへ届いた PATH を読む
    try {
      const run = await $.process.run(['/usr/bin/env', '-0'], { timeoutMs: TIMEOUT_MS })
      const path = run.stdout.split('\0').find((entry) => entry.startsWith('PATH='))
      lines.push(`POC_CHILD_PATH: ${path ?? '(PATH なし)'}`)
    } catch (error) {
      lines.push(`POC_CHILD_PATH: 例外 ${error instanceof Error ? error.message : String(error)}`)
    }

    // 名前で起動し、PATH から env を引けるかを見る
    try {
      const run = await $.process.run(['env', '-0'], { timeoutMs: TIMEOUT_MS })
      const value = run.stdout.split('\0').find((entry) => entry.startsWith('ALIAS_INJECT_E2E_VALUE='))
      lines.push(`POC_ENV_BY_NAME: 終了コード ${run.exitCode} ${value ?? '(値なし)'}`)
    } catch (error) {
      lines.push(`POC_ENV_BY_NAME: 例外 ${error instanceof Error ? error.message : String(error)}`)
    }

    return { ...result, context: [...(result.context ?? []), lines.join('\n')] }
  })
}
