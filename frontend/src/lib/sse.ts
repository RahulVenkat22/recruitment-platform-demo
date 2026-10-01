import { resolveApiBaseUrl, tokenRefresher } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'

/** The server could not answer; the message is the sentence to show. */
export class EventStreamError extends Error {}

export type EventHandler = (event: string, payload: unknown) => void

function post(url: string, body: unknown, signal: AbortSignal): Promise<Response> {
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
    body: JSON.stringify(body),
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
function dispatch(frame: string, onEvent: EventHandler): string | null {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  const payload: unknown = JSON.parse(data.join('\n'))
  if (event === 'error') {
    return String((payload as { message?: string }).message || 'The AI could not answer.')
  }
  onEvent(event, payload)
  return null
}

/**
 * POSTs `body` to an API path that answers with server-sent events and hands
 * each event to `onEvent` as it arrives (axios buffers, so this goes through
 * fetch). A stale access token is refreshed once, like the axios client does.
 * A non-2xx response or an `error` event becomes an `EventStreamError`;
 * aborting `signal` rejects with the browser's AbortError.
 */
export async function postEventStream(
  path: string,
  body: unknown,
  onEvent: EventHandler,
  signal: AbortSignal,
): Promise<void> {
  const url = `${resolveApiBaseUrl()}${path}`
  let response = await post(url, body, signal)
  if (response.status === 401) {
    try {
      await tokenRefresher.refresh()
    } catch (error) {
      useAuthStore.getState().clearSession()
      throw error
    }
    response = await post(url, body, signal)
  }
  if (!response.ok || !response.body) throw new EventStreamError(await failureMessage(response))

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
        failure = dispatch(buffer.slice(0, boundary), onEvent)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  if (failure !== null) throw new EventStreamError(failure)
}
