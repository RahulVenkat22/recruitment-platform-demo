import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PointerState } from '@/features/auth/scene/pointer'
import { LIME, type SceneBus, type Stage, WHITE } from '@/features/auth/scene/stage'
import { makeGlowTexture } from '@/features/auth/scene/textures'

const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uPulse;
  void main() {
    vec3 lime = vec3(0.769, 0.839, 0.0);
    float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
    // Latitude waves sweeping over the surface, warped by longitude.
    float wave = 0.5 + 0.5 * sin(vPos.y * 15.0 - uTime * 2.4 + sin(vPos.x * 5.0 + uTime * 0.7) * 0.9);
    float bands = smoothstep(0.62, 0.96, wave) * 0.3;
    // Rising scan line.
    float scan = smoothstep(0.08, 0.0, abs(fract(vPos.y * 0.5 - uTime * 0.25) - 0.5)) * 0.35;
    vec3 col = vec3(0.025, 0.03, 0.015);
    col += lime * (bands + scan + fresnel * 1.25 + uPulse * 0.6);
    col += vec3(1.0) * fresnel * 0.35 * uPulse;
    gl_FragColor = vec4(col, 0.92 + 0.08 * fresnel);
  }
`

interface Props {
  stage: Stage
  pointer: PointerState
  bus: SceneBus
}

function shellPoints(count: number, inner: number, outer: number) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const r = inner + Math.random() * (outer - inner)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

/**
 * The AI matching engine: a shader sphere breathing with lime waves inside a
 * rotating wireframe, three gyroscope rings that tip towards the cursor, an
 * orbiting halo of points, and a shockwave ring on every absorbed résumé.
 */
export function MatchCore({ stage, pointer, bus }: Props) {
  const group = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Mesh>(null)
  const wire = useRef<THREE.Mesh>(null)
  const rings = useRef<THREE.Group>(null)
  const ring1 = useRef<THREE.Mesh>(null)
  const ring2 = useRef<THREE.Mesh>(null)
  const ring3 = useRef<THREE.Mesh>(null)
  const haloA = useRef<THREE.Points>(null)
  const haloB = useRef<THREE.Points>(null)
  const shock = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Sprite>(null)

  const coreMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
        transparent: true,
      }),
    [],
  )
  const glowTexture = useMemo(() => makeGlowTexture(256), [])
  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: LIME,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [glowTexture],
  )
  const wireMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: LIME,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    [],
  )
  const ringMaterials = useMemo(
    () =>
      [0.55, 0.38, 0.26].map(
        (opacity, index) =>
          new THREE.MeshBasicMaterial({
            color: index === 1 ? WHITE : LIME,
            transparent: true,
            opacity,
            depthWrite: false,
          }),
      ),
    [],
  )
  const haloMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: LIME,
        size: 0.055,
        map: glowTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    [glowTexture],
  )
  const haloGeometryA = useMemo(() => shellPoints(220, 1.45, 2.4), [])
  const haloGeometryB = useMemo(() => shellPoints(140, 2.5, 3.3), [])
  const shockMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: LIME,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  const s = stage.s

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const time = state.clock.elapsedTime
    const g = group.current
    if (!g) return

    bus.pulse = Math.max(0, bus.pulse - dt * 1.4)
    const dx = pointer.world.x - stage.coreX
    const dy = pointer.world.y - stage.coreY
    const distance = Math.hypot(dx, dy)
    const near = THREE.MathUtils.smoothstep(4.5 - distance, 0, 4.5) * pointer.active
    const energy = bus.pulse + near * 0.35

    coreMaterial.uniforms.uTime.value = time
    coreMaterial.uniforms.uPulse.value = energy

    // The whole engine leans a touch towards the cursor.
    g.position.x = THREE.MathUtils.damp(g.position.x, stage.coreX + dx * 0.02 * pointer.active, 3, dt)
    g.position.y = THREE.MathUtils.damp(g.position.y, stage.coreY + dy * 0.02 * pointer.active, 3, dt)

    if (inner.current) {
      const breathe = 1 + Math.sin(time * 1.4) * 0.025 + bus.pulse * 0.1 + near * 0.05
      inner.current.scale.setScalar(s * breathe)
      inner.current.rotation.y = time * 0.15
    }
    if (wire.current) {
      wire.current.rotation.y += dt * (0.28 + bus.pulse * 1.2)
      wire.current.rotation.x = Math.sin(time * 0.3) * 0.35 + pointer.y * 0.3
      const wireScale = s * (1 + Math.sin(time * 1.1 + 1) * 0.03 + bus.pulse * 0.06)
      wire.current.scale.setScalar(wireScale)
      wireMaterial.opacity = 0.26 + near * 0.25 + bus.pulse * 0.4
    }
    if (rings.current) {
      rings.current.rotation.x = THREE.MathUtils.damp(rings.current.rotation.x, -pointer.y * 0.9, 3, dt)
      rings.current.rotation.y = THREE.MathUtils.damp(rings.current.rotation.y, pointer.x * 0.9, 3, dt)
    }
    const spin = 1 + bus.pulse * 2 + near * 0.5
    if (ring1.current) ring1.current.rotation.z += dt * 0.35 * spin
    if (ring2.current) {
      ring2.current.rotation.x += dt * 0.22 * spin
      ring2.current.rotation.y = time * 0.15
    }
    if (ring3.current) {
      ring3.current.rotation.y += dt * 0.18 * spin
      ring3.current.rotation.z = Math.sin(time * 0.4) * 0.5
    }
    if (haloA.current) {
      haloA.current.rotation.y += dt * 0.12 * spin
      haloA.current.rotation.x = Math.sin(time * 0.2) * 0.3
    }
    if (haloB.current) {
      haloB.current.rotation.y -= dt * 0.07 * spin
      haloB.current.rotation.z = time * 0.05
    }
    if (glow.current) {
      const glowScale = s * (6.4 + bus.pulse * 2.4 + near * 1.2)
      glow.current.scale.set(glowScale, glowScale, 1)
      glowMaterial.opacity = 0.28 + bus.pulse * 0.45 + near * 0.15
    }
    if (shock.current) {
      const age = time - bus.lastAbsorb
      const life = THREE.MathUtils.clamp(age / 1.1, 0, 1)
      const shockScale = s * (1.5 + life * 2.6)
      shock.current.scale.set(shockScale, shockScale, 1)
      shockMaterial.opacity = (1 - life) * (1 - life) * 0.5
      shock.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={group} position={[stage.coreX, stage.coreY, 0]}>
      <sprite ref={glow} material={glowMaterial} renderOrder={1} />
      <points ref={haloB} geometry={haloGeometryB} material={haloMaterial} scale={s} />
      <points ref={haloA} geometry={haloGeometryA} material={haloMaterial} scale={s} />
      <mesh ref={inner} material={coreMaterial} renderOrder={5}>
        <sphereGeometry args={[0.95, 64, 64]} />
      </mesh>
      <mesh ref={wire} material={wireMaterial} renderOrder={6}>
        <icosahedronGeometry args={[1.32, 1]} />
      </mesh>
      <group ref={rings} scale={s}>
        <mesh ref={ring1} material={ringMaterials[0]} rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[1.75, 0.012, 8, 128]} />
        </mesh>
        <mesh ref={ring2} material={ringMaterials[1]} rotation={[0.3, Math.PI / 3, 0]}>
          <torusGeometry args={[2.1, 0.01, 8, 128]} />
        </mesh>
        <mesh ref={ring3} material={ringMaterials[2]} rotation={[Math.PI / 1.6, 0.4, 0]}>
          <torusGeometry args={[2.55, 0.009, 8, 160]} />
        </mesh>
      </group>
      <mesh ref={shock} material={shockMaterial} renderOrder={7}>
        <ringGeometry args={[0.96, 1, 96]} />
      </mesh>
    </group>
  )
}
