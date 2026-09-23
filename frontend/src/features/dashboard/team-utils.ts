import type { Segment } from '@/features/dashboard/charts/StackedBar'
import { SERIES } from '@/features/dashboard/charts/theme'
import type { TeamMember } from '@/types/domain'

/** The four kinds of work the timeline records, in pipeline order, on the categorical slots. */
export const TEAM_GROUPS: readonly {
  key: keyof TeamMember & string
  label: string
  color: string
}[] = [
  { key: 'sourcing', label: 'Sourcing', color: SERIES[0] },
  { key: 'outreach', label: 'Outreach', color: SERIES[1] },
  { key: 'interviews', label: 'Interviews', color: SERIES[2] },
  { key: 'closing', label: 'Closing', color: SERIES[3] },
]

export function teamSegments(member: TeamMember): Segment[] {
  return TEAM_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    value: Number(member[group.key]),
    color: group.color,
  }))
}
