import { SERIES } from '@/features/dashboard/charts/theme'
import type { TrendPoint } from '@/types/domain'

export type TrendKey = Exclude<keyof TrendPoint, 'date'>

/** Fixed order and colour per series; a hidden series keeps its colour when it returns. */
export const TREND_SERIES: readonly { key: TrendKey; label: string; color: string }[] = [
  { key: 'candidates', label: 'Candidates found', color: SERIES[0] },
  { key: 'shortlisted', label: 'Shortlisted', color: SERIES[1] },
  { key: 'interviews', label: 'Interviews', color: SERIES[2] },
  { key: 'offers', label: 'Offers sent', color: SERIES[3] },
  { key: 'hires', label: 'Hires', color: SERIES[4] },
]
