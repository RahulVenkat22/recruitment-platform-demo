/*
 * Chart colours for the dashboard. Every value below was checked with the
 * data-viz palette validator on the white card surface rather than by eye:
 * the categorical order clears the colour-vision-deficiency and normal-vision
 * separation floors with every slot at 3:1 or better, and the ordinal ramp
 * reads light-to-dark in one hue with visible steps.
 */

/** Chart chrome as hex (SVG attributes cannot read the CSS tokens in index.css). */
export const CHART_INK = {
  surface: '#ffffff',
  grid: '#e1e1db',
  baseline: '#b7b7ae',
  axis: '#5d615c',
} as const

/**
 * Categorical theme, fixed order: brand olive first, then indigo, amber, blue and
 * rose. Series take slots in sequence and keep them; nothing is cycled past five.
 */
export const SERIES = ['#6b7500', '#3f3fb5', '#b7791f', '#1d4ed8', '#b42318'] as const

/** Ordinal lime ramp, light to dark, for ordered pipeline stages. */
export const ORDINAL_RAMP = [
  '#abac0c',
  '#949507',
  '#7e7f03',
  '#696900',
  '#545400',
  '#404005',
] as const

/** Funnel stage -> ramp step; the per-role bars use the same steps for the same stages. */
export const STAGE_COLORS: Record<string, string> = {
  found: ORDINAL_RAMP[0],
  shortlisted: ORDINAL_RAMP[1],
  contacted: ORDINAL_RAMP[2],
  interviewed: ORDINAL_RAMP[3],
  selected: ORDINAL_RAMP[4],
  onboarded: ORDINAL_RAMP[5],
}

/** Interview recommendations are a diverging scale: two greens, a neutral, one red. */
export const OUTCOME_COLORS: Record<string, string> = {
  strong_proceed: '#1f7a4d',
  proceed: '#4c9d6f',
  hold: '#b7b7ae',
  reject: '#d50032',
}

/** The sparkline accent on the stat tiles. */
export const SPARK = SERIES[0]
