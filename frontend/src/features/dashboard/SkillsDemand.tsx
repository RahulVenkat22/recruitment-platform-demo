import { BarRows } from '@/features/dashboard/BarRows'
import { SERIES } from '@/features/dashboard/charts/theme'
import type { SkillDemand } from '@/types/domain'

/**
 * The skills open roles ask for most, each with how many pipeline candidates
 * have it: a bar with nobody behind it is a gap to source for.
 */
export function SkillsDemand({
  skills,
  onSelect,
}: {
  skills: readonly SkillDemand[]
  onSelect: (skill: SkillDemand) => void
}) {
  if (skills.length === 0) {
    return <p className="text-small text-ink-subtle">No open role lists required skills yet.</p>
  }
  return (
    <BarRows
      aria-label="Required skills and the candidates who have them"
      rows={skills.map((skill) => ({
        key: skill.key,
        label: skill.label,
        value: skill.candidates,
        color: SERIES[0],
        hint:
          skill.candidates === 0
            ? 'Nobody has it'
            : `${skill.roles} ${skill.roles === 1 ? 'role asks' : 'roles ask'}`,
        tone: skill.candidates === 0 ? 'warning' : undefined,
      }))}
      onSelect={(row) => onSelect(skills.find((skill) => skill.key === row.key)!)}
    />
  )
}
