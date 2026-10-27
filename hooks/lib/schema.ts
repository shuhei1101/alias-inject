import { ALIAS_SCHEMA } from './aliases-schema'

/** 値の検証で解釈するキーワード */
export const VALIDATION_KEYWORDS: readonly string[] = [
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'minLength',
  'allOf',
  'if',
  'then',
  '$ref',
  '$defs',
]

/** 検証に効かない注釈のキーワード */
export const ANNOTATION_KEYWORDS: readonly string[] = ['$schema', 'title', 'description', 'default', 'examples']

const DEFS_REF_PREFIX = '#/$defs/'

/** 同梱のスキーマが読めない・書式が誤っている・解釈しないキーワードを含むことを、理由つきで伝える例外 */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

// `#/$defs/{名前}` が指すルートの `$defs` の要素。形が違う・要素が無いときは undefined
function resolveRef(root: Json, ref: string): unknown {
  if (!ref.startsWith(DEFS_REF_PREFIX)) return undefined
  const name = ref.slice(DEFS_REF_PREFIX.length)
  const defs = root.$defs
  return isRecord(defs) && hasOwn(defs, name) ? defs[name] : undefined
}

// スキーマのマッピングをたどり、使うキーワードと `$ref` を確かめる。`pointer` は理由に使うキーまでのパス
function walkKeywords(root: Json, schema: unknown, pointer: string): void {
  if (!isRecord(schema)) throw new SchemaError(`${pointer}: スキーマがマッピングではありません`)
  for (const key of Object.keys(schema)) {
    if (!VALIDATION_KEYWORDS.includes(key) && !ANNOTATION_KEYWORDS.includes(key)) {
      throw new SchemaError(`${pointer}/${key}: 解釈しないキーワード ${key} です`)
    }
  }

  const ref = schema.$ref
  if (ref !== undefined && (typeof ref !== 'string' || resolveRef(root, ref) === undefined)) {
    throw new SchemaError(`${pointer}/$ref: ${String(ref)} が指す $defs の要素がありません`)
  }

  // `properties`・`$defs` は値の各要素をスキーマとしてたどる
  for (const key of ['properties', '$defs']) {
    const children = schema[key]
    if (children === undefined) continue
    if (!isRecord(children)) throw new SchemaError(`${pointer}/${key}: マッピングではありません`)
    for (const [name, child] of Object.entries(children)) walkKeywords(root, child, `${pointer}/${key}/${name}`)
  }
  for (const key of ['items', 'if', 'then']) {
    if (schema[key] !== undefined) walkKeywords(root, schema[key], `${pointer}/${key}`)
  }
  if (isRecord(schema.additionalProperties)) {
    walkKeywords(root, schema.additionalProperties, `${pointer}/additionalProperties`)
  }
  if (schema.allOf !== undefined) {
    if (!Array.isArray(schema.allOf)) throw new SchemaError(`${pointer}/allOf: 並びではありません`)
    for (const [index, child] of schema.allOf.entries()) walkKeywords(root, child, `${pointer}/allOf/${index}`)
  }
}

/** スキーマが検証するキーワードと読み飛ばすキーワードだけを使い、`$ref` が `$defs` の要素を指すことを確かめる */
export function checkKeywords(root: Json): void {
  walkKeywords(root, root, 'schemas/aliases.schema.yaml')
}

/** 同梱のスキーマのキーワードを確かめて返す */
export function loadAliasSchema(): Json {
  checkKeywords(ALIAS_SCHEMA)
  return ALIAS_SCHEMA
}

// 配列とマッピングを中まで比べる
function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return a === b
}

// 値が `type` の名前に当たるか。整数は `number` にも当たる
function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'null':
      return value === null
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number'
    case 'string':
      return typeof value === 'string'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isRecord(value)
    default:
      return false
  }
}

/** 値をスキーマで検証し、合わない箇所をパスと理由の並びで返す */
export function validateSchema({
  root,
  schema,
  value,
  path,
}: {
  root: Json
  schema: unknown
  value: unknown
  path: string
}): string[] {
  if (!isRecord(schema)) return []
  const reasons: string[] = []
  const validate = (child: unknown, childValue: unknown, childPath: string) =>
    validateSchema({ root, schema: child, value: childValue, path: childPath })

  if (typeof schema.$ref === 'string') {
    const target = resolveRef(root, schema.$ref)
    if (target === undefined) throw new SchemaError(`${path}: ${schema.$ref} が指す $defs の要素がありません`)
    reasons.push(...validate(target, value, path))
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => typeof type === 'string' && matchesType(type, value))) {
      // 型が違えば、他のキーワードは見ない
      reasons.push(`${path}: 型が ${types.join(' か ')} ではありません`)
      return reasons
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    reasons.push(`${path}: ${schema.enum.map((candidate) => JSON.stringify(candidate)).join('・')} のどれかではありません`)
  }
  if (hasOwn(schema, 'const') && !deepEqual(schema.const, value)) {
    reasons.push(`${path}: ${JSON.stringify(schema.const)} ではありません`)
  }

  if (isRecord(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !hasOwn(value, key)) reasons.push(`${path}.${key}: 必須のキーがありません`)
      }
    }
    const properties = isRecord(schema.properties) ? schema.properties : {}
    for (const [key, child] of Object.entries(properties)) {
      if (hasOwn(value, key)) reasons.push(...validate(child, value[key], `${path}.${key}`))
    }
    // `properties` に無いキーは、false なら書けないキー、スキーマならそのスキーマで検証する
    for (const key of Object.keys(value)) {
      if (hasOwn(properties, key)) continue
      if (schema.additionalProperties === false) reasons.push(`${path}.${key}: 書けないキーです`)
      else if (isRecord(schema.additionalProperties)) {
        reasons.push(...validate(schema.additionalProperties, value[key], `${path}.${key}`))
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      reasons.push(`${path}: 要素が ${schema.minItems} 件以上必要です`)
    }
    if (schema.items !== undefined) {
      for (const [index, item] of value.entries()) reasons.push(...validate(schema.items, item, `${path}[${index}]`))
    }
  }

  if (typeof value === 'string' && typeof schema.minLength === 'number' && [...value].length < schema.minLength) {
    reasons.push(`${path}: ${schema.minLength} 文字以上必要です`)
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) reasons.push(...validate(child, value, path))
  }
  // `if` に合うときだけ `then` を当てる
  if (schema.if !== undefined && schema.then !== undefined && validate(schema.if, value, path).length === 0) {
    reasons.push(...validate(schema.then, value, path))
  }
  return reasons
}
