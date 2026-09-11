import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder'

export default function JobFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const title = mode === 'create' ? 'New Job Description' : 'Edit Job Description'
  return (
    <PhasePlaceholder
      title={title}
      phase={3}
      breadcrumbs={[{ label: 'Job Descriptions', to: '/jobs' }, { label: title }]}
    />
  )
}
