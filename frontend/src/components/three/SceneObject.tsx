import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { cn } from '@/lib/utils'
import type { StageId } from './carousel-items'

const ObjectStage = lazy(() => import('./ObjectStage'))

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export interface SceneObjectProps {
  model: StageId
  /** Height in pixels; the box is square. */
  size?: number
  /** Lighting for the surface it sits on. */
  tone?: 'light' | 'dark'
  /** Shown instead of the model when the browser has no WebGL. */
  fallback?: ReactNode
  className?: string
}

/**
 * The 3D object from the login journey, dropped into the application: a
 * résumé, candidate, opportunity or interview model that floats and leans
 * towards the cursor as it moves nearby. Decorative only, so it is hidden from
 * assistive technology; the fallback renders the usual icon without WebGL.
 */
export function SceneObject({
  model,
  size = 160,
  tone = 'light',
  fallback,
  className,
}: SceneObjectProps) {
  const reduced = useMotionPreference()
  const box = useRef<HTMLDivElement>(null)
  const [pointer] = useState(() => ({ x: 0, y: 0 }))
  const [webgl] = useState(() => typeof WebGL2RenderingContext !== 'undefined')
  const [onScreen, setOnScreen] = useState(true)
  const [visible, setVisible] = useState(true)
  const active = onScreen && visible

  useEffect(() => {
    const element = box.current
    if (!element) return
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer?.observe(element)
    return () => {
      document.removeEventListener('visibilitychange', update)
      observer?.disconnect()
    }
  }, [])

  // The model leans towards a cursor anywhere near it, easing back when it wanders off.
  useEffect(() => {
    if (!active || reduced) return
    const onMove = (event: PointerEvent) => {
      const rect = box.current?.getBoundingClientRect()
      if (!rect) return
      const reach = Math.max(rect.width, rect.height) * 2.2
      const dx = (event.clientX - (rect.left + rect.width / 2)) / reach
      const dy = (event.clientY - (rect.top + rect.height / 2)) / reach
      const distance = Math.hypot(dx, dy)
      const weight = Math.max(0, 1 - Math.max(distance - 0.5, 0) * 2)
      pointer.x = Math.max(-1, Math.min(1, dx * 2)) * weight
      pointer.y = -Math.max(-1, Math.min(1, dy * 2)) * weight
    }
    const onLeave = () => {
      pointer.x = 0
      pointer.y = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      onLeave()
    }
  }, [active, reduced, pointer])

  return (
    <div
      ref={box}
      aria-hidden="true"
      data-slot="scene-object"
      data-tone={tone}
      className={cn('scene-object', className)}
      style={{ '--scene-size': `${size}px` } as CSSProperties}
    >
      <div className="scene-object__fallback">{fallback}</div>
      {webgl && (
        <SceneBoundary>
          <Suspense fallback={null}>
            <ObjectStage
              model={model}
              pointer={pointer}
              active={active}
              reduced={reduced}
              tone={tone}
            />
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  )
}
