import { formatDayHeading } from '@/lib/format'
import type { Activity } from '@/types/domain'

export interface TimelineDay {
  key: string
  label: string
  items: Activity[]
}

/** Groups newest-first activities by calendar day, keeping the order. */
export function groupByDay(items: readonly Activity[]): TimelineDay[] {
  const days: TimelineDay[] = []
  for (const item of items) {
    const key = item.occurred_at.slice(0, 10)
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(item)
    else days.push({ key, label: formatDayHeading(item.occurred_at), items: [item] })
  }
  return days
}

/** Loose reads over `metadata`, which is a free-form JSON object per event type. */
export type Metadata = Record<string, unknown>

export function metaString(meta: Metadata, key: string): string | null {
  const value = meta[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return String(value)
  return null
}

export function metaNumber(meta: Metadata, key: string): number | null {
  const value = meta[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return null
}

export function metaStrings(meta: Metadata, key: string): string[] {
  const value = meta[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export interface MetaPerson {
  id?: string
  name: string
  avatar_url?: string | null
  role?: string
}

export function metaPeople(meta: Metadata, key: string): MetaPerson[] {
  const value = meta[key]
  if (!Array.isArray(value)) return []
  return value
    .map((entry): MetaPerson | null => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name : null
      if (!name) return null
      return {
        id:
          typeof record.user_id === 'string'
            ? record.user_id
            : typeof record.id === 'string'
              ? record.id
              : undefined,
        name,
        avatar_url: typeof record.avatar_url === 'string' ? record.avatar_url : null,
        role: typeof record.role === 'string' ? record.role : undefined,
      }
    })
    .filter((entry): entry is MetaPerson => entry !== null)
}

export function metaPerson(meta: Metadata, key: string): MetaPerson | null {
  const value = meta[key]
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string') return null
  return {
    id:
      typeof record.id === 'string'
        ? record.id
        : typeof record.user_id === 'string'
          ? record.user_id
          : undefined,
    name: record.name,
    avatar_url: typeof record.avatar_url === 'string' ? record.avatar_url : null,
  }
}

/** "experience_max_years" -> "Experience max years". */
export function humaniseField(key: string): string {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Free-text match over the title, description and actor name. */
export function matchesText(item: Activity, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    item.title,
    item.description,
    item.actor?.full_name ?? '',
    item.candidate?.full_name ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}
