/** Roles Buro Happold hires for and the skills the matcher links them to. */
export interface RoleSpec {
  label: string
  skills: string[]
}

export const ROLES: RoleSpec[] = [
  { label: 'Senior Structural Engineer', skills: ['Structural analysis', 'Eurocodes', 'Revit'] },
  { label: 'Bridge Engineer', skills: ['Bridges', 'Structural analysis', 'Geotechnics'] },
  { label: 'BIM Coordinator', skills: ['Revit', 'BIM 360', 'Navisworks'] },
  { label: 'Sustainability Consultant', skills: ['Net zero', 'LCA', 'Energy modelling'] },
  { label: 'Façade Engineer', skills: ['Façades', 'Grasshopper', 'Thermal performance'] },
  { label: 'MEP Lead', skills: ['MEP', 'Energy modelling', 'BIM 360'] },
]

/** A smaller graph for phones. */
export const ROLES_COMPACT: RoleSpec[] = [
  { label: 'Structural Engineer', skills: ['Structural analysis', 'Revit'] },
  { label: 'BIM Coordinator', skills: ['Revit', 'Navisworks'] },
  { label: 'Sustainability Consultant', skills: ['Net zero', 'LCA'] },
  { label: 'Façade Engineer', skills: ['Façades', 'Grasshopper'] },
]

export interface ResumeVariant {
  initials: string
  hue: string
  match: number
  chips: number[]
  lines: number[]
}

/** Six looks for the résumé cards; hues follow the Avatar palette. */
export const RESUME_VARIANTS: ResumeVariant[] = [
  { initials: 'JD', hue: '#4f55b8', match: 95, chips: [62, 50, 70], lines: [0.92, 0.7, 0.84, 0.56, 0.76] },
  { initials: 'PS', hue: '#1f7f7a', match: 88, chips: [54, 68, 46], lines: [0.8, 0.9, 0.62, 0.74, 0.5] },
  { initials: 'AK', hue: '#7248b0', match: 91, chips: [70, 44, 58], lines: [0.86, 0.6, 0.78, 0.9, 0.55] },
  { initials: 'MR', hue: '#2e6fa8', match: 83, chips: [48, 60, 66], lines: [0.7, 0.84, 0.58, 0.66, 0.8] },
  { initials: 'LN', hue: '#2f7d57', match: 97, chips: [66, 52, 60], lines: [0.9, 0.76, 0.66, 0.82, 0.6] },
  { initials: 'SO', hue: '#b04a5a', match: 86, chips: [56, 64, 50], lines: [0.78, 0.66, 0.9, 0.6, 0.72] },
]
