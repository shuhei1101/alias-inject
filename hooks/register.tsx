import type { Register } from 'claude-code'
import { handlePromptSubmit, handleSessionCompact, handleSessionEnd } from './handlers'

/** hooks モジュールの入口。3 つのイベントに処理を登録する */
export const register: Register = (on) => {
  on('prompt.submit', handlePromptSubmit)
  on('session.compact', handleSessionCompact)
  on('session.end', handleSessionEnd)
}
