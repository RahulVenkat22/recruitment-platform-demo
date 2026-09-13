import { addDays, format, isValid, parseISO, set, startOfWeek } from 'date-fns'

/** ISO (or Date) -> the value an `<input type="datetime-local">` wants ("2026-09-12T15:00"). */
export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : parseISO(value)
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : ''
}

/** `<input type="datetime-local">` value -> ISO string in the browser's zone; '' when empty or invalid. */
export function fromDateTimeLocal(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return isValid(date) ? date.toISOString() : ''
}

/** ISO date ("2026-10-01") for `<input type="date">`. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : parseISO(value)
  return isValid(date) ? format(date, 'yyyy-MM-dd') : ''
}

/** A sensible default slot for a new interview: the next working day at 11:00. */
export function nextWorkingSlot(from: Date = new Date()): Date {
  let day = addDays(from, 1)
  while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1)
  return set(day, { hours: 11, minutes: 0, seconds: 0, milliseconds: 0 })
}

/** Monday-start week containing `date`, as seven consecutive days. */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Monday of the week containing `date`, as "yyyy-MM-dd" (the calendar's URL key). */
export function weekKey(date: Date): string {
  return format(weekDays(date)[0], 'yyyy-MM-dd')
}
