import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RoleSpec } from '@/features/auth/scene/graph-data'
import { createParticlePool } from '@/features/auth/scene/particles'
import type { PointerState } from '@/features/auth/scene/pointer'
import { LIME, type SceneBus, type Stage, WHITE } from '@/features/auth/scene/stage'
import { makeGlowTexture, makeLabelTexture } from '@/features/auth/scene/textures'

interface GraphNode {
  kind: 'role' | 'skill'
  label: string
  base: THREE.Vector3
  pos: THREE.Vector3
  offset: THREE.Vector3
  heat: number
  hover: number
  phase: number
  aspect: number
  labelMaterial: THREE.SpriteMaterial
  bodyMaterial: THREE.MeshBasicMaterial
  ringMaterial: THREE.MeshBasicMaterial | null
  glowMaterial: THREE.SpriteMaterial | null
}

interface Edge {
  /** -1 is the core. */
  a: number
  b: number
  intensity: number
}

interface Signal {
  edge: number
  t: number
  speed: number
  active: boolean
}

const AMBIENT_PER_EDGE = 5
const SIGNAL_POOL = 40
const DEG = Math.PI / 180

interface Graph {
  nodes: GraphNode[]
  edges: Edge[]
  roleIndices: number[]
  roleEdges: number[][]
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function buildGraph(stage: Stage, roles: RoleSpec[], glowTexture: THREE.Texture): Graph {
  const formEdge = stage.landscape ? -stage.vw / 2 + stage.vw * 0.6 : stage.vw / 2
  const span = Math.max(formEdge - stage.coreX, 2.8)
  const roleRadius = Math.min(span * 0.68, stage.vh * 0.36) * stage.s
  const skillRadius = Math.min(span * 0.97, stage.vh * 0.47) * stage.s

  const nodes: GraphNode[] = []
  const edges: Edge[] = []
  const roleIndices: number[] = []
  const roleEdges: number[][] = []

  function makeNode(kind: 'role' | 'skill', label: string, base: THREE.Vector3): number {
    const { texture, aspect } = makeLabelTexture(label, kind)
    nodes.push({
      kind,
      label,
      base,
      pos: base.clone(),
      offset: new THREE.Vector3(),
      heat: 0,
      hover: 0,
      phase: Math.random() * Math.PI * 2,
      aspect,
      labelMaterial: new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: kind === 'role' ? 0.85 : 0.5,
        depthWrite: false,
        depthTest: false,
      }),
      bodyMaterial: new THREE.MeshBasicMaterial({
        color: kind === 'role' ? LIME : WHITE,
        transparent: true,
        opacity: kind === 'role' ? 1 : 0.85,
      }),
      ringMaterial:
        kind === 'role'
          ? new THREE.MeshBasicMaterial({
              color: LIME,
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          : null,
      glowMaterial:
        kind === 'role'
          ? new THREE.SpriteMaterial({
              map: glowTexture,
              color: LIME,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          : null,
    })
    return nodes.length - 1
  }

  // Roles on an arc to the right of the core, fanning further up than down: the
  // pitch sits top-left and the legend bottom-left, so the free space is upper-right.
  const lower = stage.landscape ? -48 : -60
  let upper = stage.landscape ? 66 : 60
  // Bring the top of the fan down until nothing left of the page copy rises into it.
  const clear = (radius: number, degrees: number) => {
    const x = stage.coreX + Math.cos(degrees * DEG) * radius
    const y = stage.coreY + Math.sin(degrees * DEG) * radius
    return x >= stage.pitchRight || y <= stage.pitchBottom
  }
  while (upper > 30 && !(clear(roleRadius, upper) && clear(skillRadius, upper + 18))) {
    upper -= 2
  }
  const roleAngles = roles.map((_, index) =>
    roles.length === 1 ? 0 : (lower + (index / (roles.length - 1)) * (upper - lower)) * DEG,
  )
  const roleCentre = ((lower + upper) / 2) * DEG
  roles.forEach((role, index) => {
    const angle = roleAngles[index]
    const base = new THREE.Vector3(
      stage.coreX + Math.cos(angle) * roleRadius,
      stage.coreY + Math.sin(angle) * roleRadius,
      Math.sin(angle * 2.3) * 0.7,
    )
    const node = makeNode('role', role.label, base)
    roleIndices.push(node)
    edges.push({ a: -1, b: node, intensity: 0 })
  })

  // Skills further out, each near the roles that ask for it; shared skills sit between them.
  // Only as many as the arc has room for: every role's first skill, then the rest in turn.
  const arcLower = (lower - 12) * DEG
  const arcUpper = (upper + 18) * DEG
  const arcPx = skillRadius * (arcUpper - arcLower) * (stage.heightPx / stage.vh)
  const budget = Math.max(roles.length, Math.floor(arcPx / 74))
  const chosen = new Set<string>()
  for (let rank = 0; chosen.size < budget; rank += 1) {
    let added = false
    for (const role of roles) {
      const skill = role.skills[rank]
      if (skill && !chosen.has(skill)) {
        chosen.add(skill)
        added = true
        if (chosen.size >= budget) break
      }
    }
    if (!added) break
  }
  const skillAngles = new Map<string, number[]>()
  roles.forEach((role, roleIndex) => {
    role.skills.forEach((skill, skillIndex) => {
      if (!chosen.has(skill)) return
      const local = (skillIndex - (role.skills.length - 1) / 2) * 10 * DEG
      const list = skillAngles.get(skill) ?? []
      list.push(roleAngles[roleIndex] + local)
      skillAngles.set(skill, list)
    })
  })
  const placed = [...skillAngles.entries()].map(([label, angles]) => ({
    label,
    angle: angles.reduce((sum, value) => sum + value, 0) / angles.length,
  }))
  placed.sort((x, y) => x.angle - y.angle)
  // Spread neighbours apart so their labels never collide, sized so the whole fan
  // fits the arc, then centre it on the roles.
  const gap = Math.min(10.5 * DEG, (arcUpper - arcLower) / Math.max(placed.length - 1, 1))
  for (let i = 1; i < placed.length; i += 1) {
    const min = placed[i - 1].angle + gap
    if (placed[i].angle < min) placed[i].angle = min
  }
  const centre = (placed[0].angle + placed[placed.length - 1].angle) / 2
  const shift = THREE.MathUtils.clamp(
    roleCentre - centre,
    arcLower - placed[0].angle,
    arcUpper - placed[placed.length - 1].angle,
  )
  placed.forEach((skill) => {
    skill.angle += shift
  })
  const skillIndex = new Map<string, number>()
  placed.forEach((skill, index) => {
    const angle = THREE.MathUtils.clamp(skill.angle, arcLower, arcUpper)
    const radius = skillRadius * (index % 2 === 0 ? 1 : 0.86) * rand(0.98, 1.02)
    const base = new THREE.Vector3(
      stage.coreX + Math.cos(angle) * radius,
      stage.coreY + Math.sin(angle) * radius,
      rand(-1.4, 1.0),
    )
    skillIndex.set(skill.label, makeNode('skill', skill.label, base))
  })
  roles.forEach((role, roleIndex) => {
    const own: number[] = []
    role.skills.forEach((skill) => {
      const target = skillIndex.get(skill)
      if (target === undefined) return
      edges.push({ a: roleIndices[roleIndex], b: target, intensity: 0 })
      own.push(edges.length - 1)
    })
    roleEdges.push(own)
  })

  return { nodes, edges, roleIndices, roleEdges }
}

interface Props {
  stage: Stage
  pointer: PointerState
  bus: SceneBus
  roles: RoleSpec[]
}

/**
 * The right-hand constellation: role nodes (lime, ringed, labelled pills) and
 * the skills they need (white dots), wired to the core. Nodes float, retreat
 * from the cursor and glow when it comes near. Each absorbed résumé sends a
 * signal down a role's wire, lighting the role and then its skills.
 */
export function TalentGraph({ stage, pointer, bus, roles }: Props) {
  const pixelRatio = useThree((state) => state.viewport.dpr)
  const glowTexture = useMemo(() => makeGlowTexture(128), [])
  const graph = useMemo(() => buildGraph(stage, roles, glowTexture), [stage, roles, glowTexture])
  const { nodes, edges } = graph

  const lines = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(edges.length * 6)
    const colors = new Float32Array(edges.length * 6)
    const position = new THREE.BufferAttribute(positions, 3)
    const color = new THREE.BufferAttribute(colors, 3)
    position.setUsage(THREE.DynamicDrawUsage)
    color.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setAttribute('color', color)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const object = new THREE.LineSegments(geometry, material)
    object.frustumCulled = false
    return { object, positions, colors, position, color }
  }, [edges])

  const particles = useMemo(
    () =>
      createParticlePool(
        edges.length * AMBIENT_PER_EDGE + SIGNAL_POOL,
        LIME,
        glowTexture,
        pixelRatio,
      ),
    [edges, glowTexture, pixelRatio],
  )
  const ambient = useMemo(
    () =>
      edges.map(() =>
        Array.from({ length: AMBIENT_PER_EDGE }, () => ({
          offset: Math.random(),
          speed: rand(0.12, 0.22),
        })),
      ),
    [edges],
  )
  const signals = useMemo<Signal[]>(
    () => Array.from({ length: SIGNAL_POOL }, () => ({ edge: 0, t: 0, speed: 1, active: false })),
    [],
  )

  useEffect(() => {
    return () => {
      lines.object.geometry.dispose()
      ;(lines.object.material as THREE.Material).dispose()
      particles.points.geometry.dispose()
      ;(particles.points.material as THREE.Material).dispose()
      nodes.forEach((node) => {
        node.labelMaterial.map?.dispose()
        node.labelMaterial.dispose()
        node.bodyMaterial.dispose()
        node.ringMaterial?.dispose()
        node.glowMaterial?.dispose()
      })
    }
  }, [lines, particles, nodes])

  const bodies = useRef<(THREE.Mesh | null)[]>([])
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const glows = useRef<(THREE.Sprite | null)[]>([])
  const labels = useRef<(THREE.Sprite | null)[]>([])
  const core = useMemo(() => new THREE.Vector3(stage.coreX, stage.coreY, 0), [stage])

  function fire(edge: number, speed: number) {
    const free = signals.find((signal) => !signal.active)
    if (!free) return
    free.active = true
    free.edge = edge
    free.t = 0
    free.speed = speed
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const time = state.clock.elapsedTime
    const cursor = pointer.world
    const s = stage.s

    // New matches from the résumé stream travel core → role.
    while (bus.matches.length) {
      const role = bus.matches.shift()!
      fire(role % graph.roleIndices.length, rand(1.0, 1.3))
    }

    // Nodes: float, retreat from the cursor, cool down.
    nodes.forEach((node, index) => {
      const fx = node.base.x + Math.sin(time * 0.55 + node.phase) * 0.14
      const fy = node.base.y + Math.cos(time * 0.45 + node.phase * 1.3) * 0.12
      const fz = node.base.z + Math.sin(time * 0.35 + node.phase) * 0.18
      const dx = fx - cursor.x
      const dy = fy - cursor.y
      const distance = Math.hypot(dx, dy)
      const reach = node.kind === 'role' ? 1.9 : 1.4
      const hoverTarget =
        distance < reach ? Math.pow(1 - distance / reach, 1.5) * pointer.active : 0
      node.hover = THREE.MathUtils.damp(node.hover, hoverTarget, 7, dt)
      node.heat = Math.max(0, node.heat - dt * 1.1)
      const pushRange = 3.2
      const push =
        distance < pushRange
          ? Math.pow(1 - distance / pushRange, 2) * 0.85 * pointer.active
          : 0
      const len = Math.max(distance, 0.001)
      node.offset.x = THREE.MathUtils.damp(node.offset.x, (dx / len) * push, 4, dt)
      node.offset.y = THREE.MathUtils.damp(node.offset.y, (dy / len) * push, 4, dt)
      node.offset.z = THREE.MathUtils.damp(node.offset.z, node.hover * 0.8, 4, dt)
      node.pos.set(fx + node.offset.x, fy + node.offset.y, fz + node.offset.z)

      const energy = Math.max(node.hover, node.heat)
      const body = bodies.current[index]
      if (body) {
        body.position.copy(node.pos)
        const base = node.kind === 'role' ? 0.16 : 0.085
        body.scale.setScalar(s * base * (1 + 0.5 * node.hover + 0.7 * node.heat))
        node.bodyMaterial.opacity = node.kind === 'role' ? 1 : 0.75 + 0.25 * energy
      }
      const ring = rings.current[index]
      if (ring && node.ringMaterial) {
        ring.position.copy(node.pos)
        ring.scale.setScalar(s * (1 + 0.35 * node.heat + 0.2 * node.hover))
        ring.rotation.z = time * 0.6 + node.phase
        ring.lookAt(state.camera.position)
        node.ringMaterial.opacity = 0.45 + 0.55 * energy
      }
      const glow = glows.current[index]
      if (glow && node.glowMaterial) {
        glow.position.copy(node.pos)
        const size = s * (1.6 + 1.4 * energy)
        glow.scale.set(size, size, 1)
        node.glowMaterial.opacity = 0.16 + 0.6 * energy
      }
      const label = labels.current[index]
      if (label) {
        const height = s * (node.kind === 'role' ? 0.36 : 0.27) * (1 + 0.12 * node.hover)
        label.scale.set(height * node.aspect, height, 1)
        if (node.kind === 'role') {
          label.position.set(node.pos.x, node.pos.y - s * 0.3 - 0.06 * node.hover, node.pos.z + 0.05)
        } else {
          label.position.set(node.pos.x + s * 0.16, node.pos.y, node.pos.z + 0.05)
        }
        node.labelMaterial.opacity =
          node.kind === 'role' ? 0.8 + 0.2 * energy : 0.42 + 0.58 * energy
      }
    })

    // Signals move along their wires and light what they reach.
    edges.forEach((edge) => {
      edge.intensity = 0
    })
    signals.forEach((signal) => {
      if (!signal.active) return
      signal.t += dt * signal.speed
      const edge = edges[signal.edge]
      edge.intensity = Math.max(edge.intensity, 1)
      if (signal.t >= 1) {
        signal.active = false
        const target = nodes[edge.b]
        target.heat = 1
        if (target.kind === 'role') {
          const roleSlot = graph.roleIndices.indexOf(edge.b)
          graph.roleEdges[roleSlot]?.forEach((child) => fire(child, rand(1.1, 1.7)))
        }
      }
    })

    // Wires: positions follow the nodes, brightness follows hover, heat and signals.
    edges.forEach((edge, index) => {
      const from = edge.a < 0 ? core : nodes[edge.a].pos
      const to = nodes[edge.b].pos
      const i = index * 6
      lines.positions[i] = from.x
      lines.positions[i + 1] = from.y
      lines.positions[i + 2] = from.z
      lines.positions[i + 3] = to.x
      lines.positions[i + 4] = to.y
      lines.positions[i + 5] = to.z
      const aNode = edge.a < 0 ? null : nodes[edge.a]
      const bNode = nodes[edge.b]
      const life = Math.max(
        aNode ? Math.max(aNode.hover, aNode.heat * 0.7) : 0,
        bNode.hover,
        bNode.heat,
        edge.intensity * 0.8,
      )
      const base = edge.a < 0 ? 0.2 : 0.14
      const start = base + 0.85 * life
      const end = base * 0.7 + 0.85 * life
      lines.colors[i] = LIME.r * start
      lines.colors[i + 1] = LIME.g * start
      lines.colors[i + 2] = LIME.b * start
      lines.colors[i + 3] = LIME.r * end
      lines.colors[i + 4] = LIME.g * end
      lines.colors[i + 5] = LIME.b * end
    })
    lines.position.needsUpdate = true
    lines.color.needsUpdate = true

    // Ambient particles drifting along every wire, then the signal sparks.
    let slot = 0
    edges.forEach((edge, index) => {
      const from = edge.a < 0 ? core : nodes[edge.a].pos
      const to = nodes[edge.b].pos
      const aNode = edge.a < 0 ? null : nodes[edge.a]
      const bNode = nodes[edge.b]
      const life = Math.max(aNode?.hover ?? 0, bNode.hover, bNode.heat)
      ambient[index].forEach((particle) => {
        const t = (time * particle.speed + particle.offset) % 1
        particles.positions[slot * 3] = THREE.MathUtils.lerp(from.x, to.x, t)
        particles.positions[slot * 3 + 1] = THREE.MathUtils.lerp(from.y, to.y, t)
        particles.positions[slot * 3 + 2] = THREE.MathUtils.lerp(from.z, to.z, t)
        particles.sizes[slot] = (edge.a < 0 ? 4 : 3) * s
        particles.alphas[slot] = Math.sin(t * Math.PI) * (0.22 + 0.5 * life)
        slot += 1
      })
    })
    signals.forEach((signal) => {
      if (signal.active) {
        const edge = edges[signal.edge]
        const from = edge.a < 0 ? core : nodes[edge.a].pos
        const to = nodes[edge.b].pos
        const t = THREE.MathUtils.smoothstep(signal.t, 0, 1)
        particles.positions[slot * 3] = THREE.MathUtils.lerp(from.x, to.x, t)
        particles.positions[slot * 3 + 1] = THREE.MathUtils.lerp(from.y, to.y, t)
        particles.positions[slot * 3 + 2] = THREE.MathUtils.lerp(from.z, to.z, t)
        particles.sizes[slot] = 16 * s
        particles.alphas[slot] = 0.95
      } else {
        particles.alphas[slot] = 0
      }
      slot += 1
    })
    particles.commit()
  })

  return (
    <group>
      <primitive object={lines.object} renderOrder={1} />
      <primitive object={particles.points} renderOrder={2} />
      {nodes.map((node, index) => (
        <group key={node.label}>
          {node.glowMaterial && (
            <sprite
              ref={(element) => {
                glows.current[index] = element
              }}
              material={node.glowMaterial}
              renderOrder={3}
            />
          )}
          <mesh
            ref={(element) => {
              bodies.current[index] = element
            }}
            material={node.bodyMaterial}
            renderOrder={6}
          >
            <sphereGeometry args={[1, 24, 24]} />
          </mesh>
          {node.ringMaterial && (
            <mesh
              ref={(element) => {
                rings.current[index] = element
              }}
              material={node.ringMaterial}
              renderOrder={6}
            >
              <ringGeometry args={[0.3, 0.325, 48]} />
            </mesh>
          )}
          <sprite
            ref={(element) => {
              labels.current[index] = element
            }}
            material={node.labelMaterial}
            center={node.kind === 'role' ? [0.5, 1] : [0, 0.5]}
            renderOrder={8}
          />
        </group>
      ))}
    </group>
  )
}
