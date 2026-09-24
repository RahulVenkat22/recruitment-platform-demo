import { BarRows } from '@/features/dashboard/BarRows'
import { ORDINAL_RAMP } from '@/features/dashboard/charts/theme'
import type { KeyCount } from '@/types/domain'

/** Candidates in the pipeline by years of experience, juniors first. */
export function ExperienceMix({
  bands,
  onSelect,
}: {
  bands: readonly KeyCount[]
  onSelect: (band: KeyCount) => void
}) {
  return (
    <BarRows
      aria-label="Candidates by years of experience"
      rows={bands.map((band, index) => ({
        ...band,
        color: ORDINAL_RAMP[Math.min(index, ORDINAL_RAMP.length - 1)],
      }))}
      onSelect={(row) => onSelect(bands.find((band) => band.key === row.key)!)}
    />
  )
}
