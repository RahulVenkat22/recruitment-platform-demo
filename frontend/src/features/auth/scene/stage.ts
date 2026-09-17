import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/** Where the story sits in world units at z = 0, derived from the visible viewport. */
export interface Stage {
  vw: number
  vh: number
  /** Canvas height in CSS pixels, for sizing against the page copy. */
  heightPx: number
  /** Size multiplier so the composition fits short viewports. */
  s: number
  landscape: boolean
  /** Fewer cards and nodes on phones. */
  compact: boolean
  /** The AI core. */
  coreX: number
  coreY: number
  /** Résumé cards enter from here, just past the left edge. */
  spawnX: number
  /** Centre of the roles-and-skills graph. */
  graphX: number
  /**
   * Footprint of the page copy (top-left) in world units: nodes left of
   * `pitchRight` must stay below `pitchBottom`. Unconstrained in portrait.
   */
  pitchBottom: number
  pitchRight: number
}

/**
 * Desktop: the glass form covers the right ~38%, so the résumé stream, the
 * core and the graph share the left 62%. Portrait: the core rises above the
 * form and the graph sits to its right.
 */
export function useStage(): Stage {
  const width = useThree((state) => state.viewport.width)
  const height = useThree((state) => state.viewport.height)
  const heightPx = useThree((state) => state.size.height)
  return useMemo(() => {
    const landscape = width > height * 1.25
    // The page copy is fixed in pixels, so on short screens the scene shrinks to leave it room.
    const s = THREE.MathUtils.clamp(heightPx / 1000, 0.7, 1.08)
    const coreX = landscape ? -width / 2 + width * 0.33 : -width * 0.08
    const coreY = landscape ? -height * 0.05 : height * 0.14
    // LoginPage: header, eyebrow, two-line headline and (above 820px tall) the paragraph.
    const pitchBottomPx = heightPx > 820 ? 372 : 252
    const pitchRightPx = 640
    const pxToWorld = height / heightPx
    return {
      vw: width,
      vh: height,
      heightPx,
      s,
      landscape,
      compact: width < 12,
      coreX,
      coreY,
      spawnX: -width / 2 - 2.2,
      graphX: landscape ? -width / 2 + width * 0.56 : width * 0.24,
      pitchBottom: landscape ? height / 2 - pitchBottomPx * pxToWorld : height / 2,
      pitchRight: landscape ? -width / 2 + pitchRightPx * pxToWorld : -width / 2,
    }
  }, [width, height, heightPx])
}

export const LIME = new THREE.Color('#C4D600')
export const WHITE = new THREE.Color('#ffffff')

/** Signals passed between parts of the scene without React state. */
export interface SceneBus {
  /** 1 the instant a résumé is absorbed, decaying to 0. */
  pulse: number
  /** Résumés absorbed since the graph last looked; each names the role it matched. */
  matches: number[]
  /** Set to now (seconds) on each absorb; the core's shockwave reads it. */
  lastAbsorb: number
}

export function createSceneBus(): SceneBus {
  return { pulse: 0, matches: [], lastAbsorb: -10 }
}
