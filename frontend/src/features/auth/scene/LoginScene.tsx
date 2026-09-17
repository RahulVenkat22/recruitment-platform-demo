import { Canvas } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import { Backdrop } from '@/features/auth/scene/Backdrop'
import { CameraRig } from '@/features/auth/scene/CameraRig'
import { CursorLight } from '@/features/auth/scene/CursorLight'
import { ROLES, ROLES_COMPACT } from '@/features/auth/scene/graph-data'
import { MatchCore } from '@/features/auth/scene/MatchCore'
import {
  createPointerState,
  usePointerListeners,
  type PointerState,
} from '@/features/auth/scene/pointer'
import { ResumeStream } from '@/features/auth/scene/ResumeStream'
import { createSceneBus, useStage, type SceneBus } from '@/features/auth/scene/stage'
import { TalentGraph } from '@/features/auth/scene/TalentGraph'

interface LoginSceneProps {
  /** Static frame instead of animation. */
  reducedMotion: boolean
  /** Fired once the WebGL context exists, so the page can fade the canvas in. */
  onReady: () => void
}

function Composition({ pointer, bus }: { pointer: PointerState; bus: SceneBus }) {
  const stage = useStage()
  const roles = stage.compact ? ROLES_COMPACT : ROLES
  return (
    <>
      <CameraRig pointer={pointer} />
      <Backdrop pointer={pointer} />
      <ResumeStream stage={stage} pointer={pointer} bus={bus} roleCount={roles.length} />
      <MatchCore stage={stage} pointer={pointer} bus={bus} />
      <TalentGraph stage={stage} pointer={pointer} bus={bus} roles={roles} />
      <CursorLight pointer={pointer} />
    </>
  )
}

/**
 * The login backdrop as one React Three Fiber canvas: résumés stream into the
 * matching core, which fires matches out to a constellation of roles and
 * skills. Loaded lazily so three.js stays out of the main bundle, and never
 * mounted without WebGL. Pointer events pass straight through to the form.
 */
export default function LoginScene({ reducedMotion, onReady }: LoginSceneProps) {
  const pointer = useMemo(() => createPointerState(), [])
  const bus = useMemo(() => createSceneBus(), [])
  const [lost, setLost] = useState(false)
  usePointerListeners(pointer)

  if (lost) return null

  return (
    <Canvas
      flat
      dpr={[1, 1.5]}
      frameloop={reducedMotion ? 'demand' : 'always'}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      camera={{ fov: 42, position: [0, 0, 14], near: 0.1, far: 80 }}
      onCreated={({ gl }) => {
        gl.setClearColor('#0a0a0a', 1)
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault()
          setLost(true)
        })
        onReady()
      }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <Composition pointer={pointer} bus={bus} />
    </Canvas>
  )
}
