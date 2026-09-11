import { useParams } from 'react-router'
import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder'

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <PhasePlaceholder
      title="Job Description"
      subtitle={id ? `Job ${id}` : undefined}
      phase={3}
      breadcrumbs={[{ label: 'Job Descriptions', to: '/jobs' }, { label: 'Job Description' }]}
    />
  )
}
