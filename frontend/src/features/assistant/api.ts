import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import { EventStreamError, postEventStream } from '@/lib/sse'
import type { AssistantMessage, AssistantStep, AssistantThread } from '@/types/domain'

export async function fetchAssistantThread(): Promise<AssistantThread> {
  const { data } = await api.get<AssistantThread>(endpoints.assistantChat)
  return data
}

export async function clearAssistantThread(): Promise<void> {
  await api.delete(endpoints.assistantChat)
}

export type ActionDecision = 'confirm' | 'cancel'

export async function decideAction(
  stepId: string,
  decision: ActionDecision,
): Promise<AssistantMessage> {
  const { data } = await api.post<AssistantMessage>(endpoints.assistantAction(stepId, decision))
  return data
}

/** Everything except the conversation itself: what an action may have changed. */
export function invalidateWorkspace(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'assistant' })
}

/** The user's conversation. Only this client changes it, so it never goes stale on its own. */
export function useAssistantThread(enabled: boolean) {
  return useQuery({
    queryKey: qk.assistant.thread(),
    queryFn: fetchAssistantThread,
    enabled,
    staleTime: Infinity,
  })
}

export function useClearAssistant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clearAssistantThread,
    onSuccess: () => {
      queryClient.setQueryData<AssistantThread>(qk.assistant.thread(), (thread) =>
        thread ? { ...thread, messages: [] } : thread,
      )
    },
  })
}

/** Confirms or cancels a pending action; the stored turn comes back rewritten. */
export function useDecideAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, decision }: { stepId: string; decision: ActionDecision }) =>
      decideAction(stepId, decision),
    onSuccess: (message) => {
      queryClient.setQueryData<AssistantThread>(qk.assistant.thread(), (thread) =>
        thread
          ? {
              ...thread,
              messages: thread.messages.map((row) => (row.id === message.id ? message : row)),
            }
          : thread,
      )
      if (message.steps.some((step) => step.result?.changed)) invalidateWorkspace(queryClient)
    },
  })
}

// ---------------------------------------------------------------- the stream

/** `done`: both turns as the server stored them. */
export interface AssistantDone {
  question: AssistantMessage
  message: AssistantMessage
  seconds: number
}

export interface AssistantStreamHandlers {
  onToken(text: string): void
  /** An action, first as `running`, then again with the same id once it is done, failed or pending. */
  onStep(step: AssistantStep): void
  onDone(done: AssistantDone): void
}

export { EventStreamError as AssistantStreamError }

/** `POST /assistant/chat/`: sends the instruction and relays each server-sent event. */
export async function streamAssistantTurn(
  message: string,
  handlers: AssistantStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  await postEventStream(
    endpoints.assistantChat,
    { message },
    (event, payload) => {
      switch (event) {
        case 'token':
          handlers.onToken(String((payload as { text?: string }).text ?? ''))
          break
        case 'step':
          handlers.onStep(payload as AssistantStep)
          break
        case 'done':
          handlers.onDone(payload as AssistantDone)
          break
        default:
          break
      }
    },
    signal,
  )
}
