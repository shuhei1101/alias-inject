import { expect, test } from 'claude-code/testing'
import { installWorld, submit } from './support/engine'
import { MemoryFs } from './support/memory-fs'

// 設定ファイルのパスが無いとき、入力の送信が変わらずに届く（正常系）
test('test_register', async ($, on) => {
  // 準備
  // エンジンの代わりに、設定ファイルのパスを持たない settings と、届いた text と context をそのまま返す処理を登録する
  installWorld(on, { fs: new MemoryFs(), settings: {} })

  // 実行
  const result = await submit($, 'hello')

  // 検証
  expect(result.text).toBe('hello')
  expect(result.context ?? []).toEqual([])
})
