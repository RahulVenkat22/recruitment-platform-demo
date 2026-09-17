import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RESUME_VARIANTS } from '@/features/auth/scene/graph-data'
import { createParticlePool, smoothstep } from '@/features/auth/scene/particles'
import type { PointerState } from '@/features/auth/scene/pointer'
import { LIME, type SceneBus, type Stage } from '@/features/auth/scene/stage'
import { makeGlowTexture, makeResumeTexture } from '@/features/auth/scene/textures'

const CARD_W = 1.0
const CARD_H = 1.3125
const TRAIL = 10

interface Card {
  t: number
  speed: number
  curve: THREE.QuadraticBezierCurve3
  phase: number
  hover: number
  offset: THREE.Vector3
  absorbed: boolean
  material: THREE.MeshBasicMaterial
  glow: THREE.SpriteMaterial
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function makeCurve(stage: Stage): THREE.QuadraticBezierCurve3 {
  // Keep to the band between the pitch (top-left) and the legend (bottom-left).
  const top = Math.min(stage.coreY + stage.vh * 0.12, stage.pitchBottom - 0.9)
  const y0 = rand(stage.coreY - stage.vh * 0.24, top)
  const z0 = rand(-2.2, 1.4)
  const start = new THREE.Vector3(stage.spawnX, y0, z0)
  const end = new THREE.Vector3(stage.coreX - 0.35 * stage.s, stage.coreY + rand(-0.2, 0.2), 0)
  const control = new THREE.Vector3(
    THREE.MathUtils.lerp(start.x, end.x, rand(0.35, 0.6)),
    stage.coreY + (y0 - stage.coreY) * rand(1.1, 1.5),
    z0 * 0.4,
  )
  return new THREE.QuadraticBezierCurve3(start, control, end)
}

interface Props {
  stage: Stage
  pointer: PointerState
  bus: SceneBus
  roleCount: number
}

/**
 * Résumé cards drift in from the left along their own curves, lean towards
 * the cursor, shy away when it gets close, and shrink into the core, each
 * leaving a trail of lime particles. Absorbing one pulses the core and posts a
 * match for the graph to light up.
 */
export function ResumeStream({ stage, pointer, bus, roleCount }: Props) {
  const pixelRatio = useThree((state) => state.viewport.dpr)
  const count = stage.compact ? 7 : 13
  const group = useRef<THREE.Group>(null)

  const textures = useMemo(() => RESUME_VARIANTS.map(makeResumeTexture), [])
  const glowTexture = useMemo(() => makeGlowTexture(64), [])
  const cards = useMemo<Card[]>(
    () =>
      Array.from({ length: count }, (_, index) => ({
        // Staggered along the path so the first frame is already populated.
        t: (index / count + Math.random() * 0.05) % 0.85,
        speed: rand(0.075, 0.115),
        curve: makeCurve(stage),
        phase: Math.random() * Math.PI * 2,
        hover: 0,
        offset: new THREE.Vector3(),
        absorbed: false,
        material: new THREE.MeshBasicMaterial({
          map: textures[index % textures.length],
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
        glow: new THREE.SpriteMaterial({
          map: glowTexture,
          color: LIME,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      })),
    [count, stage, textures, glowTexture],
  )
  const trail = useMemo(
    () => createParticlePool(count * TRAIL, LIME, glowTexture, pixelRatio),
    [count, glowTexture, pixelRatio],
  )

  useEffect(() => {
    return () => {
      trail.points.geometry.dispose()
      ;(trail.points.material as THREE.Material).dispose()
    }
  }, [trail])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])

  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const glows = useRef<(THREE.Sprite | null)[]>([])
  const scratch = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3() }), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const time = state.clock.elapsedTime
    const { p, q } = scratch
    const cursor = pointer.world

    cards.forEach((card, index) => {
      const mesh = meshes.current[index]
      const glow = glows.current[index]
      if (!mesh || !glow) return

      card.t += dt * card.speed
      if (card.t >= 1) {
        card.t = 0
        card.curve = makeCurve(stage)
        card.absorbed = false
        card.offset.set(0, 0, 0)
      }
      if (!card.absorbed && card.t > 0.88) {
        card.absorbed = true
        bus.pulse = 1
        bus.lastAbsorb = time
        bus.matches.push(Math.floor(Math.random() * roleCount))
      }

      card.curve.getPoint(card.t, p)
      const fadeIn = smoothstep(0, 0.09, card.t)
      const shrink = 1 - smoothstep(0.86, 1, card.t)
      const dx = p.x - cursor.x
      const dy = p.y - cursor.y
      const distance = Math.hypot(dx, dy)
      const hoverTarget = distance < 2.6 ? (1 - distance / 2.6) * pointer.active : 0
      card.hover = THREE.MathUtils.damp(card.hover, hoverTarget, 6, dt)

      // Shy away from the cursor, then settle back onto the path.
      const push = card.hover * 0.9 * shrink
      const len = Math.max(distance, 0.001)
      q.set((dx / len) * push, (dy / len) * push, card.hover * 0.6)
      card.offset.x = THREE.MathUtils.damp(card.offset.x, q.x, 4, dt)
      card.offset.y = THREE.MathUtils.damp(card.offset.y, q.y, 4, dt)
      card.offset.z = THREE.MathUtils.damp(card.offset.z, q.z, 4, dt)

      const bob = Math.sin(time * 0.9 + card.phase) * 0.08
      mesh.position.set(p.x + card.offset.x, p.y + card.offset.y + bob, p.z + card.offset.z)
      const scale = stage.s * fadeIn * shrink * (1 + 0.14 * card.hover)
      mesh.scale.set(scale, scale, 1)
      mesh.rotation.set(
        Math.cos(time * 0.55 + card.phase) * 0.1 - pointer.y * 0.2,
        Math.sin(time * 0.7 + card.phase) * 0.28 + pointer.x * 0.28 + card.hover * dx * 0.05,
        Math.sin(time * 0.4 + card.phase) * 0.05,
      )
      card.material.opacity = fadeIn * (1 - smoothstep(0.9, 1, card.t))

      glow.position.copy(mesh.position)
      glow.position.z -= 0.05
      const glowScale = scale * 2.6 * (1 + card.hover * 0.4)
      glow.scale.set(glowScale, glowScale * 1.2, 1)
      card.glow.opacity =
        (0.1 + 0.45 * card.hover + smoothstep(0.78, 0.92, card.t) * 0.5) * fadeIn * shrink

      // Trail behind the card along the curve.
      for (let k = 0; k < TRAIL; k += 1) {
        const i = index * TRAIL + k
        const back = card.t - (k + 1) * 0.016
        const fall = 1 - k / TRAIL
        if (back <= 0) {
          trail.alphas[i] = 0
          continue
        }
        card.curve.getPoint(back, q)
        trail.positions[i * 3] = q.x + card.offset.x * fall
        trail.positions[i * 3 + 1] = q.y + card.offset.y * fall + bob * fall
        trail.positions[i * 3 + 2] = q.z + card.offset.z * fall
        trail.sizes[i] = (2.5 + 7 * fall) * stage.s
        trail.alphas[i] = fall * fall * 0.6 * fadeIn * shrink
      }
    })
    trail.commit()
  })

  return (
    <group ref={group}>
      {cards.map((card, index) => (
        <group key={index}>
          <mesh
            ref={(node) => {
              meshes.current[index] = node
            }}
            material={card.material}
            renderOrder={4}
          >
            <planeGeometry args={[CARD_W, CARD_H]} />
          </mesh>
          <sprite
            ref={(node) => {
              glows.current[index] = node
            }}
            material={card.glow}
            renderOrder={3}
          />
        </group>
      ))}
      <primitive object={trail.points} renderOrder={2} />
    </group>
  )
}
