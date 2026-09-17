import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Mutable cursor state shared by every part of the scene. Written by window
 * listeners (the canvas sits behind the form, so it never receives events
 * itself) and smoothed once per frame by `PointerDriver`.
 */
export interface PointerState {
  /** Raw target in normalised device coordinates, -1..1. */
  tx: number
  ty: number
  /** Smoothed NDC position. */
  x: number
  y: number
  /** Smoothed cursor position on the z = 0 plane, in world units. */
  world: THREE.Vector3
  /** 1 while a real pointer is over the page, easing to 0 when it leaves. */
  active: number
  targetActive: number
  /** Recent cursor speed in NDC units per second, decays quickly. */
  speed: number
  lastMove: number
}

export function createPointerState(): PointerState {
  return {
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    world: new THREE.Vector3(),
    active: 0,
    targetActive: 0,
    speed: 0,
    lastMove: 0,
  }
}

/** Installs the window listeners for the lifetime of the scene. */
export function usePointerListeners(state: PointerState) {
  useEffect(() => {
    let lastX = 0
    let lastY = 0
    let lastT = 0
    const onMove = (event: PointerEvent) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1
      const ny = -((event.clientY / window.innerHeight) * 2 - 1)
      const now = performance.now()
      if (lastT) {
        const dt = Math.max(now - lastT, 8) / 1000
        const dist = Math.hypot(nx - lastX, ny - lastY)
        state.speed = Math.min(state.speed * 0.5 + (dist / dt) * 0.5, 12)
      }
      lastX = nx
      lastY = ny
      lastT = now
      state.tx = nx
      state.ty = ny
      state.targetActive = 1
      state.lastMove = now
    }
    const onLeave = () => {
      state.targetActive = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [state])
}

const PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const NDC = new THREE.Vector2()

/**
 * Smooths the raw pointer each frame and projects it onto the z = 0 plane.
 * Without a pointer (touch devices, or before the first move) the target
 * drifts on a slow figure-of-eight so the scene still feels alive.
 */
export function usePointerDriver(state: PointerState) {
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)
  const timeRef = useRef(0)

  return (delta: number, elapsed: number) => {
    timeRef.current = elapsed
    const idle = state.targetActive === 0 || performance.now() - state.lastMove > 6000
    if (idle) {
      state.targetActive = 0
      state.tx = Math.sin(elapsed * 0.21) * 0.55
      state.ty = Math.sin(elapsed * 0.33 + 1.2) * 0.35
    }
    const smooth = idle ? 1.2 : 4.5
    state.x = THREE.MathUtils.damp(state.x, state.tx, smooth, delta)
    state.y = THREE.MathUtils.damp(state.y, state.ty, smooth, delta)
    state.active = THREE.MathUtils.damp(state.active, state.targetActive, 3, delta)
    state.speed = THREE.MathUtils.damp(state.speed, 0, 4, delta)
    NDC.set(state.x, state.y)
    raycaster.setFromCamera(NDC, camera)
    raycaster.ray.intersectPlane(PLANE, state.world)
  }
}
