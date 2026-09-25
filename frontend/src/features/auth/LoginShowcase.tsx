import { MoveHorizontalIcon } from 'lucide-react'
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { CAROUSEL_ITEMS, wrapCarouselIndex } from '@/features/auth/carousel-items'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import './login-motion.css'

const TalentCarousel = lazy(() => import('@/features/auth/scene/TalentCarousel'))

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface DragGesture {
  id: number
  x: number
  y: number
  start: number
  current: number
  moved: boolean
}

export function LoginShowcase({
  paused = false,
  onStageChange,
}: {
  paused?: boolean
  onStageChange?: (index: number) => void
}) {
  const reduced = useMotionPreference()
  const [position, setPosition] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [visible, setVisible] = useState(true)
  const [onScreen, setOnScreen] = useState(true)
  const [webgl] = useState(() => typeof WebGL2RenderingContext !== 'undefined')
  const stage = useRef<HTMLDivElement>(null)
  const gesture = useRef<DragGesture | null>(null)
  const captionId = useId()
  const instructionsId = useId()
  const selected = wrapCarouselIndex(position)
  const item = CAROUSEL_ITEMS[selected]
  const active = !paused && visible && onScreen
  const playing = active && !reduced && !dragging

  useEffect(() => {
    onStageChange?.(selected)
  }, [selected, onStageChange])

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    if (stage.current) observer?.observe(stage.current)
    return () => {
      document.removeEventListener('visibilitychange', update)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    // Give each model two seconds, including after a drag or manual selection.
    const timer = window.setTimeout(() => setPosition((value) => Math.round(value) + 1), 2000)
    return () => window.clearTimeout(timer)
  }, [playing, position])

  const step = useCallback((direction: number) => {
    setPosition((value) => Math.round(value) + direction)
  }, [])

  function select(index: number) {
    setPosition((value) => {
      const current = Math.round(value)
      let distance = index - wrapCarouselIndex(current)
      if (distance > 2) distance -= CAROUSEL_ITEMS.length
      if (distance < -2) distance += CAROUSEL_ITEMS.length
      return current + distance
    })
  }

  useEffect(() => {
    const element = stage.current
    if (!element) return
    let accumulated = 0
    let lastEvent = 0
    let lastStep = -Infinity
    const wheel = (event: WheelEvent) => {
      // Leave vertical scrolling and browser pinch-to-zoom available.
      if (event.ctrlKey || (Math.abs(event.deltaX) <= Math.abs(event.deltaY) && !event.shiftKey))
        return
      event.preventDefault()
      const now = performance.now()
      if (now - lastEvent > 180) accumulated = 0
      lastEvent = now
      accumulated +=
        (event.deltaX || event.deltaY) *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1)
      if (Math.abs(accumulated) > 36 && now - lastStep > 450) {
        step(Math.sign(accumulated))
        accumulated = 0
        lastStep = now
      }
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [step])

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button'))
      return
    setDragging(true)
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: position,
      current: position,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = drag.x - event.clientX
    const dy = drag.y - event.clientY
    if (!drag.moved && (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy))) return
    drag.moved = true
    drag.current = drag.start + dx / Math.max(event.currentTarget.clientWidth * 0.42, 100)
    setDragging(true)
    setPosition(drag.current)
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    gesture.current = null
    setDragging(false)
    const distance = drag.current - drag.start
    const destination = cancelled
      ? drag.start
      : Math.abs(distance) > 0.12 && Math.abs(distance) < 0.5
        ? drag.start + Math.sign(distance)
        : drag.current
    setPosition(Math.round(destination))
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      step(event.key === 'ArrowRight' ? 1 : -1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      select(event.key === 'Home' ? 0 : CAROUSEL_ITEMS.length - 1)
    }
  }

  return (
    <section
      className="talent-showcase"
      aria-labelledby="talent-showcase-heading"
      data-reduced-motion={reduced}
    >
      <div className="talent-showcase__intro">
        <p className="talent-showcase__eyebrow">
          <span /> AI-powered recruitment intelligence
        </p>
        <h2 key={`heading-${item.id}`} id="talent-showcase-heading">
          {item.headline}
          <br />
          <span>{item.highlight}</span>
        </h2>
        <p key={`intro-${item.id}`} className="talent-showcase__description">
          {item.introduction}
        </p>
      </div>
      <div
        className="talent-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Explore your hiring journey"
        data-selected={item.id}
        data-playing={playing}
        data-dragging={dragging}
      >
        <div className="talent-carousel__toolbar">
          <span>
            <span className="talent-carousel__status-dot" /> THE HIRING JOURNEY
          </span>
        </div>
        <div
          ref={stage}
          className="talent-carousel__stage"
          role="group"
          aria-label="Rotate recruitment models"
          aria-describedby={instructionsId}
          tabIndex={0}
          onKeyDown={keyDown}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={(event) => finishDrag(event)}
          onPointerCancel={(event) => finishDrag(event, true)}
          onLostPointerCapture={(event) => finishDrag(event, true)}
        >
          <div className="talent-carousel__scene" aria-hidden="true">
            <div className="talent-carousel__glow" />
            <div className="talent-carousel__floor" />
            <div className="talent-carousel__fallback" data-dragging={dragging}>
              {CAROUSEL_ITEMS.map(({ id, label, Icon, color }, index) => {
                const angle = ((index - position) * Math.PI) / 2
                return (
                  <div
                    key={id}
                    className="talent-carousel__fallback-model"
                    style={
                      {
                        '--model-x': Math.sin(angle),
                        '--model-depth': (Math.cos(angle) + 1) / 2,
                        '--model-color': color,
                      } as CSSProperties
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                    <i />
                    <i />
                    <i />
                  </div>
                )
              })}
            </div>
            {webgl && (
              <SceneBoundary>
                <Suspense fallback={null}>
                  <TalentCarousel
                    position={position}
                    playing={playing}
                    dragging={dragging}
                    reduced={reduced}
                    active={active}
                  />
                </Suspense>
              </SceneBoundary>
            )}
          </div>
          <p id={instructionsId} className="talent-carousel__hint">
            <MoveHorizontalIcon aria-hidden="true" />
            <span>Drag or swipe to rotate</span>
            <span className="sr-only">
              . You can also scroll horizontally or use the left and right arrow keys.
            </span>
          </p>
        </div>
        <div
          id={captionId}
          className="talent-carousel__caption"
          aria-live={playing ? 'off' : 'polite'}
          aria-atomic="true"
        >
          <span className="talent-carousel__count">
            0{selected + 1}
            <span> / 04</span>
          </span>
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        </div>
        <div className="talent-carousel__steps" role="group" aria-label="Choose a hiring stage">
          {CAROUSEL_ITEMS.map(({ id, label, Icon }, index) => (
            <button
              key={id}
              type="button"
              aria-label={`Show ${label.toLowerCase()}`}
              aria-current={selected === index ? 'step' : undefined}
              aria-controls={captionId}
              onClick={() => select(index)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <i />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
