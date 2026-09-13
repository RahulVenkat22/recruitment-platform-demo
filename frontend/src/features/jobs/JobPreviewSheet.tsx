import { PeoplePicker } from '@/components/shared/PeoplePicker'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formToSnapshot, type JobFormValues } from '@/features/jobs/job-form-schema'
import { JobOverview } from '@/features/jobs/JobOverview'
import type { Person } from '@/types/domain'

export interface JobPreviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  values: JobFormValues
  creator: Person | null
  status: string
}

/** plan.md 9.5 Preview: a right-side sheet rendering the JD as candidates would read it. */
export function JobPreviewSheet({
  open,
  onOpenChange,
  values,
  creator,
  status,
}: JobPreviewSheetProps) {
  const snapshot = formToSnapshot(values)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-4xl">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="text-h2">
            {snapshot.title || 'Untitled job description'}
          </SheetTitle>
          <SheetDescription>
            Preview of how the team will read this job description.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <JobOverview
            content={snapshot}
            status={status}
            createdBy={creator}
            people={
              <PeoplePicker
                value={values.participants.map((entry) => ({
                  user_id: entry.user_id,
                  role_in_recruitment: entry.role_in_recruitment,
                }))}
                onChange={() => {}}
                collapsed
              />
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
