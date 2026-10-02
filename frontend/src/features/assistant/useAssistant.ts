import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  AssistantStreamError,
  invalidateWorkspace,
  streamAssistantTurn,
  useAssistantThread,
  useClearAssistant,
  type AssistantDone,
} from '@/features/assistant/api'
import { describeError, NETWORK_MESSAGE } from '@/lib/errors'
import { qk } from '@/lib/query-keys'
import type { AssistantStep, AssistantThread } from '@/types/domain'

export type AssistantStatus = 'idle' | 'thinking' | 'streaming'

export interface AssistantState {
  status: AssistantStatus
  /** The instruction in flight, or the one that just failed. */
  pending: string | null
  /** The turn revealed so far: text and actions in order. */
  steps: AssistantStep[]
  error: string | null
}

const IDLE: AssistantState = { status: 'idle', pending: null, steps: [], error: null }

/** Characters revealed per frame: at least this many, and a tenth of the backlog when behind. */
const REVEAL_MIN = 3
const REVEAL_CATCH_UP = 10

type QueueItem = { kind: 'text'; text: string } | { kind: 'step'; step: AssistantStep }

function textStep(text: string): AssistantStep {
  return {
    type: 'text',
    text,
    id: '',
    name: '',
    label: '',
    status: 'done',
    details: [],
    body: '',
    result: null,
    error: '',
  }
}

function appendText(steps: AssistantStep[], text: string): void {
  const last = steps[steps.length - 1]
  if (last && last.type === 'text') steps[steps.length - 1] = { ...last, text: last.text + text }
  else steps.push(textStep(text))
}

function applyStep(steps: AssistantStep[], step: AssistantStep): void {
  const index = steps.findIndex((row) => row.type === 'action' && row.id === step.id)
  if (index === -1) steps.push(step)
  else steps[index] = step
}

function describeFailure(error: unknown): string {
  if (error instanceof AssistantStreamError) return error.message
  if (error instanceof TypeError) return NETWORK_MESSAGE
  return describeError(error)
}

/**
 * The user's conversation with the assistant. `send` streams a turn; text is
 * revealed a few characters per frame (with `smooth`) and each action appears
 * the moment the server reports it, in order. Both stored turns land in the
 * thread query once the reveal has caught up, so nothing jumps.
 */
export function useAssistant(open: boolean, smooth: boolean) {
  const queryClient = useQueryClient()
  const thread = useAssistantThread(open)
  const clear = useClearAssistant()
  const [state, setState] = useState<AssistantState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)
  const queueRef = useRef<QueueItem[]>([])
  const draftRef = useRef<AssistantStep[]>([])
  const doneRef = useRef<AssistantDone | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  function resetBuffers() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    queueRef.current = []
    draftRef.current = []
    doneRef.current = null
  }

  function commit(done: AssistantDone) {
    queryClient.setQueryData<AssistantThread>(qk.assistant.thread(), (current) =>
      current
        ? { ...current, messages: [...current.messages, done.question, done.message] }
        : current,
    )
    resetBuffers()
    setState(IDLE)
  }

  function schedule() {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(tick)
  }

  function tick() {
    frameRef.current = null
    const queue = queueRef.current
    const behind = queue.reduce(
      (sum, item) => sum + (item.kind === 'text' ? item.text.length : 0),
      0,
    )
    let budget = smooth ? Math.max(REVEAL_MIN, Math.ceil(behind / REVEAL_CATCH_UP)) : Infinity
    let changed = false
    while (queue.length > 0) {
      const head = queue[0]
      if (head.kind === 'step') {
        applyStep(draftRef.current, head.step)
        queue.shift()
        changed = true
        continue
      }
      if (budget <= 0) break
      const take = Math.min(budget, head.text.length)
      appendText(draftRef.current, head.text.slice(0, take))
      head.text = head.text.slice(take)
      if (!head.text) queue.shift()
      budget -= take
      changed = true
    }
    if (changed) {
      const steps = [...draftRef.current]
      setState((current) => ({ ...current, status: 'streaming', steps }))
    }
    if (queue.length > 0) schedule()
    else if (doneRef.current) commit(doneRef.current)
  }

  async function send(text: string) {
    const instruction = text.trim()
    if (!instruction || abortRef.current || doneRef.current) return
    const controller = new AbortController()
    // Completion and the visual reveal have separate lifetimes: committing the
    // reveal clears doneRef before a slow connection necessarily closes.
    let completed = false
    let acted = false
    abortRef.current = controller
    resetBuffers()
    setState({ status: 'thinking', pending: instruction, steps: [], error: null })
    try {
      await streamAssistantTurn(
        instruction,
        {
          onToken: (piece) => {
            queueRef.current.push({ kind: 'text', text: piece })
            schedule()
          },
          onStep: (step) => {
            queueRef.current.push({ kind: 'step', step })
            if (step.status === 'done' && step.result?.changed) {
              acted = true
              invalidateWorkspace(queryClient)
            }
            schedule()
          },
          onDone: (done) => {
            completed = true
            doneRef.current = done
            schedule()
          },
        },
        controller.signal,
      )
      if (!completed) throw new AssistantStreamError('The answer was cut short; try again.')
    } catch (error) {
      if (completed) return
      resetBuffers()
      if (controller.signal.aborted || acted) {
        // The server keeps a turn whose actions ran; show it as stored.
        void queryClient.invalidateQueries({ queryKey: qk.assistant.thread() })
      }
      if (controller.signal.aborted) {
        setState(IDLE)
      } else {
        setState({
          status: 'idle',
          pending: acted ? null : instruction,
          steps: [],
          error: describeFailure(error),
        })
      }
    } finally {
      abortRef.current = null
    }
  }

  /**
   * Stops the turn. While the model is still working, the request is aborted
   * ('aborted'); once the whole turn has arrived and only the reveal is running,
   * it is shown in full instead ('finished').
   */
  function stop(): 'aborted' | 'finished' | null {
    if (doneRef.current) {
      commit(doneRef.current)
      return 'finished'
    }
    if (abortRef.current) {
      abortRef.current.abort()
      return 'aborted'
    }
    return null
  }

  function retry() {
    if (state.pending) void send(state.pending)
  }

  function dismiss() {
    setState(IDLE)
  }

  return { thread, clear, state, send, stop, retry, dismiss }
}
