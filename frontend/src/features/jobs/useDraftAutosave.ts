import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { JobFormValues } from '@/features/jobs/job-form-schema'

export const AUTOSAVE_INTERVAL_MS = 10_000
const DRAFT_PREFIX = 'aimious.jobdraft.'

export interface SavedDraft {
  values: JobFormValues
  savedAt: string
}

function read(key: string): SavedDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedDraft>
    if (!parsed || typeof parsed !== 'object' || !parsed.values || !parsed.savedAt) return null
    return parsed as SavedDraft
  } catch {
    return null
  }
}

function write(key: string, draft: SavedDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage full or blocked: the safety net simply does not apply.
  }
}

/**
 * plan.md 9.5 safety net: every 10 seconds, a dirty form is written to
 * localStorage under `aimious.jobdraft.<id|new>`. On mount an existing draft is
 * offered back; `clear()` removes it once the JD is saved for real.
 */
export function useDraftAutosave(draftId: string, form: UseFormReturn<JobFormValues>) {
  const key = `${DRAFT_PREFIX}${draftId}`
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(() =>
    typeof window === 'undefined' ? null : read(key),
  )
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  })

  useEffect(() => {
    const handle = window.setInterval(() => {
      const current = formRef.current
      if (!current.formState.isDirty || current.formState.isSubmitting) return
      write(key, { values: current.getValues(), savedAt: new Date().toISOString() })
    }, AUTOSAVE_INTERVAL_MS)
    return () => window.clearInterval(handle)
  }, [key])

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Nothing to do.
    }
    setSavedDraft(null)
  }, [key])

  const restore = useCallback(() => {
    if (!savedDraft) return
    // Keep the original defaults so the restored values count as unsaved changes.
    formRef.current.reset(savedDraft.values, { keepDefaultValues: true })
    setSavedDraft(null)
  }, [savedDraft])

  return { savedDraft, restore, discard: clear, clear }
}
