import { expect, test } from 'claude-code/testing'
import { installWorld, submit } from '../../unit/hooks/support/engine'
import { SETTINGS, makeFs } from './support/fixtures'

// /clear で終わるセッションの記録を消す（正常系）
test('test_normal', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })
  await submit($, 'term-a とは')

  // 実行
  const ended = await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(ended.sessionId).toBe('s1')
  expect(after.context?.[0]).toContain('Term-A')
})

// clear 以外の理由で終わるときは記録を消さない（正常系）
test('test_normal_when_not_clear', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })
  await submit($, 'term-a とは')

  // 実行
  const ended = await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(ended.sessionId).toBe('s1')
  expect(after.context ?? []).toEqual([])
})
