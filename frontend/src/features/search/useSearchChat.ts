import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  ChatStreamError,
  streamChatAnswer,
  useChatThread,
  useClearChat,
  type ChatContext,
  type ChatDone,
} from '@/features/search/chat-api'
import { describeError, NETWORK_MESSAGE } from '@/lib/errors'
import { qk } from '@/lib/query-keys'
import type { SearchChatThread } from '@/types/domain'

export type ChatStatus = 'idle' | 'thinking' | 'streaming'

export interface ChatState {
  status: ChatStatus
  /** The question in flight, or the one that just failed. */
  pending: string | null
  /** The answer revealed so far. */
  draft: string
  context: ChatContext | null
  error: string | null
}

const IDLE: ChatState = { status: 'idle', pending: null, draft: '', context: null, error: null }

/** Characters revealed per frame: at least this many, and a tenth of the backlog when behind. */
const REVEAL_MIN = 3
const REVEAL_CATCH_UP = 10

function describeFailure(error: unknown): string {
  if (error instanceof ChatStreamError) return error.message
  if (error instanceof TypeError) return NETWORK_MESSAGE
  return describeError(error)
}

/**
 * One conversation about one search run. `send` streams the answer and, with
 * `smooth`, reveals it a few characters per frame so the text reads like it is
 * being typed even though the model sends it in larger pieces; without it the
 * text appears as it arrives. Both stored turns land in the thread query once
 * the reveal has caught up, so the bubble never jumps.
 */
export function useSearchChat(runId: string, smooth: boolean) {
  const queryClient = useQueryClient()
  const thread = useChatThread(runId)
  const clear = useClearChat(runId)
  const [state, setState] = useState<ChatState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)
  const receivedRef = useRef('')
  const revealedRef = useRef(0)
  const doneRef = useRef<ChatDone | null>(null)
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
    receivedRef.current = ''
    revealedRef.current = 0
    doneRef.current = null
  }

  function commit(done: ChatDone) {
    queryClient.setQueryData<SearchChatThread>(qk.searches.chat(runId), (current) =>
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
    const target = receivedRef.current
    const behind = target.length - revealedRef.current
    if (behind > 0) {
      const step = smooth ? Math.max(REVEAL_MIN, Math.ceil(behind / REVEAL_CATCH_UP)) : behind
      revealedRef.current = Math.min(target.length, revealedRef.current + step)
      const draft = target.slice(0, revealedRef.current)
      setState((current) => ({ ...current, status: 'streaming', draft }))
    }
    if (revealedRef.current < receivedRef.current.length) schedule()
    else if (doneRef.current) commit(doneRef.current)
  }

  async function send(text: string) {
    const question = text.trim()
    if (!question || abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    resetBuffers()
    setState({ status: 'thinking', pending: question, draft: '', context: null, error: null })
    try {
      await streamChatAnswer(
        runId,
        question,
        {
          onContext: (context) => setState((current) => ({ ...current, context })),
          onToken: (piece) => {
            receivedRef.current += piece
            schedule()
          },
          onDone: (done) => {
            doneRef.current = done
            schedule()
          },
        },
        controller.signal,
      )
      if (!doneRef.current) throw new ChatStreamError('The answer was cut short; try again.')
    } catch (error) {
      resetBuffers()
      if (controller.signal.aborted) {
        setState(IDLE)
      } else {
        setState({
          status: 'idle',
          pending: question,
          draft: '',
          context: null,
          error: describeFailure(error),
        })
      }
    } finally {
      abortRef.current = null
    }
  }

  /**
   * Stops the answer. While the model is still writing, the request is aborted and
   * the question is discarded ('aborted'); once the whole answer has arrived and
   * only the reveal is running, it is shown in full instead ('finished').
   */
  function stop(): 'aborted' | 'finished' | null {
    if (abortRef.current) {
      abortRef.current.abort()
      return 'aborted'
    }
    if (doneRef.current) {
      commit(doneRef.current)
      return 'finished'
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
