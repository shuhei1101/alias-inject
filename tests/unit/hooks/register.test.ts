import { expect, test } from 'claude-code/testing'

// 入口を読み込んでも入力の送信が変わらずに届く（正常系）
test('test_register', async ($, on) => {
  // 準備
  // エンジンの代わりに、届いた text と context をそのまま返す
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  // 実行
  const result = await $.prompt.submit({
    text: 'hello',
    wait: false,
    origin: { kind: 'composer' },
  })

  // 検証
  expect(result.text).toBe('hello')
  expect(result.context ?? []).toEqual([])
})
