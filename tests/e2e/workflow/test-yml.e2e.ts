/// <reference types="node" />
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const WORKFLOW = 'test.yml'
const ARTIFACT = 'test-log'
const STEPS = ['ブランチを取得する', 'Node を入れる', 'Claude Code を入れる', 'テストの全件を回す', 'ログを成果物に上げる'] as const
// ジョブのタイムアウト（4 分）に、ランナーの割り当ての待ちと成果物の取得を加えた上限
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const STEP_TIMEOUT_SECONDS = 60

type StepName = (typeof STEPS)[number]
type Step = { name: string; conclusion: string; startedAt: string; completedAt: string }
type Run = { conclusion: string; jobs: { steps: Step[] }[] }
type Branch = { name: string; dir: string }
type Edit = (dir: string) => void

const git = ({ args, cwd }: { args: string[]; cwd?: string }): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const gh = (args: string[]): string =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

// 今の commit から検証用のブランチを作り、edit で書き換えて push する
const pushBranch = ({ testName, edit }: { testName: string; edit: Edit }): Branch => {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
  const name = `e2e/test-yml/${testName}-${stamp}`
  const dir = join(mkdtempSync(join(tmpdir(), 'alias-inject-e2e-')), 'worktree')
  git({ args: ['worktree', 'add', '--detach', dir, 'HEAD'] })
  edit(dir)
  git({ args: ['add', '-A'], cwd: dir })
  git({ args: ['commit', '--allow-empty', '-m', `e2e: ${testName}`], cwd: dir })
  git({ args: ['push', 'origin', `HEAD:refs/heads/${name}`], cwd: dir })
  return { name, dir }
}

// テストの成否によらず、リモートのブランチと worktree を削除する
const removeBranch = (branch: Branch): void => {
  spawnSync('git', ['push', 'origin', '--delete', branch.name], { stdio: 'ignore' })
  spawnSync('git', ['worktree', 'remove', '--force', branch.dir], { stdio: 'ignore' })
}

const withBranch = ({ testName, edit, body }: { testName: string; edit: Edit; body: (branch: Branch) => void }): void => {
  const branch = pushBranch({ testName, edit })
  try {
    body(branch)
  } finally {
    removeBranch(branch)
  }
}

// workflow を起動し、終わるまで待って、実行の ID と結論・step を返却する
const dispatch = (branch: string): { id: string; run: Run } => {
  const out = gh(['workflow', 'run', WORKFLOW, '--ref', branch])
  const url = out.match(/https:\/\/\S+\/actions\/runs\/\d+/)?.[0]
  assert.ok(url, `実行の URL が出力にありません: ${out}`)
  const id = url.slice(url.lastIndexOf('/') + 1)
  // 異常系は 0 以外で終わるため、終了コードではなく結論で確認する
  spawnSync('gh', ['run', 'watch', id, '--exit-status'], { stdio: 'ignore' })
  const run = JSON.parse(gh(['run', 'view', id, '--json', 'conclusion,jobs'])) as Run
  return { id, run }
}

// workflow の step だけを取り出す（GitHub が追加する step は除く）
const stepsOf = (run: Run): Map<StepName, Step> => {
  const steps = new Map<StepName, Step>()
  for (const step of run.jobs[0]?.steps ?? []) {
    const name = STEPS.find((s) => s === step.name)
    if (name) steps.set(name, step)
  }
  return steps
}

const assertSteps = ({ run, expected }: { run: Run; expected: Record<StepName, string> }): void => {
  const actual = Object.fromEntries([...stepsOf(run)].map(([name, step]) => [name, step.conclusion]))
  assert.deepEqual(actual, expected)
}

// 成果物の test.log を取得する。成果物が無ければ undefined
const downloadLog = (id: string): string | undefined => {
  const dir = mkdtempSync(join(tmpdir(), 'alias-inject-e2e-log-'))
  try {
    const r = spawnSync('gh', ['run', 'download', id, '-n', ARTIFACT, '-D', dir], { encoding: 'utf8' })
    if (r.status !== 0) return undefined
    return readFileSync(join(dir, 'test.log'), 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// claude plugin test の集計の行（` 206 pass` など）から件数を取る。行が無ければ 0
const countOf = ({ log, label }: { log: string; label: string }): number =>
  Number(log.match(new RegExp(`^\\s*(\\d+) ${label}$`, 'm'))?.[1] ?? 0)

const addUnitTest = ({ file, source }: { file: string; source: string }): Edit => (dir) => {
  writeFileSync(join(dir, 'tests/unit/hooks', file), source)
}

test('test_normal', { timeout: TEST_TIMEOUT_MS }, () => {
  withBranch({
    testName: 'test_normal',
    edit: () => {},
    body: (branch) => {
      const { id, run } = dispatch(branch.name)
      assert.equal(run.conclusion, 'success')
      assertSteps({
        run,
        expected: {
          'ブランチを取得する': 'success',
          'Node を入れる': 'success',
          'Claude Code を入れる': 'success',
          'テストの全件を回す': 'success',
          'ログを成果物に上げる': 'success',
        },
      })
      const log = downloadLog(id)
      assert.ok(log, '成果物 test-log がありません')
      assert.equal(countOf({ log, label: 'fail' }), 0)
      // 同じ commit を手元で回した skip の件数と比べる
      const local = spawnSync('claude', ['plugin', 'test', '.'], { cwd: branch.dir, encoding: 'utf8' })
      const localLog = `${local.stdout}${local.stderr}`
      assert.equal(countOf({ log, label: 'skip' }), countOf({ log: localLog, label: 'skip' }))
    },
  })
})

test('test_error_when_tests_fail', { timeout: TEST_TIMEOUT_MS }, () => {
  const failName = 'e2e_intentional_fail'
  withBranch({
    testName: 'test_error_when_tests_fail',
    edit: addUnitTest({
      file: 'zz-e2e-fail.test.ts',
      source: `import { expect, test } from 'claude-code/testing'\n\ntest('${failName}', () => {\n  expect(1).toBe(2)\n})\n`,
    }),
    body: (branch) => {
      const { id, run } = dispatch(branch.name)
      assert.equal(run.conclusion, 'failure')
      assertSteps({
        run,
        expected: {
          'ブランチを取得する': 'success',
          'Node を入れる': 'success',
          'Claude Code を入れる': 'success',
          'テストの全件を回す': 'failure',
          'ログを成果物に上げる': 'success',
        },
      })
      const log = downloadLog(id)
      assert.ok(log, '成果物 test-log がありません')
      assert.match(log, new RegExp(failName))
    },
  })
})

test('test_error_when_tests_hang', { timeout: TEST_TIMEOUT_MS }, () => {
  withBranch({
    testName: 'test_error_when_tests_hang',
    // await の待ちはテストごとの上限（5 秒）で fail になるため、同期の無限ループで止める
    edit: addUnitTest({
      file: 'zz-e2e-hang.test.ts',
      source: `import { test } from 'claude-code/testing'\n\ntest('e2e_intentional_hang', () => {\n  for (;;) {}\n})\n`,
    }),
    body: (branch) => {
      const { id, run } = dispatch(branch.name)
      assert.equal(run.conclusion, 'failure')
      assertSteps({
        run,
        expected: {
          'ブランチを取得する': 'success',
          'Node を入れる': 'success',
          'Claude Code を入れる': 'success',
          'テストの全件を回す': 'failure',
          'ログを成果物に上げる': 'success',
        },
      })
      const step = stepsOf(run).get('テストの全件を回す')
      assert.ok(step)
      const seconds = (Date.parse(step.completedAt) - Date.parse(step.startedAt)) / 1000
      assert.ok(seconds >= STEP_TIMEOUT_SECONDS, `step の所要時間が 1 分未満です: ${seconds} 秒`)
      const log = downloadLog(id)
      assert.ok(log, '成果物 test-log がありません')
      assert.notEqual(log.trim(), '')
    },
  })
})

test('test_error_when_setup_fails', { timeout: TEST_TIMEOUT_MS }, () => {
  withBranch({
    testName: 'test_error_when_setup_fails',
    edit: (dir) => {
      const path = join(dir, '.github/workflows', WORKFLOW)
      const yml = readFileSync(path, 'utf8')
      const replaced = yml.replace(/@anthropic-ai\/claude-code@\S+/, '@anthropic-ai/claude-code@0.0.0-e2e-missing')
      assert.notEqual(replaced, yml)
      writeFileSync(path, replaced)
    },
    body: (branch) => {
      const { id, run } = dispatch(branch.name)
      assert.equal(run.conclusion, 'failure')
      assertSteps({
        run,
        expected: {
          'ブランチを取得する': 'success',
          'Node を入れる': 'success',
          'Claude Code を入れる': 'failure',
          'テストの全件を回す': 'skipped',
          'ログを成果物に上げる': 'success',
        },
      })
      assert.equal(downloadLog(id), undefined)
      assert.match(gh(['run', 'view', id, '--log']), /No files were found with the provided path: test\.log/)
    },
  })
})
