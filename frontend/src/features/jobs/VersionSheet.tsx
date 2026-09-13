import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { UserChip } from '@/components/shared/UserChip'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useJobVersion } from '@/features/jobs/api'
import { JobOverview } from '@/features/jobs/JobOverview'
import {
  diffSnapshots,
  markItems,
  type FieldDiff,
  type ItemState,
} from '@/features/jobs/version-diff'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser } from '@/types/domain'

export interface VersionSheetProps {
  jobId: string
  /** The version to show; `null` closes the sheet. */
  version: number | null
  /** When set, the sheet shows the field-level changes from `version` to this one. */
  compareWith: number | null
  onOpenChange: (open: boolean) => void
}

const STATE_CLASS: Record<ItemState, string> = {
  same: 'bg-surface-2 text-ink-muted',
  added: 'bg-success-soft text-success',
  removed: 'bg-danger-soft text-danger line-through decoration-danger/50',
}

function ListSide({
  items,
  other,
  side,
}: {
  items: string[]
  other: string[]
  side: 'before' | 'after'
}) {
  const marked = markItems(items, other, side)
  if (marked.length === 0) return <span className="text-small text-ink-subtle">Empty</span>
  return (
    <ul className="flex flex-wrap gap-1">
      {marked.map((item, index) => (
        <li
          key={`${item.text}-${index}`}
          data-state={item.state}
          className={cn(
            'inline-flex h-6 items-center rounded-pill px-2.5 text-[13px]',
            STATE_CLASS[item.state],
          )}
        >
          {item.text}
        </li>
      ))}
    </ul>
  )
}

function LinesSide({
  items,
  other,
  side,
}: {
  items: string[]
  other: string[]
  side: 'before' | 'after'
}) {
  const marked = markItems(items, other, side)
  if (marked.length === 0) return <span className="text-small text-ink-subtle">Empty</span>
  return (
    <ul className="space-y-1">
      {marked.map((item, index) => (
        <li
          key={`${item.text}-${index}`}
          data-state={item.state}
          className={cn('rounded-control px-2 py-1 text-small', STATE_CLASS[item.state])}
        >
          {item.text}
        </li>
      ))}
    </ul>
  )
}

function ScalarSide({ value, side }: { value: string; side: 'before' | 'after' }) {
  if (!value) return <span className="text-small text-ink-subtle">Empty</span>
  return (
    <div
      className={cn(
        'rounded-control px-2.5 py-1.5 text-small whitespace-pre-wrap',
        side === 'after' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      {value}
    </div>
  )
}

function DiffRow({ diff }: { diff: FieldDiff }) {
  const before = diff.before
  const after = diff.after
  const isList = Array.isArray(before) && Array.isArray(after)
  return (
    <div className="grid gap-3 border-t border-line py-4 md:grid-cols-[160px_1fr_1fr]">
      <div className="text-small font-medium text-ink">{diff.label}</div>
      {isList ? (
        diff.kind === 'list' ? (
          <>
            <ListSide items={before} other={after} side="before" />
            <ListSide items={after} other={before} side="after" />
          </>
        ) : (
          <>
            <LinesSide items={before} other={after} side="before" />
            <LinesSide items={after} other={before} side="after" />
          </>
        )
      ) : (
        <>
          <ScalarSide value={String(before)} side="before" />
          <ScalarSide value={String(after)} side="after" />
        </>
      )}
    </div>
  )
}

/** plan.md 9.6 Versions: "View" renders a snapshot like the Overview; "Compare" shows field-level changes. */
export function VersionSheet({ jobId, version, compareWith, onOpenChange }: VersionSheetProps) {
  const base = useJobVersion(jobId, version)
  const target = useJobVersion(jobId, compareWith)
  const comparing = compareWith !== null
  const open = version !== null

  const loading = base.isPending || (comparing && target.isPending)
  const error = base.error ?? (comparing ? target.error : null)

  let body = null
  if (loading) {
    body = (
      <div className="space-y-4">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={3} />
      </div>
    )
  } else if (error) {
    body = (
      <ErrorState
        title="Couldn't load this version"
        error={error}
        onRetry={() => {
          void base.refetch()
          if (comparing) void target.refetch()
        }}
      />
    )
  } else if (comparing && base.data && target.data) {
    const diffs = diffSnapshots(base.data.snapshot, target.data.snapshot)
    body = (
      <div>
        <div className="grid gap-3 pb-2 text-caption text-ink-subtle uppercase md:grid-cols-[160px_1fr_1fr]">
          <span>Field</span>
          <span>v{base.data.version}</span>
          <span>v{target.data.version}</span>
        </div>
        {diffs.length === 0 ? (
          <p className="border-t border-line pt-4 text-small text-ink-muted">
            These two versions have the same content.
          </p>
        ) : (
          diffs.map((diff) => <DiffRow key={diff.key} diff={diff} />)
        )}
      </div>
    )
  } else if (base.data) {
    body = (
      <JobOverview
        content={{
          ...base.data.snapshot,
          required_skill_names: base.data.required_skill_names,
          preferred_skill_names: base.data.preferred_skill_names,
        }}
        createdBy={base.data.created_by ? personFromUser(base.data.created_by) : null}
        createdAt={base.data.created_at}
      />
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-4xl">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="text-h2">
            {comparing && compareWith !== null
              ? `Changes from v${version} to v${compareWith}`
              : `Version ${version ?? ''}`}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
              {base.data && (
                <>
                  {base.data.created_by && <UserChip user={personFromUser(base.data.created_by)} />}
                  <span>{formatDateTime(base.data.created_at)}</span>
                  {base.data.change_summary && <span>• {base.data.change_summary}</span>}
                </>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
