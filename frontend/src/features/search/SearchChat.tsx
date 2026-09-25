import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  BotIcon,
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
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'
import { matchTone, type MatchTone } from '@/components/shared/match-tone'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChatMarkdown, type NameLink } from '@/features/search/ChatMarkdown'
import { useSearchChat } from '@/features/search/useSearchChat'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { EASE_BRAND } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type {
  SearchChatCitation,
  SearchChatMessage,
  SearchChatScope,
  SearchRun,
} from '@/types/domain'

const THINKING_LINES = [
  'Reading the ranked results…',
  'Checking the resumes…',
  'Writing the answer…',
]
const THINKING_LINE_MS = 1600

const TONE_CLASS: Record<MatchTone, string> = {
  emerald: 'text-success',
  amber: 'text-warning',
  slate: 'text-ink-muted',
}

const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const
const BUBBLE_AI =
  'rounded-card rounded-tl-sm border border-line bg-surface px-4 py-3 text-small/[21px] text-ink shadow-card [overflow-wrap:anywhere]'
const BUBBLE_USER =
  'max-w-[85%] rounded-card rounded-br-sm bg-primary px-4 py-3 text-small/[21px] whitespace-pre-wrap text-white [overflow-wrap:anywhere]'

const QUESTION_LIMIT = 2000

function linkFor(citation: SearchChatCitation): NameLink {
  return { name: citation.name, href: `/candidates/${citation.id}` }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function useRotating(count: number, intervalMs: number): number {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (count <= 1) return
    const handle = window.setInterval(() => setIndex((value) => (value + 1) % count), intervalMs)
    return () => window.clearInterval(handle)
  }, [count, intervalMs])
  return index
}

export interface SearchChatProps {
  /** The finished search the conversation is about; a new run starts a new thread. */
  run: SearchRun
  /** Shown in the header until the thread (which carries the title) has loaded. */
  jobTitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The results chatbot (Enhancement: search results chat): a launcher pinned to
 * the bottom-right corner of the results, and the panel it opens, docked over
 * the page so the ranked table stays readable while the recruiter asks about
 * it. Everything the assistant says comes from this search's results only, and
 * the panel says so up front. Rendered through a portal so page transitions
 * never move it.
 */
export function SearchChat({ run, jobTitle, open, onOpenChange }: SearchChatProps) {
  const reduced = useMotionPreference()
  const triggerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)

  useLayoutEffect(() => {
    if (open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
  }, [open])

  function close() {
    restoreFocusRef.current = true
    onOpenChange(false)
  }

  function restoreFocus() {
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    const target = triggerRef.current?.isConnected
      ? triggerRef.current
      : document.querySelector<HTMLElement>('[data-slot="search-chat-launcher"]')
    target?.focus()
  }
  return createPortal(
    <>
      <AnimatePresence>
        {!open && <Launcher key="launcher" reduced={reduced} onOpen={() => onOpenChange(true)} />}
      </AnimatePresence>
      <AnimatePresence onExitComplete={restoreFocus}>
        {open && (
          <ChatPanel key={run.id} run={run} jobTitle={jobTitle} reduced={reduced} onClose={close} />
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}

function Launcher({ reduced, onOpen }: { reduced: boolean; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      data-slot="search-chat-launcher"
      aria-label="Ask AI about these results"
      aria-haspopup="dialog"
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, y: 12, scale: 0.9, transition: { duration: 0.15 } }}
      transition={SPRING}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2.5 rounded-pill border border-white/10 bg-graphite pr-5 pl-1.5 text-white shadow-popover outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-sm:right-4 max-sm:pr-1.5"
    >
      <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-accent text-ink">
        {!reduced && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-accent animate-bh-ping"
            style={{ animationIterationCount: 3 }}
          />
        )}
        <SparklesIcon aria-hidden="true" className="size-4.5" />
      </span>
      <span className="text-[14px] font-medium max-sm:sr-only">Ask AI about these results</span>
    </motion.button>
  )
}

function ChatPanel({
  run,
  jobTitle,
  reduced,
  onClose,
}: {
  run: SearchRun
  jobTitle?: string
  reduced: boolean
  onClose: () => void
}) {
  const chat = useSearchChat(run.id, !reduced)
  const [draft, setDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Follow the conversation as it grows, unless the reader scrolled up to re-read something.
  const pinnedRef = useRef(true)
  const thread = chat.thread.data
  const messages = thread?.messages ?? []
  const { status, pending, draft: answer, context, error } = chat.state
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
  }, [messages.length, pending, answer, status, error, ready])

  function submit(text: string) {
    if (!text.trim() || text.trim().length > QUESTION_LIMIT || busy || !ready) return
    pinnedRef.current = true
    setDraft('')
    void chat.send(text)
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
    const question = pending
    if (chat.stop() === 'aborted' && question) setDraft(question)
  }

  function editQuestion() {
    const question = pending
    chat.dismiss()
    if (question) setDraft(question)
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

  const title = thread?.scope.job_title ?? jobTitle
  const draftLinks = (context?.named ?? []).map(linkFor)

  return (
    <motion.section
      role="dialog"
      aria-modal="false"
      aria-label="Ask about this search"
      data-slot="search-chat"
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
      style={{ transformOrigin: 'bottom right' }}
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden rounded-card border border-line bg-bg shadow-popover',
        'max-md:inset-x-3 max-md:top-16 max-md:bottom-3',
        'md:right-5 md:bottom-5 md:h-[min(720px,calc(100dvh-2.5rem))] md:w-[460px]',
      )}
    >
      <header
        data-surface="dark"
        className="relative shrink-0 bg-linear-to-br from-graphite to-graphite-2 px-5 pt-5 pb-4 text-ink"
      >
        {/* The lime scan line marks "working", as it does on the search loader. */}
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
            <h2 className="font-heading text-h3 text-white">Your search assistant</h2>
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
        <ScopeCard scope={thread?.scope} run={run} title={title} />
      </header>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Search conversation"
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
              <MessageItem key={message.id} message={message} reduced={reduced} />
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
                  <div className="flex gap-2">
                    <Button type="button" size="xs" onClick={chat.retry}>
                      <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                      Try again
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={editQuestion}>
                      Edit question
                    </Button>
                  </div>
                </div>
              </li>
            )}
            {status === 'thinking' && <ThinkingBubble context={context} reduced={reduced} />}
            {status === 'streaming' && (
              <li className="flex gap-2.5" aria-hidden="true">
                <BotAvatar />
                <div className={cn(BUBBLE_AI, 'min-w-0 max-w-[88%]')}>
                  <ChatMarkdown
                    text={answer}
                    links={draftLinks}
                    trailing={<Caret reduced={reduced} />}
                  />
                </div>
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
            maxLength={QUESTION_LIMIT}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={!ready}
            aria-label="Your question"
            placeholder={busy ? 'Answering…' : 'Ask about these candidates…'}
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px]/[22px] text-ink outline-none field-sizing-content placeholder:text-ink-subtle disabled:opacity-60 md:text-small/[21px]"
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Stop answering"
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
              disabled={!draft.trim() || draft.trim().length > QUESTION_LIMIT || !ready}
            >
              <ArrowUpIcon aria-hidden="true" strokeWidth={2.5} />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]/[16px] text-ink-subtle">
          <span>Grounded in this search’s results</span>
          <span className="tabular-nums">
            {draft.length} / {QUESTION_LIMIT}
          </span>
        </div>
        <p className="mt-1 text-center text-[10px]/[16px] text-ink-subtle">
          AI can make mistakes. Review candidate details before deciding.
        </p>
      </form>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this conversation?"
        description="Every question and answer about this search is removed. The search results themselves are untouched."
        confirmLabel="Clear conversation"
        destructive
        onConfirm={clearThread}
      />
    </motion.section>
  )
}

function ScopeCard({
  scope,
  run,
  title,
}: {
  scope: SearchChatScope | undefined
  run: SearchRun
  title: string | undefined
}) {
  const requestedBy = scope?.requested_by ?? run.requested_by
  return (
    <div
      data-slot="search-chat-scope"
      className="mt-4 rounded-control border border-white/10 bg-white/5 px-3 py-2.5"
    >
      <p className="truncate text-small font-medium text-white">
        {title ?? <Skeleton className="inline-block h-3.5 w-40 bg-white/10 align-middle" />}
      </p>
      <p className="mt-1 text-caption text-ink-muted tabular-nums">
        {scope?.ranked ?? run.total_found} candidates · {run.shortlisted} AI shortlisted
      </p>
      <p className="mt-1 text-[10px]/[16px] text-ink-subtle">
        {formatDateTime(run.started_at)}
        {requestedBy ? ` · by ${requestedBy.full_name}` : ''}
      </p>
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

function Intro({
  scope,
  suggestions,
  reduced,
  onPick,
}: {
  scope: SearchChatScope
  suggestions: string[]
  reduced: boolean
  onPick: (question: string) => void
}) {
  return (
    <li className="space-y-5">
      <div className="px-2 pt-1">
        <span className="mb-3 inline-flex size-10 items-center justify-center rounded-control border border-primary/10 bg-primary-soft text-primary">
          <SparklesIcon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="font-heading text-h3 text-ink">Make sense of your shortlist</h3>
        <p className="mt-2 text-small/[21px] text-ink-muted">
          Explore the <strong className="font-medium text-ink">{scope.ranked} candidates</strong>{' '}
          ranked for <strong className="font-medium text-ink">{scope.job_title}</strong>. Compare
          experience, understand match scores, or ask about someone by name.
        </p>
      </div>
      <div>
        {suggestions.length > 0 && (
          <ul aria-label="Suggested questions" className="space-y-2">
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
      </div>
    </li>
  )
}

function MessageItem({ message, reduced }: { message: SearchChatMessage; reduced: boolean }) {
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
      <div className="min-w-0 max-w-[88%] space-y-2">
        <div className={BUBBLE_AI}>
          <ChatMarkdown text={message.content} links={message.citations.map(linkFor)} />
        </div>
        {message.citations.length > 0 && <Citations items={message.citations} reduced={reduced} />}
      </div>
    </li>
  )
}

function Citations({ items, reduced }: { items: SearchChatCitation[]; reduced: boolean }) {
  return (
    <ul aria-label="Candidates mentioned" className="flex flex-wrap gap-1.5">
      {items.map((citation, index) => (
        <motion.li
          key={citation.id}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.25, ease: EASE_BRAND }}
        >
          <Link
            to={`/candidates/${citation.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line bg-surface pr-2.5 pl-1 text-caption text-ink transition-colors duration-150 ease-brand hover:border-primary/30 hover:bg-primary-soft"
          >
            <Avatar name={citation.name} src={citation.avatar_url} size="xs" />
            <span className="max-w-36 truncate font-medium">{citation.name}</span>
            <span className={cn('tabular-nums', TONE_CLASS[matchTone(citation.match_pct)])}>
              {Math.round(citation.match_pct)}%
            </span>
          </Link>
        </motion.li>
      ))}
    </ul>
  )
}

function ThinkingBubble({
  context,
  reduced,
}: {
  context: { named: SearchChatCitation[]; excerpts: number; ranked: number } | null
  reduced: boolean
}) {
  const line = useRotating(reduced ? 1 : THINKING_LINES.length, THINKING_LINE_MS)
  const named = context?.named ?? []
  const detail =
    named.length > 0
      ? `Looking at ${joinNames(named.map((citation) => citation.name))}`
      : context
        ? `Reading ${context.ranked} ranked candidates${
            context.excerpts ? ` and ${context.excerpts} resume passages` : ''
          }`
        : null
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
        {detail && (
          <p className="mt-1.5 flex items-center gap-1.5 text-caption text-ink-subtle">
            {named.length > 0 && (
              <span className="flex -space-x-1">
                {named.slice(0, 3).map((citation) => (
                  <Avatar
                    key={citation.id}
                    name={citation.name}
                    src={citation.avatar_url}
                    size="xs"
                    ring
                  />
                ))}
              </span>
            )}
            <span className="truncate">{detail}</span>
          </p>
        )}
      </div>
    </motion.li>
  )
}
