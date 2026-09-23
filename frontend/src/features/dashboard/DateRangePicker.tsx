import { format } from 'date-fns'
import { CalendarRangeIcon, ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateRange, validCustomRange } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'

export interface DateRange {
  start: string
  end: string
}

export interface DateRangePickerProps {
  /** The applied window as ISO dates; both empty means a preset is in charge. */
  start: string
  end: string
  /** The two dates to apply, or null to go back to the presets. */
  onChange: (range: DateRange | null) => void
  className?: string
}

/**
 * A custom window: any two days up to a year apart, applied together so the
 * dashboard never reloads on a half-typed range.
 */
export function DateRangePicker({ start, end, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>({ start, end })
  const applied = Boolean(start && end)
  const today = format(new Date(), 'yyyy-MM-dd')

  function show(next: boolean) {
    if (next) setDraft({ start, end })
    setOpen(next)
  }

  function apply() {
    onChange(draft)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={
            applied ? `Showing ${formatDateRange(start, end)}. Change dates` : 'Choose custom dates'
          }
          data-active={applied || undefined}
          className={cn(
            'gap-2 bg-surface',
            applied && 'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft',
            className,
          )}
        >
          <CalendarRangeIcon aria-hidden="true" className="size-3.5" />
          <span>{applied ? formatDateRange(start, end) : 'Custom dates'}</span>
          <ChevronDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="dashboard-range-start">From</Label>
            <Input
              id="dashboard-range-start"
              type="date"
              value={draft.start}
              max={draft.end || today}
              onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dashboard-range-end">To</Label>
            <Input
              id="dashboard-range-end"
              type="date"
              value={draft.end}
              min={draft.start || undefined}
              max={today}
              onChange={(event) => setDraft({ ...draft, end: event.target.value })}
            />
          </div>
        </div>
        <p className="text-caption text-ink-subtle">
          Any two days up to a year apart, compared with the same span before them.
        </p>
        <div className="flex justify-end gap-2">
          {applied && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Back to presets
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!validCustomRange(draft.start, draft.end)}
            onClick={apply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
