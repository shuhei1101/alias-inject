import type { Register } from 'claude-code'
import { pocSessionAppend, pocTurnComplete, pocTurnStep } from './poc-response'
import { handlePromptSubmit, handleSessionCompact, handleSessionEnd, handleToolCall } from './handlers'

/** hooks モジュールの入口。4 つのイベントに処理を登録する */
export const register: Register = (on) => {
  on('prompt.submit', handlePromptSubmit)
  on('session.compact', handleSessionCompact)
  on('session.end', handleSessionEnd)
  on('tool.call', handleToolCall)
  on('turn.step', pocTurnStep)
  on('turn.complete', pocTurnComplete)
  on('session.append', pocSessionAppend)
}
