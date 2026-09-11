import { useParams } from 'react-router'
import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder'

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <PhasePlaceholder
      title="Candidate"
      subtitle={id ? `Candidate ${id}` : undefined}
      phase={6}
      breadcrumbs={[{ label: 'Candidates', to: '/candidates' }, { label: 'Candidate' }]}
    />
  )
}
