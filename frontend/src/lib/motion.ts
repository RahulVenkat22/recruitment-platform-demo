/** Shared timing for the workspace motion system. */

/** Brand easing, also declared as `--ease-brand` in index.css. */
export const EASE_BRAND: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** List items enter 45ms apart; the delay stops growing after eight items. */
export const STAGGER_STEP_MS = 45
export const STAGGER_CAP = 8

export function staggerDelay(index: number): number {
  return (Math.min(Math.max(index, 0), STAGGER_CAP) * STAGGER_STEP_MS) / 1000
}
