import * as THREE from 'three'
import type { ResumeVariant } from '@/features/auth/scene/graph-data'

const FONT = "'Geist Variable', 'Inter', system-ui, -apple-system, sans-serif"
const LIME = '#C4D600'

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  return element
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function toTexture(element: HTMLCanvasElement, mipmaps = true) {
  const texture = new THREE.CanvasTexture(element)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.generateMipmaps = mipmaps
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** A résumé card: avatar, name bars, body lines, skill chips and a lime match pill. */
export function makeResumeTexture(variant: ResumeVariant): THREE.CanvasTexture {
  const W = 256
  const H = 336
  const element = canvas(W, H)
  const ctx = element.getContext('2d')!

  ctx.fillStyle = '#181818'
  rounded(ctx, 1.5, 1.5, W - 3, H - 3, 22)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Lime accent along the top edge.
  ctx.fillStyle = LIME
  rounded(ctx, 28, 1, W - 56, 4, 2)
  ctx.fill()

  // Avatar with initials.
  ctx.fillStyle = variant.hue
  ctx.beginPath()
  ctx.arc(48, 54, 23, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 18px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(variant.initials, 48, 55)

  // Name and designation bars.
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  rounded(ctx, 84, 40, 112, 12, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  rounded(ctx, 84, 60, 78, 9, 4.5)
  ctx.fill()

  // Body text lines.
  variant.lines.forEach((factor, index) => {
    ctx.fillStyle = `rgba(255,255,255,${index === 0 ? 0.24 : 0.15})`
    rounded(ctx, 26, 104 + index * 20, (W - 52) * factor, 7, 3.5)
    ctx.fill()
  })

  // Skill chips.
  let x = 26
  for (const width of variant.chips) {
    ctx.strokeStyle = 'rgba(196,214,0,0.75)'
    ctx.lineWidth = 1.5
    rounded(ctx, x, 222, width, 22, 11)
    ctx.stroke()
    ctx.fillStyle = 'rgba(196,214,0,0.55)'
    rounded(ctx, x + 10, 230, width - 20, 6, 3)
    ctx.fill()
    x += width + 8
  }

  // Match pill.
  ctx.fillStyle = LIME
  rounded(ctx, W - 26 - 96, H - 26 - 32, 96, 32, 16)
  ctx.fill()
  ctx.fillStyle = '#0a0a0a'
  ctx.font = `700 15px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(`${variant.match}% match`, W - 26 - 48, H - 26 - 15)

  // Status dot.
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(W - 30, 32, 4, 0, Math.PI * 2)
  ctx.fill()

  return toTexture(element)
}

export interface LabelTexture {
  texture: THREE.CanvasTexture
  /** width / height, so the sprite keeps the text's proportions. */
  aspect: number
}

/** Role labels are outlined lime pills; skill labels plain white text. */
export function makeLabelTexture(text: string, kind: 'role' | 'skill'): LabelTexture {
  const scale = 2
  const font =
    kind === 'role' ? `600 ${15 * scale}px ${FONT}` : `500 ${13.5 * scale}px ${FONT}`
  const measure = canvas(1, 1).getContext('2d')!
  measure.font = font
  const textWidth = measure.measureText(text).width
  const padX = (kind === 'role' ? 15 : 8) * scale
  const h = (kind === 'role' ? 32 : 24) * scale
  const w = Math.ceil(textWidth + padX * 2)
  const element = canvas(w, h)
  const ctx = element.getContext('2d')!

  if (kind === 'role') {
    ctx.fillStyle = 'rgba(12,12,12,0.88)'
    rounded(ctx, 1.5, 1.5, w - 3, h - 3, h / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(196,214,0,0.85)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
  }
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(text, padX, h / 2 + 1)

  return { texture: toTexture(element, false), aspect: w / h }
}

/** Soft radial falloff for additive glow sprites and particles. */
export function makeGlowTexture(size = 128, hardness = 0.0): THREE.CanvasTexture {
  const element = canvas(size, size)
  const ctx = element.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(Math.max(hardness, 0.001), 'rgba(255,255,255,0.85)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return toTexture(element, false)
}
