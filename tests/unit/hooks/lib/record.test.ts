import { expect, test } from 'claude-code/testing'
import type { Selection } from '../../../../hooks/lib/context'
import { RecordConflictError, addRecorded, clearRecorded, readRecorded, recordIdOf } from '../../../../hooks/lib/record'
import { createFakeEngine } from '../support/engine'
import { thrownAsync } from '../support/thrown'

// 受け取った記録済みのキーに無い候補を選ぶ select。受け取ったキーを calls に残す
function selectMissing(candidates: string[], calls: string[][]) {
  return (recorded: ReadonlySet<string>): Selection | null => {
    calls.push([...recorded].sort())
    const keys = candidates.filter((key) => !recorded.has(key))
    return keys.length === 0 ? null : { text: keys.join(','), keys }
  }
}

// メインの会話はセッション ID、サブエージェントはセッションと agentId の組にする（正常系）
test('test_record_id_of', () => {
  // 実行
  const main = recordIdOf({ sessionId: 's1', agentId: undefined })
  const agent1 = recordIdOf({ sessionId: 's1', agentId: 'agent-1' })
  const agent2 = recordIdOf({ sessionId: 's1', agentId: 'agent-2' })

  // 検証
  expect(main).toBe('s1')
  expect(new Set([main, agent1, agent2]).size).toBe(3)
})

// 書いていない記録は空になる（正常系）
test('test_read_recorded_when_never_written', async () => {
  // 準備
  const { $ } = createFakeEngine()

  // 実行
  const recorded = await readRecorded($, 's1')

  // 検証
  expect(recorded.keys).toBeInstanceOf(Set)
  expect(recorded.keys.size).toBe(0)
  expect(recorded.version).toBe(0)
})

// 選んだ語のキーがその会話の記録だけに残り、次の select に記録済みのキーが渡る（正常系）
test('test_add_recorded', async () => {
  // 準備
  const { $ } = createFakeEngine()
  const calls: string[][] = []

  // 実行
  await addRecorded($, { recordId: 's1', select: selectMissing(['a'], []) })
  await addRecorded($, { recordId: 's1', select: selectMissing(['b'], calls) })

  // 検証
  expect(calls).toEqual([['a']])
  expect([...(await readRecorded($, 's1')).keys].sort()).toEqual(['a', 'b'])
  expect((await readRecorded($, 's2')).keys.size).toBe(0)
})

// select が null なら書かずに null を返す（正常系）
test('test_add_recorded_when_nothing_selected', async () => {
  // 準備
  let setCalls = 0
  const { $ } = createFakeEngine({
    onStateSet: (write, store) => {
      setCalls += 1
      return store(write.value, write.ifVersion)
    },
  })

  // 実行
  const result = await addRecorded($, { recordId: 's1', select: () => null })

  // 検証
  expect(result).toBeNull()
  expect(setCalls).toBe(0)
})

// ifVersion が外れたら読み直して選び直す（正常系）
test('test_add_recorded_when_conflicted', async () => {
  // 準備
  // 1 回目の書き込みの前に、同じ記録へ a を書き込んで version を進める
  let injected = false
  const { $ } = createFakeEngine({
    onStateSet: (write, store) => {
      if (!injected) {
        injected = true
        store(['a'], undefined)
      }
      return store(write.value, write.ifVersion)
    },
  })
  const calls: string[][] = []

  // 実行
  const result = await addRecorded($, { recordId: 's1', select: selectMissing(['a', 'b'], calls) })

  // 検証
  expect(calls).toEqual([[], ['a']])
  expect(result?.keys).toEqual(['b'])
  expect([...(await readRecorded($, 's1')).keys].sort()).toEqual(['a', 'b'])
})

// 上限まで外れたら例外を投げる（異常系）
test('test_add_recorded_when_conflicts_exhausted', async () => {
  // 準備
  // ifVersion を付けた書き込みには常に外れたと返す
  let setCalls = 0
  const { $ } = createFakeEngine({
    onStateSet: (write, store) => {
      setCalls += 1
      if (write.ifVersion !== undefined) return { isSet: false, version: write.ifVersion + 1 }
      return store(write.value, undefined)
    },
  })

  // 実行
  const error = await thrownAsync(() => addRecorded($, { recordId: 's1', select: selectMissing(['a'], []) }))

  // 検証
  expect(error).toBeInstanceOf(RecordConflictError)
  expect(setCalls).toBe(3)
})

// 消去した記録だけが空になる（正常系）
test('test_clear_recorded', async () => {
  // 準備
  const { $ } = createFakeEngine()
  await addRecorded($, { recordId: 's1', select: selectMissing(['a'], []) })
  await addRecorded($, { recordId: 's2', select: selectMissing(['a'], []) })

  // 実行
  await clearRecorded($, 's1')

  // 検証
  expect((await readRecorded($, 's1')).keys.size).toBe(0)
  expect([...(await readRecorded($, 's2')).keys]).toEqual(['a'])
})
