/* Dashboard palette: teal-led categories and a sequential teal ramp.
 * Direct labels, legends and the table view keep values available beyond colour.
 */

/** Chart chrome as hex (SVG attributes cannot read the CSS tokens in index.css). */
export const CHART_INK = {
  surface: '#ffffff',
  grid: '#e7edf2',
  baseline: '#a5b4c2',
  axis: '#5f7184',
} as const

/**
 * Categorical theme, fixed order: brand teal first, then indigo, amber, blue and
 * rose. Series take slots in sequence and keep them; nothing is cycled past five.
 */
export const SERIES = ['#11796c', '#6874be', '#b7791f', '#3988b1', '#b65779'] as const

/** Ordinal teal ramp, light to dark, for ordered pipeline stages. */
export const ORDINAL_RAMP = [
  '#69a89b',
  '#489784',
  '#2a8574',
  '#177260',
  '#135e52',
  '#124c44',
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

/** The stage partition on the funnel's colours; candidates awaiting review take the first step. */
export function stageColor(key: string): string {
  return STAGE_COLORS[key] ?? STAGE_COLORS.found
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

/**
 * Sequential teal ramp for the activity heatmap, quiet to busy; empty cells take
 * the surface. Lightness falls monotonically through the steps, and every cell
 * carries its value in a hover readout and the table twin, as the pale steps
 * sit under 3:1 against the card.
 */
export const HEAT_RAMP = ['#eaf4ef', '#c4e2d4', '#8cc5ae', '#419b81', '#176e5c'] as const

/** Offer statuses are states: blue in flight, amber negotiating, green won, red lost, grey closed. */
export const OFFER_COLORS: Record<string, string> = {
  draft: '#b7b7ae',
  sent: '#1d4ed8',
  negotiating: '#b7791f',
  accepted: '#1f7a4d',
  declined: '#d50032',
  withdrawn: '#5d615c',
  expired: '#5d615c',
}
