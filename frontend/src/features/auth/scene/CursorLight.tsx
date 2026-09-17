import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PointerState } from '@/features/auth/scene/pointer'
import { LIME } from '@/features/auth/scene/stage'
import { makeGlowTexture } from '@/features/auth/scene/textures'

/** A soft lime lamp and a thin ring riding on the cursor; the ring swells with cursor speed. */
export function CursorLight({ pointer }: { pointer: PointerState }) {
  const glow = useRef<THREE.Sprite>(null)
  const ring = useRef<THREE.Mesh>(null)
  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: makeGlowTexture(128),
        color: LIME,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: LIME,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const sprite = glow.current
    const mesh = ring.current
    if (!sprite || !mesh) return
    sprite.position.copy(pointer.world)
    mesh.position.copy(pointer.world)
    const active = pointer.active
    glowMaterial.opacity = THREE.MathUtils.damp(glowMaterial.opacity, 0.2 * active, 4, dt)
    const swell = 1 + Math.min(pointer.speed, 6) * 0.12
    const glowScale = 3.2 * swell
    sprite.scale.set(glowScale, glowScale, 1)
    ringMaterial.opacity = THREE.MathUtils.damp(ringMaterial.opacity, 0.55 * active, 4, dt)
    const ringScale = THREE.MathUtils.damp(mesh.scale.x, 0.9 * swell, 6, dt)
    mesh.scale.set(ringScale, ringScale, 1)
  })

  return (
    <>
      <sprite ref={glow} material={glowMaterial} renderOrder={20} />
      <mesh ref={ring} material={ringMaterial} renderOrder={21}>
        <ringGeometry args={[0.2, 0.215, 64]} />
      </mesh>
    </>
  )
}
