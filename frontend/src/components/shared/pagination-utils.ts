/** Page numbers to show: first, last, and a window around the current page, with `null` for gaps. */
export function pageWindow(page: number, pageCount: number, radius = 1): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set<number>([1, pageCount])
  for (let candidate = page - radius; candidate <= page + radius; candidate += 1) {
    if (candidate >= 1 && candidate <= pageCount) pages.add(candidate)
  }
  if (page <= 3) [2, 3, 4].forEach((candidate) => pages.add(candidate))
  if (page >= pageCount - 2) {
    ;[pageCount - 3, pageCount - 2, pageCount - 1].forEach((candidate) => pages.add(candidate))
  }
  const sorted = [...pages].filter((candidate) => candidate >= 1).sort((a, b) => a - b)
  const result: (number | null)[] = []
  sorted.forEach((candidate, index) => {
    if (index > 0 && candidate - (sorted[index - 1] as number) > 1) result.push(null)
    result.push(candidate)
  })
  return result
}

export interface PaginationState {
  /** Zero-based, as TanStack Table counts pages. */
  pageIndex: number
  pageSize: number
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}
