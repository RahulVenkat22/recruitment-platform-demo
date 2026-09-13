import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SkillChip {
  name: string
  /** Set by the matcher for required skills: true = candidate has it, false = missing. */
  matched?: boolean
  /** 1 to 5, shown in the tooltip. */
  proficiency?: number | null
}

export interface SkillChipsProps {
  skills: readonly SkillChip[]
  /** Chips shown before the `+N` overflow chip. */
  max?: number
  /** Emerald soft with a check for matched, rose outlined for missing; neutral otherwise. */
  highlight?: boolean
  size?: 'sm' | 'md'
  emptyLabel?: string
  className?: string
}

type ChipState = 'matched' | 'missing' | 'neutral'

function chipState(skill: SkillChip, highlight: boolean): ChipState {
  if (!highlight || skill.matched === undefined) return 'neutral'
  return skill.matched ? 'matched' : 'missing'
}

const STATE_CLASSES: Record<ChipState, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  matched: 'bg-success-soft text-success',
  missing: 'border border-danger/40 bg-transparent text-danger',
}

/** Inline list of skills with an overflow chip; used in tables, cards and the JD overview. */
export function SkillChips({
  skills,
  max,
  highlight = false,
  size = 'sm',
  emptyLabel = 'No skills listed',
  className,
}: SkillChipsProps) {
  if (skills.length === 0) {
    return <span className="text-small text-ink-subtle">{emptyLabel}</span>
  }

  const limit = max === undefined ? skills.length : Math.max(0, max)
  const visible = skills.slice(0, limit)
  const hidden = skills.slice(limit)
  const sizing = size === 'sm' ? 'h-5 px-2 text-caption' : 'h-6 px-2.5 text-[13px] font-[450]'

  return (
    <ul
      aria-label="Skills"
      data-slot="skill-chips"
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {visible.map((skill) => {
        const state = chipState(skill, highlight)
        const title =
          skill.proficiency !== undefined && skill.proficiency !== null
            ? `${skill.name} · proficiency ${skill.proficiency}/5`
            : skill.name
        return (
          <li
            key={skill.name}
            data-state={state}
            title={title}
            className={cn(
              'inline-flex max-w-48 items-center gap-1 rounded-pill whitespace-nowrap',
              sizing,
              STATE_CLASSES[state],
            )}
          >
            {state === 'matched' && <CheckIcon aria-hidden="true" className="size-3 shrink-0" />}
            <span className="truncate">{skill.name}</span>
          </li>
        )
      })}
      {hidden.length > 0 && (
        <li
          data-state="overflow"
          title={hidden.map((skill) => skill.name).join(', ')}
          className={cn(
            'inline-flex items-center rounded-pill bg-surface-2 text-ink-subtle tabular-nums',
            sizing,
          )}
        >
          +{hidden.length}
        </li>
      )}
    </ul>
  )
}
