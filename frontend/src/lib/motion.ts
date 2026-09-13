/** plan.md 8.3 motion constants shared by the JS-driven animations. */

/** Brand easing, also declared as `--ease-brand` in index.css. */
export const EASE_BRAND: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** List items enter 30ms apart; the delay stops growing after the tenth item. */
export const STAGGER_STEP_MS = 30
export const STAGGER_CAP = 10

export function staggerDelay(index: number): number {
  return (Math.min(Math.max(index, 0), STAGGER_CAP) * STAGGER_STEP_MS) / 1000
}
