export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/** Diameter in pixels per size (plan.md 8.4 Avatar). */
export const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 64,
  '2xl': 96,
}

/** The eight muted hues from src/index.css; the order decides which hash bucket lands where. */
export const AVATAR_HUES = [
  'slate',
  'indigo',
  'violet',
  'sky',
  'teal',
  'emerald',
  'amber',
  'rose',
] as const
export type AvatarHue = (typeof AVATAR_HUES)[number]

/** djb2 over the name, so the same person always gets the same hue on every screen. */
export function avatarHue(name: string): AvatarHue {
  if (!name) return 'slate'
  let hash = 5381
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 33) ^ name.charCodeAt(i)
  }
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length]
}
