export type MatchTone = 'emerald' | 'amber' | 'slate'

/** plan.md 8.1: >= 85 emerald, 70 to 84 amber, below 70 slate. */
export function matchTone(value: number): MatchTone {
  if (value >= 85) return 'emerald'
  if (value >= 70) return 'amber'
  return 'slate'
}
