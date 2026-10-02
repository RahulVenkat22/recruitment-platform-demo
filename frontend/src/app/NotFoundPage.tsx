import { Link, useLocation } from 'react-router'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { CompassIcon } from 'lucide-react'

export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <>
      <PageHeader title="Page not found" breadcrumbs={[{ label: 'Not found' }]} />
      <section className="section-reveal flex min-h-80 flex-col items-center justify-center rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
        <span className="grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary">
          <CompassIcon aria-hidden="true" className="size-8" strokeWidth={1.5} />
        </span>
        <span
          aria-hidden="true"
          className="mt-5 font-heading text-6xl font-bold tracking-tight text-ink"
        >
          404
        </span>
        <h2 className="mt-3 text-h2">Let's find your way back.</h2>
        <p className="mt-3 max-w-md break-all text-ink-muted">
          There is nothing at{' '}
          <code className="rounded-control bg-surface-2 px-1.5 py-0.5 text-small text-ink">
            {pathname}
          </code>
          . Check the address or head back to the homepage.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Go to homepage</Link>
        </Button>
      </section>
    </>
  )
}
