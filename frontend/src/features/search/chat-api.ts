import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import { EventStreamError, postEventStream } from '@/lib/sse'
import type { SearchChatCitation, SearchChatMessage, SearchChatThread } from '@/types/domain'

export async function fetchChatThread(runId: string): Promise<SearchChatThread> {
  const { data } = await api.get<SearchChatThread>(endpoints.searchChat(runId))
  return data
}

export async function clearChatThread(runId: string): Promise<void> {
  await api.delete(endpoints.searchChat(runId))
}

/** The conversation about one search. Only this client changes it, so it never goes stale on its own. */
export function useChatThread(runId: string | undefined) {
  return useQuery({
    queryKey: qk.searches.chat(runId ?? ''),
    queryFn: () => fetchChatThread(runId as string),
    enabled: Boolean(runId),
    staleTime: Infinity,
  })
}

export function useClearChat(runId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => clearChatThread(runId),
    onSuccess: () => {
      queryClient.setQueryData<SearchChatThread>(qk.searches.chat(runId), (thread) =>
        thread ? { ...thread, messages: [] } : thread,
      )
    },
  })
}

// ---------------------------------------------------------------- the stream

/** `context`: what the answer rests on, sent before the first word. */
export interface ChatContext {
  /** The candidates the question names. */
  named: SearchChatCitation[]
  /** Resume passages retrieved for the question. */
  excerpts: number
  /** Ranked candidates the assistant can see. */
  ranked: number
}

/** `done`: both turns as the server stored them. */
export interface ChatDone {
  question: SearchChatMessage
  message: SearchChatMessage
  seconds: number
}

export interface ChatStreamHandlers {
  onContext(context: ChatContext): void
  onToken(text: string): void
  onDone(done: ChatDone): void
}

/** The server could not answer; the message is the sentence to show. */
export { EventStreamError as ChatStreamError }

/**
 * `POST /searches/{id}/chat/`: sends the question and hands each server-sent
 * event to the handlers as it arrives. A non-2xx response or an `error` event
 * becomes a `ChatStreamError`; aborting `signal` rejects with the browser's
 * AbortError.
 */
export async function streamChatAnswer(
  runId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  await postEventStream(
    endpoints.searchChat(runId),
    { message },
    (event, payload) => {
      switch (event) {
        case 'context':
          handlers.onContext(payload as ChatContext)
          break
        case 'token':
          handlers.onToken(String((payload as { text?: string }).text ?? ''))
          break
        case 'done':
          handlers.onDone(payload as ChatDone)
          break
        default:
          break
      }
    },
    signal,
  )
}
