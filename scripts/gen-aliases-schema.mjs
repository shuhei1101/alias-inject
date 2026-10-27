import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from '../hooks/vendor/js-yaml.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA_PATH = join(ROOT, 'schemas', 'aliases.schema.yaml')
const OUTPUT_PATH = join(ROOT, 'hooks', 'lib', 'aliases-schema.ts')
const HEADER = '// schemas/aliases.schema.yaml から scripts/gen-aliases-schema.mjs が生成する。直接編集しない'

/** schemas/aliases.schema.yaml から hooks/lib/aliases-schema.ts を書き出す。check が true のときは書き出さずに一致を確かめる */
function generateAliasSchema(check) {
  const schema = load(readFileSync(SCHEMA_PATH, 'utf8'))
  const body = `${HEADER}\nexport const ALIAS_SCHEMA: Record<string, unknown> = ${JSON.stringify(schema, null, 2)}\n`

  if (!check) {
    writeFileSync(OUTPUT_PATH, body)
    return 0
  }
  if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, 'utf8') !== body) {
    console.error('hooks/lib/aliases-schema.ts が schemas/aliases.schema.yaml と一致しません。node scripts/gen-aliases-schema.mjs を実行してください')
    return 1
  }
  return 0
}

process.exitCode = generateAliasSchema(process.argv.includes('--check'))
