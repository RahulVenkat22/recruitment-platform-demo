import { api, endpoints } from '@/lib/api'
import {
  categoryMeta,
  enumLabel,
  enumOptions,
  jdStatusMeta,
  loadEnums,
  sourceMeta,
  statusMeta,
  useEnumsStore,
} from '@/lib/enums'
import type { EnumCatalogue } from '@/types/domain'

const catalogue: EnumCatalogue = {
  enums: {
    application_status: [{ key: 'new', label: 'Fresh (from API)' }],
    candidate_source: [{ key: 'naukri', label: 'Naukri.com' }],
    activity_category: [{ key: 'offer', label: 'Offer' }],
    jd_status: [{ key: 'open', label: 'Open (API)' }],
    user_role: [{ key: 'hr_admin', label: 'HR Admin' }],
  },
  colors: {
    application_status: { new: { bg: '#111111', text: '#EEEEEE', name: 'test' } },
    candidate_source: { naukri: { bg: '#222222', text: '#DDDDDD', name: 'test' } },
    activity_category: { offer: { bg: '#333333', text: '#CCCCCC', name: 'test' } },
  },
  status_order: ['new'],
  status_groups: { active: ['new'], tray: [], terminal: [] },
  status_entry_category: { new: 'candidate_search' },
  kanban: { columns: [], tray: { label: 'Tray', statuses: [] }, status_to_column: {} },
}

describe('enums', () => {
  beforeEach(() => {
    useEnumsStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serves the plan.md 8.1 fallback table before the catalogue is loaded', () => {
    expect(statusMeta('ai_shortlisted')).toEqual({
      label: 'AI Shortlisted',
      bg: '#E8EAFB',
      fg: '#3F3FB5',
    })
    expect(sourceMeta('linkedin')).toEqual({ label: 'LinkedIn', bg: '#E1EEF8', fg: '#0A66C2' })
    expect(categoryMeta('decision')).toEqual({
      label: 'Rejected / On Hold',
      bg: '#FCE8E6',
      fg: '#B42318',
    })
    expect(jdStatusMeta('open')).toMatchObject({ label: 'Open' })
  })

  it('humanises unknown keys instead of throwing', () => {
    expect(statusMeta('some_future_status')).toMatchObject({ label: 'Some Future Status' })
    expect(statusMeta('')).toMatchObject({ label: '' })
  })

  it('prefers labels and colours from the loaded catalogue', () => {
    useEnumsStore.getState().setCatalogue(catalogue)

    expect(statusMeta('new')).toEqual({ label: 'Fresh (from API)', bg: '#111111', fg: '#EEEEEE' })
    expect(sourceMeta('naukri')).toEqual({ label: 'Naukri.com', bg: '#222222', fg: '#DDDDDD' })
    expect(categoryMeta('offer')).toEqual({ label: 'Offer', bg: '#333333', fg: '#CCCCCC' })
    // JD statuses have API labels but no API colours yet; the fallback colours fill in.
    expect(jdStatusMeta('open')).toEqual({ label: 'Open (API)', bg: '#E3F3EA', fg: '#1F7A4D' })
    // A key the API does not know still resolves through the fallback table.
    expect(statusMeta('rejected')).toMatchObject({ label: 'Rejected' })
  })

  it('exposes option lists and labels for any enum', () => {
    expect(enumOptions('user_role').map((o) => o.key)).toEqual([
      'hr_admin',
      'hr',
      'interviewer',
      'employee',
      'admin',
    ])
    expect(enumLabel('user_role', 'interviewer')).toBe('Interviewer')
    useEnumsStore.getState().setCatalogue(catalogue)
    expect(enumOptions('user_role')).toEqual([{ key: 'hr_admin', label: 'HR Admin' }])
  })

  it('loads the catalogue once and shares the in-flight request', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: catalogue, status: 200 })

    const [a, b] = await Promise.all([loadEnums(), loadEnums()])
    await loadEnums()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(endpoints.metaEnums)
    expect(a).toBe(b)
    expect(useEnumsStore.getState()).toMatchObject({ status: 'ready', catalogue })
  })

  it('records an error status and keeps serving fallbacks when the load fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))

    await expect(loadEnums()).rejects.toThrow('offline')

    expect(useEnumsStore.getState().status).toBe('error')
    expect(statusMeta('selected')).toMatchObject({ label: 'Selected' })
  })
})
