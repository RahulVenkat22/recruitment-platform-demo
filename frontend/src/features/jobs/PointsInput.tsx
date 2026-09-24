import { PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { splitLines } from '@/features/jobs/job-utils'
import { cn } from '@/lib/utils'

export interface PointsInputProps {
  /** Id of the first box, for the field label. */
  id?: string
  /** Singular name of one point ("Responsibility"): names the boxes and the add and remove buttons. */
  label: string
  value: readonly string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

/**
 * A list of points, one box each, for the fields that used to be "one per
 * line" in a textarea. A point can be a few words or a paragraph; the box
 * grows with it. Enter starts the next point, Backspace on an empty one
 * removes it, and pasting a list makes a point of every line. The API keeps
 * the list newline-separated, so a point itself never holds a line break.
 */
export function PointsInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
}: PointsInputProps) {
  // One empty box is shown while there is nothing, so there is always somewhere to type.
  const points = value.length ? [...value] : ['']
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([])
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    if (pendingFocus.current === null) return
    boxes.current[pendingFocus.current]?.focus()
    pendingFocus.current = null
  })

  function commit(next: string[], focus: number) {
    pendingFocus.current = focus
    onChange(next)
  }

  function update(index: number, text: string) {
    const next = [...points]
    next[index] = text
    onChange(next)
  }

  function insert(after: number, items: string[]) {
    const next = [...points]
    next.splice(after + 1, 0, ...items)
    commit(next, after + items.length)
  }

  function remove(index: number) {
    if (points.length === 1) {
      commit([], 0)
      return
    }
    commit(
      points.filter((_, at) => at !== index),
      Math.max(0, index - 1),
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault()
      insert(index, [''])
    } else if (event.key === 'Backspace' && points[index] === '' && points.length > 1) {
      event.preventDefault()
      remove(index)
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>, index: number) {
    const lines = splitLines(event.clipboardData.getData('text'))
    if (lines.length < 2) return
    event.preventDefault()
    // An empty box takes the first line; otherwise every line goes in after the box.
    if (points[index].trim() === '') {
      const next = [...points]
      next.splice(index, 1, ...lines)
      commit(next, index + lines.length - 1)
    } else {
      insert(index, lines)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <ol className="space-y-2">
        {points.map((point, index) => (
          <li key={index} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-[15px] size-1.5 shrink-0 rounded-full bg-line-strong"
            />
            <Textarea
              ref={(node) => {
                boxes.current[index] = node
              }}
              id={index === 0 ? id : undefined}
              aria-label={index === 0 ? undefined : `${label} ${index + 1}`}
              rows={1}
              value={point}
              placeholder={index === 0 ? placeholder : undefined}
              onChange={(event) => update(index, event.target.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPaste={(event) => onPaste(event, index)}
              className="min-h-9 resize-none py-1.5"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              disabled={points.length === 1 && point === ''}
              onClick={() => remove(index)}
              className="mt-0.5 shrink-0 text-ink-subtle hover:text-danger"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => insert(points.length - 1, [''])}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        Add {label.toLowerCase()}
      </Button>
    </div>
  )
}
