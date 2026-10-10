import type Vapi from '@vapi-ai/web'
import { HeadphonesIcon, Loader2Icon, MicIcon, MicOffIcon, PhoneOffIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { startBrowserCall } from '@/features/calls/api'
import type { BrowserCallCreateRequest, BrowserCallSession } from '@/types/domain'

interface BrowserCallTarget {
  applicationId: string
  candidateName: string
  body: BrowserCallCreateRequest
}

export interface BrowserCallDialogProps {
  target: BrowserCallTarget | null
  onOpenChange: (open: boolean) => void
}

type Phase = 'ready' | 'permission' | 'connecting' | 'live' | 'ended' | 'failed'
type Speaker = 'assistant' | 'user'
interface TranscriptLine {
  role: Speaker
  text: string
}

const STATUS: Record<Phase, string> = {
  ready: 'Ready to start',
  permission: 'Waiting for microphone permission…',
  connecting: 'Connecting to the AI recruiter…',
  live: 'Call in progress',
  ended: 'Call ended',
  failed: 'Call could not continue',
}
const CALL_ERROR =
  'The browser call could not connect or was interrupted. Check your connection and voice service setup, then try again.'

function stopClient(client: Vapi) {
  client.removeAllListeners()
  // An in-flight SDK connection can emit errors after cancellation. Keep only a
  // stateless sink: EventEmitter throws for an unhandled "error" event.
  client.on('error', () => {})
  void client.stop().catch(() => {})
}

function microphoneError(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission was denied. Allow microphone access in your browser and try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.'
  }
  return 'Your microphone could not be opened. Check that it is connected and available, then try again.'
}

export function BrowserCallDialog({ target, onOpenChange }: BrowserCallDialogProps) {
  const stop = useRef<(() => void) | null>(null)

  function close(open: boolean) {
    if (!open) stop.current?.()
    onOpenChange(open)
  }

  return (
    <Dialog open={target !== null} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl">
        {target && (
          <BrowserConversation
            key={target.applicationId}
            target={target}
            stopRef={stop}
            onClose={() => close(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BrowserConversation({
  target,
  stopRef,
  onClose,
}: {
  target: BrowserCallTarget
  stopRef: RefObject<(() => void) | null>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [partial, setPartial] = useState<Partial<Record<Speaker, string>>>({})
  const client = useRef<Vapi | null>(null)
  const mounted = useRef(true)
  const generation = useRef(0)
  const busy = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  const dispose = useCallback(() => {
    generation.current += 1
    busy.current = false
    timers.current.forEach(clearTimeout)
    timers.current = []
    const current = client.current
    client.current = null
    if (current) stopClient(current)
  }, [])

  const finish = useCallback(() => {
    dispose()
    if (mounted.current) {
      setPhase('ended')
      setMuted(false)
      setPartial({})
    }
  }, [dispose])

  useEffect(() => {
    mounted.current = true
    stopRef.current = finish
    return () => {
      mounted.current = false
      stopRef.current = null
      dispose()
    }
  }, [dispose, finish, stopRef])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [transcript, partial])

  async function start() {
    if (busy.current) return
    busy.current = true
    const attempt = ++generation.current
    const current = () => mounted.current && generation.current === attempt
    const fail = (message: string) => {
      if (!current()) return
      dispose()
      setError(message)
      setPhase('failed')
      setMuted(false)
      setPartial({})
    }
    setError('')
    setElapsed(0)
    setTranscript([])
    setPartial({})
    setMuted(false)

    if (!window.isSecureContext) {
      fail(
        'Browser calling needs HTTPS or localhost. Open this application over a secure connection.',
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      fail(
        'This browser does not support microphone access. Use a current version of Chrome, Edge, Firefox or Safari.',
      )
      return
    }

    setPhase('permission')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // This is only a permission check. The SDK manages its own audio stream.
      stream.getTracks().forEach((track) => track.stop())
    } catch (cause) {
      fail(microphoneError(cause))
      return
    }
    if (!current()) return

    setPhase('connecting')
    let connection: Vapi | undefined
    try {
      const { default: VapiClient } = await import('@vapi-ai/web')
      if (!current()) return
      const session: BrowserCallSession = await startBrowserCall(target.applicationId, target.body)
      if (!current()) return
      // The authenticated backend creates the session. Joining its room needs
      // neither a browser API credential nor any telephone-number configuration.
      connection = new VapiClient('', undefined, { avoidEval: true })
      client.current = connection
      let connected = false
      const timeout = setTimeout(() => fail(CALL_ERROR), 45_000)
      timers.current.push(timeout)

      connection.on('call-start', () => {
        if (!current() || connected) return
        connected = true
        clearTimeout(timeout)
        setPhase('live')
        const startedAt = Date.now()
        timers.current.push(
          setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000),
          setTimeout(finish, session.max_duration_seconds * 1000),
        )
      })
      connection.on('call-end', () => {
        if (current()) finish()
      })
      connection.on('error', (event: unknown) => {
        // These SDK features are optional; their failure does not mean audio
        // transport failed (for example a browser without noise cancellation).
        if (
          event &&
          typeof event === 'object' &&
          'type' in event &&
          (event.type === 'audio-observer-setup-error' ||
            event.type === 'audio-processing-setup-error')
        )
          return
        fail(CALL_ERROR)
      })
      connection.on('call-start-failed', () => fail(CALL_ERROR))
      connection.on('message', (message: unknown) => {
        if (!current() || !message || typeof message !== 'object') return
        const event = message as Record<string, unknown>
        if (
          event.type !== 'transcript' ||
          (event.role !== 'assistant' && event.role !== 'user') ||
          typeof event.transcript !== 'string' ||
          !event.transcript.trim()
        )
          return
        const role = event.role
        const text = event.transcript.trim()
        if (event.transcriptType === 'final') {
          setTranscript((lines) => [...lines, { role, text }])
          setPartial((lines) => ({ ...lines, [role]: '' }))
        } else if (event.transcriptType === 'partial') {
          setPartial((lines) => ({ ...lines, [role]: text }))
        }
      })
      await connection.reconnect({ id: session.id, webCallUrl: session.web_call_url })
    } catch {
      fail(CALL_ERROR)
    } finally {
      // stop() can run before reconnect() finishes acquiring its microphone.
      // Repeat teardown after that promise settles if this attempt was canceled.
      if (connection && !current()) stopClient(connection)
    }
  }

  function toggleMute() {
    try {
      client.current?.setMuted(!muted)
      setMuted(!muted)
    } catch {
      setError('The microphone could not be changed. End the call and try again.')
    }
  }

  const starting = phase === 'permission' || phase === 'connecting'
  const active = starting || phase === 'live'
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <>
      <DialogHeader>
        <DialogTitle>Browser call demo · {target.candidateName}</DialogTitle>
        <DialogDescription>
          Speak as {target.candidateName} using your microphone. The AI recruiter responds through
          your speakers. This demo does not contact the candidate or book a real interview.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2">
        <p role="status" className="flex items-center gap-2 text-small font-medium text-ink">
          {starting ? (
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <HeadphonesIcon aria-hidden="true" className="size-4" />
          )}
          {STATUS[phase]}
        </p>
        <span aria-label="Call duration" className="text-small tabular-nums text-ink-subtle">
          {clock}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      )}
      <div className="min-h-40 min-w-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface p-3">
        <div role="log" aria-label="Call transcript" aria-live="polite" className="grid gap-3">
          {transcript.length === 0 && !partial.assistant && !partial.user && (
            <p className="text-small text-ink-subtle">
              {active
                ? 'Your conversation will appear here as you speak.'
                : 'Use headphones for clear audio. Start when you are ready.'}
            </p>
          )}
          {transcript.map((line, index) => (
            <p key={index} className="break-words text-small text-ink">
              <span className="font-medium">
                {line.role === 'assistant' ? 'AI recruiter' : 'You'}:{' '}
              </span>
              {line.text}
            </p>
          ))}
          {(['assistant', 'user'] as const).map(
            (role) =>
              partial[role] && (
                <p key={role} className="break-words text-small text-ink-subtle">
                  <span className="font-medium">
                    {role === 'assistant' ? 'AI recruiter' : 'You'}:{' '}
                  </span>
                  {partial[role]}
                </p>
              ),
          )}
        </div>
        <div ref={bottom} />
      </div>
      <p className="text-caption text-ink-subtle">
        Vapi and AI usage charges apply to this live demo.
      </p>
      <DialogFooter>
        {phase === 'live' && (
          <Button type="button" variant="outline" aria-pressed={muted} onClick={toggleMute}>
            {muted ? <MicOffIcon aria-hidden="true" /> : <MicIcon aria-hidden="true" />}
            {muted ? 'Unmute microphone' : 'Mute microphone'}
          </Button>
        )}
        {active ? (
          <Button type="button" variant="outline" onClick={finish}>
            <PhoneOffIcon aria-hidden="true" />
            {starting ? 'Cancel connection' : 'End call'}
          </Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close demo
            </Button>
            <Button type="button" onClick={() => void start()}>
              <MicIcon aria-hidden="true" />
              {phase === 'ready' ? 'Start browser call' : 'Try another call'}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
