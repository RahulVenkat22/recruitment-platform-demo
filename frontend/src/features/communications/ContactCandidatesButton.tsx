import {
  ChevronDownIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  PhoneIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ContactChannel = 'email' | 'phone'

export interface ContactCandidatesButtonProps {
  active: boolean
  onChoose: (channel: ContactChannel) => void
}

/**
 * "Contact Candidates": pick a channel, then tick the candidates in the table.
 * WhatsApp is listed but not wired yet.
 */
export function ContactCandidatesButton({ active, onChoose }: ContactCandidatesButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant={active ? 'secondary' : 'default'}>
          <MessageSquareTextIcon data-icon="inline-start" aria-hidden="true" />
          Contact Candidates
          <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>How do you want to reach them?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChoose('email')}>
          <MailIcon aria-hidden="true" />
          Email
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <MessageCircleIcon aria-hidden="true" />
          WhatsApp
          <DropdownMenuShortcut>Coming soon</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChoose('phone')}>
          <PhoneIcon aria-hidden="true" />
          Phone call (AI)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
