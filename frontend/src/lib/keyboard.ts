/** True when ⌘K (Mac) or Ctrl+K should open the command palette (plan.md 9.2). */
export function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
}

/**
 * Roving tabindex for a custom radio group or tab strip (WAI-ARIA APG): the
 * index the arrow / Home / End key moves to, wrapping at both ends, or `null`
 * when the key is not a navigation key.
 */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * Focus the `next` sibling control inside a roving group. Elements are matched
 * by `role` so wrappers between the group and its controls do not matter.
 */
export function focusRovingSibling(group: HTMLElement | null, next: number, role = 'radio'): void {
  const controls = group?.querySelectorAll<HTMLElement>(`[role="${role}"]`)
  controls?.[next]?.focus()
}
