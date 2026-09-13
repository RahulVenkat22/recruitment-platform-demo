import {
  BellIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileSignatureIcon,
  RocketIcon,
  ShuffleIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Notification } from '@/types/domain'

export const TYPE_ICONS: Record<string, LucideIcon> = {
  assignment: UserPlusIcon,
  status_change: ShuffleIcon,
  interview: CalendarClockIcon,
  feedback: ClipboardCheckIcon,
  offer: FileSignatureIcon,
  onboarding: RocketIcon,
  mention: BellIcon,
  system: BellIcon,
}

/** Notification links are SPA routes ("/candidates/…?jd=…"); anything else falls back to the list. */
export function linkFor(notification: Notification): string {
  return notification.link_url?.startsWith('/') ? notification.link_url : '/notifications'
}
