import { FingerprintIcon, SlidersHorizontalIcon, UserRoundIcon, UsersIcon } from 'lucide-react'
import { useIsMobile } from '@/lib/hooks'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PreferencesPanel } from '@/features/settings/PreferencesPanel'
import { ProfileForm } from '@/features/settings/ProfileForm'
import { SecurityForm } from '@/features/settings/SecurityForm'
import { SettingsSection } from '@/features/settings/SettingsSection'
import { UsersTable } from '@/features/settings/UsersTable'
import { useAuthStore } from '@/lib/auth-store'

const TABS = [
  { key: 'profile', label: 'Profile', icon: UserRoundIcon },
  { key: 'security', label: 'Security', icon: FingerprintIcon },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontalIcon },
  { key: 'users', label: 'Users', icon: UsersIcon, adminOnly: true },
] as const

type TabKey = (typeof TABS)[number]['key']

/** plan.md 9.13. The active tab lives in `?tab=` so each one is linkable. */
export default function SettingsPage() {
  const mobile = useIsMobile()
  const user = useAuthStore((state) => state.user)
  const [params, setParams] = useSearchParams()
  const isAdmin = user?.role === 'hr_admin'
  const tabs = TABS.filter((tab) => !('adminOnly' in tab) || isAdmin)
  const requested = params.get('tab')
  const active: TabKey = tabs.some((tab) => tab.key === requested)
    ? (requested as TabKey)
    : 'profile'

  function setTab(next: string) {
    const search = new URLSearchParams(params)
    if (next === 'profile') search.delete('tab')
    else search.set('tab', next)
    setParams(search, { replace: true })
  }

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your profile, password and workspace preferences."
        breadcrumbs={[{ label: 'Settings' }]}
      />
      <Tabs
        value={active}
        onValueChange={setTab}
        orientation={mobile ? 'horizontal' : 'vertical'}
        className="items-start gap-6 max-md:flex-col"
      >
        <TabsList className="h-auto w-full max-w-full shrink-0 justify-start overflow-x-auto gap-1 rounded-card border border-line bg-surface p-2 md:w-48 md:items-stretch">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="min-h-11 flex-none justify-start gap-2.5 px-3 data-active:bg-primary-soft"
            >
              <tab.icon aria-hidden="true" className="size-4 max-sm:hidden" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="w-full min-w-0" value="profile">
          <SettingsSection title="Profile" description="How you appear to the rest of the team.">
            <ProfileForm key={user.id} user={user} />
          </SettingsSection>
        </TabsContent>

        <TabsContent className="w-full min-w-0" value="security">
          <SettingsSection title="Security" description="Change the password you sign in with.">
            <SecurityForm />
          </SettingsSection>
        </TabsContent>

        <TabsContent className="w-full min-w-0" value="preferences">
          <SettingsSection title="Preferences" description="Saved in this browser only.">
            <PreferencesPanel />
          </SettingsSection>
        </TabsContent>

        {isAdmin && (
          <TabsContent className="w-full min-w-0" value="users">
            <SettingsSection
              title="Users"
              description="Everyone who can sign in, with their role."
              className="max-w-none"
            >
              <UsersTable />
            </SettingsSection>
          </TabsContent>
        )}
      </Tabs>
    </>
  )
}
