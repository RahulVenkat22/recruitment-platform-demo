import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type * as ChatApi from './chat-api'
import { streamChatAnswer, type ChatDone, type ChatStreamHandlers } from './chat-api'
import { useSearchChat } from './useSearchChat'
import { createQueryClient } from '@/lib/query-client'
import { qk } from '@/lib/query-keys'
import type { SearchChatThread } from '@/types/domain'

vi.mock('./chat-api', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatApi>()),
  streamChatAnswer: vi.fn(),
}))

const thread: SearchChatThread = {
  scope: {
    run_id: 'run-1',
    job_id: 'job-1',
    job_title: 'Engineer',
    status: 'completed',
    total_found: 1,
    shortlisted: 1,
    new_candidates: 1,
    ranked: 1,
    started_at: '2026-09-25T10:00:00Z',
    finished_at: '2026-09-25T10:00:01Z',
    requested_by: null,
    sources: ['internal'],
    model: 'test',
  },
  messages: [],
  suggestions: [],
}
const done: ChatDone = {
  question: {
    id: 'q-1',
    role: 'user',
    content: 'Why first?',
    citations: [],
    model: '',
    created_at: '',
  },
  message: {
    id: 'a-1',
    role: 'assistant',
    content: 'Relevant experience.',
    citations: [],
    model: 'test',
    created_at: '',
  },
  seconds: 1,
}

function setup(smooth = false) {
  const client = createQueryClient({ retry: false })
  client.setQueryData(qk.searches.chat('run-1'), thread)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useSearchChat('run-1', smooth), { wrapper }) }
}

describe('search answer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(streamChatAnswer).mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('keeps a completed answer when its reveal finishes before the connection closes', async () => {
    let handlers!: ChatStreamHandlers
    let finish!: () => void
    vi.mocked(streamChatAnswer).mockImplementation((_run, _question, callbacks) => {
      handlers = callbacks
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const { result, client } = setup()
    let request!: Promise<void>
    act(() => {
      request = result.current.send('Why first?')
    })
    act(() => {
      handlers.onToken(done.message.content)
      handlers.onDone(done)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32)
    })
    expect(result.current.state.status).toBe('idle')
    await act(async () => {
      finish()
      await request
    })
    expect(result.current.state.error).toBeNull()
    expect(client.getQueryData<SearchChatThread>(qk.searches.chat('run-1'))?.messages).toEqual([
      done.question,
      done.message,
    ])
  })

  it('shows a fully received answer when Stop is pressed during its reveal', async () => {
    let handlers!: ChatStreamHandlers
    let finish!: () => void
    vi.mocked(streamChatAnswer).mockImplementation((_run, _question, callbacks) => {
      handlers = callbacks
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const { result, client } = setup(true)
    let request!: Promise<void>
    act(() => {
      request = result.current.send('Why first?')
    })
    act(() => {
      handlers.onToken(done.message.content)
      handlers.onDone(done)
    })
    act(() => {
      expect(result.current.stop()).toBe('finished')
    })
    await act(async () => {
      finish()
      await request
    })
    expect(result.current.state.error).toBeNull()
    expect(client.getQueryData<SearchChatThread>(qk.searches.chat('run-1'))?.messages).toHaveLength(
      2,
    )
  })

  it('allows a cut-short question to be retried without storing a partial answer', async () => {
    vi.mocked(streamChatAnswer).mockResolvedValueOnce(undefined)
    const { result, client } = setup()
    await act(async () => {
      await result.current.send('Why first?')
    })
    expect(result.current.state.error).toMatch(/cut short/)
    expect(result.current.state.pending).toBe('Why first?')
    expect(client.getQueryData<SearchChatThread>(qk.searches.chat('run-1'))?.messages).toEqual([])
    vi.mocked(streamChatAnswer).mockImplementationOnce(async (_run, _question, handlers) => {
      handlers.onToken(done.message.content)
      handlers.onDone(done)
    })
    await act(async () => {
      result.current.retry()
      await vi.advanceTimersByTimeAsync(32)
    })
    expect(result.current.state.error).toBeNull()
    expect(client.getQueryData<SearchChatThread>(qk.searches.chat('run-1'))?.messages).toHaveLength(
      2,
    )
  })
})
