import { expect, mock, test } from 'claude-code/testing'

// PoC #136: turn.step を $ から発火させ、プラグインの $.session.append が記録されるかを確認する
test('poc_turn_step_fires_and_appends', async ($, on) => {
  const session = mock.session(on)
  // PoC の観測の書き出しは捨てる
  on('fs.read', () => ({ value: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  // モデルの代わり: 目印の単語を含む応答を返す
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ZEBRA を含む応答', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  const stream = $.turn.step({ turnId: 't-1', index: 0, model: 'haiku', messageCount: 1 })
  let step = await stream.next()
  while (!step.done) step = await stream.next()
  const result = step.value

  expect(result.answer).toBe('ZEBRA を含む応答')
  const rows = session.appended()
  expect(rows.length).toBe(1)
  expect(JSON.stringify(rows[0]?.message)).toContain('POCMARK-STEP-0-MAIN')
})
