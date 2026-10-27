import { userSettingsWithConfig } from '../../../unit/hooks/support/engine'
import { MemoryFs } from '../../../unit/hooks/support/memory-fs'

/** 設定ファイルの絶対パス */
export const CONFIG_PATH = '/home/u/.config/alias-inject/settings.yaml'

/** 設定ファイルのフォルダ */
export const CONFIG_DIR = '/home/u/.config/alias-inject'

/** 読むリポジトリのフォルダ */
export const KNOWLEDGE_DIR = '/repo/knowledge'

/** 読むリポジトリの dev-docs.yaml の絶対パス */
export const DEV_DOCS_PATH = `${KNOWLEDGE_DIR}/dev-docs.yaml`

/** 用語の YAML を置くフォルダ */
export const TERMS_DIR = `${KNOWLEDGE_DIR}/terms`

/** `alias_type` を持たない行の YAML を置くフォルダ */
export const DOCS_DIR = `${KNOWLEDGE_DIR}/docs`

/** `ALIAS_INJECT_CONFIG` で設定ファイルを指すユーザースコープの settings */
export const SETTINGS = userSettingsWithConfig('~/.config/alias-inject/settings.yaml')

/** 行の先頭に空白を `width` 個置く */
export function indent(lines: string[], width: number): string[] {
  return lines.map((line) => `${' '.repeat(width)}${line}`)
}

/** エイリアスの元の行 1 つの行。`- id:` を字下げなしで始める。`metadata.alias_type` を `type` の値にする */
export function aliasLines(options: {
  id: string
  /** `metadata.alias_type` の値（引用の種類にない値も書ける） */
  type: string
  paths: string
  /** `false` のとき、この行を使わない */
  enabled?: boolean
  /** 文書の並びを持つ配列のキー */
  records?: string
  /** `metadata` に追加するキーの行（字下げなし） */
  metadata?: string[]
}): string[] {
  return [
    `- id: ${options.id}`,
    `  paths: [${options.paths}]`,
    ...(options.records === undefined ? [] : [`  records: ${options.records}`]),
    ...(options.enabled === undefined ? [] : [`  enabled: ${options.enabled}`]),
    '  metadata:',
    '    alias_type:',
    '      type: custom',
    `      value: ${options.type}`,
    ...indent(options.metadata ?? [], 4),
  ]
}

/** 用語の行（既定は `id: terms`・`paths: [terms/*.yaml]`）の行 */
export function termAliasLines(options: { id?: string; paths?: string; enabled?: boolean } = {}): string[] {
  return aliasLines({ id: options.id ?? 'terms', type: 'term', paths: options.paths ?? 'terms/*.yaml', ...(options.enabled === undefined ? {} : { enabled: options.enabled }) })
}

/**
 * 端末の設定ファイルの本文。読むリポジトリを `global.repositories` に持つ。
 * `repositories`・`aliases` は字下げなしの要素の行で渡し、`global` の行と `projects` の行も渡せる
 */
export function makeConfig(
  options: { globalExtra?: string[]; repositories?: string[]; aliases?: string[]; projects?: string[] } = {},
): string {
  return [
    'global:',
    ...indent(options.globalExtra ?? [], 2),
    '  repositories:',
    ...indent(options.repositories ?? [`- config: ${DEV_DOCS_PATH}`], 4),
    ...(options.aliases === undefined ? [] : ['  aliases:', ...indent(options.aliases, 4)]),
    ...(options.projects === undefined ? [] : ['projects:', ...indent(options.projects, 2)]),
  ].join('\n')
}

/** `metadata` に `alias_type` を持たない `documents` の行（エイリアスの行ではない） */
const PLAIN_DOCUMENT_LINES = ['- id: docs', '  paths: [docs/*.yaml]', '  metadata:', '    title:', '      type: ref', '      field: name']

/** `dev-docs.yaml` の本文。`documents` に用語の行と `alias_type` を持たない行を持ち、字下げなしの行で他の行を追加できる */
export function makeDevDocs(options: { documentsExtra?: string[]; rootExtra?: string[] } = {}): string {
  return [
    'documents:',
    ...indent([...termAliasLines(), ...PLAIN_DOCUMENT_LINES, ...(options.documentsExtra ?? [])], 2),
    ...(options.rootExtra ?? []),
  ].join('\n')
}

/** 用語の YAML の本文。`name` を省くと `name` の列を持たない */
export function termYaml(options: { id: string; name?: string; aliases?: string[]; description?: string }): string {
  return [
    `id: ${options.id}`,
    ...(options.name === undefined ? [] : [`name: ${options.name}`]),
    ...(options.aliases === undefined ? [] : [`aliases: [${options.aliases.join(', ')}]`]),
    `description: ${options.description ?? `説明 ${options.name ?? options.id}`}`,
    '',
  ].join('\n')
}

/** 設定ファイルと、読むリポジトリの dev-docs.yaml と用語の YAML（term-a・term-b。term-b は `name` を持たない）と文書の YAML（doc-z）を持つファイル表 */
export function makeFs(config: string = makeConfig(), devDocs: string = makeDevDocs()): MemoryFs {
  return new MemoryFs({
    [CONFIG_PATH]: config,
    [DEV_DOCS_PATH]: devDocs,
    [`${TERMS_DIR}/term-a.yaml`]: termYaml({ id: 'term-a', name: 'Term-A', aliases: ['用語エー'] }),
    [`${TERMS_DIR}/term-b.yaml`]: termYaml({ id: 'term-b' }),
    [`${DOCS_DIR}/doc-z.yaml`]: 'name: doc-z\n',
  })
}
