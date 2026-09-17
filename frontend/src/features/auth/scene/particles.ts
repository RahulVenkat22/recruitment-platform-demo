import * as THREE from 'three'

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uPixelRatio;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (150.0 / -mv.z);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform sampler2D uMap;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

/** Additive point cloud with per-particle size and alpha, positions written by the caller each frame. */
export interface ParticlePool {
  points: THREE.Points
  positions: Float32Array
  sizes: Float32Array
  alphas: Float32Array
  /** Marks every attribute dirty; call after writing the arrays. */
  commit: () => void
}

export function createParticlePool(
  count: number,
  color: THREE.Color,
  map: THREE.Texture,
  pixelRatio: number,
): ParticlePool {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const alphas = new Float32Array(count)
  const position = new THREE.BufferAttribute(positions, 3)
  const size = new THREE.BufferAttribute(sizes, 1)
  const alpha = new THREE.BufferAttribute(alphas, 1)
  position.setUsage(THREE.DynamicDrawUsage)
  size.setUsage(THREE.DynamicDrawUsage)
  alpha.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('aSize', size)
  geometry.setAttribute('aAlpha', alpha)
  // Never culled: the particles roam the whole stage.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uMap: { value: map },
      uPixelRatio: { value: pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return {
    points,
    positions,
    sizes,
    alphas,
    commit: () => {
      position.needsUpdate = true
      size.needsUpdate = true
      alpha.needsUpdate = true
    },
  }
}

/** Ease used for movement along curves: slow in, quick through the middle, slow out. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
