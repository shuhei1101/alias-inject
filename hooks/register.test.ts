import { expect, test } from 'claude-code/testing'

test('入力の送信に目印の文脈が追加される', async ($, on) => {
  // エンジンの代わりに、届いた文脈をそのまま返す
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const result = await $.prompt.submit({
    text: 'hello',
    wait: false,
    origin: { kind: 'composer' },
  })

  expect(result.context).toEqual(['目印: ALIAS-INJECT-POC-7f3a'])
})
