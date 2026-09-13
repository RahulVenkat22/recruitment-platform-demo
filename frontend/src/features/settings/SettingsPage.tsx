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
  { key: 'profile', label: 'Profile' },
  { key: 'security', label: 'Security' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'users', label: 'Users', adminOnly: true },
] as const

type TabKey = (typeof TABS)[number]['key']

/** plan.md 9.13. The active tab lives in `?tab=` so each one is linkable. */
export default function SettingsPage() {
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
      <Tabs value={active} onValueChange={setTab} className="gap-5">
        <TabsList variant="line" className="w-full justify-start border-b border-line">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="flex-none px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <SettingsSection title="Profile" description="How you appear to the rest of the team.">
            <ProfileForm key={user.id} user={user} />
          </SettingsSection>
        </TabsContent>

        <TabsContent value="security">
          <SettingsSection title="Security" description="Change the password you sign in with.">
            <SecurityForm />
          </SettingsSection>
        </TabsContent>

        <TabsContent value="preferences">
          <SettingsSection title="Preferences" description="Saved in this browser only.">
            <PreferencesPanel />
          </SettingsSection>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users">
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
