import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBrowserCall } from '@/features/calls/api'
import { BrowserCallDialog } from '@/features/calls/BrowserCallDialog'
import type { BrowserCallCreateRequest, BrowserCallSession } from '@/types/domain'

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  reconnect: vi.fn(),
  stop: vi.fn(),
  setMuted: vi.fn(),
  listeners: new Map<string, Set<(value?: unknown) => void>>(),
}))

vi.mock('@/features/calls/api', () => ({ startBrowserCall: vi.fn() }))
vi.mock('@vapi-ai/web', () => ({
  default: class {
    constructor(...args: unknown[]) {
      sdk.create(...args)
    }
    reconnect = sdk.reconnect
    stop = sdk.stop
    setMuted = sdk.setMuted
    on(event: string, listener: (value?: unknown) => void) {
      const listeners = sdk.listeners.get(event) ?? new Set()
      listeners.add(listener)
      sdk.listeners.set(event, listeners)
      return this
    }
    removeAllListeners() {
      sdk.listeners.clear()
    }
  },
}))

const session: BrowserCallSession = {
  id: 'web-call-1',
  web_call_url: 'https://example.daily.co/demo-room',
  max_duration_seconds: 300,
}
const target = {
  applicationId: 'application-1',
  candidateName: 'Anita Kumar',
  body: {
    purpose: 'information',
    information: 'Explain the role',
    interview_round: '',
    interview_duration_minutes: 60,
    interview_mode: 'video',
    instructions: '',
    max_minutes: 5,
  } satisfies BrowserCallCreateRequest,
}
const stopTrack = vi.fn()
const getUserMedia = vi.fn()
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

function emit(event: string, value?: unknown) {
  act(() => sdk.listeners.get(event)?.forEach((listener) => listener(value)))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function startDemo() {
  const ui = userEvent.setup()
  await ui.click(screen.getByRole('button', { name: 'Start browser call' }))
  await waitFor(() => expect(sdk.reconnect).toHaveBeenCalled())
  return ui
}

beforeEach(() => {
  vi.clearAllMocks()
  sdk.listeners.clear()
  sdk.reconnect.mockResolvedValue(undefined)
  sdk.stop.mockResolvedValue(undefined)
  vi.mocked(startBrowserCall).mockResolvedValue(session)
  getUserMedia.mockResolvedValue(stream)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else Reflect.deleteProperty(navigator, 'mediaDevices')
})

it('requests microphone permission before creating and joining a server browser session', async () => {
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  expect(startBrowserCall).not.toHaveBeenCalled()
  expect(
    screen.getByText(/does not contact the candidate or book a real interview/),
  ).toBeInTheDocument()

  await startDemo()

  expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(stopTrack.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(startBrowserCall).mock.invocationCallOrder[0],
  )
  expect(startBrowserCall).toHaveBeenCalledWith(target.applicationId, target.body)
  expect(sdk.create).toHaveBeenCalledWith('', undefined, { avoidEval: true })
  expect(sdk.reconnect).toHaveBeenCalledWith({ id: session.id, webCallUrl: session.web_call_url })
  expect(screen.queryByText(session.web_call_url)).not.toBeInTheDocument()
  emit('call-start')
  expect(screen.getByRole('status')).toHaveTextContent('Call in progress')
})

it('does not create a billed session when microphone permission is denied', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start browser call' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Microphone permission was denied')
  expect(startBrowserCall).not.toHaveBeenCalled()
  expect(sdk.create).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Try another call' })).toBeEnabled()
})

it('explains the secure browser requirement before requesting a session', async () => {
  vi.stubGlobal('isSecureContext', false)
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start browser call' }))
  expect(screen.getByRole('alert')).toHaveTextContent('HTTPS or localhost')
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(startBrowserCall).not.toHaveBeenCalled()
})

it('shows partial and final speech, supports mute, and stops the call', async () => {
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  const ui = await startDemo()
  emit('call-start')
  emit('message', {
    type: 'transcript',
    role: 'assistant',
    transcriptType: 'partial',
    transcript: 'Hello there',
  })
  expect(screen.getByRole('log')).toHaveTextContent('AI recruiter: Hello there')
  emit('message', {
    type: 'transcript',
    role: 'assistant',
    transcriptType: 'final',
    transcript: 'Hello Anita.',
  })
  expect(screen.getByRole('log')).not.toHaveTextContent('Hello there')
  expect(screen.getByRole('log')).toHaveTextContent('AI recruiter: Hello Anita.')
  emit('message', {
    type: 'transcript',
    role: 'user',
    transcriptType: 'final',
    transcript: 'I am available tomorrow.',
  })
  expect(screen.getByRole('log')).toHaveTextContent('You: I am available tomorrow.')

  await ui.click(screen.getByRole('button', { name: 'Mute microphone' }))
  expect(sdk.setMuted).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Unmute microphone' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await ui.click(screen.getByRole('button', { name: 'Unmute microphone' }))
  expect(sdk.setMuted).toHaveBeenLastCalledWith(false)
  await ui.click(screen.getByRole('button', { name: 'End call' }))
  expect(sdk.stop).toHaveBeenCalled()
  expect(sdk.listeners.has('message')).toBe(false)
  expect(screen.getByRole('status')).toHaveTextContent('Call ended')
})

it('closes and stops an active call when Escape is pressed', async () => {
  const onOpenChange = vi.fn()
  render(<BrowserCallDialog target={target} onOpenChange={onOpenChange} />)
  const ui = await startDemo()
  emit('call-start')
  await ui.keyboard('{Escape}')
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(sdk.stop).toHaveBeenCalled()
  expect(sdk.listeners.has('call-start')).toBe(false)
})

it('releases a late permission stream after unmount without creating a session', async () => {
  const permission = deferred<MediaStream>()
  getUserMedia.mockReturnValue(permission.promise)
  const view = render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start browser call' }))
  view.unmount()
  await act(async () => {
    permission.resolve(stream)
  })
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(startBrowserCall).not.toHaveBeenCalled()
})

it('never joins a server session that arrives after cancellation', async () => {
  const creation = deferred<BrowserCallSession>()
  vi.mocked(startBrowserCall).mockReturnValue(creation.promise)
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start browser call' }))
  await waitFor(() => expect(startBrowserCall).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: 'Cancel connection' }))
  await act(async () => {
    creation.resolve(session)
  })
  expect(sdk.reconnect).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('Call ended')
})

it('stops again when an in-flight SDK connection resolves after unmount', async () => {
  const connecting = deferred<void>()
  sdk.reconnect.mockReturnValue(connecting.promise)
  const view = render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await startDemo()
  view.unmount()
  expect(sdk.stop).toHaveBeenCalledTimes(1)
  await act(async () => {
    connecting.resolve()
  })
  expect(sdk.stop).toHaveBeenCalledTimes(2)
  expect(sdk.listeners.has('message')).toBe(false)
})

it('handles rejected SDK connections without exposing provider errors and permits retry', async () => {
  sdk.reconnect.mockRejectedValue(new Error(`Failure connecting ${session.web_call_url}`))
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start browser call' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The browser call could not connect')
  expect(screen.getByRole('alert')).not.toHaveTextContent(session.web_call_url)
  expect(sdk.stop).toHaveBeenCalled()
  sdk.reconnect.mockResolvedValue(undefined)
  await userEvent.click(screen.getByRole('button', { name: 'Try another call' }))
  await waitFor(() => expect(sdk.reconnect).toHaveBeenCalledTimes(2))
  emit('call-start')
  expect(screen.getByRole('status')).toHaveTextContent('Call in progress')
})

it('keeps optional SDK audio features from ending the call, but handles transport errors', async () => {
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await startDemo()
  emit('call-start')
  emit('error', { type: 'audio-observer-setup-error' })
  emit('error', { type: 'audio-processing-setup-error' })
  expect(screen.getByRole('status')).toHaveTextContent('Call in progress')
  expect(sdk.stop).not.toHaveBeenCalled()
  emit('error', { type: 'daily-error', message: session.web_call_url })
  expect(screen.getByRole('alert')).toHaveTextContent('The browser call could not connect')
  expect(screen.getByRole('alert')).not.toHaveTextContent(session.web_call_url)
  expect(sdk.stop).toHaveBeenCalled()
})

it('updates elapsed time and ends at the server-provided duration limit', async () => {
  render(<BrowserCallDialog target={target} onOpenChange={vi.fn()} />)
  await startDemo()
  vi.useFakeTimers()
  emit('call-start')
  act(() => vi.advanceTimersByTime(65_000))
  expect(screen.getByLabelText('Call duration')).toHaveTextContent('01:05')
  act(() => vi.advanceTimersByTime(235_000))
  expect(screen.getByRole('status')).toHaveTextContent('Call ended')
  expect(sdk.stop).toHaveBeenCalled()
})
