import { expect, test } from 'claude-code/testing'
import { COMPACTED_MESSAGE, callTool, installToolWorld, installWorld, submit } from '../../unit/hooks/support/engine'
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

// precompute・見送りでは記録を残す（正常系）
test('test_normal_when_not_compacted', async ($, on) => {
  // 準備
  const world = installWorld(on, { fs: makeFs(), settings: SETTINGS })
  const before = await submit($, 'term-a とは')

  // 実行
  // precompute・見送りの 2 つを順に起こす
  const precomputed = await $.session.compact({ trigger: 'precompute', messages: [COMPACTED_MESSAGE] })
  world.compactResult = { skip: 'not compacted' }
  const skipped = await $.session.compact({ trigger: 'manual', messages: [COMPACTED_MESSAGE] })
  const after = await submit($, 'term-a とは')

  // 検証
  expect(before.context?.length).toBe(1)
  expect(precomputed.messages).toEqual([COMPACTED_MESSAGE])
  expect(skipped.skip).toBe('not compacted')
  expect(after.context ?? []).toEqual([])
})

// agentId のある圧縮ではそのサブエージェントの記録だけを消す（正常系）
test('test_normal_when_subagent_compacted', async ($, on) => {
  // 準備
  const world = installToolWorld(on, { fs: makeFs(), settings: SETTINGS })
  world.answer = { result: 'r', text: 'term-b' }
  const agentRead = { tool: 'Read', file_path: '/work/note.md', agentId: 'agent-1' }
  await submit($, 'term-a とは')
  await callTool($, agentRead)

  // 実行
  const compacted = await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: [COMPACTED_MESSAGE] })
  const agentAfter = await callTool($, agentRead)
  const mainAfter = await submit($, 'term-a とは')

  // 検証
  expect(compacted.messages).toEqual([COMPACTED_MESSAGE])
  expect(agentAfter.context?.[0]).toContain('id: term-b')
  expect(mainAfter.context ?? []).toEqual([])
})
