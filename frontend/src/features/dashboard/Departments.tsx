import { BarRows } from '@/features/dashboard/BarRows'
import { SERIES } from '@/features/dashboard/charts/theme'
import type { DepartmentInsight } from '@/types/domain'

/** Open roles by department with the candidates on them; a row opens the department's roles. */
export function Departments({
  departments,
  onSelect,
}: {
  departments: readonly DepartmentInsight[]
  onSelect: (department: DepartmentInsight) => void
}) {
  if (departments.length === 0) {
    return <p className="text-small text-ink-subtle">No open roles right now.</p>
  }
  return (
    <BarRows
      aria-label="Open roles by department"
      rows={departments.map((row) => ({
        key: row.key,
        label: row.label,
        value: row.candidates,
        color: SERIES[0],
        hint: `${row.roles} ${row.roles === 1 ? 'role' : 'roles'} · ${row.openings} ${row.openings === 1 ? 'opening' : 'openings'}`,
      }))}
      onSelect={(row) => onSelect(departments.find((entry) => entry.key === row.key)!)}
    />
  )
}
