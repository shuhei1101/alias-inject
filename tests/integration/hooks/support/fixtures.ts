import { userSettingsWithConfig } from '../../../unit/hooks/support/engine'
import { MemoryFs } from '../../../unit/hooks/support/memory-fs'

/** 設定ファイルの絶対パス */
export const CONFIG_PATH = '/home/u/.config/alias-inject/settings.yaml'

/** 用語の YAML を置くフォルダ */
export const TERMS_DIR = '/home/u/.config/alias-inject/terms'

/** `ALIAS_INJECT_CONFIG` で設定ファイルを指すユーザースコープの settings */
export const SETTINGS = userSettingsWithConfig('~/.config/alias-inject/settings.yaml')

/** 用語のソース 1 つ（label は「用語」）を `global` に持つ設定ファイルの本文。`global` へ足す行と `projects` の行を渡せる */
export function makeConfig(options: { globalExtra?: string[]; sourcesExtra?: string[]; projects?: string[] } = {}): string {
  return [
    'global:',
    ...(options.globalExtra ?? []).map((line) => `  ${line}`),
    '  sources:',
    '    - label: 用語',
    '      type: term',
    '      files: terms/*.yaml',
    '      id: id',
    '      words: [name, aliases]',
    '      description: description',
    ...(options.sourcesExtra ?? []).map((line) => `    ${line}`),
    ...(options.projects === undefined ? [] : ['projects:', ...options.projects.map((line) => `  ${line}`)]),
  ].join('\n')
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

/** 設定ファイルと、用語の YAML（term-a・term-b）を持つファイル表 */
export function makeFs(config: string = makeConfig()): MemoryFs {
  return new MemoryFs({
    [CONFIG_PATH]: config,
    [`${TERMS_DIR}/term-a.yaml`]: termYaml({ id: 'term-a', name: 'Term-A', aliases: ['用語エー'] }),
    [`${TERMS_DIR}/term-b.yaml`]: termYaml({ id: 'term-b', name: 'Term-B' }),
  })
}
