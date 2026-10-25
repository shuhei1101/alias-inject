import { expect, test } from 'claude-code/testing'
import { COMPACTED_MESSAGE, installWorld, submit } from '../../unit/hooks/support/engine'
import { SETTINGS, makeFs } from './support/fixtures'

// 圧縮の後に記録を消し、同じ語の文脈がもう一度追加される（正常系）
test('test_normal', async ($, on) => {
  // 準備
  installWorld(on, { fs: makeFs(), settings: SETTINGS })
  await submit($, 'term-a とは')

  // 実行
  const compacted = await $.session.compact({ trigger: 'manual', messages: [COMPACTED_MESSAGE] })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(compacted.skip).toBeUndefined()
  expect(compacted.messages).toEqual([COMPACTED_MESSAGE])
  expect(after.context?.[0]).toContain('Term-A')
})

// precompute・見送り・サブエージェントの圧縮では記録を残す（正常系）
test('test_normal_when_not_compacted', async ($, on) => {
  // 準備
  const world = installWorld(on, { fs: makeFs(), settings: SETTINGS })
  const before = await submit($, 'term-a とは')

  // 実行
  // precompute・見送り・サブエージェントの圧縮の 3 つを順に起こす
  const precomputed = await $.session.compact({ trigger: 'precompute', messages: [COMPACTED_MESSAGE] })
  world.compactResult = { skip: 'not compacted' }
  const skipped = await $.session.compact({ trigger: 'manual', messages: [COMPACTED_MESSAGE] })
  world.compactResult = { messages: [COMPACTED_MESSAGE] }
  const sub = await $.session.compact({ trigger: 'auto', agentId: 'sub1', messages: [COMPACTED_MESSAGE] })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(before.context?.length).toBe(1)
  expect(precomputed.messages).toEqual([COMPACTED_MESSAGE])
  expect(skipped.skip).toBe('not compacted')
  expect(sub.messages).toEqual([COMPACTED_MESSAGE])
  expect(after.context ?? []).toEqual([])
})
