import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints, resolveApiBaseUrl, tokenRefresher } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { qk } from '@/lib/query-keys'
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
export class ChatStreamError extends Error {}

function post(url: string, message: string, signal: AbortSignal): Promise<Response> {
  const token = useAuthStore.getState().accessToken
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // JSON first: an error envelope stays JSON; the answer streams regardless.
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
    signal,
  })
}

async function failureMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // Not the plan.md 6.10 envelope.
  }
  return `The request failed (HTTP ${response.status}).`
}

/** Handles one `event: … / data: …` frame; returns the error sentence when the frame is one. */
function dispatch(frame: string, handlers: ChatStreamHandlers): string | null {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  const payload: unknown = JSON.parse(data.join('\n'))
  switch (event) {
    case 'context':
      handlers.onContext(payload as ChatContext)
      return null
    case 'token':
      handlers.onToken(String((payload as { text?: string }).text ?? ''))
      return null
    case 'done':
      handlers.onDone(payload as ChatDone)
      return null
    case 'error':
      return String((payload as { message?: string }).message || 'The AI could not answer.')
    default:
      return null
  }
}

/**
 * `POST /searches/{id}/chat/`: sends the question and hands each server-sent
 * event to the handlers as it arrives (axios buffers, so this goes through
 * fetch). A stale access token is refreshed once, like the axios client does.
 * A non-2xx response or an `error` event becomes a `ChatStreamError`; aborting
 * `signal` rejects with the browser's AbortError.
 */
export async function streamChatAnswer(
  runId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const url = `${resolveApiBaseUrl()}${endpoints.searchChat(runId)}`
  let response = await post(url, message, signal)
  if (response.status === 401) {
    try {
      await tokenRefresher.refresh()
    } catch (error) {
      useAuthStore.getState().clearSession()
      throw error
    }
    response = await post(url, message, signal)
  }
  if (!response.ok || !response.body) throw new ChatStreamError(await failureMessage(response))

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let failure: string | null = null
  try {
    while (failure === null) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1 && failure === null) {
        failure = dispatch(buffer.slice(0, boundary), handlers)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  if (failure !== null) throw new ChatStreamError(failure)
}
