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

/** `ALIAS_INJECT_CONFIG` で設定ファイルを指すユーザースコープの settings */
export const SETTINGS = userSettingsWithConfig('~/.config/alias-inject/settings.yaml')

/** 行の先頭に空白を `width` 個置く */
export function indent(lines: string[], width: number): string[] {
  return lines.map((line) => `${' '.repeat(width)}${line}`)
}

/** `aliases` の要素 1 つの行。`- id:` を字下げなしで始める。`type` ごとに照合する列と表示する列を `fields` に持つ */
export function aliasLines(options: {
  id: string
  type: 'term' | 'command' | 'url' | 'skill' | 'tool' | 'path' | 'env' | 'avoid'
  paths: string
  /** `false` のとき、この要素を使わない */
  enabled?: boolean
  /** `fields` に追加する列の行（字下げなし） */
  fields?: string[]
  /** `type` ごとの既定の列の行（字下げなし）の代わりに使う列の行 */
  columns?: string[]
}): string[] {
  const columns = options.columns ?? {
    term: ['match: [name, aliases]', 'title: name', 'description: description'],
    command: ['match: [name]', 'command: command'],
    url: ['match: [name]', 'url: url'],
    skill: ['match: [name]', 'skill: skill'],
    tool: ['match: [name]', 'tool: tool'],
    path: ['match: [name]', 'path: path'],
    env: ['match: [name]', 'url: url', 'port: port', 'description: description'],
    avoid: ['match: [name]', 'replacement: replacement'],
  }[options.type]
  return [
    `- id: ${options.id}`,
    `  type: ${options.type}`,
    ...(options.enabled === undefined ? [] : [`  enabled: ${options.enabled}`]),
    `  paths: [${options.paths}]`,
    '  fields:',
    '    id: id',
    ...indent([...columns, ...(options.fields ?? [])], 4),
  ]
}

/** 用語の `aliases` の要素（既定は `id: terms`・`paths: [terms/*.yaml]`）の行 */
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

/** `dev-docs.yaml` の本文。用語の `aliases` の要素を 1 つ持ち、字下げなしの要素の行で他の要素を追加できる */
export function makeDevDocs(options: { aliasesExtra?: string[] } = {}): string {
  return ['aliases:', ...indent([...termAliasLines(), ...(options.aliasesExtra ?? [])], 2)].join('\n')
}

/** 用語の YAML の本文 */
export function termYaml(options: { id: string; name: string; aliases?: string[]; description?: string }): string {
  return [
    `id: ${options.id}`,
    `name: ${options.name}`,
    ...(options.aliases === undefined ? [] : [`aliases: [${options.aliases.join(', ')}]`]),
    `description: ${options.description ?? `説明 ${options.name}`}`,
    '',
  ].join('\n')
}

/** 設定ファイルと、読むリポジトリの dev-docs.yaml と用語の YAML（term-a・term-b）を持つファイル表 */
export function makeFs(config: string = makeConfig(), devDocs: string = makeDevDocs()): MemoryFs {
  return new MemoryFs({
    [CONFIG_PATH]: config,
    [DEV_DOCS_PATH]: devDocs,
    [`${TERMS_DIR}/term-a.yaml`]: termYaml({ id: 'term-a', name: 'Term-A', aliases: ['用語エー'] }),
    [`${TERMS_DIR}/term-b.yaml`]: termYaml({ id: 'term-b', name: 'Term-B' }),
  })
}
