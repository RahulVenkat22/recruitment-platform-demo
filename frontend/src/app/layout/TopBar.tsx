import { BellIcon } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { HealthPill } from '@/components/shared/HealthPill'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore } from '@/lib/auth-store'
import { fullName, initials } from '@/lib/format'
import { useUiStore } from '@/lib/ui-store'

function TopBarBreadcrumbs() {
  const crumbs = useUiStore((state) => state.breadcrumbs)
  if (crumbs.length === 0) return <div aria-hidden="true" />

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[13px]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem>
                {isLast || !crumb.to ? (
                  <BreadcrumbPage className="font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function TopBar() {
  const user = useAuthStore((state) => state.user)
  const name = user ? fullName(user) : 'Guest'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6 max-md:px-4">
      <TopBarBreadcrumbs />
      <div className="flex items-center gap-2">
        <HealthPill />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-ink-muted hover:text-ink"
            >
              <Link to="/notifications" aria-label="Notifications">
                <BellIcon aria-hidden="true" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Notifications</TooltipContent>
        </Tooltip>
        <Avatar size="default" aria-label={name}>
          {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-surface-2 text-xs font-medium text-ink-muted">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
