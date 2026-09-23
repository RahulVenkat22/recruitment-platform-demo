/**
 * Domain aliases over the generated OpenAPI types (`make openapi` -> api.d.ts),
 * plus the few shapes the schema does not describe: the error envelope and the
 * generic pagination wrapper. Import these rather than reaching into
 * `components['schemas']` from feature code.
 */
import type { components } from '@/types/api'

type Schemas = components['schemas']

export type UserRole = Schemas['UserRoleEnum']

/** The profile returned by `POST /auth/login`, `POST /auth/refresh` and `GET /auth/me`. */
export type SessionUser = Schemas['User']

export type LoginRequest = Schemas['LoginRequest']

export type AuthResponse = Schemas['AuthResponse']

/** Editable fields of `PATCH /auth/me/`. */
export type ProfilePatch = Schemas['PatchedProfileUpdateRequest']

export type ChangePasswordRequest = Schemas['ChangePasswordRequest']

/** The single error envelope from plan.md 6.10 (not part of the OpenAPI schema). */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  }
}

/** Generic form of the `Paginated<Name>List` schemas. */
export interface Paginated<T> {
  count: number
  next?: string | null
  previous?: string | null
  results: T[]
}

/** Compact user row from `GET /users/`. */
export type UserRow = Schemas['UserSummary']

/** Anyone rendered as an avatar: users, participants, candidates. */
export interface Person {
  id: string
  name: string
  avatar_url?: string | null
  designation?: string | null
}

export function personFromUser(
  user: Pick<SessionUser, 'id' | 'avatar_url' | 'designation'> &
    Partial<Pick<SessionUser, 'full_name' | 'first_name' | 'last_name'>>,
): Person {
  const name = user.full_name ?? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return { id: user.id, name, avatar_url: user.avatar_url, designation: user.designation }
}

// ------------------------------------------------------------------ meta/enums

export type KeyLabel = Schemas['KeyLabel']

export type ColorToken = Schemas['ColorToken']

export type KanbanColumnMeta = Schemas['KanbanColumn']

/** Body of `GET /meta/enums/` (plan.md 6.4, 7.2). */
export type EnumCatalogue = Schemas['MetaEnums']
export type Country = Schemas['Country']
export type CountryCities = Schemas['CountryCities']

// The enum keys below are string-typed in the schema; these unions are the
// plan.md 6.4 vocabulary and feed the typed fallback tables in lib/enums.ts.

export type ApplicationStatus =
  | 'new'
  | 'ai_shortlisted'
  | 'hr_review'
  | 'contact_pending'
  | 'contacted'
  | 'phone_screening'
  | 'interview_scheduled'
  | 'technical_interview'
  | 'hr_interview'
  | 'final_interview'
  | 'selected'
  | 'offer_sent'
  | 'offer_accepted'
  | 'onboarding'
  | 'onboarded'
  | 'rejected'
  | 'withdrawn'
  | 'on_hold'

export type CandidateSource = 'internal' | 'referral' | 'naukri' | 'linkedin'

export type ActivityCategory =
  | 'job_description'
  | 'candidate_search'
  | 'candidate_shortlisted'
  | 'candidate_contact'
  | 'interview'
  | 'interview_feedback'
  | 'candidate_selected'
  | 'offer'
  | 'onboarding'
  | 'decision'

export type JDStatus = 'draft' | 'open' | 'on_hold' | 'closed' | 'force_closed' | 'archived'

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

// ------------------------------------------------------------------ jobs (plan.md 6.10)

export type JDStatusKey = Schemas['JDStatusEnum']
export type WorkMode = Schemas['WorkModeEnum']
export type EmploymentType = Schemas['EmploymentTypeEnum']
export type ParticipantRole = Schemas['ParticipantRoleEnum']

/** A row of `GET /job-descriptions/`. */
export type JobRow = Schemas['JobDescriptionRow']

/** `GET /job-descriptions/{id}/`: the row plus long text, participants, metrics and permissions. */
export type JobDetail = Schemas['JobDescriptionDetail']

export type JobCreateRequest = Schemas['JobDescriptionCreateRequest']
export type JobUpdateRequest = Schemas['PatchedJobDescriptionUpdateRequest']

export type Participant = Schemas['Participant']
export type ParticipantInput = Schemas['ParticipantInputRequest']

export type PipelineCounts = Schemas['PipelineCounts']
export type JobMetrics = Schemas['Metrics']
export type JobPermissions = Schemas['JobPermissions']
export type JobFacets = Schemas['JobFacets']
export type FacetOption = Schemas['FacetOption']
/** `POST /job-descriptions/extract/`: the fields the AI read from an uploaded JD file. */
export type JobExtraction = Schemas['JobExtraction']
export type JobExtractedFields = Schemas['JobExtractedFields']
export type SkillSuggestion = Schemas['SkillSuggestion']

export type JobVersion = Schemas['VersionRow']

/** The content fields captured in a version snapshot (plan.md 6.3 JobDescriptionVersion). */
export interface JobSnapshot {
  title: string
  department: string
  location: string
  work_mode: WorkMode
  employment_type: EmploymentType
  experience_min_years: number
  experience_max_years: number
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  required_skills: string[]
  preferred_skills: string[]
  education_requirements: string
  responsibilities: string
  qualifications: string
  additional_requirements: string
  description: string
  domain: string | null
  openings: number
}

export type JobVersionDetail = Omit<Schemas['VersionDetail'], 'snapshot'> & {
  snapshot: JobSnapshot
}

// ------------------------------------------------------------- activities (plan.md 6.3, 6.10)

/** One timeline row from `GET /activities/`. */
export type Activity = Schemas['Activity']

/** A keyset page of activities plus per-category counts. */
export type ActivityPage = Schemas['ActivityPage']

/** The candidate reference carried by candidate-level activities. */
export type CandidateRef = Schemas['CandidateRef']

// ---------------------------------------------- searches and applications (plan.md 6.10)

export type ProviderHealth = Schemas['ProviderHealth']
export type SearchRun = Schemas['SearchRun']
export type SearchRunStatus = Schemas['SearchRunStatusEnum']

/** Where a background search run is; `SearchRun.phase` is one of these (or '' before it starts). */
export type SearchRunPhase =
  'queued' | 'analysing' | 'retrieving' | 'scoring' | 'evaluating' | 'finalising' | 'done'

/** `SearchRun.progress`: the live line the loader shows, with a counter when there is one. */
export interface SearchProgress {
  message?: string
  current?: number
  total?: number
}

/** `SearchRun.query_plan`: what the AI read in the job description before searching. */
export interface QueryPlan {
  title?: string
  required_skills?: string[]
  preferred_skills?: string[]
  inferred_skills?: string[]
  min_years?: number
  max_years?: number
  domains?: string[]
  seniority?: string
  ideal_candidate?: string
  queries?: string[]
  source?: 'llm' | 'structured'
  model?: string
  error?: string
}

/** One resume excerpt the evaluator was shown. */
export interface SemanticEvidence {
  section: string
  excerpt: string
  similarity?: number
}

/** `CandidateMatch.semantic_details`: the signals and findings behind a hybrid match. */
export interface SemanticDetails {
  rule_pct?: number
  retrieval_score?: number | null
  llm_score?: number | null
  matched_skills?: string[]
  missing_skills?: string[]
  matching_experience?: string[]
  concerns?: string[]
  meets_experience_requirement?: boolean
  dropped_claims?: string[]
  evidence?: SemanticEvidence[]
  model?: string
  seconds?: number
  /** Set when the explanation is a search-time summary of the scoring facts, not a full evaluation. */
  summary_model?: string
}
export type SearchResponse = Schemas['SearchResponse']
export type JobRef = Schemas['JobRef']
export type CandidateSkillRef = Schemas['CandidateSkillRef']
export type CandidateSummary = Schemas['CandidateSummary']
export type CandidateMatch = Schemas['CandidateMatch']

/** A ranked row of `GET /applications/`. */
export type ApplicationRow = Schemas['ApplicationRow']
export type ApplicationDetail = Schemas['ApplicationDetail']

/** One allowed status move from `GET /applications/{id}/moves/` (plan.md 6.5). */
export type Move = Schemas['Move']
export type TransitionResponse = Schemas['TransitionResponse']
export type BulkTransitionResponse = Schemas['BulkTransitionResponse']

// ------------------------------------------------------------- candidates (plan.md 6.10)

export type CandidateRow = Schemas['CandidateRow']
export type CandidateDetail = Schemas['CandidateDetail']
export type CandidateApplication = Schemas['CandidateApplication']
export type CandidateSkill = Schemas['CandidateSkill']
export type CandidateExperience = Schemas['CandidateExperience']
export type CandidateEducation = Schemas['CandidateEducation']
export type CandidateCertification = Schemas['CandidateCertification']
export type CandidateSourceDetail = Schemas['CandidateSource']
export type CandidateWriteRequest = Schemas['CandidateWriteRequest']
export type ResumeDocumentSummary = Schemas['ResumeDocumentSummary']
export type ResumeLink = Schemas['ResumeLink']

// ------------------------------------------------------------- resume uploads

export type IntakeFile = Schemas['IntakeFile']
export type IntakeResult = Schemas['IntakeResult']
export type UploadedDocument = Schemas['UploadedDocument']
export type UploadBatch = Schemas['UploadBatch']
export type UploadBatchSummary = Schemas['UploadBatchSummary']
export type CandidatePatch = Schemas['PatchedCandidateWriteRequest']

// ------------------------------- interviews, communications, offers, onboardings (plan.md 6.10)

/** The candidate, JD and status an interview or offer row carries so it renders alone. */
export type ApplicationRef = Schemas['ApplicationRef']

export type Interview = Schemas['Interview']
export type InterviewCreateRequest = Schemas['InterviewCreateRequest']
export type InterviewPatch = Schemas['PatchedInterviewUpdateRequest']
export type InterviewRescheduleRequest = Schemas['InterviewRescheduleRequest']
export type FeedbackRequest = Schemas['FeedbackRequest']
export type InterviewRound = Schemas['InterviewRoundEnum']
export type InterviewMode = Schemas['InterviewModeEnum']
export type InterviewStatus = Schemas['InterviewStatusEnum']
export type Recommendation = Schemas['RecommendationEnum']

export type Communication = Schemas['Communication']
export type CommunicationCreateRequest = Schemas['CommunicationCreateRequest']
export type EmailConfig = Schemas['EmailConfig']
export type MessageTemplate = Schemas['MessageTemplate']
export type EmailPreview = Schemas['EmailPreview']
export type EmailSendRequest = Schemas['EmailSendRequest']
export type BulkEmailRequest = Schemas['BulkEmailRequest']
export type BulkEmailResult = Schemas['BulkEmailResult']
export type MessageTemplateRequest = Schemas['MessageTemplateRequest']
export type MessageTemplatePatch = Schemas['PatchedMessageTemplateRequest']
export type EmailDraftBrief = Schemas['EmailDraftBriefRequest']
export type EmailDraft = Schemas['EmailDraft']
export type EmailPreviewRequest = Schemas['EmailPreviewRequestRequest']
export type PhoneCall = Schemas['PhoneCall']
export type PhoneCallCreateRequest = Schemas['PhoneCallCreateRequest']
export type BulkPhoneCallRequest = Schemas['BulkPhoneCallRequest']
export type BulkPhoneCallResult = Schemas['BulkPhoneCallResult']
export type CallReplyRequest = Schemas['CallReplyRequest']
export type VoiceConfig = Schemas['VoiceConfig']

export type Offer = Schemas['Offer']
export type OfferCreateRequest = Schemas['OfferCreateRequest']
export type OfferPatch = Schemas['PatchedOfferUpdateRequest']
export type OfferStatus = Schemas['OfferStatusEnum']

export type Onboarding = Schemas['Onboarding']
export type OnboardingCreateRequest = Schemas['OnboardingCreateRequest']
export type OnboardingPatch = Schemas['PatchedOnboardingUpdateRequest']
export type ChecklistItem = Schemas['ChecklistItem']
export type OnboardingStatus = Schemas['OnboardingStatusEnum']

// ------------------------------------------------------------------ kanban (plan.md 9.7)

export type KanbanBoard = Schemas['KanbanBoard']
export type KanbanColumnData = Schemas['KanbanColumnData']
/** A ranked row plus the pending next action for the amber clock. */
export type KanbanCard = Schemas['KanbanCard']

// ------------------------------------------------ notifications and dashboard (plan.md 6.10)

export type Notification = Schemas['Notification']
export type NotificationType = Schemas['NotificationTypeEnum']
export type UnreadCount = Schemas['UnreadCount']
export type DashboardSummary = Schemas['DashboardSummary']
export type DashboardMetric = Schemas['DashboardMetric']
export type DashboardTrends = Schemas['DashboardTrends']
export type TrendPoint = Schemas['TrendPoint']
export type DashboardPipeline = Schemas['DashboardPipeline']
export type JobPipelineRow = Schemas['JobPipelineRow']
export type KeyCount = Schemas['KeyCount']
export type StageCount = Schemas['StageCount']
export type Funnel = Schemas['Funnel']
export type FunnelStage = Schemas['FunnelStage']
export type InterviewInsights = Schemas['InterviewInsights']
export type InterviewerLoad = Schemas['InterviewerLoad']
export type AttentionCounts = Schemas['AttentionCounts']
export type TeamMember = Schemas['TeamMember']

// ------------------------------------------------------------------ support tickets

/** A row of `GET /support/tickets/`. */
export type TicketRow = Schemas['TicketRow']
/** `GET /support/tickets/{id}/`: the row plus text, timeline and permissions. */
export type TicketDetail = Schemas['TicketDetail']
export type TicketEvent = Schemas['TicketEvent']
export type TicketPermissions = Schemas['TicketPermissions']
export type TicketCreateRequest = Schemas['TicketCreateRequest']
export type TicketPatch = Schemas['PatchedTicketUpdateRequest']
export type TicketCommentRequest = Schemas['TicketCommentRequest']
export type TicketTransitionRequest = Schemas['TicketTransitionRequest']
export type TicketAssignRequest = Schemas['TicketAssignRequest']
export type TicketSummary = Schemas['TicketSummary']
export type TicketCategory = Schemas['TicketCategoryEnum']
export type TicketEventKind = Schemas['TicketEventKindEnum']
