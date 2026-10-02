import { usePrefersReducedMotion } from '@/lib/hooks/useMediaQuery'
import { useUiStore } from '@/lib/ui-store'

/** The system preference always wins over the optional workspace effects. */
export function useMotionPreference(): boolean {
  const systemReduced = usePrefersReducedMotion()
  const effects = useUiStore((state) => state.motionEffects)
  return systemReduced || !effects
}
