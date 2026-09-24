import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { HEAT_RAMP } from '@/features/dashboard/charts/theme'
import { WEEKDAYS, formatCount, hourLabel, peakCell } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'

/** Which ramp step a cell takes: none when quiet, else its share of the busiest cell in five steps. */
function step(value: number, max: number): number {
  if (value === 0) return 0
  return Math.min(HEAT_RAMP.length, Math.ceil((value / max) * HEAT_RAMP.length))
}

/**
 * When the team works: actions per hour of the day, one row per weekday, on a
 * one-hue ramp. Hovering a cell reads it out; the table twin lists every hour.
 */
export function ActivityHeatmap({ heatmap }: { heatmap: readonly (readonly number[])[] }) {
  const max = Math.max(1, ...heatmap.flat())
  const total = heatmap.flat().reduce((sum, value) => sum + value, 0)
  const peak = peakCell(heatmap)
  return (
    <div className="flex h-full flex-col gap-3">
      <div
        role="img"
        aria-label={
          peak
            ? `Actions per hour across the week; busiest ${WEEKDAYS[peak.day]} at ${hourLabel(peak.hour)} with ${peak.value}`
            : 'Actions per hour across the week; none in this window'
        }
        className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-1"
      >
        <span aria-hidden="true" />
        <div aria-hidden="true" className="grid grid-cols-24 text-caption text-ink-subtle">
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className={cn(hour % 6 !== 0 && 'invisible')}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        {heatmap.map((row, day) => (
          <div key={day} className="contents">
            <span aria-hidden="true" className="self-center text-caption text-ink-subtle">
              {WEEKDAYS[day]}
            </span>
            <div className="grid grid-cols-24 gap-0.5">
              {row.map((value, hour) => {
                const level = step(value, max)
                return (
                  <TooltipPrimitive.Root key={hour}>
                    <TooltipPrimitive.Trigger asChild>
                      <span
                        tabIndex={-1}
                        data-level={level}
                        className="block aspect-square min-h-3 w-full rounded-[3px] outline-none"
                        style={{
                          background: level === 0 ? 'var(--color-surface-2)' : HEAT_RAMP[level - 1],
                        }}
                      />
                    </TooltipPrimitive.Trigger>
                    <TooltipPrimitive.Portal>
                      <TooltipPrimitive.Content side="top" sideOffset={4} className="z-50">
                        <span className="block rounded-control border border-line bg-surface px-2 py-1 text-caption whitespace-nowrap text-ink shadow-card-hover">
                          {WEEKDAYS[day]} {hourLabel(hour)} ·{' '}
                          <span className="font-medium tabular-nums">{formatCount(value)}</span>{' '}
                          {value === 1 ? 'action' : 'actions'}
                        </span>
                      </TooltipPrimitive.Content>
                    </TooltipPrimitive.Portal>
                  </TooltipPrimitive.Root>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-caption text-ink-subtle">
        <span>
          {total === 0
            ? 'No activity in this window.'
            : peak &&
              `${formatCount(total)} actions; busiest ${WEEKDAYS[peak.day]} around ${hourLabel(peak.hour)}.`}
        </span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          Quiet
          <span className="size-3 rounded-[3px] bg-surface-2" />
          {HEAT_RAMP.map((color) => (
            <span key={color} className="size-3 rounded-[3px]" style={{ background: color }} />
          ))}
          Busy
        </span>
      </div>
    </div>
  )
}
