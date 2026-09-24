import {
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  Loader2Icon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportDashboard, type DashboardScope, type ExportKind } from '@/features/dashboard/api'
import { describeError } from '@/lib/errors'

const KINDS: readonly { kind: ExportKind; label: string; icon: LucideIcon }[] = [
  { kind: 'xlsx', label: 'Excel workbook', icon: FileSpreadsheetIcon },
  { kind: 'csv', label: 'CSV', icon: FileTextIcon },
  { kind: 'pdf', label: 'PDF', icon: FileTypeIcon },
]

/**
 * Downloads every figure and table on the dashboard, for the window and people
 * on screen, as one file: a workbook with a sheet per widget, a single CSV with
 * a block per widget, or a printable PDF.
 */
export function ExportMenu({ scope, jobId }: { scope: DashboardScope; jobId?: string }) {
  const [busy, setBusy] = useState<ExportKind | null>(null)

  async function download(kind: ExportKind) {
    setBusy(kind)
    try {
      const { blob, filename } = await exportDashboard(scope, kind, jobId)
      const url = URL.createObjectURL(blob)
      const anchor = Object.assign(document.createElement('a'), { href: url, download: filename })
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(describeError(error), { duration: 8000 })
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-busy={busy !== null || undefined}
        >
          {busy ? (
            <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" />
          ) : (
            <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-caption text-ink-subtle">
          Every figure and table on this page
        </DropdownMenuLabel>
        {KINDS.map(({ kind, label, icon: Icon }) => (
          <DropdownMenuItem key={kind} onSelect={() => void download(kind)}>
            <Icon aria-hidden="true" />
            {label}
            <span className="ml-auto text-caption text-ink-subtle">.{kind}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
