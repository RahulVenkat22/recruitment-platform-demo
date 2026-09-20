/**
 * Query key factories. Every key starts with its domain so a mutation can
 * invalidate a whole domain (`qk.jobs.all`) or one record (`qk.jobs.detail(id)`).
 */
export type QueryFilters = Record<string, unknown>

const withFilters = (filters?: QueryFilters) => filters ?? {}

export const qk = {
  meta: {
    all: ['meta'] as const,
    enums: () => ['meta', 'enums'] as const,
    health: () => ['meta', 'health'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (filters?: QueryFilters) => ['users', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    list: (filters?: QueryFilters) => ['jobs', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
    metrics: (id: string) => ['jobs', 'detail', id, 'metrics'] as const,
    participants: (id: string) => ['jobs', 'detail', id, 'participants'] as const,
    versions: (id: string) => ['jobs', 'detail', id, 'versions'] as const,
    version: (id: string, version: number) => ['jobs', 'detail', id, 'versions', version] as const,
    kanban: (id: string, filters?: QueryFilters) =>
      ['jobs', 'detail', id, 'kanban', withFilters(filters)] as const,
    facets: () => ['jobs', 'facets'] as const,
  },
  skills: {
    all: ['skills'] as const,
    suggest: (query: string) => ['skills', 'suggest', query] as const,
  },
  resumes: {
    all: ['resumes'] as const,
    batches: () => ['resumes', 'batches'] as const,
    batch: (id: string) => ['resumes', 'batch', id] as const,
  },
  searches: {
    all: ['searches'] as const,
    byJob: (jobId: string) => ['searches', 'byJob', jobId] as const,
    detail: (id: string) => ['searches', 'detail', id] as const,
  },
  candidates: {
    all: ['candidates'] as const,
    list: (filters?: QueryFilters) => ['candidates', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['candidates', 'detail', id] as const,
  },
  applications: {
    all: ['applications'] as const,
    list: (filters?: QueryFilters) => ['applications', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
    moves: (id: string) => ['applications', 'detail', id, 'moves'] as const,
  },
  sources: {
    all: ['sources'] as const,
    health: () => ['sources', 'health'] as const,
  },
  activities: {
    all: ['activities'] as const,
    byJob: (jobId: string, filters?: QueryFilters) =>
      ['activities', 'byJob', jobId, withFilters(filters)] as const,
    byApplication: (applicationId: string) =>
      ['activities', 'byApplication', applicationId] as const,
    byCandidate: (candidateId: string) => ['activities', 'byCandidate', candidateId] as const,
  },
  interviews: {
    all: ['interviews'] as const,
    list: (filters?: QueryFilters) => ['interviews', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['interviews', 'detail', id] as const,
  },
  communications: {
    all: ['communications'] as const,
    list: (filters?: QueryFilters) => ['communications', 'list', withFilters(filters)] as const,
  },
  email: {
    all: ['email'] as const,
    config: () => ['email', 'config'] as const,
    preview: (applicationId: string, templateId: string) =>
      ['email', 'preview', applicationId, templateId] as const,
  },
  offers: {
    all: ['offers'] as const,
    list: (filters?: QueryFilters) => ['offers', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['offers', 'detail', id] as const,
  },
  onboardings: {
    all: ['onboardings'] as const,
    list: (filters?: QueryFilters) => ['onboardings', 'list', withFilters(filters)] as const,
    detail: (id: string) => ['onboardings', 'detail', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (filters?: QueryFilters) => ['notifications', 'list', withFilters(filters)] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    funnel: (jobId?: string) => ['dashboard', 'funnel', jobId ?? 'all'] as const,
    recentActivity: () => ['dashboard', 'recent-activity'] as const,
    topCandidates: () => ['dashboard', 'top-candidates'] as const,
    upcomingInterviews: () => ['dashboard', 'upcoming-interviews'] as const,
  },
} as const
