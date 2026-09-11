import { Link, useLocation } from 'react-router'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <>
      <PageHeader title="Page not found" breadcrumbs={[{ label: 'Not found' }]} />
      <p className="text-ink-muted">
        There is nothing at{' '}
        <code className="rounded-control bg-surface-2 px-1.5 py-0.5 text-small text-ink">
          {pathname}
        </code>
        . Check the address or head back to the dashboard.
      </p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    </>
  )
}
