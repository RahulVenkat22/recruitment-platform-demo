import { ChevronDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from '@/features/auth/demo-accounts'
import { enumLabel } from '@/lib/enums'
import { cn } from '@/lib/utils'

interface DemoAccountsProps {
  onPick: (account: DemoAccount) => void
  className?: string
}

/** Collapsible list of the seeded logins; one click fills the form (dev and demo builds only). */
export function DemoAccounts({ onPick, className }: DemoAccountsProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <div className={cn('border-t border-line pt-5', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-control text-small font-medium text-ink-muted transition-colors duration-150 ease-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Demo accounts
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            'size-4 transition-transform duration-250 ease-brand',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <>
          <p className="mt-1 text-caption text-ink-subtle">
            Every demo account uses the password{' '}
            <code className="rounded-control bg-surface-2 px-1 py-0.5 text-ink">
              {DEMO_PASSWORD}
            </code>
            .
          </p>
          <ul
            id={listId}
            aria-label="Demo accounts"
            className="mt-3 max-h-64 space-y-0.5 overflow-y-auto pr-1"
          >
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => onPick(account)}
                  className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left transition-colors duration-150 ease-brand hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Avatar name={account.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small text-ink">
                      <span className="font-medium">{account.name}</span>
                      <span className="text-ink-subtle"> • {account.designation}</span>
                    </span>
                    <span className="block truncate text-caption text-ink-subtle">
                      {account.email}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-caption text-ink-muted">
                    {enumLabel('user_role', account.role)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
