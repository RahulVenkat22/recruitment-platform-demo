import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/** Public route. The real two-panel login (plan.md 9.1) arrives in phase 2. */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card">
        <img
          src="/brand/aimious-mark-for-light-bg.svg"
          alt="Aimious"
          width={32}
          height={32}
          className="size-8"
        />
        <h1 className="mt-5 text-display text-ink">Welcome back</h1>
        <p className="mt-2 text-ink-muted">
          Sign in arrives in phase 2. Until then the workspace is open without an account.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/dashboard">Open the dashboard</Link>
        </Button>
      </div>
    </main>
  )
}
