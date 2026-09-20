import { BotIcon, CheckIcon, SearchIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { SEARCH_MESSAGES } from '@/features/search/search-messages'
import { EASE_BRAND } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SearchProgress } from '@/types/domain'

/**
 * What the search does, in order. With a live `phase` from the API the current
 * stage is highlighted and finished ones ticked; without one (a synchronous
 * run) every stage pulses.
 */
const STAGES = [
  { key: 'analyse', label: 'Reading the brief', icon: BotIcon },
  { key: 'search', label: 'Searching sources', icon: SearchIcon },
  { key: 'evaluate', label: 'AI evaluation', icon: SparklesIcon },
  { key: 'results', label: 'Results', icon: UsersIcon },
] as const

/** Run phases (SearchRun.phase) mapped onto the four stages. */
const PHASE_STAGE: Record<string, number> = {
  queued: 0,
  analysing: 0,
  retrieving: 1,
  scoring: 2,
  evaluating: 2,
  finalising: 3,
  done: 3,
}

const MESSAGE_INTERVAL_MS = 3200
const SOURCE_INTERVAL_MS = 1400

export interface AISearchLoaderProps {
  /** Display names of the sources being queried, in the order chosen. */
  sources: readonly string[]
  jobTitle?: string
  /** Epoch ms when the search started, for the elapsed counter. */
  startedAt: number
  /** Live phase of a background run (SearchRun.phase); omitted for a synchronous run. */
  phase?: string | null
  /** Live progress line of a background run (SearchRun.progress). */
  progress?: SearchProgress | null
  className?: string
}

function useTicker(intervalMs: number, count: number, enabled: boolean): number {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!enabled || count <= 1) return
    const handle = window.setInterval(() => setIndex((value) => (value + 1) % count), intervalMs)
    return () => window.clearInterval(handle)
  }, [enabled, count, intervalMs])
  return count > 0 ? index % count : 0
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(handle)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** The orbiting "profiles" around the radar; angles in degrees. */
const ORBITERS = [0, 120, 240]

/**
 * The search-in-progress state (Enhancement.md 7): a radar sweep with orbiting
 * profiles, the sources being scanned, a four-stage pipeline strip, rotating
 * messages that crossfade every few seconds, and a real elapsed-time counter.
 * No percentage is shown because the API gives none. Reduced motion keeps the
 * text rotating but stops every animation.
 */
export function AISearchLoader({
  sources,
  jobTitle,
  startedAt,
  phase,
  progress,
  className,
}: AISearchLoaderProps) {
  const reducedMotion = useReducedMotion()
  const messageIndex = useTicker(MESSAGE_INTERVAL_MS, SEARCH_MESSAGES.length, true)
  const sourceIndex = useTicker(SOURCE_INTERVAL_MS, sources.length, true)
  const elapsed = useElapsedSeconds(startedAt)
  const message = SEARCH_MESSAGES[messageIndex]
  const scanning = sources[sourceIndex]
  const live = progress?.message?.trim() || null
  const activeStage = phase ? (PHASE_STAGE[phase] ?? null) : null
  const counter =
    progress?.current && progress?.total ? `${progress.current}/${progress.total}` : null

  return (
    <section
      data-slot="ai-search-loader"
      aria-label="Search in progress"
      className={cn(
        'relative overflow-hidden rounded-card border border-line bg-surface shadow-card',
        className,
      )}
    >
      {/* A lime scan line crosses the top edge while the search runs. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-surface-3"
      >
        <div className="h-full w-1/3 bg-accent animate-bh-scan" />
      </div>

      <div className="grid gap-8 px-6 py-10 md:grid-cols-[auto_1fr] md:items-center md:gap-12 md:px-12">
        {/* Radar */}
        <div aria-hidden="true" className="relative mx-auto size-44 shrink-0 md:size-52">
          <div className="absolute inset-0 rounded-full border border-line" />
          <div className="absolute inset-[18%] rounded-full border border-line" />
          <div className="absolute inset-[36%] rounded-full border border-line-strong/60" />
          <div className="absolute inset-0 rounded-full border-2 border-accent/40 animate-bh-ping" />
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgb(196_214_0/0.55),rgb(196_214_0/0.12)_30%,transparent_60%)] animate-bh-sweep [mask:radial-gradient(circle,transparent_22%,black_23%)]" />
          <div className="absolute inset-0 animate-bh-orbit">
            {ORBITERS.map((angle) => (
              <span
                key={angle}
                className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-card"
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-84px) rotate(${-angle}deg)`,
                }}
              >
                <UsersIcon className="size-3.5" />
              </span>
            ))}
          </div>
          <div className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white shadow-popover">
            <SearchIcon className="size-6 animate-pulse" strokeWidth={2} />
          </div>
        </div>

        {/* Copy */}
        <div className="min-w-0 text-center md:text-left">
          <p className="text-caption font-medium tracking-[0.14em] text-accent-ink uppercase">
            AI candidate search
          </p>
          <h2 className="mt-1 text-h2 text-ink">
            Searching{jobTitle ? ` for “${jobTitle}”` : ' candidates'}
          </h2>

          <div
            role="status"
            aria-live="polite"
            className="relative mt-3 min-h-12 text-[15px]/[24px] text-ink-muted"
          >
            {live && (
              <p data-slot="search-live-message" className="font-medium text-ink">
                {live}
                {counter && (
                  <span className="ml-2 text-caption text-ink-subtle tabular-nums">{counter}</span>
                )}
              </p>
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={messageIndex}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_BRAND }}
                className={cn(live && 'text-small text-ink-subtle')}
              >
                <span aria-hidden="true" className="mr-2">
                  {message.emoji}
                </span>
                {message.text}
              </motion.p>
            </AnimatePresence>
          </div>

          {sources.length > 0 && (
            <ul
              aria-label="Sources being scanned"
              className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start"
            >
              {sources.map((source) => {
                const active = source === scanning
                return (
                  <li
                    key={source}
                    data-active={active || undefined}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-small transition-colors duration-250 ease-brand',
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-ink-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1.5 rounded-full',
                        active ? 'bg-accent animate-pulse' : 'bg-line-strong',
                      )}
                    />
                    {active ? `Scanning ${source}` : source}
                  </li>
                )
              })}
            </ul>
          )}

          <ol
            aria-label="Search stages"
            className="mt-6 grid grid-cols-2 gap-x-2 gap-y-4 text-caption text-ink-muted sm:grid-cols-4"
          >
            {STAGES.map((stage, index) => {
              const state =
                activeStage === null
                  ? 'pulse'
                  : index < activeStage
                    ? 'done'
                    : index === activeStage
                      ? 'active'
                      : 'todo'
              return (
                <li
                  key={stage.key}
                  data-state={state}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className="relative flex items-center gap-2"
                >
                  <span
                    className={cn(
                      'inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-250 ease-brand',
                      state === 'pulse' && 'border-line bg-surface-2 text-ink-muted animate-pulse',
                      state === 'done' && 'border-ink bg-ink text-accent',
                      state === 'active' && 'border-accent bg-accent text-ink animate-pulse',
                      state === 'todo' && 'border-line bg-surface-2 text-ink-subtle',
                    )}
                    style={state === 'pulse' ? { animationDelay: `${index * 0.35}s` } : undefined}
                  >
                    {state === 'done' ? (
                      <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      <stage.icon aria-hidden="true" className="size-3.5" />
                    )}
                  </span>
                  <span
                    className={cn('font-medium', state === 'todo' ? 'text-ink-subtle' : 'text-ink')}
                  >
                    {stage.label}
                  </span>
                  {index < STAGES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="ml-auto hidden h-px w-6 overflow-hidden bg-line sm:block"
                    >
                      <span className="block h-full w-1/2 bg-accent-strong animate-bh-scan" />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>

          <p className="mt-5 text-caption text-ink-subtle tabular-nums">
            {elapsed < 1 ? 'Just started' : `${elapsed}s elapsed`} ·{' '}
            {phase
              ? 'Runs in the background — you can keep using the app; results land here.'
              : 'The results appear here the moment the search finishes.'}
          </p>
        </div>
      </div>
    </section>
  )
}
