import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PointerState } from '@/features/auth/scene/pointer'

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uActive;
  uniform float uAspect;

  float grid(vec2 p, float cells) {
    vec2 g = abs(fract(p * cells - 0.5) - 0.5) / fwidth(p * cells);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    vec3 lime = vec3(0.769, 0.839, 0.0);

    // Graphite base, a touch lighter towards the top-left.
    vec3 col = mix(vec3(0.028), vec3(0.052), smoothstep(-0.6, 0.7, vUv.y - vUv.x * 0.4));

    // Engineering grid: a coarse and a fine pass, fading away from the centre.
    float fade = smoothstep(1.25, 0.15, length(p));
    float g = grid(p, 6.0) * 0.06 + grid(p, 30.0) * 0.022;
    col += vec3(g) * (0.35 + 0.65 * fade);

    // The cursor light.
    vec2 c = vec2(uPointer.x * 0.5 * uAspect, uPointer.y * 0.5);
    float d = length(p - c);
    float glow = exp(-d * d * 3.2) * (0.06 + 0.11 * uActive);
    col += lime * glow;
    col += vec3(g) * exp(-d * d * 2.0) * (0.4 + 0.6 * uActive);

    // Two slow ambient glows so the frame never goes flat.
    vec2 a = vec2((-0.3 + 0.05 * sin(uTime * 0.11)) * uAspect, 0.16 + 0.07 * cos(uTime * 0.09));
    vec2 b = vec2((0.36 + 0.04 * cos(uTime * 0.07)) * uAspect, -0.3 + 0.05 * sin(uTime * 0.13));
    col += lime * exp(-pow(length(p - a), 2.0) * 1.4) * 0.085;
    col += lime * exp(-pow(length(p - b), 2.0) * 2.2) * 0.05;

    // Vignette.
    col *= 1.0 - 0.5 * smoothstep(0.5, 1.4, length(p));
    gl_FragColor = vec4(col, 1.0);
  }
`

const DEPTH = -9

/** Full-frame plane behind everything: graphite, engineering grid, ambient glows and the cursor light. */
export function Backdrop({ pointer }: { pointer: PointerState }) {
  const camera = useThree((state) => state.camera)
  const viewport = useThree((state) => state.viewport)
  const size = useMemo(() => {
    const at = viewport.getCurrentViewport(camera, [0, 0, DEPTH])
    // Margin for the camera parallax, which shifts the frame by up to a unit.
    return { width: at.width * 1.25, height: at.height * 1.3, aspect: at.width / at.height }
  }, [camera, viewport])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uPointer: { value: new THREE.Vector2() },
          uActive: { value: 0 },
          uAspect: { value: 1 },
        },
        depthWrite: false,
      }),
    [],
  )
  const ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uPointer.value.set(pointer.x, pointer.y)
    material.uniforms.uActive.value = pointer.active
    material.uniforms.uAspect.value = size.aspect
  })

  return (
    <mesh ref={ref} position={[0, 0, DEPTH]} material={material} renderOrder={-10}>
      <planeGeometry args={[size.width, size.height]} />
    </mesh>
  )
}
