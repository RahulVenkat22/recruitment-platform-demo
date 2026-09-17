import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { PointerState } from '@/features/auth/scene/pointer'
import { usePointerDriver } from '@/features/auth/scene/pointer'

const TARGET = new THREE.Vector3(0, 0, 0)

/** Smooths the pointer, then eases the camera a little towards it for parallax. */
export function CameraRig({ pointer }: { pointer: PointerState }) {
  const drive = usePointerDriver(pointer)

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    drive(dt, state.clock.elapsedTime)
    const camera = state.camera
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.9, 2.2, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pointer.y * 0.55, 2.2, dt)
    camera.lookAt(TARGET)
  }, -1)

  return null
}
