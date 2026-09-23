import type { SortingState } from '@tanstack/react-table'

/* Sort helpers for tables that keep their sort in a `?sort=` style string (plan.md 8.4). */

export type SortDirection = 'asc' | 'desc' | false

/** The `aria-sort` value of a sortable header cell. */
export function ariaSort(direction: SortDirection): 'ascending' | 'descending' | 'none' {
  if (direction === 'asc') return 'ascending'
  if (direction === 'desc') return 'descending'
  return 'none'
}

/** Which way `key` sorts under a `?sort=` value: `key` ascending, `-key` descending. */
export function directionOf(sort: string, key: string): SortDirection {
  if (sort === key) return 'asc'
  if (sort === `-${key}`) return 'desc'
  return false
}

/**
 * The `?sort=` value after a click on `key`'s header: the first direction
 * (ascending, or descending for numbers and dates), then the other, then off.
 */
export function toggleSort(sort: string, key: string, descFirst = false): string {
  const direction = directionOf(sort, key)
  const first = descFirst ? 'desc' : 'asc'
  if (!direction) return first === 'desc' ? `-${key}` : key
  if (direction === first) return first === 'desc' ? key : `-${key}`
  return ''
}

/** The same cycle for a table's one-column `SortingState`. */
export function nextSorting(sorting: SortingState, id: string, descFirst = false): SortingState {
  const current = sorting.find((entry) => entry.id === id)
  if (!current) return [{ id, desc: descFirst }]
  if (current.desc === descFirst) return [{ id, desc: !descFirst }]
  return []
}
