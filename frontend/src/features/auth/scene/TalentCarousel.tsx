import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Color, type DirectionalLight, type Group, MathUtils, type MeshBasicMaterial } from 'three'
import { CAROUSEL_ITEMS, wrapCarouselIndex } from '@/features/auth/carousel-items'
import { CandidateModel, InterviewModel, OpportunityModel, ResumeModel } from './RecruitmentModels'

interface TalentCarouselProps {
  position: number
  playing: boolean
  dragging: boolean
  reduced: boolean
  active: boolean
}

const MODELS = [ResumeModel, CandidateModel, OpportunityModel, InterviewModel]
const STEP = (Math.PI * 2) / MODELS.length

function CarouselScene({ position, playing, dragging, reduced, active }: TalentCarouselProps) {
  const groups = useRef<(Group | null)[]>([])
  const rotation = useRef(position * STEP)
  const time = useRef(0)
  const rimLight = useRef<DirectionalLight>(null)
  const accents = useRef<(MeshBasicMaterial | null)[]>([])
  const theme = CAROUSEL_ITEMS[wrapCarouselIndex(position)].theme
  const palette = useMemo(
    () => ({
      background: new Color(theme.background),
      light: new Color(theme.accent),
      ring: new Color(theme.accent).multiplyScalar(0.36),
      outerRing: new Color(theme.accent).multiplyScalar(0.1),
      dot: new Color(theme.accent).multiplyScalar(0.7),
      minorDot: new Color(theme.accent).multiplyScalar(0.28),
    }),
    [theme],
  )
  const invalidate = useThree((state) => state.invalidate)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useEffect(() => {
    camera.position.set(0, 2.4, Math.max(7.4, 13.2 / (size.width / size.height)))
    camera.lookAt(0, 0.15, 0)
    invalidate()
  }, [camera, size.width, size.height, invalidate])

  useEffect(() => {
    invalidate()
  }, [position, playing, dragging, reduced, active, invalidate])

  useFrame((state, delta) => {
    if (!active) return
    const target = position * STEP
    const dt = Math.min(delta, 0.05)
    const blend = reduced ? 1 : 1 - Math.exp(-5 * dt)
    state.scene.fog?.color.lerp(palette.background, blend)
    rimLight.current?.color.lerp(palette.light, blend)
    accents.current.forEach((material, index) => {
      const color =
        index === 0
          ? palette.ring
          : index === 1
            ? palette.outerRing
            : (index - 2) % 4 === 0
              ? palette.dot
              : palette.minorDot
      material?.color.lerp(color, blend)
    })
    const fogColor = state.scene.fog?.color
    const tintPending =
      fogColor &&
      Math.max(
        Math.abs(fogColor.r - palette.background.r),
        Math.abs(fogColor.g - palette.background.g),
        Math.abs(fogColor.b - palette.background.b),
      ) > 0.0005
    rotation.current =
      reduced || dragging ? target : MathUtils.damp(rotation.current, target, 5, dt)
    if (playing && !reduced) time.current += dt
    groups.current.forEach((group, index) => {
      if (!group) return
      const angle = index * STEP - rotation.current
      const depth = Math.cos(angle)
      const front = (depth + 1) / 2
      group.position.set(
        Math.sin(angle) * 2.43,
        (1 - depth) * 0.55 + Math.sin(time.current * 0.85 + index) * 0.055,
        depth * 1.78,
      )
      group.rotation.set(
        0.015,
        Math.sin(angle) * -0.32,
        Math.sin(time.current * 0.5 + index) * 0.025,
      )
      group.scale.setScalar(0.78 + front * 0.4)
    })
    // Demand rendering stops entirely when idle; navigation still animates while autoplay is paused.
    if (!reduced && (playing || Math.abs(target - rotation.current) > 0.0005 || tintPending))
      state.invalidate()
  })

  return (
    <>
      <fog attach="fog" args={[CAROUSEL_ITEMS[0].theme.background, 8.5, 17]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[-3, 6, 5]} intensity={3.2} color="#fff6e5" />
      <directionalLight ref={rimLight} position={[5, 3, -2]} intensity={2.8} color="#cceec4" />
      <directionalLight position={[0, -2, 4]} intensity={0.7} color="#9dccb6" />
      {MODELS.map((Model, index) => (
        <group
          key={CAROUSEL_ITEMS[index].id}
          name={CAROUSEL_ITEMS[index].id}
          ref={(group) => {
            groups.current[index] = group
          }}
        >
          <Model />
        </group>
      ))}
      {[2.43, 2.68].map((radius, index) => (
        <mesh
          key={radius}
          position={[0, -1.25, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[1, 0.73, 1]}
        >
          <torusGeometry args={[radius, index === 0 ? 0.012 : 0.005, 8, 128]} />
          <meshBasicMaterial
            ref={(material) => {
              accents.current[index] = material
            }}
            color={index === 0 ? '#6a8557' : '#354b3b'}
          />
        </mesh>
      ))}
      {Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2
        return (
          <mesh key={index} position={[Math.sin(angle) * 2.43, -1.25, Math.cos(angle) * 1.78]}>
            <sphereGeometry args={[index % 4 === 0 ? 0.035 : 0.015, 10, 8]} />
            <meshBasicMaterial
              ref={(material) => {
                accents.current[index + 2] = material
              }}
              color={index % 4 === 0 ? '#c4db91' : '#5b7552'}
            />
          </mesh>
        )
      })}
    </>
  )
}

export default function TalentCarousel(props: TalentCarouselProps) {
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
      className="talent-carousel__canvas"
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 2.4, 7.4], fov: 34 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power', stencil: false }}
      onCreated={({ gl }) => setCanvas(gl.domElement)}
      fallback={null}
    >
      <CarouselScene {...props} />
    </Canvas>
  )
}
