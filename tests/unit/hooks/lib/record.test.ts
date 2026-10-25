import { expect, test } from 'claude-code/testing'
import { addRecorded, clearRecorded, readRecorded } from '../../../../hooks/lib/record'
import { createFakeEngine } from '../support/engine'

// 書いていないセッションは空になる（正常系）
test('test_read_recorded_when_never_written', async () => {
  // 準備
  const { $ } = createFakeEngine()

  // 実行
  const recorded = await readRecorded($, 's1')

  // 検証
  expect(recorded).toBeInstanceOf(Set)
  expect(recorded.size).toBe(0)
})

// 追加したキーがそのセッションだけに残る（正常系）
test('test_add_recorded', async () => {
  // 準備
  const { $ } = createFakeEngine()

  // 実行
  await addRecorded($, 's1', ['a'])
  await addRecorded($, 's1', ['a', 'b'])

  // 検証
  expect([...(await readRecorded($, 's1'))].sort()).toEqual(['a', 'b'])
  expect((await readRecorded($, 's2')).size).toBe(0)
})

// 消去したセッションの記録だけが空になる（正常系）
test('test_clear_recorded', async () => {
  // 準備
  const { $ } = createFakeEngine()
  await addRecorded($, 's1', ['a'])
  await addRecorded($, 's2', ['a'])

  // 実行
  await clearRecorded($, 's1')

  // 検証
  expect((await readRecorded($, 's1')).size).toBe(0)
  expect([...(await readRecorded($, 's2'))]).toEqual(['a'])
})
