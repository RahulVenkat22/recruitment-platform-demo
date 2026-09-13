import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Filter and tab state that lives in the URL (plan.md 7.1: any view is linkable).
 *
 *   const [state, setState] = useUrlState({
 *     tab: param.string('overview'),
 *     cat: param.list<ActivityCategory>(ALL_CATEGORIES),
 *     page: param.number(1),
 *     mine: param.boolean(false),
 *   })
 *   setState({ tab: 'timeline' })            // ?tab=timeline
 *   setState((prev) => ({ page: prev.page + 1 }))
 *
 * A key whose value equals its default is removed from the URL, so the address
 * stays short; keys the spec does not know about are left untouched.
 */
export interface ParamCodec<T> {
  defaultValue: T
  // Method signatures (not function properties) so a `ParamCodec<string>` is
  // assignable to the `ParamCodec<unknown>` index signature of a spec.
  parse(raw: string): T | undefined
  serialize(value: T): string
  equals?(a: T, b: T): boolean
}

export type UrlStateSpec = Record<string, ParamCodec<unknown>>

export type UrlState<S extends UrlStateSpec> = {
  [K in keyof S]: S[K] extends ParamCodec<infer T> ? T : never
}

export type UrlStateUpdate<S extends UrlStateSpec> =
  Partial<UrlState<S>> | ((prev: UrlState<S>) => Partial<UrlState<S>>)

export interface SetUrlStateOptions {
  /** `replace` (default) keeps filter churn out of the history stack; `push` adds an entry. */
  history?: 'replace' | 'push'
}

const LIST_SEPARATOR = ','

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

export const param = {
  string(defaultValue = ''): ParamCodec<string> {
    return { defaultValue, parse: (raw) => raw, serialize: (value) => value }
  },
  /** Any string union: `param.enum<'table' | 'cards'>('table', ['table', 'cards'])`. */
  enum<T extends string>(defaultValue: T, allowed: readonly T[]): ParamCodec<T> {
    return {
      defaultValue,
      parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : undefined),
      serialize: (value) => value,
    }
  },
  number(defaultValue = 0): ParamCodec<number> {
    return {
      defaultValue,
      parse: (raw) => {
        if (raw.trim() === '') return undefined
        const parsed = Number(raw)
        return Number.isFinite(parsed) ? parsed : undefined
      },
      serialize: (value) => String(value),
    }
  },
  boolean(defaultValue = false): ParamCodec<boolean> {
    return {
      defaultValue,
      parse: (raw) => {
        if (raw === '1' || raw === 'true') return true
        if (raw === '0' || raw === 'false') return false
        return undefined
      },
      serialize: (value) => (value ? '1' : '0'),
    }
  },
  /** Comma-separated list; `?cat=` (present but empty) reads as an empty list. */
  list<T extends string = string>(defaultValue: readonly T[] = []): ParamCodec<T[]> {
    return {
      defaultValue: [...defaultValue],
      parse: (raw) => (raw === '' ? [] : (raw.split(LIST_SEPARATOR).filter(Boolean) as T[])),
      serialize: (value) => value.join(LIST_SEPARATOR),
      equals: sameList,
    }
  },
}

function isDefault<T>(codec: ParamCodec<T>, value: T): boolean {
  return codec.equals ? codec.equals(value, codec.defaultValue) : value === codec.defaultValue
}

export function readUrlState<S extends UrlStateSpec>(
  spec: S,
  search: URLSearchParams,
): UrlState<S> {
  const state: Record<string, unknown> = {}
  for (const key of Object.keys(spec)) {
    const codec = spec[key]
    const raw = search.get(key)
    const parsed = raw === null ? undefined : codec.parse(raw)
    state[key] = parsed === undefined ? codec.defaultValue : parsed
  }
  return state as UrlState<S>
}

export function writeUrlState<S extends UrlStateSpec>(
  spec: S,
  search: URLSearchParams,
  patch: Partial<UrlState<S>>,
): URLSearchParams {
  const next = new URLSearchParams(search)
  for (const key of Object.keys(patch)) {
    const codec = spec[key]
    if (!codec) continue
    const value = patch[key as keyof UrlState<S>]
    if (value === undefined || isDefault(codec, value)) next.delete(key)
    else next.set(key, codec.serialize(value))
  }
  return next
}

export function useUrlState<S extends UrlStateSpec>(
  spec: S,
): [UrlState<S>, (update: UrlStateUpdate<S>, options?: SetUrlStateOptions) => void] {
  const [search, setSearch] = useSearchParams()
  const searchString = search.toString()
  // The spec is expected to be a module-level constant; keying on its names keeps the memo stable.
  const specKey = Object.keys(spec).join('|')

  const state = useMemo(
    () => readUrlState(spec, new URLSearchParams(searchString)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchString, specKey],
  )

  const setState = useCallback(
    (update: UrlStateUpdate<S>, options: SetUrlStateOptions = {}) => {
      setSearch(
        (current) => {
          const prev = readUrlState(spec, current)
          const patch = typeof update === 'function' ? update(prev) : update
          return writeUrlState(spec, current, patch)
        },
        { replace: options.history !== 'push' },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearch, specKey],
  )

  return [state, setState]
}
