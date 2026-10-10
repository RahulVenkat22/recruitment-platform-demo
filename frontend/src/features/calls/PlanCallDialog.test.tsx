import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { PipelineTarget } from '@/features/applications/pipeline-target'
import { PlanCallDialog } from '@/features/calls/PlanCallDialog'
import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'

const demo = vi.hoisted(() => ({ target: null as unknown }))

vi.mock('@/features/calls/BrowserCallDialog', () => ({
  BrowserCallDialog: ({ target }: { target: unknown }) => {
    demo.target = target
    return target ? <p>Browser demo opened</p> : null
  },
}))

const target: PipelineTarget = {
  id: 'application-1',
  job_description: 'job-1',
  candidate: { id: 'candidate-1', full_name: 'Alex Morgan', avatar_url: null },
  status: 'new',
}

function Harness({ multiple = false }: { multiple?: boolean }) {
  const [targets, setTargets] = useState<PipelineTarget[] | null>(
    multiple ? [target, { ...target, id: 'application-2' }] : [target],
  )
  return <PlanCallDialog targets={targets} onOpenChange={(open) => !open && setTargets(null)} />
}

function mockConfig(browserConfigured: boolean) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === endpoints.callsConfig) {
      return {
        data: {
          configured: false,
          browser_configured: browserConfigured,
          provider: '',
          safe_number: '',
          default_region: 'IN',
        },
      }
    }
    if (url === endpoints.job('job-1')) return { data: { participants: [] } }
    return { data: { results: [] } }
  })
}

describe('browser demo in the call planner', () => {
  beforeEach(() => {
    demo.target = null
    useAuthStore.setState({ user: makeUser(), accessToken: 'test', status: 'authed' })
  })

  afterEach(() => vi.restoreAllMocks())

  it('opens a single-candidate demo without phone configuration or placing a phone call', async () => {
    mockConfig(true)
    const post = vi.spyOn(api, 'post')
    const ui = userEvent.setup()
    renderWithProviders(<Harness />)

    const browser = screen.getByRole('button', { name: 'Browser voice demo' })
    await waitFor(() => expect(browser).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Place phone call' })).toBeDisabled()
    await ui.click(browser)

    expect(await screen.findByText('Browser demo opened')).toBeVisible()
    expect(demo.target).toMatchObject({
      applicationId: 'application-1',
      candidateName: 'Alex Morgan',
      body: { purpose: 'schedule_interview', interviewer: 'u1', max_minutes: 10 },
    })
    expect(demo.target).not.toHaveProperty('body.mode')
    expect(post).not.toHaveBeenCalled()
  })

  it('disables browser voice until the backend reports it is configured', async () => {
    mockConfig(false)
    renderWithProviders(<Harness />)
    expect(await screen.findByText(/Voice calling is not connected yet/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Browser voice demo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run simulated call' })).toBeEnabled()
  })

  it('does not offer a browser demo for a bulk telephone call', async () => {
    mockConfig(true)
    renderWithProviders(<Harness multiple />)
    expect(await screen.findByText(/Browser voice is ready/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Browser voice demo' })).not.toBeInTheDocument()
  })
})
