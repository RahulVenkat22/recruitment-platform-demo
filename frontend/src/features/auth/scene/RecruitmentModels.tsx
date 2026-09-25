import { extend, type ThreeElement } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

extend({ RoundedBoxGeometry })

declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>
  }
}

type Point = [number, number, number]

function Block({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = '#edf0df',
  radius = 0.08,
  metalness = 0.12,
}: {
  size: Point
  position?: Point
  rotation?: Point
  color?: string
  radius?: number
  metalness?: number
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <roundedBoxGeometry args={[...size, 3, radius]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={metalness} />
    </mesh>
  )
}

function Label({
  text,
  position,
  width = 1.15,
  color = '#314838',
}: {
  text: string
  position: Point
  width?: number
  color?: string
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = '600 48px Arial, sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 256, 68, 488)
    }
    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    return result
  }, [text, color])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={position}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Person({
  position = [0, 0, 0],
  scale = 1,
  color = '#638575',
}: {
  position?: Point
  scale?: number
  color?: string
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.2, 24, 20]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.18} />
      </mesh>
      <mesh position={[0, -0.17, -0.035]} scale={[1, 0.78, 0.58]}>
        <sphereGeometry args={[0.34, 28, 20]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.18} />
      </mesh>
    </group>
  )
}

function CheckBadge({ position, color = '#d4e98d' }: { position: Point; color?: string }) {
  return (
    <group position={position} rotation={[0.05, -0.15, 0.05]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.1, 40]} />
        <meshStandardMaterial color={color} roughness={0.24} metalness={0.25} />
      </mesh>
      <Block
        size={[0.07, 0.18, 0.045]}
        position={[-0.055, -0.015, 0.07]}
        rotation={[0, 0, 0.7]}
        color="#365442"
        radius={0.025}
      />
      <Block
        size={[0.07, 0.29, 0.045]}
        position={[0.045, 0.025, 0.07]}
        rotation={[0, 0, -0.7]}
        color="#365442"
        radius={0.025}
      />
    </group>
  )
}

export function ResumeModel() {
  return (
    <group rotation={[0.04, -0.16, -0.07]}>
      <Block
        size={[1.58, 2.1, 0.12]}
        position={[0.09, -0.035, -0.17]}
        rotation={[0, 0, -0.07]}
        color="#839986"
      />
      <Block
        size={[1.58, 2.1, 0.12]}
        position={[0.035, 0.015, -0.07]}
        rotation={[0, 0, 0.04]}
        color="#c4d3b7"
      />
      <Block size={[1.58, 2.1, 0.16]} color="#f2f3df" />
      <Block
        size={[0.42, 0.51, 0.055]}
        position={[-0.4, 0.57, 0.1]}
        color="#d3e4b0"
        radius={0.025}
      />
      <Person position={[-0.4, 0.56, 0.16]} scale={0.47} color="#567251" />
      <Label text="RÉSUMÉ" position={[0.22, 0.68, 0.1]} width={0.72} />
      <Block
        size={[0.54, 0.055, 0.035]}
        position={[0.18, 0.43, 0.1]}
        color="#9aa78b"
        radius={0.015}
      />
      <Block size={[1.16, 0.025, 0.03]} position={[0, 0.16, 0.1]} color="#c1cbb3" radius={0.01} />
      {[1.08, 0.85, 1.1, 0.69].map((width, index) => (
        <Block
          key={index}
          size={[width, 0.065, 0.035]}
          position={[-0.56 + width / 2, -0.04 - index * 0.2, 0.1]}
          color={index === 0 ? '#76916b' : '#b1bea2'}
          radius={0.015}
        />
      ))}
      <Block
        size={[0.44, 0.16, 0.055]}
        position={[-0.33, -0.83, 0.12]}
        color="#bed982"
        radius={0.025}
      />
      <Block
        size={[0.47, 0.16, 0.055]}
        position={[0.2, -0.83, 0.12]}
        color="#d1dfb8"
        radius={0.025}
      />
      <CheckBadge position={[0.72, -0.69, 0.26]} />
    </group>
  )
}

export function CandidateModel() {
  return (
    <group rotation={[0.04, 0.12, 0.05]}>
      <Block size={[1.7, 2.06, 0.25]} color="#94cbb6" radius={0.12} />
      <Block size={[0.49, 0.075, 0.06]} position={[0, 0.82, 0.13]} color="#365c4e" radius={0.025} />
      <mesh position={[0, 0.27, 0.145]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.56, 0.56, 0.045, 48]} />
        <meshStandardMaterial color="#dcefe1" roughness={0.45} />
      </mesh>
      <Person position={[0, 0.25, 0.22]} scale={1.08} color="#4c8071" />
      <Label text="CANDIDATE" position={[0, -0.47, 0.145]} width={1.3} color="#264f41" />
      <Block size={[0.77, 0.06, 0.06]} position={[0, -0.68, 0.14]} color="#5a9b83" radius={0.02} />
      <Block size={[0.49, 0.045, 0.04]} position={[0, -0.82, 0.14]} color="#68aa91" radius={0.02} />
      <CheckBadge position={[0.75, 0.68, 0.24]} color="#e2ecaa" />
    </group>
  )
}

export function OpportunityModel() {
  return (
    <group rotation={[0.03, -0.14, -0.05]} position={[0, -0.08, 0]}>
      <Block size={[0.83, 0.16, 0.26]} position={[0, 0.99, 0]} color="#cfa37d" />
      <Block size={[0.16, 0.37, 0.26]} position={[-0.34, 0.82, 0]} color="#cfa37d" />
      <Block size={[0.16, 0.37, 0.26]} position={[0.34, 0.82, 0]} color="#cfa37d" />
      <Block size={[2.02, 1.52, 0.62]} position={[0, -0.03, 0]} color="#dbae88" radius={0.14} />
      <Block size={[1.98, 0.57, 0.085]} position={[0, 0.42, 0.32]} color="#e8c19c" radius={0.04} />
      <Block
        size={[1.79, 0.027, 0.018]}
        position={[0, 0.12, 0.367]}
        color="#a77b56"
        radius={0.009}
      />
      <Block
        size={[0.27, 0.34, 0.11]}
        position={[0, 0.1, 0.4]}
        color="#f4e0ad"
        radius={0.04}
        metalness={0.6}
      />
      <Block size={[0.09, 0.09, 0.02]} position={[0, 0.09, 0.463]} color="#8a6c45" radius={0.015} />
      <Label text="OPPORTUNITY" position={[0, -0.41, 0.325]} width={1.62} color="#644932" />
      {[-0.79, 0.79].map((x) => (
        <Block
          key={x}
          size={[0.07, 1.13, 0.04]}
          position={[x, -0.13, 0.33]}
          color="#c79870"
          radius={0.018}
        />
      ))}
    </group>
  )
}

export function InterviewModel() {
  return (
    <group rotation={[0.05, 0.12, -0.05]}>
      <Block size={[1.93, 1.91, 0.24]} color="#e7e7f1" radius={0.11} />
      <Block size={[1.91, 0.5, 0.075]} position={[0, 0.68, 0.135]} color="#afadd9" radius={0.035} />
      <Label text="INTERVIEW" position={[0, 0.67, 0.18]} width={1.37} color="#38395e" />
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.93, 0.08]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.13, 0.042, 12, 28]} />
          <meshStandardMaterial color="#89939f" metalness={0.72} roughness={0.22} />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, index) => (
        <Block
          key={index}
          size={[0.26, 0.25, 0.055]}
          position={[-0.56 + (index % 4) * 0.37, 0.18 - Math.floor(index / 4) * 0.35, 0.15]}
          color={index === 6 ? '#8b8aba' : '#c5c8dd'}
          radius={0.025}
        />
      ))}
      <Label text="LET’S CONNECT" position={[0, -0.77, 0.135]} width={1.26} color="#656989" />
      <CheckBadge position={[0.88, -0.59, 0.27]} color="#d9d8f1" />
    </group>
  )
}
