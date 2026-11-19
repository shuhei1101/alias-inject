import { describe, expect, test } from 'claude-code/testing'
import { STEP_CHUNK, installStepWorld, step, stepResult, submit, userSettingsWithConfig } from '../../unit/hooks/support/engine'
import { SETTINGS, makeConfig, makeFs } from './support/fixtures'

// 正常系の要求のターンの ID
const TURN_ID = 'turn-1'
// 正常系の応答の文。エイリアスで term-a にヒットさせる
const ANSWER = '用語エーの説明'

// 正常系の要求の結果
function expectedResult(answer: string = ANSWER) {
  return stepResult(answer, { turnId: TURN_ID, index: 0 })
}

// 利用者の画面に出した行（`to: transcript`）
function transcriptLines(logs: { text: string; to: string }[]): string[] {
  return logs.filter((line) => line.to === 'transcript').map((line) => line.text)
}

describe('応答の文への引用の文脈の追加', () => {
  // 応答の文に初めて出た単語の文脈を会話に追加し、メインの会話の記録に入れる（正常系）
  test('test_normal', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = ANSWER

    // 実行
    const { chunks, result } = await step($, undefined, TURN_ID)
    const after = await submit($, 'term-a とは')

    // 検証
    expect(chunks).toEqual([STEP_CHUNK])
    expect(result).toEqual(expectedResult())
    const rows = world.appended()
    expect(rows.length).toBe(1)
    expect((rows[0]?.message as { type: string }).type).toBe('user')
    const text = JSON.stringify(rows[0]?.message)
    expect(text).toContain('# この発言に出る用語')
    expect(text).toContain('## 用語')
    expect(text).toContain('Term-A')
    expect(after.context ?? []).toEqual([])
    expect(transcriptLines(world.files.logs)).toEqual(['文脈を追加: Term-A（term-a）'])
  })

  // 記録済みの単語だけがヒットしたときは行を追加しない（正常系）
  test('test_normal_when_only_recorded_terms', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    await submit($, 'term-a とは')
    const shownBySubmit = transcriptLines(world.files.logs)
    world.answer = ANSWER

    // 実行
    const { result } = await step($, undefined, TURN_ID)

    // 検証
    expect(world.appended().length).toBe(0)
    expect(result).toEqual(expectedResult())
    // 入力で表示した行のほかに、行が増えていない
    expect(transcriptLines(world.files.logs)).toEqual(shownBySubmit)
  })

  // agentId のある要求はメインの会話と別の記録で照合し、そのサブエージェントの会話に追加する（正常系）
  test('test_normal_when_in_subagent', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = ANSWER

    // 実行
    await step($, 'agent-1', TURN_ID)
    const after = await submit($, 'term-a とは')

    // 検証
    const rows = world.appended()
    expect(rows.length).toBe(1)
    expect(rows[0]?.agentId).toBe('agent-1')
    expect(after.context?.[0]).toContain('Term-A')
    expect(transcriptLines(world.files.logs).filter((line) => line.includes('（term-a）')).length).toBe(2)
  })

  // 見える文の無い応答は照合しない（正常系）
  test('test_normal_when_no_answer', async ($, on) => {
    // 準備
    // 応答の文は空で、ツールの呼び出しの引数に term-a を持つ
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = ''
    world.toolUses = [{ id: 'tool-1', name: 'Write', input: { file_path: '/work/note.md', content: 'term-a の説明' } }]

    // 実行
    await step($, undefined, TURN_ID)
    const shownByStep = transcriptLines(world.files.logs)
    const after = await submit($, 'term-a とは')

    // 検証
    expect(world.appended().length).toBe(0)
    expect(shownByStep).toEqual([])
    expect(after.context?.[0]).toContain('Term-A')
  })

  // 設定ファイルを読み込めないときは行を追加せずに返却する（異常系）
  test('test_error_when_config_unreadable', async ($, on) => {
    // 準備
    const brokenPath = '/broken/settings.yaml'
    const fs = makeFs()
    fs.write(brokenPath, 'global: [')
    const world = installStepWorld(on, { fs, settings: userSettingsWithConfig(brokenPath) })
    world.answer = ANSWER

    // 実行
    const { result } = await step($, undefined, TURN_ID)

    // 検証
    expect(result).toEqual(expectedResult())
    expect(world.appended().length).toBe(0)
    expect(world.files.logs.filter((line) => line.to === 'debug' && line.text.includes(brokenPath)).length).toBeGreaterThan(0)
    expect(transcriptLines(world.files.logs)).toEqual([])
  })

  // $.session.append が deny を返却したときは debug log に出して返却する（異常系）
  test('test_error_when_append_denied', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = ANSWER
    world.denyAppend = '拒否'

    // 実行
    const { result } = await step($, undefined, TURN_ID)

    // 検証
    expect(result).toEqual(expectedResult())
    expect(world.files.logs.filter((line) => line.to === 'debug' && line.text.includes('拒否')).length).toBe(1)
    expect(transcriptLines(world.files.logs)).toEqual([])
  })

  // 照合の途中の例外では行を追加せずに返却する（異常系）
  test('test_error_when_unexpected', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS })
    world.answer = ANSWER
    on('state.get', () => ({ deny: 'state broken' }))

    // 実行
    const { result } = await step($, undefined, TURN_ID)

    // 検証
    expect(result).toEqual(expectedResult())
    expect(world.appended().length).toBe(0)
    expect(world.files.logs.filter((line) => line.to === 'debug').length).toBeGreaterThan(0)
    expect(transcriptLines(world.files.logs)).toEqual([])
  })

  // show_added が false のときは、行を追加して記録に入れ、利用者の画面には表示しない（正常系）
  test('test_normal_when_display_off', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(makeConfig({ globalExtra: ['show_added: false'] })), settings: SETTINGS })
    world.answer = ANSWER

    // 実行
    await step($, undefined, TURN_ID)

    // 検証
    const rows = world.appended()
    expect(rows.length).toBe(1)
    expect(JSON.stringify(rows[0]?.message)).toContain('Term-A')
    expect(transcriptLines(world.files.logs)).toEqual([])
  })

  // 表示の $.ui.log が失敗しても、Claude Code が受け止めるので、行の追加と記録はそのまま（異常系）
  test('test_error_when_display_fails', async ($, on) => {
    // 準備
    const world = installStepWorld(on, { fs: makeFs(), settings: SETTINGS, transcriptError: '表示できません' })
    world.answer = ANSWER

    // 実行
    const { result } = await step($, undefined, TURN_ID)
    const after = await submit($, 'term-a とは')

    // 検証
    expect(result).toEqual(expectedResult())
    expect(world.appended().length).toBe(1)
    expect(after.context ?? []).toEqual([])
    expect(transcriptLines(world.files.logs)).toEqual([])
  })
})
