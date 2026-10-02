import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import type { StageId } from './carousel-items'
import { CandidateModel, InterviewModel, OpportunityModel, ResumeModel } from './RecruitmentModels'

const MODELS = {
  resumes: ResumeModel,
  candidates: CandidateModel,
  opportunities: OpportunityModel,
  interviews: InterviewModel,
}

export interface ObjectStageProps {
  model: StageId
  /** Where the model should lean, in -1..1 on both axes; written by the wrapper. */
  pointer: { x: number; y: number }
  /** False while off screen or in a hidden tab: the frame loop stops entirely. */
  active: boolean
  reduced: boolean
  tone: 'light' | 'dark'
}

/** Soft elliptical contact shadow under the model. */
function shadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(0,0,0,0.6)')
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.2)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new CanvasTexture(canvas)
}

function Scene({ model, pointer, active, reduced, tone }: ObjectStageProps) {
  const Model = MODELS[model]
  const group = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const time = useRef(0)
  const lean = useRef({ x: 0, y: 0 })
  const texture = useMemo(() => shadowTexture(), [])
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const dark = tone === 'dark'

  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    camera.lookAt(0, -0.05, 0)
    invalidate()
  }, [camera, invalidate, active, reduced, model])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    if (!reduced) time.current += dt
    const t = time.current
    const blend = reduced ? 1 : 1 - Math.exp(-5 * dt)
    lean.current.x += (pointer.x - lean.current.x) * blend
    lean.current.y += (pointer.y - lean.current.y) * blend
    const bob = reduced ? 0 : Math.sin(t * 1.1) * 0.07
    g.position.y = bob
    g.rotation.set(
      0.05 - lean.current.y * 0.2 + (reduced ? 0 : Math.sin(t * 0.7) * 0.03),
      -0.3 + lean.current.x * 0.45 + (reduced ? 0 : Math.sin(t * 0.5) * 0.09),
      0,
    )
    if (shadow.current) {
      const spread = 1 - bob * 0.8
      shadow.current.scale.set(spread, spread, 1)
      ;(shadow.current.material as MeshBasicMaterial).opacity =
        (dark ? 0.55 : 0.3) * (1 - bob * 1.6)
    }
    // Demand rendering: the loop only runs while the object is on screen and allowed to move.
    if (active && !reduced) state.invalidate()
  })

  return (
    <>
      <ambientLight intensity={dark ? 1.8 : 1.7} />
      <directionalLight position={[-3, 6, 5]} intensity={dark ? 3.2 : 2.9} color="#fff6e5" />
      <directionalLight
        position={[5, 3, -2]}
        intensity={dark ? 2.8 : 2.3}
        color={dark ? '#cceec4' : '#bfe6d8'}
      />
      <directionalLight
        position={[0, -2, 4]}
        intensity={0.7}
        color={dark ? '#9dccb6' : '#e2ecf3'}
      />
      <group ref={group}>
        <Model />
      </group>
      <mesh ref={shadow} position={[0, -1.34, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.9, 1.5]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={0.3} />
      </mesh>
    </>
  )
}

/**
 * One recruitment model on a transparent canvas: it floats, turns slowly and
 * leans towards the cursor. Loaded lazily by SceneObject, which also decides
 * whether the browser can show it at all.
 */
export default function ObjectStage(props: ObjectStageProps) {
  const [lost, setLost] = useState(false)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!canvas) return
    const onLost = (event: Event) => {
      event.preventDefault()
      setLost(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => canvas.removeEventListener('webglcontextlost', onLost)
  }, [canvas])
  if (lost) return null
  return (
    <Canvas
      className="scene-object__canvas"
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 1.15, 5.5], fov: 30 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power', stencil: false }}
      onCreated={({ gl }) => setCanvas(gl.domElement)}
      fallback={null}
    >
      <Scene {...props} />
    </Canvas>
  )
}
