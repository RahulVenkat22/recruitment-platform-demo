import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  BotIcon,
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ChatMarkdown } from '@/components/shared/ChatMarkdown'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActionCard } from '@/features/assistant/ActionCard'
import { useAssistant } from '@/features/assistant/useAssistant'
import { describeError } from '@/lib/errors'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { EASE_BRAND } from '@/lib/motion'
import { useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { AssistantMessage, AssistantScope, AssistantStep } from '@/types/domain'

const THINKING_LINES = ['Reading your request…', 'Looking things up…', 'Working on it…']
const THINKING_LINE_MS = 1600
const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const
const BUBBLE_AI =
  'rounded-card rounded-tl-sm border border-line bg-surface px-4 py-3 text-small/[21px] text-ink shadow-card [overflow-wrap:anywhere]'
const BUBBLE_USER =
  'max-w-[85%] rounded-card rounded-br-sm bg-primary px-4 py-3 text-small/[21px] whitespace-pre-wrap text-white [overflow-wrap:anywhere]'
const INSTRUCTION_LIMIT = 4000

function useRotating(count: number, intervalMs: number): number {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (count <= 1) return
    const handle = window.setInterval(() => setIndex((value) => (value + 1) % count), intervalMs)
    return () => window.clearInterval(handle)
  }, [count, intervalMs])
  return index
}

/**
 * The TalentOS assistant: a panel docked over every page where the user tells the
 * AI what to do in the application (create a job description, email the onboarded
 * candidates, comment on a job, notify people) and watches it happen. Opened from
 * the top bar, ⌘/ or the command palette; rendered through a portal so page
 * transitions never move it.
 */
export function AssistantPanel() {
  const open = useUiStore((state) => state.assistantOpen)
  const close = useUiStore((state) => state.closeAssistant)
  const reduced = useMotionPreference()
  const triggerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)

  useLayoutEffect(() => {
    if (open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
  }, [open])

  function onClose() {
    restoreFocusRef.current = true
    close()
  }

  function restoreFocus() {
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    const target = triggerRef.current?.isConnected
      ? triggerRef.current
      : document.querySelector<HTMLElement>('[data-slot="assistant-launcher"]')
    target?.focus()
  }

  return createPortal(
    <AnimatePresence onExitComplete={restoreFocus}>
      {open && <Panel key="assistant" reduced={reduced} onClose={onClose} />}
    </AnimatePresence>,
    document.body,
  )
}

function Panel({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  const chat = useAssistant(true, !reduced)
  const initialDraft = useUiStore((state) => state.assistantDraft)
  const [draft, setDraft] = useState(initialDraft)
  const [wide, setWide] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Follow the conversation as it grows, unless the reader scrolled up to re-read something.
  const pinnedRef = useRef(true)
  const thread = chat.thread.data
  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages])
  const { status, pending, steps, error } = chat.state
  const busy = status !== 'idle'
  const ready = chat.thread.isSuccess && !chat.clear.isPending

  // The composer is disabled until the thread has loaded, so focus it once it is usable.
  useEffect(() => {
    if (ready) textareaRef.current?.focus()
  }, [ready])

  useEffect(() => {
    const list = listRef.current
    if (list && pinnedRef.current) {
      list.scrollTop = messages.length === 0 && !pending ? 0 : list.scrollHeight
    }
  }, [messages, pending, steps, status, error, ready])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > INSTRUCTION_LIMIT || busy || !ready) return
    pinnedRef.current = true
    setDraft('')
    void chat.send(trimmed)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit(draft)
    }
  }

  function stop() {
    const instruction = pending
    if (chat.stop() === 'aborted' && instruction) setDraft(instruction)
  }

  function editInstruction() {
    const instruction = pending
    chat.dismiss()
    if (instruction) setDraft(instruction)
    textareaRef.current?.focus()
  }

  async function clearThread() {
    try {
      await chat.clear.mutateAsync()
      toast.success('Conversation cleared')
    } catch (failure) {
      toast.error(describeError(failure))
      throw failure
    }
  }

  return (
    <motion.section
      role="dialog"
      aria-modal="false"
      aria-label="TalentOS AI assistant"
      data-slot="assistant-panel"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !confirmClear &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        ) {
          event.stopPropagation()
          onClose()
        }
      }}
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduced ? undefined : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.18 } }
      }
      transition={SPRING}
      style={{ transformOrigin: 'top right' }}
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden rounded-card border border-line bg-bg shadow-popover',
        'max-md:inset-x-3 max-md:top-16 max-md:bottom-3',
        'md:top-20 md:right-5 md:bottom-5 md:h-auto',
        wide ? 'md:w-[min(880px,calc(100vw-2.5rem))]' : 'md:w-[500px]',
      )}
    >
      <header
        data-surface="dark"
        className="relative shrink-0 bg-linear-to-br from-graphite to-graphite-2 px-5 pt-5 pb-4 text-ink"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-white/5"
        >
          {busy && (
            <div className={cn('h-full bg-accent', reduced ? 'w-full' : 'w-1/3 animate-bh-scan')} />
          )}
        </div>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-accent/20 bg-accent/10 text-accent">
            <SparklesIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-accent uppercase">
              TalentOS AI
            </p>
            <h2 className="font-heading text-h3 text-white">Your workspace assistant</h2>
          </div>
          <div className="-mt-1 -mr-1.5 flex items-center">
            {messages.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear conversation"
                    disabled={busy}
                    onClick={() => setConfirmClear(true)}
                    className="text-ink-muted hover:bg-white/10 hover:text-white"
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear conversation</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={wide ? 'Narrower panel' : 'Wider panel'}
                  aria-pressed={wide}
                  onClick={() => setWide((value) => !value)}
                  className="text-ink-muted hover:bg-white/10 hover:text-white max-md:hidden"
                >
                  {wide ? (
                    <Minimize2Icon aria-hidden="true" />
                  ) : (
                    <Maximize2Icon aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{wide ? 'Narrower' : 'Wider'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  onClick={onClose}
                  className="text-ink-muted hover:bg-white/10 hover:text-white"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <ScopeCard scope={thread?.scope} />
      </header>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Assistant conversation"
        onScroll={(event) => {
          const list = event.currentTarget
          pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
        }}
        className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-5"
      >
        {chat.thread.isPending ? (
          <div aria-busy="true" aria-label="Loading the conversation" className="space-y-3">
            <Skeleton className="h-16 w-4/5 rounded-2xl bg-surface-3" />
            <Skeleton className="h-7 w-40 rounded-pill bg-surface-3" />
            <Skeleton className="h-7 w-52 rounded-pill bg-surface-3" />
          </div>
        ) : chat.thread.isError ? (
          <ErrorState
            variant="inline"
            title="Couldn’t load the conversation"
            error={chat.thread.error}
            onRetry={() => void chat.thread.refetch()}
          />
        ) : (
          <ol className="space-y-4">
            {messages.length === 0 && !pending && thread && (
              <Intro
                scope={thread.scope}
                suggestions={thread.suggestions}
                reduced={reduced}
                onPick={submit}
              />
            )}
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            {pending && (
              <li className="flex justify-end">
                <div className={cn(BUBBLE_USER, error && 'opacity-70')}>{pending}</div>
              </li>
            )}
            {error && (
              <li className="flex justify-end">
                <div
                  role="alert"
                  className="flex max-w-[85%] flex-col gap-2 rounded-card border border-danger/30 bg-danger-soft px-3 py-2.5 text-small text-ink"
                >
                  <p className="flex items-start gap-2">
                    <TriangleAlertIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-danger"
                    />
                    <span>{error}</span>
                  </p>
                  {pending && (
                    <div className="flex gap-2">
                      <Button type="button" size="xs" onClick={chat.retry}>
                        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                        Try again
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={editInstruction}>
                        Edit request
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )}
            {status === 'thinking' && <ThinkingBubble reduced={reduced} />}
            {status === 'streaming' && (
              <li className="flex gap-2.5" aria-hidden="true">
                <BotAvatar />
                <Turn steps={steps} interactive={false} streaming />
              </li>
            )}
          </ol>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 rounded-card border border-line bg-bg p-2 transition-[border-color,box-shadow] duration-150 ease-brand focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={INSTRUCTION_LIMIT}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={!ready}
            aria-label="Your request"
            placeholder={busy ? 'Working…' : 'Tell me what to do…'}
            className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px]/[22px] text-ink outline-none field-sizing-content placeholder:text-ink-subtle disabled:opacity-60 md:text-small/[21px]"
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Stop"
              onClick={(event) => {
                // Aborting switches this control back to submit during the click.
                event.preventDefault()
                stop()
              }}
            >
              <SquareIcon aria-hidden="true" className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-lg"
              aria-label="Send"
              disabled={!draft.trim() || draft.trim().length > INSTRUCTION_LIMIT || !ready}
            >
              <ArrowUpIcon aria-hidden="true" strokeWidth={2.5} />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]/[16px] text-ink-subtle">
          <span>Actions run as you. Mail and one-way moves ask first.</span>
          <span className="tabular-nums">
            {draft.length} / {INSTRUCTION_LIMIT}
          </span>
        </div>
        <p className="mt-1 text-center text-[10px]/[16px] text-ink-subtle">
          AI can make mistakes. Check what it changed before you rely on it.
        </p>
      </form>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this conversation?"
        description="Every request and reply is removed. Anything the assistant already did in the application stays done."
        confirmLabel="Clear conversation"
        destructive
        onConfirm={clearThread}
      />
    </motion.section>
  )
}

function ScopeCard({ scope }: { scope: AssistantScope | undefined }) {
  return (
    <div
      data-slot="assistant-scope"
      className="mt-4 rounded-control border border-white/10 bg-white/5 px-3 py-2.5"
    >
      <div className="truncate text-small font-medium text-white">
        {scope ? (
          `Acting as ${scope.user_name}`
        ) : (
          <Skeleton className="inline-block h-3.5 w-40 bg-white/10 align-middle" />
        )}
      </div>
      <p className="mt-1 text-caption text-ink-muted">
        {scope
          ? scope.can_act
            ? `${scope.role_label} · creates, moves, emails and notifies`
            : `${scope.role_label} · answers and notifications only`
          : ' '}
      </p>
      {scope && <p className="mt-1 text-[10px]/[16px] text-ink-subtle">{scope.model}</p>}
    </div>
  )
}

function BotAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary"
    >
      <BotIcon className="size-4" />
    </span>
  )
}

function Caret({ reduced }: { reduced: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ml-0.5 inline-block h-[1em] w-0.5 translate-y-[0.15em] bg-primary',
        !reduced && 'animate-pulse',
      )}
    />
  )
}

/** An assistant turn: its text and action cards in the order they happened. */
function Turn({
  steps,
  interactive,
  streaming = false,
}: {
  steps: AssistantStep[]
  interactive: boolean
  streaming?: boolean
}) {
  const reduced = useMotionPreference()
  return (
    <div className="min-w-0 max-w-[92%] flex-1 space-y-2">
      {steps.map((step, index) =>
        step.type === 'text' ? (
          <div key={`text-${index}`} className={BUBBLE_AI}>
            <ChatMarkdown
              text={step.text}
              trailing={
                streaming && index === steps.length - 1 ? <Caret reduced={reduced} /> : null
              }
            />
          </div>
        ) : (
          <ActionCard key={step.id || `action-${index}`} step={step} interactive={interactive} />
        ),
      )}
      {streaming && steps.length === 0 && (
        <div className={BUBBLE_AI}>
          <Caret reduced={reduced} />
        </div>
      )}
    </div>
  )
}

function MessageItem({ message }: { message: AssistantMessage }) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <div className={BUBBLE_USER}>{message.content}</div>
      </li>
    )
  }
  return (
    <li className="flex gap-2.5">
      <BotAvatar />
      <Turn steps={message.steps} interactive />
    </li>
  )
}

function Intro({
  scope,
  suggestions,
  reduced,
  onPick,
}: {
  scope: AssistantScope
  suggestions: string[]
  reduced: boolean
  onPick: (text: string) => void
}) {
  return (
    <li className="space-y-5">
      <div className="px-2 pt-1">
        <span className="mb-3 inline-flex size-10 items-center justify-center rounded-control border border-primary/10 bg-primary-soft text-primary">
          <SparklesIcon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="font-heading text-h3 text-ink">Tell me what to do</h3>
        <p className="mt-2 text-small/[21px] text-ink-muted">
          {scope.can_act ? (
            <>
              I work inside TalentOS as you: I{' '}
              <strong className="font-medium text-ink">write job descriptions</strong>, move
              candidates, <strong className="font-medium text-ink">email them</strong>, comment on
              timelines, notify colleagues and answer questions about your pipeline.
            </>
          ) : (
            <>
              I answer questions about the job descriptions and interviews you are involved in, and
              I can notify colleagues for you.
            </>
          )}
        </p>
      </div>
      {suggestions.length > 0 && (
        <ul aria-label="Suggested requests" className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <motion.li
              key={suggestion}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.06, duration: 0.3, ease: EASE_BRAND }}
            >
              <button
                type="button"
                onClick={() => onPick(suggestion)}
                className="flex w-full items-center justify-between gap-3 rounded-control border border-line bg-surface px-3.5 py-3 text-left text-small/[20px] text-ink shadow-card transition-colors duration-150 ease-brand hover:border-primary/30 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">{suggestion}</span>
                <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ThinkingBubble({ reduced }: { reduced: boolean }) {
  const line = useRotating(reduced ? 1 : THINKING_LINES.length, THINKING_LINE_MS)
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_BRAND }}
      className="flex gap-2.5"
    >
      <BotAvatar />
      <div className={cn(BUBBLE_AI, 'min-w-0')}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex items-center gap-1">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="size-1.5 rounded-full bg-primary"
                animate={reduced ? undefined : { y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  delay: dot * 0.15,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={line}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: EASE_BRAND }}
              className="text-small text-ink-muted"
            >
              {THINKING_LINES[line]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.li>
  )
}
