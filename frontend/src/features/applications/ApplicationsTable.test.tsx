import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplicationsTable } from '@/features/applications/ApplicationsTable'
import { useContactMode } from '@/features/communications/useContactMode'
import { renderWithProviders } from '@/test/render'
import type { ApplicationRow } from '@/types/domain'

const rows: ApplicationRow[] = ['Alex Morgan', 'Sam Taylor'].map((name, index) => ({
  id: `application-${index}`,
  job_description: 'job-1',
  job: {
    id: 'job-1',
    title: 'React Developer',
    department: 'Engineering',
    status: 'open',
    location: '',
  },
  candidate: {
    id: `candidate-${index}`,
    full_name: name,
    email: `candidate-${index}@example.com`,
    phone: '',
    avatar_url: null,
    headline: 'Frontend Developer',
    current_company: '',
    current_title: 'Frontend Developer',
    location: '',
    total_experience_years: 5,
    skills: [],
    sources: ['internal'],
  },
  status: 'new',
  status_label: 'New',
  previous_status: null,
  owner: null,
  entry_source: 'internal',
  search_run: null,
  match: {
    overall_pct: 92 - index * 10,
    skills_score: 90,
    experience_score: 90,
    domain_score: 90,
    education_score: 90,
    responsibility_score: 90,
    matched_required_skills: [],
    matched_required_skill_names: [],
    missing_required_skills: [],
    missing_required_skill_names: [],
    matched_preferred_skills: [],
    matched_preferred_skill_names: [],
    strengths: [],
    gaps: [],
    engine: 'test',
    engine_version: '1',
    computed_at: '2026-09-25T00:00:00Z',
    retrieval_score: null,
    rerank_score: null,
    explanation: '',
    semantic_details: null,
  },
  is_starred: false,
  stage_entered_at: '2026-09-25T00:00:00Z',
  last_activity_at: '2026-09-25T00:00:00Z',
  created_at: '2026-09-25T00:00:00Z',
  permissions: { can_transition: true, can_manage: true },
}))

const pagination = { pageIndex: 0, pageSize: 20, onChange: vi.fn() }

describe('ApplicationsTable', () => {
  it('preserves match rings and checkbox focus throughout email selection', async () => {
    const user = userEvent.setup()
    const sendEmail = vi.fn()
    function Harness() {
      const contact = useContactMode()
      return (
        <ApplicationsTable
          rows={rows}
          total={rows.length}
          pagination={pagination}
          selection={contact.selection}
          toolbar={
            <>
              {contact.controls}
              {contact.banner}
            </>
          }
          // The page's action hook supplies a new callback on each render.
          actionsFor={() => [{ key: 'profile', label: 'Open profile', onSelect: () => {} }]}
          bulkActions={({ selectedRows }) => (
            <button onClick={() => sendEmail(selectedRows)}>Send email</button>
          )}
        />
      )
    }
    renderWithProviders(<Harness />)
    const rings = screen.getAllByRole('img', { name: /% match/ })
    const expectSameRings = () => {
      const current = screen.getAllByRole('img', { name: /% match/ })
      rings.forEach((ring, index) => expect(current[index]).toBe(ring))
    }

    await user.click(screen.getByRole('button', { name: 'Contact Candidates' }))
    await user.click(screen.getByRole('menuitem', { name: 'Email' }))
    expectSameRings()

    const alex = screen.getByRole('checkbox', { name: 'Select Alex Morgan' })
    const sam = screen.getByRole('checkbox', { name: 'Select Sam Taylor' })
    const all = screen.getByRole('checkbox', { name: 'Select all rows' })

    await user.click(alex)
    expect(alex).toBeChecked()
    expect(alex).toHaveFocus()
    expect(all).toBePartiallyChecked()
    expectSameRings()

    await user.click(sam)
    expect(sam).toBeChecked()
    expect(all).toBeChecked()
    expectSameRings()

    await user.keyboard('[Space]')
    expect(sam).not.toBeChecked()
    expect(sam).toHaveFocus()
    expectSameRings()
    await user.click(screen.getByRole('button', { name: 'Send email' }))
    expect(sendEmail).toHaveBeenCalledWith([rows[0]])

    await user.click(all)
    expect(alex).toBeChecked()
    expect(sam).toBeChecked()
    expectSameRings()

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(alex).not.toBeChecked()
    expect(all).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
    expectSameRings()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expectSameRings()
  })

  it('updates changed match scores, ranks and optional job columns', () => {
    const { rerender } = renderWithProviders(
      <ApplicationsTable rows={rows} total={rows.length} pagination={pagination} />,
    )
    const ring = screen.getByRole('img', { name: '92% match' })
    const updated = rows.map((row) => ({
      ...row,
      match: row.match ? { ...row.match, overall_pct: 95 } : null,
    }))
    rerender(
      <ApplicationsTable
        rows={updated}
        total={rows.length}
        pagination={pagination}
        rankOffset={20}
        showJob
      />,
    )
    expect(screen.getAllByRole('img', { name: '95% match' })[0]).toBe(ring)
    const firstRow = screen.getByRole('link', { name: 'Alex Morgan' }).closest('tr')!
    expect(within(firstRow).getByRole('cell', { name: '21' })).toBeInTheDocument()
    expect(within(firstRow).getByRole('link', { name: 'React Developer' })).toHaveAttribute(
      'href',
      '/jobs/job-1',
    )
  })
})
