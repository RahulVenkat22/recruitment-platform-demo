import { Loader2Icon, PhoneOffIcon, SendHorizontalIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { assessmentOf, useCallReply, useFinishCall } from '@/features/calls/api'
import { AssessmentView, Transcript } from '@/features/calls/CallCard'
import { describeError } from '@/lib/errors'
import type { PhoneCall } from '@/types/domain'

export interface SimulatedCallDialogProps {
  call: PhoneCall | null
  onOpenChange: (open: boolean) => void
}

/** The interview as a chat: you type what the candidate would say; the AI asks the next question. */
export function SimulatedCallDialog({ call, onOpenChange }: SimulatedCallDialogProps) {
  return (
    <Dialog open={call !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl">
        {call && <Conversation key={call.id} initial={call} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Conversation({ initial, onClose }: { initial: PhoneCall; onClose: () => void }) {
  const [call, setCall] = useState(initial)
  const [answer, setAnswer] = useState('')
  const reply = useCallReply()
  const finish = useFinishCall()
  const busy = reply.isPending || finish.isPending
  const live = call.status === 'in_progress'
  const bottom = useRef<HTMLDivElement>(null)
  const name = call.application.candidate.full_name

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [call.transcript])

  async function send() {
    const text = answer.trim()
    if (!text || busy) return
    try {
      const next = await reply.mutateAsync({ id: call.id, answer: text })
      setCall(next)
      setAnswer('')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  async function end() {
    try {
      setCall(await finish.mutateAsync(call.id))
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const assessment = assessmentOf(call)
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Simulated call with {name} · {call.purpose_label}
        </DialogTitle>
        <DialogDescription>
          {live
            ? 'You are playing the candidate. Type what they would say; the AI recruiter answers with its next question. Press Enter to send.'
            : 'The call has ended and is logged in the contact log.'}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface p-3">
        <Transcript call={call} />
        {reply.isPending && (
          <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-subtle">
            <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
            AI recruiter is thinking…
          </p>
        )}
        {!live && assessment && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-small font-medium text-ink">Assessment</p>
            <AssessmentView assessment={assessment} />
          </div>
        )}
        <div ref={bottom} />
      </div>
      {live ? (
        <div className="grid gap-2">
          <Textarea
            rows={2}
            maxLength={4000}
            value={answer}
            disabled={busy}
            placeholder={`What ${name.split(' ')[0]} says…`}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void end()}>
              <PhoneOffIcon data-icon="inline-start" aria-hidden="true" />
              End call
            </Button>
            <Button type="button" disabled={busy || !answer.trim()} onClick={() => void send()}>
              {reply.isPending ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <SendHorizontalIcon data-icon="inline-start" aria-hidden="true" />
              )}
              Send
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      )}
    </>
  )
}
