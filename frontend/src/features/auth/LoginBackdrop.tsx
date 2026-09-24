import { useReducedMotion } from 'motion/react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

const LoginScene = lazy(() => import('@/features/auth/scene/LoginScene'))

/** True when the browser can give us a WebGL context. False in jsdom, which never defines WebGL2. */
function supportsWebGL(): boolean {
  if (typeof window === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * The animated layer behind the login page. The CSS graphite-and-glow frame
 * paints instantly and stays as the fallback; the WebGL scene loads on top and
 * fades in once its context exists. `paused` freezes the scene on its current
 * frame, for while the welcome loader covers it.
 */
export function LoginBackdrop({ paused = false }: { paused?: boolean }) {
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const webgl = useMemo(() => supportsWebGL(), [])

  return (
    <div aria-hidden="true" className="graphite-dots absolute inset-0 overflow-hidden">
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-1000 ease-brand',
          ready && 'opacity-0',
        )}
      >
        <div className="absolute -top-[30%] -left-[20%] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.2),transparent_72%)] animate-bh-drift" />
        <div className="absolute -right-[25%] -bottom-[35%] size-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.1),transparent_72%)] animate-bh-drift [animation-delay:-9s] [animation-direction:alternate-reverse]" />
      </div>

      {webgl && (
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-brand',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Suspense fallback={null}>
            <LoginScene
              reducedMotion={Boolean(reducedMotion) || paused}
              onReady={() => setReady(true)}
            />
          </Suspense>
        </div>
      )}

      {/* Phones: the form sits over the scene, so the whole frame is dimmed a little. */}
      <div className="absolute inset-0 bg-gradient-to-b from-graphite/75 via-graphite/35 to-graphite/75 lg:hidden" />

      {/* Quiet scrim under the form so the card reads cleanly over the busiest part of the scene. */}
      <div className="absolute inset-y-0 right-0 hidden w-[48%] bg-gradient-to-l from-graphite/60 via-graphite/20 to-transparent lg:block" />
    </div>
  )
}
