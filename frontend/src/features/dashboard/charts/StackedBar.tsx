import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useState } from 'react'
import { ChartTooltip } from '@/features/dashboard/charts/ChartTooltip'
import { cn } from '@/lib/utils'

export interface Segment {
  key: string
  label: string
  value: number
  color: string
}

export interface StackedBarProps {
  segments: readonly Segment[]
  /** The value that fills the whole track; defaults to the segments' sum (a 100% bar). */
  max?: number
  title: string
  /** One line under the title in the hover readout, e.g. "12 awaiting review". */
  footer?: string
  className?: string
}

/**
 * A thin horizontal stack: 2px surface gaps between segments, a 4px rounded end,
 * and one hover (or focus) readout listing every segment. Zero segments take no
 * space; hovering one segment fades the others.
 */
export function StackedBar({ segments, max, title, footer, className }: StackedBarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const scale = Math.max(max ?? total, 1)
  const visible = segments.filter((segment) => segment.value > 0)

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <div
          role="img"
          tabIndex={0}
          aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            'flex h-3 w-full gap-0.5 rounded-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            className,
          )}
        >
          {visible.length === 0 && <span className="h-full w-full rounded-[4px] bg-surface-2" />}
          {visible.map((segment, index) => (
            <span
              key={segment.key}
              data-segment={segment.key}
              onMouseEnter={() => setHovered(segment.key)}
              className={cn(
                'h-full min-w-[3px] transition-opacity duration-150 ease-brand',
                index === visible.length - 1 && 'rounded-r-[4px]',
                hovered && hovered !== segment.key && 'opacity-40',
              )}
              style={{ width: `${(segment.value / scale) * 100}%`, background: segment.color }}
            />
          ))}
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="top" sideOffset={6} className="z-50">
          <ChartTooltip
            title={title}
            rows={segments.map((segment) => ({
              label: segment.label,
              value: segment.value,
              color: segment.color,
              muted: segment.value === 0,
            }))}
            footer={footer}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
