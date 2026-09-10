# AI Recruitment & Requirement Agent: Implementation Plan

| | |
|---|---|
| Status | Draft for review, no code written yet |
| Date | 2026-09-11 |
| Source | `AI Recruitment & Requirement Agent — Updated Project Prompt.md` (40 sections) |
| Brand | Aimious (assets in `../aimious-logo-hd`, tokens borrowed from `../public-webiste`) |
| Sibling reference | `../naukri-web-scrap-poc` (repo layout, Makefile, docker-compose, provider layering) |

This document is the single source of truth for what gets built, how it is structured, what every page and component looks like, and in what order the work happens. Section 21 maps every section of the original prompt to the part of this plan that covers it.

---

## 1. Decisions already locked

| Decision | Choice | Reason |
|---|---|---|
| Frontend | Vite + React + TypeScript | Your call |
| Backend | Django + Django REST Framework (DRF) | Your call, approach A |
| Database | PostgreSQL 16 | Prompt requirement |
| API style | Separate SPA and API, JSON over `/api/v1/`, JWT | Approach A |
| UI kit | Tailwind CSS v4 + shadcn/ui (Radix primitives) | Bespoke look, not admin-template |
| Avatars | Placeholder photo URLs + initials fallback | Your call |
| Kanban board | Included, drag and drop, status is the single source of truth | Your call |
| JD version history | Simple version list tab with view | Your call |
| External integrations | Mock providers only, real ones later | Prompt requirement |
| Theme | Light only, tokens as CSS variables so dark can be added later | HR desktop workflow, keeps scope tight |

---

## 2. Goals and non-goals

**Goals**

1. A demo-ready recruitment platform that walks the full journey: Login → JDs → Create JD with "People Involved in the Recruitment" → JD timeline with live filters → Search candidates → AI match percentage → Ranked candidates → Candidate detail → HR contact → Interviews → Selection → Offer → Onboarding.
2. Every important action is stored in PostgreSQL and appears on a timeline with who did it and when.
3. A premium, consistent visual system: circular avatars everywhere, avatar groups, status badges, match rings, metric cards, skeleton loaders, empty and error states, confirmation dialogs, tooltips, subtle motion.
4. Architecture that lets Naukri, LinkedIn, referral email, and a real AI matcher be plugged in without restructuring.

**Non-goals for this MVP**

- Real scraping or API calls to Naukri, LinkedIn, or any email provider.
- Sending real email (password reset, notifications).
- Resume file upload and parsing (resume is stored as text plus a URL placeholder).
- Background worker (Celery or RQ). Search runs synchronously, but the data model is worker-ready.
- Dark mode toggle, internationalisation, multi-tenant organisations.

---

## 3. Tech stack

Versions below were checked against PyPI and npm on 2026-09-11. Exact pins are written at scaffold time; the majors are fixed here.

### 3.1 Backend

| Package | Version target | Role |
|---|---|---|
| Python | 3.12 (installed) | Runtime |
| Django | 5.2 LTS | Web framework, ORM, auth, admin |
| djangorestframework | 3.18 | REST API |
| djangorestframework-simplejwt | 5.5 | JWT access and refresh tokens |
| django-filter | 26.1 | Query-string filtering |
| drf-spectacular | 0.30 | OpenAPI 3 schema and Swagger UI |
| django-cors-headers | 4.9 | CORS for the Vite dev origin |
| django-environ | 0.14 | Typed settings from environment |
| psycopg[binary] | 3.3 | PostgreSQL driver |
| argon2-cffi | 25.1 | Argon2 password hashing |
| Faker | 40.x | Seed data generation |
| pytest, pytest-django, pytest-cov | latest | Tests |
| ruff | latest | Lint and format |
| gunicorn, whitenoise | latest | Production serving of API and admin static files |

Why Django 5.2 and not 6.1: Django 6.1.1 is the newest release, but SimpleJWT 5.5.1 declares support only up to Django 5.2. Django 5.2 is an LTS release supported until April 2028, and every other package above lists 5.2 as supported.

### 3.2 Frontend

| Package | Version target | Role |
|---|---|---|
| Node | 24 (installed) | Toolchain |
| Vite | 8.x | Dev server and bundler |
| React, react-dom | 19.x | UI |
| TypeScript | 5.9.x (pinned below 7) | Types. TypeScript 7 is a new compiler; tooling support is not yet uniform |
| Tailwind CSS, @tailwindcss/vite | 4.x | Styling via CSS-first config |
| shadcn CLI | 4.x | Copies Radix-based components into `src/components/ui` |
| react-router | 7.x | Client routing (data APIs not used, plain component routes) |
| @tanstack/react-query | 5.x | Server state, caching, optimistic updates |
| @tanstack/react-table | 8.x | Headless tables (matches the shadcn data-table recipe) |
| axios | 1.x | HTTP client with refresh interceptor |
| zustand | 5.x | Tiny store for auth session and UI preferences |
| react-hook-form + @hookform/resolvers + zod | 7.x / 5.x / 4.x | Forms and validation |
| @dnd-kit/core + @dnd-kit/sortable | 6.x / 10.x | Kanban drag and drop, keyboard accessible |
| recharts | 3.x | Funnel and dashboard charts |
| motion | 13.x (`import { motion } from "motion/react"`) | Subtle animations |
| lucide-react | latest | Icons |
| date-fns | 4.x | Date formatting |
| @fontsource-variable/geist | 5.x | Brand typeface, self-hosted |
| vitest, @testing-library/react, @testing-library/user-event, jsdom | latest | Component tests |
| openapi-typescript | latest | Generates `src/types/api.d.ts` from the DRF schema |
| eslint, typescript-eslint, prettier | latest | Lint and format |

### 3.3 Infrastructure and tooling

| Tool | Use |
|---|---|
| Docker Compose | PostgreSQL for dev; full stack (postgres, api, web via nginx) for demo |
| Makefile | One command per common task, mirrors the Naukri POC |
| GitHub-style `.gitignore`, `.editorconfig` | Hygiene |
| `scripts/dev.sh` | Runs API and Vite together with a shared `.env` |

---

## 4. Repository layout

```
Demo-Session_UI/
├── plan.md                          ← this file
├── README.md                        ← run instructions, demo accounts, screenshots
├── ARCHITECTURE.md                  ← layering rules and extension points (written in phase 10)
├── Makefile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .editorconfig
├── scripts/
│   └── dev.sh
├── backend/
│   ├── manage.py
│   ├── pyproject.toml               ← ruff + pytest config
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── Dockerfile
│   ├── config/                      ← Django project package
│   │   ├── settings/ base.py, dev.py, test.py, prod.py
│   │   ├── urls.py
│   │   ├── asgi.py, wsgi.py
│   │   └── api_router.py            ← mounts every app's router under /api/v1/
│   ├── common/                      ← shared: base models, pagination, exception handler, permissions, enums
│   ├── accounts/                    ← custom User, auth views, password reset request, users API
│   ├── jobs/                        ← JobDescription, versions, participants
│   ├── candidates/                  ← Candidate and child tables, candidates API
│   ├── pipeline/                    ← Application, CandidateMatch, SearchRun, Interview, Communication, Offer, Onboarding, transitions
│   ├── sourcing/                    ← CandidateSourceProvider ABC, DTOs, registry, internal + mock providers, SearchService
│   ├── matching/                    ← MatchEngine protocol, RuleBasedEngine, skill normaliser
│   ├── activity/                    ← Activity model, record_activity(), activities API
│   ├── notifications/               ← Notification model and API
│   ├── audit/                       ← AuditLog model, middleware
│   ├── dashboard/                   ← aggregate endpoints
│   ├── seed/                        ← management command seed_demo + generators
│   └── tests/                       ← pytest suites per app + API flow tests
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
    ├── components.json              ← shadcn config
    ├── Dockerfile, nginx.conf
    ├── public/ favicon, aimious mark
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── app/                     ← router.tsx, providers.tsx, layout/ (AppShell, Sidebar, TopBar)
        ├── lib/                     ← api.ts, auth-store.ts, query-keys.ts, format.ts, utils.ts, enums.ts
        ├── types/                   ← api.d.ts (generated), domain.ts (hand-written helpers)
        ├── components/ui/           ← shadcn components (button, card, dialog, ...)
        ├── components/shared/       ← Avatar, AvatarGroup, StatusBadge, MatchRing, Timeline, MetricCard, ...
        ├── features/
        │   ├── auth/  dashboard/  jobs/  search/  candidates/  pipeline/
        │   ├── interviews/  communications/  offers/  onboarding/
        │   ├── notifications/  settings/  timeline/
        └── test/ setup.ts, render.tsx (test wrapper with providers)
```

Backend layering rule, enforced by code review and an import-linter check in `make lint`:

```
api views/serializers  →  services  →  repositories / providers / engines  →  models
```

Views never contain workflow logic. Providers never import the ORM. The matching engine never imports Django models; it works on plain dataclasses.

---

## 5. Runtime, ports, configuration, commands

### 5.1 Ports

The Naukri POC uses 5433, 8100, 8101, 5174. Ports 8000 and 8080 are used by unrelated containers. This project uses:

| Service | Dev (host) | Docker demo (host) |
|---|---|---|
| PostgreSQL | 5434 | 5434 |
| Django API | 8200 | 8200 |
| Vite dev server | 5175 | not used |
| nginx serving the built SPA | not used | 8201 |

Vite proxies `/api` to `http://localhost:8200` in dev. nginx does the same in Docker. The SPA therefore always calls a same-origin `/api/v1/...`, so no CORS is needed in the browser path. CORS stays enabled for the Vite origin as a fallback.

### 5.2 Environment variables (`.env.example`)

```
# Django
DJANGO_SETTINGS_MODULE=config.settings.dev
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://recruit:recruit@localhost:5434/recruitment_demo
CORS_ALLOWED_ORIGINS=http://localhost:5175,http://localhost:8201

# Auth
JWT_ACCESS_MINUTES=15
JWT_REFRESH_HOURS=12
JWT_REFRESH_REMEMBER_DAYS=14
JWT_COOKIE_SECURE=false          # true in prod
JWT_COOKIE_SAMESITE=Lax

# Recruitment
MATCH_ENGINE=rule_based          # future: claude
AI_SHORTLIST_THRESHOLD=80        # overall match >= this becomes "AI Shortlisted"
SEARCH_RESULT_LIMIT_PER_SOURCE=60
CANDIDATE_SOURCE_PROVIDERS=internal,referral,naukri,linkedin

# Seed
SEED_RANDOM_SEED=42
SEED_ANCHOR_DATE=2026-09-11      # timelines end on this date

# Frontend build
VITE_API_BASE_URL=               # empty = same origin
```

### 5.3 Makefile targets

| Target | Does |
|---|---|
| `make setup` | Copies `.env`, creates `backend/.venv`, installs Python and npm deps |
| `make db-up` / `db-down` / `db-shell` | Postgres container lifecycle |
| `make migrate` / `make makemigrations` | Django migrations |
| `make seed` | `manage.py seed_demo` (idempotent, `--reset` wipes first) |
| `make reset-db` | Drop, recreate, migrate, seed |
| `make api` | Django dev server on 8200 |
| `make web` | Vite on 5175 |
| `make dev` | Postgres + API + web together |
| `make openapi` | Dumps schema to `frontend/openapi.json` and regenerates `src/types/api.d.ts` |
| `make test` / `test-api` / `test-web` | Test suites |
| `make lint` / `format` / `typecheck` | Ruff, ESLint, Prettier, tsc |
| `make docker-up` / `docker-down` / `docker-logs` | Full stack via compose |
| `make demo` | `docker-up` then seed, prints demo URL and accounts |

---

## 6. Backend architecture

### 6.1 Django apps and responsibilities

| App | Owns |
|---|---|
| `common` | `UUIDTimestampedModel` base, `StandardPagination` (page/page_size, max 100), `CursorActivityPagination`, `api_exception_handler`, role permission classes, `enums.py` with every choice set and its display label |
| `accounts` | `User` (custom, email login), JWT views with cookie refresh, `/auth/me`, users listing for the people picker, `PasswordResetRequest` |
| `jobs` | `JobDescription`, `JobDescriptionVersion`, `RecruitmentParticipant`, `JobService` (create with participants, update with versioning, duplicate, archive, metrics) |
| `candidates` | `Candidate`, `CandidateSkill`, `CandidateExperience`, `CandidateEducation`, `CandidateCertification`, `CandidateSource`, `CandidateRepository.upsert_from_dto()` |
| `pipeline` | `Application`, `CandidateMatch`, `SearchRun`, `Interview`, `Communication`, `Offer`, `Onboarding`, `PipelineService.transition()`, `InterviewService`, `OfferService`, `OnboardingService`, Kanban aggregation |
| `sourcing` | `CandidateSourceProvider` ABC, `SearchCriteria`, `NormalizedCandidate` DTOs, registry, `InternalDatabaseProvider`, `MockReferralProvider`, `MockNaukriProvider`, `MockLinkedInProvider`, `SearchService.run()` |
| `matching` | `MatchEngine` protocol, `RuleBasedEngine`, `skills.py` normaliser and synonyms, `explain.py` strengths and gaps text |
| `activity` | `Activity`, `record_activity()`, category mapping, activities API |
| `notifications` | `Notification`, `notify()` helper, API |
| `audit` | `AuditLog`, `AuditMiddleware` for mutating requests and auth events |
| `dashboard` | Read-only aggregate endpoints |
| `seed` | `seed_demo` command plus generator modules per entity |

### 6.2 Request flow example: dragging a Kanban card

1. Browser `POST /api/v1/applications/{id}/transition {"status":"interview_scheduled","note":"..."}`.
2. `ApplicationViewSet.transition` validates the body with `TransitionSerializer`, checks `CanManageApplication` permission (creator, participant, or HR admin of the JD).
3. `PipelineService.transition(application, new_status, actor, note)`:
   - checks the move against the transition rules (section 6.5),
   - updates `status`, `stage_entered_at`, `last_activity_at`, stores `previous_status` when moving to on hold,
   - calls `record_activity()` with the right category and a human title such as "Priya moved John Doe from HR Review to Interview Scheduled",
   - calls `notify()` for the application owner and JD owner if they are not the actor,
   - all inside one `transaction.atomic()`.
4. `AuditMiddleware` writes an `AuditLog` row for the request.
5. Response returns the updated application plus the created activity so the UI can append it without refetching.

### 6.3 Data model

Conventions: UUID primary keys, `created_at` and `updated_at` on every table via the base model, `timestamptz` everywhere, `on_delete` shown per foreign key, enums stored as short `varchar` with Django choices. Names are Django model names; tables get the `app_model` default names.

#### accounts.User

| Column | Type | Notes |
|---|---|---|
| id | uuid | pk |
| email | varchar(254) | unique, login field (case-insensitive unique index) |
| password | varchar | Argon2 |
| first_name, last_name | varchar(80) | |
| designation | varchar(120) | e.g. "HR Manager" |
| department | varchar(120) | e.g. "Human Resources", "Engineering" |
| avatar_url | text, null | placeholder photo; null triggers initials fallback |
| role | enum | `hr_admin`, `hr`, `interviewer`, `employee` |
| phone | varchar(32), null | |
| timezone | varchar(64) | default `Asia/Kolkata` |
| is_active, is_staff, is_superuser, last_login | Django defaults | |

#### accounts.PasswordResetRequest

`id, email, token_hash, requested_at, expires_at, used_at (null), ip_address`. Forgot-password stores a row and returns 202. No email is sent in this MVP.

#### jobs.JobDescription

| Column | Type | Notes |
|---|---|---|
| title | varchar(200) | |
| department | varchar(120) | |
| location | varchar(160) | |
| work_mode | enum | `onsite`, `hybrid`, `remote` |
| employment_type | enum | `full_time`, `part_time`, `contract`, `internship` |
| experience_min_years, experience_max_years | smallint | |
| salary_min, salary_max | integer, null | annual |
| salary_currency | char(3) | default `INR` |
| required_skills | text[] | normalised lowercase keys, display handled by the skill dictionary |
| preferred_skills | text[] | |
| education_requirements | text | |
| responsibilities | text | one per line |
| qualifications | text | one per line |
| additional_requirements | text | |
| description | text | full JD body |
| domain | varchar(120), null | e.g. "healthcare", "fintech", used by domain match |
| status | enum | `draft`, `open`, `on_hold`, `closed`, `archived` |
| openings | smallint | default 1 |
| created_by | FK User PROTECT | |
| updated_by | FK User SET_NULL | |
| published_at | timestamptz, null | set on draft → open |
| current_version | integer | default 1 |

Indexes: `(status)`, `(created_by)`, `(department)`, GIN on `required_skills`, trigram or `ILIKE` index on `title` for search.

#### jobs.JobDescriptionVersion

`job_description FK CASCADE, version int, snapshot jsonb (all content fields), change_summary varchar(300), created_by FK`. Unique `(job_description, version)`. A version is written on create (v1) and on every update that changes a content field.

#### jobs.RecruitmentParticipant

`job_description FK CASCADE, user FK CASCADE, role_in_recruitment enum (owner, recruiter, hiring_manager, interviewer, observer), added_by FK SET_NULL`. Unique `(job_description, user)`. The creator is inserted automatically as `owner`.

#### candidates.Candidate

| Column | Type | Notes |
|---|---|---|
| full_name | varchar(160) | |
| email | varchar(254) | unique, lowercase |
| phone | varchar(32) | |
| location | varchar(160) | |
| avatar_url | text, null | |
| headline | varchar(200) | "Senior Backend Engineer at Zoho" |
| current_company, current_title | varchar(160) | |
| total_experience_years | numeric(4,1) | |
| summary | text | professional summary used by responsibility match |
| resume_url | text, null | placeholder link |
| resume_text | text | plain text resume body |
| linkedin_url, github_url | text, null | placeholders |
| notice_period_days | smallint, null | |
| current_ctc, expected_ctc | integer, null | |

Child tables (all `candidate FK CASCADE`):

- **CandidateSkill**: `skill varchar(80)` (normalised key), `display_name`, `proficiency smallint 1..5`, `years numeric(3,1) null`, `is_primary bool`. Unique `(candidate, skill)`. Index on `skill`.
- **CandidateExperience**: `company, title, domain varchar(80) null, start_date, end_date null, is_current, description text`.
- **CandidateEducation**: `degree` (B.Tech, B.E, M.Tech, MCA, B.Sc, M.Sc, MBA, PhD), `field, institution, start_year, end_year, grade null`.
- **CandidateCertification**: `name, issuer, issued_year, credential_url null`.
- **CandidateSource**: `source enum (internal, referral, naukri, linkedin)`, `source_reference varchar(255)` (external id or profile URL), `referred_by FK User null`, `discovered_at`, `raw_payload jsonb null` (reserved for real providers). Unique `(candidate, source)`.

#### pipeline.Application (one candidate on one JD)

| Column | Type | Notes |
|---|---|---|
| candidate | FK CASCADE | |
| job_description | FK CASCADE | |
| status | enum (18 values, section 6.4) | the single source of truth |
| previous_status | enum, null | restored when leaving `on_hold` |
| owner | FK User SET_NULL | recruiter responsible |
| search_run | FK SearchRun SET_NULL, null | which search found it |
| entry_source | enum source | provider that surfaced it |
| stage_entered_at | timestamptz | |
| last_activity_at | timestamptz | |
| rejection_reason, hold_reason | text, null | |
| notes | text | |
| is_starred | bool | |

Unique `(candidate, job_description)`. Indexes `(job_description, status)`, `(owner)`, `(last_activity_at)`.

#### pipeline.CandidateMatch

`application OneToOne CASCADE, overall_pct numeric(5,2), skills_score, experience_score, education_score, domain_score, responsibility_score numeric(5,2), matched_required_skills text[], missing_required_skills text[], matched_preferred_skills text[], strengths jsonb (string list), gaps jsonb (string list), engine varchar(40), engine_version varchar(20), computed_at`.

#### pipeline.SearchRun

`job_description FK, requested_by FK, sources text[], status enum (pending, running, completed, partial, failed), total_found int, new_candidates int, existing_candidates int, shortlisted int, started_at, finished_at, duration_ms int, error text null`. Worker-ready: a future task queue only changes who sets `status`.

#### pipeline.Interview

`application FK CASCADE, round enum (phone_screen, technical, system_design, managerial, hr, final), sequence smallint, interviewer FK User PROTECT, scheduled_at, duration_minutes smallint default 60, mode enum (video, phone, onsite), meeting_link text null, location varchar null, status enum (scheduled, rescheduled, completed, cancelled, no_show), score numeric(3,1) null (0 to 10), feedback text, recommendation enum null (strong_proceed, proceed, hold, reject), feedback_submitted_at null, created_by FK`.

#### pipeline.Communication

`application FK CASCADE, channel enum (phone, email, linkedin, whatsapp, in_person), direction enum (outbound, inbound), outcome enum (connected, no_answer, voicemail, email_sent, replied, not_interested, callback_requested), summary varchar(300), notes text, next_action varchar(200) null, next_action_at null, performed_by FK, occurred_at`.

#### pipeline.Offer

`application OneToOne CASCADE, status enum (draft, sent, negotiating, accepted, declined, withdrawn, expired), designation varchar, annual_ctc int, currency char(3), joining_date date, expires_at null, sent_at null, responded_at null, notes text, created_by FK`.

#### pipeline.Onboarding

`application OneToOne CASCADE, status enum (not_started, documents_pending, in_progress, completed, dropped), start_date, buddy FK User null, hr_contact FK User null, checklist jsonb [{key,label,done,done_at}], completed_at null, notes text`. Default checklist: offer letter signed, documents collected, background check, laptop and accounts, day-one orientation.

#### activity.Activity

| Column | Type | Notes |
|---|---|---|
| job_description | FK CASCADE | always set, so the JD timeline is one query |
| application | FK SET_NULL, null | set for candidate-level events |
| candidate | FK SET_NULL, null | denormalised for the candidate timeline |
| category | enum (10 values, section 6.4) | what the timeline filter chips toggle |
| event_type | varchar(60) | fine-grained, e.g. `jd.created`, `application.status_changed` |
| title | varchar(200) | ready-to-render sentence, e.g. "Priya contacted John Doe" |
| description | text | optional second line |
| actor | FK User SET_NULL, null | null means system |
| metadata | jsonb | e.g. `{from:"hr_review", to:"interview_scheduled", count:127, score:8.5}` |
| occurred_at | timestamptz | seedable, defaults to now |

Indexes: `(job_description, occurred_at desc)`, `(application, occurred_at desc)`, `(candidate, occurred_at desc)`, `(category)`.

#### notifications.Notification

`recipient FK CASCADE, actor FK SET_NULL null, type enum (assignment, status_change, interview, feedback, offer, onboarding, mention, system), title, message, link_url, is_read bool, read_at null`. Index `(recipient, is_read, created_at desc)`.

#### audit.AuditLog

`actor FK SET_NULL null, action varchar(40) (login, logout, login_failed, create, update, delete, status_change, export), entity_type varchar(60), entity_id varchar(64), changes jsonb, ip_address inet, user_agent text, request_id uuid, path text, status_code smallint`.

### 6.4 Enumerations

**Application status (18), in pipeline order**

| Key | Label | Kanban column | Timeline category on entry |
|---|---|---|---|
| new | New | New | candidate_search |
| ai_shortlisted | AI Shortlisted | Shortlisted | candidate_shortlisted |
| hr_review | HR Review | New | candidate_shortlisted |
| contact_pending | Contact Pending | Contacted | candidate_contact |
| contacted | Contacted | Contacted | candidate_contact |
| phone_screening | Phone Screening | Screening | candidate_contact |
| interview_scheduled | Interview Scheduled | Interview | interview |
| technical_interview | Technical Interview | Interview | interview |
| hr_interview | HR Interview | Interview | interview |
| final_interview | Final Interview | Interview | interview |
| selected | Selected | Selected | candidate_selected |
| offer_sent | Offer Sent | Offer | offer |
| offer_accepted | Offer Accepted | Offer | offer |
| onboarding | Onboarding | Onboarding | onboarding |
| onboarded | Onboarded | Onboarding | onboarding |
| rejected | Rejected | tray | decision |
| withdrawn | Withdrawn | tray | decision |
| on_hold | On Hold | tray | decision |

**Timeline categories (10)**: the nine from the prompt plus one for negative or paused decisions, so a filter for "Candidate Selected" shows only selections.

| Key | Chip label | Dot colour |
|---|---|---|
| job_description | Job Description | slate |
| candidate_search | Candidate Search | indigo |
| candidate_shortlisted | Candidate Shortlisted | violet |
| candidate_contact | Candidate Contact | sky |
| interview | Interview | blue |
| interview_feedback | Interview Feedback | cyan |
| candidate_selected | Candidate Selected | emerald |
| offer | Offer | amber |
| onboarding | Onboarding | teal |
| decision | Rejected / On Hold | rose |

**Event types** (`event_type`, grouped by category)

- job_description: `jd.created`, `jd.updated` (metadata lists changed fields and new version), `jd.published`, `jd.status_changed`, `jd.participant_added`, `jd.participant_removed`, `jd.duplicated`, `jd.archived`
- candidate_search: `search.completed` (metadata: sources, total_found, new, shortlisted), `application.added_manually`
- candidate_shortlisted: `application.ai_shortlisted` (bulk, metadata lists names), `application.shortlisted` (manual, bulk supported), `application.status_changed` into hr_review
- candidate_contact: `communication.logged`, `application.status_changed` into contact_pending, contacted, phone_screening
- interview: `interview.scheduled`, `interview.rescheduled`, `interview.cancelled`, `application.status_changed` into any interview status
- interview_feedback: `interview.feedback_submitted` (metadata: score, recommendation)
- candidate_selected: `application.status_changed` into selected
- offer: `offer.created`, `offer.sent`, `offer.accepted`, `offer.declined`, `offer.withdrawn`
- onboarding: `onboarding.started`, `onboarding.checklist_updated`, `onboarding.completed`
- decision: `application.rejected`, `application.withdrawn`, `application.on_hold`, `application.resumed`

**Other enums**: candidate sources (internal, referral, naukri, linkedin), user roles, participant roles, interview rounds and modes, communication channels and outcomes, offer and onboarding statuses, JD statuses, work modes, employment types. All are served by `GET /api/v1/meta/enums` with labels and colour tokens so the frontend never hard-codes them (a typed fallback copy lives in `lib/enums.ts` for tests).

### 6.5 Pipeline transition rules

Order index follows the table in 6.4 (new = 0 … onboarded = 14).

| From | Allowed to | Rule |
|---|---|---|
| Any active status | Any status with a higher order index | Forward moves may skip stages (HR can go New → Contacted) |
| Any active status | The immediately previous status | One step back, note required |
| Any active status | `hr_review` | Reset to review, note required |
| Any active status except `onboarded` | `rejected`, `withdrawn`, `on_hold` | Reason required, `previous_status` stored |
| `on_hold` | `previous_status` (via "Resume") or `rejected`/`withdrawn` | |
| `rejected`, `withdrawn` | `hr_review` | HR admin only ("Reopen") |
| `onboarded` | none | Terminal |

Side effects on every transition: activity recorded, `stage_entered_at` and `last_activity_at` updated, owner and JD owner notified, audit row written. Specific triggers:

- Scheduling an interview moves the application to `interview_scheduled` if it is earlier in the pipeline, and to the round's status (`technical_interview`, `hr_interview`, `final_interview`) when the round starts (feedback submitted or explicit move).
- Logging a communication with outcome `connected` or `replied` moves `new`/`ai_shortlisted`/`hr_review`/`contact_pending` to `contacted`.
- Sending an offer moves to `offer_sent`; accepting moves to `offer_accepted`; declining moves to `withdrawn` with reason "Offer declined".
- Starting onboarding moves to `onboarding`; completing the checklist moves to `onboarded`.

### 6.6 Matching engine (rule-based v1)

Interface in `matching/engine.py`:

```python
class MatchEngine(Protocol):
    name: str
    version: str
    def score(self, jd: JDProfile, candidate: CandidateProfile) -> MatchResult: ...
```

`JDProfile` and `CandidateProfile` are dataclasses built from the ORM by `matching/adapters.py`, so the engine has no Django import and is unit-testable in isolation. `get_engine()` reads `MATCH_ENGINE`.

**Skill normalisation** (`matching/skills.py`): lowercase, strip punctuation and versions ("Python 3" → "python"), synonym map (postgres → postgresql, js → javascript, reactjs → react, node → nodejs, k8s → kubernetes, ml → machine learning, gcp → google cloud, ts → typescript, tf → tensorflow, ci/cd → cicd, restful → rest). The same normaliser is used when saving JD skills and candidate skills so comparisons are exact.

**Weights (total 100)**

| Component | Weight | Formula |
|---|---|---|
| Required skills | 35 | mean over required skills of (1.0 if matched with proficiency ≥ 3, 0.7 if matched with proficiency ≤ 2, 0 if missing) × 100 |
| Preferred skills | 10 | fraction matched × 100; 100 if the JD lists none |
| Experience | 20 | 100 inside `[min, max]`; below min: `max(0, 100 - 25 × shortfall_years)`; above max: `max(60, 100 - 10 × excess_years)` |
| Responsibilities | 15 | keyword overlap between JD responsibilities (stopwords removed, skill tokens included) and candidate summary + experience descriptions + titles; `min(100, overlap_ratio × 150)` |
| Domain | 10 | 100 if any experience domain equals the JD domain; 60 if adjacent (small adjacency map: fintech↔banking, healthcare↔pharma, ecommerce↔retail, saas↔enterprise software); 20 otherwise; 100 if the JD has no domain |
| Education | 10 | required level parsed from `education_requirements` (bachelor, master, phd); candidate's highest level ≥ required → 100; one level short → 50; none → 20; 100 if unspecified. A certification whose name overlaps a required skill adds 10, capped at 100 |

`skills_score` stored is the weighted combination of required and preferred (35 + 10 → scaled to 100) so the UI shows five bars: Skills, Experience, Education, Domain, Responsibilities.

**Explanations** (`matching/explain.py`), templated sentences, max 5 each:

- Strengths: "Strong {Skill} experience ({years} yrs, expert level)" for matched required skills with proficiency ≥ 4; "{n} years of experience fits the {min}–{max} year range"; "Relevant {domain} domain background at {company}"; "Holds {certification}"; "Covers {k} of {n} preferred skills".
- Gaps: "No {Skill} experience listed" for each missing required skill; "Limited {Skill} exposure" for proficiency ≤ 2; "{n} years below the minimum experience"; "No direct {domain} domain experience"; "{Degree} requirement not met".

Threshold: `overall_pct ≥ AI_SHORTLIST_THRESHOLD` (80) → application created as `ai_shortlisted`, otherwise `new`. Recomputing a match never changes status.

### 6.7 Candidate source providers

`sourcing/providers/base.py`:

```python
@dataclass(frozen=True)
class SearchCriteria:
    job_description_id: UUID
    title: str
    required_skills: list[str]
    preferred_skills: list[str]
    experience_min: int
    experience_max: int
    location: str
    domain: str | None
    limit: int

@dataclass
class NormalizedCandidate:
    source: str                     # internal | referral | naukri | linkedin
    external_id: str
    full_name: str
    email: str
    phone: str
    location: str
    headline: str
    current_company: str
    current_title: str
    total_experience_years: float
    skills: list[SkillDTO]          # name, proficiency, years
    experiences: list[ExperienceDTO]
    education: list[EducationDTO]
    certifications: list[CertificationDTO]
    summary: str
    avatar_url: str | None
    linkedin_url: str | None
    resume_text: str
    raw: dict

class CandidateSourceProvider(ABC):
    key: str
    display_name: str
    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]: ...
    def health(self) -> ProviderHealth: ...
```

Registry (`sourcing/registry.py`): reads `CANDIDATE_SOURCE_PROVIDERS`, maps key → dotted class path, lazy imports, exposes `get_provider(key)` and `available_providers()`.

**MVP providers**: all four read from PostgreSQL. The seeded pool holds candidates whose `CandidateSource.source` matches the provider key. Each provider filters that pool to candidates sharing at least one required skill or a similar title with the criteria, orders by a rough relevance, and yields up to `limit` `NormalizedCandidate` objects built from the rows. This proves the DTO path end to end without any network. Replacing `MockNaukriProvider` with a real one is a one-class change plus a settings entry.

**SearchService.run(jd, sources, actor)**

1. Create `SearchRun(status=running)`. Build `SearchCriteria` from the JD.
2. For each requested provider (or all when "Search All Sources"): iterate results, skip duplicates within the run by lowercase email or normalised phone.
3. `CandidateRepository.upsert_from_dto()` creates or refreshes the `Candidate` and its child rows, and ensures the `CandidateSource` row exists.
4. `Application.get_or_create(candidate, jd)`. New applications get `entry_source`, `search_run`, and status by threshold. Existing ones keep their status.
5. `MatchEngine.score()` result is upserted into `CandidateMatch`.
6. Record `search.completed` activity ("Priya searched for candidates", metadata with counts) and, if any new AI shortlists, `application.ai_shortlisted` with the top names.
7. Finalise the run with counts and duration. Return the run and the first page of ranked applications.

Runs synchronously in the request (sub-second on seeded data). Moving it to a worker later means enqueueing step 2 onward and letting the UI poll `GET /searches/{id}`; the response shape does not change.

### 6.8 Notifications

`notify(recipient, type, title, message, link_url, actor)` is called by services. Rules: participant added to a JD → assignment; status change → owner and JD owner; interview scheduled → interviewer and owner; feedback submitted → owner; offer accepted or declined → owner and JD owner; onboarding completed → participants. The actor never notifies themself. Unread count is polled every 60 seconds by the bell.

### 6.9 Authentication, authorisation, PII, audit

**Login flow**: `POST /auth/login {email, password, remember_me}` → response body has the access token (15 minutes) and the user profile; the refresh token is set as an `httpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/auth/`. Refresh lifetime is 12 hours, or 14 days when remember me is checked. `POST /auth/refresh` reads the cookie and rotates it (SimpleJWT blacklist app enabled). `POST /auth/logout` blacklists and clears the cookie. The SPA keeps the access token in memory only and silently refreshes on 401.

**Roles and permissions**

| Capability | hr_admin | hr | interviewer | employee |
|---|---|---|---|---|
| See all JDs | yes | own + participating | participating | participating |
| Create JD, manage participants | yes | yes | no | no |
| Edit, archive, duplicate JD | yes | creator or owner-role participant | no | no |
| Delete JD | yes | creator only | no | no |
| Run candidate search, transition status, log contact | yes | participant of the JD | no | no |
| Schedule interview | yes | participant | no | no |
| Submit interview feedback | yes | yes | assigned interviewer | no |
| Manage offers and onboarding | yes | participant with recruiter/owner role | no | no |
| See candidate phone and email | yes | yes | masked | masked |
| Dashboard | full | scoped to visible JDs | scoped | scoped |

Object-level checks live in `common/permissions.py` and are unit-tested per role.

**PII**: serializers mask phone (`+91 98xxx xx210`) and email (`j***@gmail.com`) for interviewer and employee roles. Resume text is only returned on the candidate detail endpoint. No candidate data is logged in application logs.

**Audit**: middleware records every non-GET request and every login attempt with actor, path, entity, and a diff of changed fields for PATCH/PUT. Retained indefinitely in the MVP.

**Other**: Argon2 hashing, Django password validators, rate limit on login (10 per minute per IP via DRF throttling), security headers (`SECURE_*`, `X-Frame-Options`, referrer policy), secrets only from environment, `DEBUG=false` in the Docker image, CSRF not needed for the JWT header path, cookie refresh protected by `SameSite` and path scoping.

### 6.10 API surface

Base path `/api/v1/`. Lists are paginated `{count, next, previous, results}` with `page` and `page_size` (default 20, max 100). Filtering via query params (django-filter), free text via `search`, sorting via `ordering`. Errors use one shape:

```json
{ "error": { "code": "validation_error", "message": "Invalid input.", "details": { "title": ["This field is required."] } } }
```

| Method and path | Purpose |
|---|---|
| **Auth** | |
| POST `auth/login` | email, password, remember_me → access token + user, sets refresh cookie |
| POST `auth/refresh` | rotate refresh cookie → new access token |
| POST `auth/logout` | blacklist and clear cookie |
| GET / PATCH `auth/me` | current user profile; editable name, phone, avatar_url, timezone |
| POST `auth/change-password` | |
| POST `auth/forgot-password` | always 202, records request |
| **Users** | |
| GET `users` | `search`, `role`, `department`; compact rows for the people picker |
| GET `users/{id}` | |
| **Job descriptions** | |
| GET `job-descriptions` | `search`, `status`, `department`, `location`, `employment_type`, `created_by`, `mine`, `ordering`; each row includes creator, participants preview (first 4 + count), and counts: candidates, shortlisted, interviewed, selected, onboarded |
| POST `job-descriptions` | body includes `participants: [{user_id, role_in_recruitment}]` and `status: draft|open` |
| GET / PATCH / DELETE `job-descriptions/{id}` | PATCH writes a version when content changes; DELETE requires `confirm=true` query param |
| POST `.../duplicate` | new draft "Copy of {title}", participants copied |
| POST `.../publish`, `.../archive`, `.../unarchive`, `.../status` | status changes with activity |
| GET `.../versions`, GET `.../versions/{n}` | version list and snapshot |
| GET / POST `.../participants`, PATCH / DELETE `.../participants/{pid}` | |
| GET `.../metrics` | total_found, shortlisted, contacted, in_interview, selected, rejected, offers_pending, onboarded |
| GET `.../kanban` | `{columns:[{key,label,statuses,count,cards:[…]}], tray:{rejected, withdrawn, on_hold}}`, supports `search`, `source`, `min_match` |
| **Searches** | |
| POST `searches` | `{job_description_id, sources:["naukri","linkedin"] or "all"}` → `{run, results}` |
| GET `searches`, GET `searches/{id}` | history per JD |
| **Applications** | |
| GET `applications` | `job_description`, `status`, `status_group`, `source`, `min_match`, `owner`, `search`, `ordering` (default `-match__overall_pct`) |
| GET `applications/{id}` | candidate summary, match, status, owner, interview count, last activity |
| POST `applications` | manual add `{candidate_id, job_description_id}` |
| POST `applications/{id}/transition` | `{status, note, reason}` → application + activity |
| POST `applications/bulk-transition` | `{ids, status, note}` → one grouped activity ("Rahul shortlisted John Doe, Jane Smith, Alex Kumar") |
| PATCH `applications/{id}` | owner, is_starred, notes |
| POST `applications/{id}/rematch` | recompute match |
| GET `applications/{id}/activities` | |
| **Candidates** | |
| GET `candidates` | `search`, `skills`, `source`, `location`, `min_exp`, `max_exp`, `status`, `job_description`, `ordering` |
| GET `candidates/{id}` | full profile with child collections and applications summary |
| POST / PATCH `candidates` | manual create (source internal) and edit |
| GET `candidates/{id}/activities` | across all their applications |
| **Interviews** | |
| GET `interviews` | `job_description`, `interviewer`, `status`, `from`, `to`, `mine` |
| POST `interviews` | `{application_id, round, interviewer_id, scheduled_at, duration_minutes, mode, meeting_link}` |
| GET / PATCH / DELETE `interviews/{id}` | |
| POST `interviews/{id}/feedback` | `{score, feedback, recommendation}` |
| POST `interviews/{id}/reschedule`, `.../cancel` | |
| **Communications** | |
| GET `communications` | `application` |
| POST `communications` | `{application_id, channel, direction, outcome, summary, notes, next_action, next_action_at, occurred_at}` |
| **Offers** | |
| GET `offers`, POST `offers`, PATCH `offers/{id}` | |
| POST `offers/{id}/send`, `.../accept`, `.../decline`, `.../withdraw` | |
| **Onboardings** | |
| GET `onboardings`, POST `onboardings`, PATCH `onboardings/{id}` | checklist toggles |
| POST `onboardings/{id}/complete` | |
| **Activities** | |
| GET `activities` | `job_description`, `application`, `candidate`, `category` (comma list), `actor`, cursor pagination by `occurred_at` (`before`, `limit` up to 200) |
| **Notifications** | |
| GET `notifications`, GET `notifications/unread-count` | |
| POST `notifications/{id}/read`, POST `notifications/read-all` | |
| **Dashboard** | |
| GET `dashboard/summary` | active JDs, total candidates, new candidates (7 days), shortlisted, interviews scheduled (next 7 days), selected, offers pending, onboarded, each with delta vs previous 7 days |
| GET `dashboard/funnel` | optional `job_description`; found → shortlisted → contacted → interviewed → selected → onboarded |
| GET `dashboard/recent-activity` | last 15 activities across visible JDs |
| GET `dashboard/top-candidates` | top 8 applications by match across open JDs |
| GET `dashboard/upcoming-interviews` | next 5 |
| **Meta** | |
| GET `meta/enums` | every enum with labels and colour tokens |
| GET `health` | db check |
| GET `/api/schema/`, `/api/docs/` | OpenAPI JSON and Swagger UI |

---

## 7. Frontend architecture

### 7.1 Application shell and routing

```
/login                                   LoginPage (public)
/                                        redirect → /dashboard
/dashboard                               DashboardPage
/jobs                                    JobListPage
/jobs/new                                JobFormPage (create)
/jobs/:id                                JobDetailPage  → tabs: overview | people | timeline | candidates | kanban | versions
/jobs/:id/edit                           JobFormPage (edit)
/search                                  SearchCandidatesPage   (?jd=<id> preselects)
/candidates                              CandidateListPage
/candidates/:id                          CandidateDetailPage → tabs: profile | match | timeline | interviews | communications  (?jd=<id> sets context)
/interviews                              InterviewsPage
/notifications                           NotificationsPage
/settings                                SettingsPage (profile, security, preferences)
*                                        NotFoundPage
```

All routes except `/login` sit under `<AppShell>` behind `<RequireAuth>`. Tab and filter state lives in the URL (`?tab=timeline&cat=interview,offer`) so any view is linkable.

### 7.2 Data layer

- `lib/api.ts`: axios instance, `baseURL` from `VITE_API_BASE_URL` or same origin, request interceptor adds `Authorization: Bearer`, response interceptor on 401 calls `/auth/refresh` once (single in-flight promise), retries, or logs out.
- `lib/auth-store.ts` (zustand): `{ user, accessToken, status: 'unknown'|'authed'|'anon', login(), logout(), setSession() }`. On app boot, `RequireAuth` calls refresh once to restore a session from the cookie.
- `lib/query-keys.ts`: factory functions, e.g. `qk.jobs.list(filters)`, `qk.jobs.detail(id)`, `qk.activities.byJob(id)`, `qk.kanban(id)`.
- Mutations invalidate precisely: a transition invalidates `applications`, `kanban`, `activities.byJob`, `jobs.detail(id)`, `dashboard.*`. Kanban drag uses optimistic update with rollback on error.
- `types/api.d.ts` generated from the OpenAPI schema by `make openapi`; hand-written helpers in `types/domain.ts` (status order, column groups).
- `lib/enums.ts` loads `/meta/enums` once at boot into the store and exposes `statusMeta(key)`, `sourceMeta(key)`, `categoryMeta(key)` with label and colour class.

### 7.3 Forms

react-hook-form with zod schemas colocated with each form. Server validation errors are mapped onto fields via `setError`. Unsaved-changes guard on the JD form.

### 7.4 Error handling and feedback

- Toasts (shadcn `sonner`) for mutation success and failure.
- Route-level `ErrorBoundary` renders `ErrorState` with retry.
- Query errors inside a section render an inline `ErrorState`, not a full-page error.
- Every list has a skeleton, an empty state, and a filtered-empty state ("No candidates match these filters. Clear filters").

---

## 8. Design system

### 8.1 Brand and tokens

Aimious light theme, derived from the public website's light palette. Defined in `src/index.css` under `@theme` so Tailwind utilities (`bg-surface`, `text-ink-muted`, `text-primary`) come from these variables.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#F5F6F8` | page background, cool paper |
| `--color-surface` | `#FFFFFF` | cards, panels, table rows |
| `--color-surface-2` | `#EDEFF3` | subtle fills, table header, hover |
| `--color-surface-3` | `#E2E5EB` | pressed, skeleton base |
| `--color-line` | `#DCE0E7` | hairline borders |
| `--color-line-strong` | `#B8BEC9` | focused inputs, dividers |
| `--color-ink` | `#0E1013` | primary text |
| `--color-ink-muted` | `#4E5562` | secondary text |
| `--color-ink-subtle` | `#5C6371` | captions, placeholders |
| `--color-primary` | `#C24A17` | signal orange: primary buttons, active nav, links, focus ring |
| `--color-primary-hover` | `#A03C12` | |
| `--color-primary-soft` | `#FCE9E0` | primary badge and selected row wash |
| `--color-success` / soft | `#1F7A4D` / `#E3F3EA` | |
| `--color-warning` / soft | `#B7791F` / `#FBF1DC` | |
| `--color-danger` / soft | `#B42318` / `#FCE8E6` | |
| `--color-info` / soft | `#1D4ED8` / `#E4ECFB` | |

Status colours (badge background / text):

| Status | Colours |
|---|---|
| new | `#EEF1F5` / `#3B4452` slate |
| ai_shortlisted | `#E8EAFB` / `#3F3FB5` indigo |
| hr_review | `#F0E8FB` / `#6B34A8` purple |
| contact_pending | `#FBF1DC` / `#8A5A0B` amber light |
| contacted | `#E0F0FB` / `#0B5C94` sky |
| phone_screening | `#DDF4F6` / `#0B6B72` cyan |
| interview_scheduled | `#E4ECFB` / `#1D4ED8` blue |
| technical_interview | `#DCE6FA` / `#1E40AF` blue deep |
| hr_interview | `#E4ECFB` / `#2B4FCF` blue |
| final_interview | `#E3E6F9` / `#312E81` indigo deep |
| selected | `#E3F3EA` / `#1F7A4D` emerald |
| offer_sent | `#FBF1DC` / `#B7791F` amber |
| offer_accepted | `#DCF5E3` / `#15803D` green |
| onboarding | `#DDF3EF` / `#0F766E` teal |
| onboarded | `#D1F0DA` / `#166534` green strong |
| rejected | `#FCE8E6` / `#B42318` rose |
| withdrawn | `#ECEEF2` / `#5C6371` gray |
| on_hold | `#F6E7D8` / `#9A4D12` warm |

Source colours: internal `#ECEEF2`/`#0E1013`, referral `#E3F3EA`/`#1F7A4D`, naukri `#EAF0FF`/`#2F54EB`, linkedin `#E1EEF8`/`#0A66C2`.

Match ring colour by score: ≥ 85 emerald, 70 to 84 amber, below 70 slate.

### 8.2 Typography

Geist Variable, self-hosted. Numbers use `font-variant-numeric: tabular-nums`.

| Style | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| Display | 28 / 34 | 500 | -0.02em | Login headline, dashboard greeting |
| H1 | 24 / 30 | 500 | -0.02em | Page titles |
| H2 | 20 / 28 | 500 | -0.015em | Card and section titles |
| H3 | 16 / 24 | 500 | -0.01em | Sub-sections, table group headers |
| Body | 14 / 20 | 400 | 0 | Default |
| Small | 13 / 18 | 400 | 0 | Table cells, meta |
| Caption | 12 / 16 | 450 | 0.01em | Labels, timestamps, badges (uppercase caption for eyebrow labels) |
| Metric | 30 / 36 | 500 | -0.02em | Metric card numbers |

### 8.3 Spacing, radius, elevation, motion

- 4px grid. Page padding 24px desktop, 16px below 768px. Card padding 20px. Section gap 24px. Inline gap 8px or 12px.
- Radii: card 10px, control 6px, badge and avatar 999px.
- Shadows: card `0 1px 2px rgb(14 16 19 / .04), 0 8px 24px -16px rgb(14 16 19 / .12)`; hover adds `0 16px 32px -20px rgb(14 16 19 / .18)`; popover `0 12px 32px -12px rgb(14 16 19 / .24)`.
- Focus ring: 2px `primary` at 2px offset.
- Motion: easing `cubic-bezier(.22,1,.36,1)`; durations 150ms (hover), 250ms (dialogs, chips), 400ms (page enter). Page content fades in and rises 8px. Lists stagger 30ms per item, capped at 10 items. Timeline items animate height and opacity when filtered. `prefers-reduced-motion` disables all of it.
- Layout: sidebar 248px expanded, 64px collapsed (icon-only, tooltips). Top bar 56px. Content max width 1440px centred. 12-column grid for dashboard and detail pages.

### 8.4 Shared components

Each entry: purpose, props, appearance, states.

**Avatar**
Props: `src`, `name`, `size` (`xs 20 | sm 24 | md 32 | lg 40 | xl 64 | 2xl 96`), `ring` (bool), `status` (optional online dot, unused in MVP). Circular image with `object-cover`. Fallback: two initials on a background hashed from the name into 8 muted hues (slate, indigo, violet, sky, teal, emerald, amber, rose) with white text, weight 500. Broken image URLs fall back to initials via `onError`. Alt text is the name.

**AvatarGroup**
Props: `people: {id, name, avatar_url, designation}[]`, `max` (default 4), `size`. Overlapping avatars with a 2px `surface` ring, negative margin of a quarter size. Overflow renders a `+N` pill in `surface-2`. Hovering any avatar shows a tooltip "Name • Designation". Clicking the group opens a popover listing everyone as `UserChip`s.

**UserChip**
Props: `user`, `size`, `showRole`, `secondary` (e.g. role in recruitment). Renders `[Avatar sm] Rahul • HR Manager` inline. Used in tables, timeline, and participants lists.

**StatusBadge**
Props: `status`, `size` (`sm | md`), `dot` (bool). Pill with the status soft background and text colour from 8.1, caption weight 450, optional 6px dot. Tooltip with the full label when truncated.

**SourceBadge**
Props: `source`, `iconOnly`. Same pill style with a small icon (database, mail, briefcase, linkedin). Multiple sources render as a compact stack "Internal + LinkedIn".

**MatchRing**
Props: `value` (0 to 100), `size` (`sm 32 | md 48 | lg 72`), `showLabel`. SVG ring with a 3px to 5px stroke, track in `surface-3`, arc in the score colour, number centred in tabular numerals. Animates the arc from 0 on first render. Tooltip "95% match".

**MatchBar**
Props: `label`, `value`, `weight`. Horizontal bar used in the AI Match Analysis breakdown: label left, value right, 6px rounded track.

**MetricCard**
Props: `label`, `value`, `delta` (number, optional), `icon`, `to` (link), `loading`. White card, icon in a 32px soft circle top left, uppercase caption label, metric number, delta chip green up or rose down with "vs last 7 days". Hover lifts. Skeleton variant.

**PageHeader**
Props: `title`, `subtitle`, `breadcrumbs`, `actions` (right slot), `tabs` (optional). Sticky below the top bar with a hairline border when scrolled.

**DataTable**
Built on TanStack Table + shadcn table. Props: `columns`, `data`, `total`, `pagination`, `sorting`, `onRowClick`, `toolbar` (search input + filter popovers + view toggle), `emptyState`, `loading`. Header in `surface-2`, sortable headers show a chevron, hover row `surface-2`, selected row `primary-soft`. Row actions in a trailing `⋯` menu. Skeleton shows 8 shimmer rows. Sticky header, horizontal scroll on narrow screens.

**FilterChips / TimelineFilterChips**
Props: `options: {key, label, color, count}[]`, `selected`, `onChange`, `allowAllNone`. Toggle chips with a coloured dot, count in caption, checked state has a soft fill and a check icon. "All" and "None" text buttons on the right. Keyboard toggle with space.

**Timeline**
Props: `items: Activity[]`, `filters`, `groupByDay` (default true), `renderExtra`, `onLoadOlder`, `hasMore`. Vertical line in `line` colour at 16px; each item has a 12px circular indicator in the category colour with a white 2px ring, a day header ("Thu, 11 Sep 2026") when the day changes, then a row: time in caption, `[Avatar xs] Actor` + title, optional description, optional details block (chips for names, score badge, recommendation), and an expand chevron when metadata exists. Items animate in and out when filters change. "Load older events" button at the bottom.

**TimelineItem details by category**
- job_description: changed field chips, "View version" link.
- candidate_search: sources as `SourceBadge`s, "127 candidates found", "12 AI shortlisted".
- candidate_shortlisted: list of candidate `UserChip`s linking to detail.
- candidate_contact: channel icon, outcome badge, notes, next action with date.
- interview: round badge, `UserChip` interviewer, date time, meeting link.
- interview_feedback: score badge "8.5/10", recommendation badge, first line of feedback, expand for full.
- candidate_selected, offer, onboarding: status badge and short line.
- decision: reason text.

**EmptyState**
Props: `icon`, `title`, `description`, `action`. Centred, 64px soft circle icon, H3 title, muted description, primary or secondary action button.

**ErrorState**
Props: `title`, `message`, `onRetry`. Rose soft icon, retry button.

**Skeletons**
`SkeletonText`, `SkeletonCard`, `SkeletonTableRows`, `SkeletonMetricRow`, `SkeletonTimeline`. Shimmer on `surface-3`, radius matching the real element.

**ConfirmDialog**
Props: `title`, `description`, `confirmLabel`, `destructive`, `requireTyping` (e.g. type the JD title to delete). Radix dialog, destructive button in danger colour.

**PeoplePicker** (the "People Involved in the Recruitment" control)
Props: `value: {user_id, role_in_recruitment}[]`, `onChange`, `excludeSelf`. A command palette style combobox: search input with a magnifier, results list of `UserChip`s with designation and department, grouped by department, keyboard navigable. Selecting adds a row to the "Selected" list beneath: `[Avatar md] Name  Designation   [Role in recruitment ▾]  [×]`. Role defaults: HR department → Recruiter, engineering manager titles → Hiring Manager, otherwise Interviewer. Shows an `AvatarGroup` summary when collapsed.

**SkillChips**
Props: `skills: {name, matched?: boolean, proficiency?}[]`, `max`, `highlight`. Neutral chips; when `highlight` is on, matched required skills are emerald soft with a check, missing required skills are rose soft outlined.

**StatusTransitionMenu**
Props: `application`, `onTransition`. Dropdown showing allowed next statuses grouped as Forward, Back, Decisions. Choosing a status that requires a note or reason opens `TransitionDialog` with a textarea and, for interviews and offers, a shortcut to the relevant dialog.

**KanbanBoard / KanbanColumn / KanbanCard** (section 9.7)

**FunnelChart**
Recharts horizontal bar funnel with six stages, values and conversion percentages between stages as captions, brand colour ramp from `primary` to `primary-soft`.

**NotificationBell**
Bell icon with an unread count badge, opens a popover listing the latest 8 notifications with `[Avatar xs] actor` and relative time, "Mark all read" and "View all".

**Sidebar**
Logo mark and wordmark at the top (collapsed shows only the mark). Nav items with icon and label: Dashboard, Job Descriptions, Search Candidates, Candidates, Interviews, Notifications. Active item has `primary-soft` background and `primary` text with a 3px left accent. Bottom: user `UserChip` with a menu (Profile / Settings, Sign out) and a collapse toggle.

**TopBar**
Breadcrumbs left. Right: global search (⌘K, searches JDs and candidates), `NotificationBell`, user avatar.

---

## 9. Pages

Wireframes are desktop. Every page has loading skeletons matching its layout, an error state with retry, and an empty state where a list can be empty. Responsive notes are at the end of each page.

### 9.1 Login (`/login`)

```
┌───────────────────────────────────────────────┬──────────────────────────────┐
│  (left 58%) dark graphite panel               │  (right 42%) paper panel     │
│                                               │                              │
│  [Aimious mark]                               │   Welcome back               │
│                                               │   Sign in to continue        │
│  AI-powered recruitment intelligence          │                              │
│  Rank candidates, run interviews, and track   │   Email or username          │
│  every step from first contact to onboarding. │   [_____________________]    │
│                                               │   Password          Forgot?  │
│  ┌ floating card: "Senior Python Developer" ┐ │   [_____________] [eye]      │
│  │ [avatars +3]   127 candidates • 12 short │ │   [ ] Remember me            │
│  └───────────────────────────────────────────┘ │   [ Sign in            ]    │
│  ┌ floating card: John Doe  ◔ 95% Match     ┐ │                              │
│  └───────────────────────────────────────────┘ │   Demo accounts ▾            │
│                                               │                              │
│  © Aimious                                    │                              │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

- Left panel uses the website's dark graphite (`#0B0C0F` to `#111318` gradient) with a faint dot grid, the Aimious mark for dark backgrounds, display headline, and two floating preview cards (`AvatarGroup`, `MatchRing`) that drift slowly (6s loop). This is where "AI-powered recruitment intelligence" is communicated.
- Right panel: form card without a border on the paper background. Inputs with floating labels, show/hide password toggle, remember me checkbox, forgot password link opening a dialog that accepts an email and always shows "If an account exists, a reset link has been sent".
- Validation: email or username required, password required, inline messages under fields. Wrong credentials show a rose inline alert "Incorrect email or password" and shake the card gently. Throttled responses show "Too many attempts, try again in a minute".
- Submit shows a spinner in the button and disables inputs. Success fades to the dashboard.
- A collapsible "Demo accounts" list shows the seeded logins with one-click fill (dev and demo builds only).
- Mobile: single column, dark header band with the tagline, then the form.

### 9.2 App shell

Sidebar + top bar as in 8.4. Content area scrolls independently. Route changes animate content with a 400ms fade and rise. Global ⌘K search opens a command dialog with recent JDs and candidates and quick actions ("Create Job Description", "Search Candidates").

### 9.3 Dashboard (`/dashboard`)

```
Good morning, Rahul                                          Thu 11 Sep 2026
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Active  │ │Total   │ │New     │ │Short-  │ │Inter-  │ │Selected│ │Offers  │ │Onboard-│
│JDs  6  │ │Cands   │ │Cands   │ │listed  │ │views   │ │  9     │ │pending │ │ed  5   │
│  ▲1    │ │ 184 ▲12│ │ 23 ▲5  │ │ 41 ▲3  │ │ 12     │ │  ▲2    │ │  4     │ │  ▲1    │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
┌ Recruitment Funnel ──────────── [All JDs ▾] ┐ ┌ Top Candidates ─────────────────────┐
│ Found        ████████████████████████  184  │ │ ◔95 [av] John Doe   Sr Python Dev   │
│ Shortlisted  ████████████            41 22% │ │ ◔92 [av] Jane Smith Sr Python Dev   │
│ Contacted    █████████               30 73% │ │ ◔91 [av] Meera Nair AI Engineer     │
│ Interviewed  ██████                  19 63% │ │ ...                                 │
│ Selected     ███                      9 47% │ │                       View all →    │
│ Onboarded    ██                       5 56% │ └─────────────────────────────────────┘
└─────────────────────────────────────────────┘ ┌ Upcoming Interviews ─────────────────┐
┌ Recent Activity ────────────────────────────┐ │ Today 3:00 PM  Technical • John Doe   │
│ ● [av] Priya contacted John Doe    2h ago   │ │   [av] Arun Kumar        [Join]      │
│ ● [av] Arun submitted feedback 8.5 3h ago   │ │ Tomorrow 11:00 AM HR • Jane Smith    │
│ ● [av] Rahul created "DevOps Eng"  5h ago   │ └─────────────────────────────────────┘
│ ...                                View all │
└─────────────────────────────────────────────┘
```

- Eight `MetricCard`s in a 4×2 grid on laptops, 8×1 on wide screens. Each links to the filtered list behind it.
- Funnel card with a JD selector; hovering a bar shows counts and conversion.
- Recent Activity uses the `Timeline` component in compact mode (no day headers), 10 items.
- Top Candidates: rows with `MatchRing sm`, `Avatar sm`, name, JD title, `StatusBadge sm`; click opens candidate detail with JD context.
- Upcoming Interviews: next five with interviewer `UserChip` and meeting link button.
- Empty state for a brand-new tenant: illustration, "Create your first Job Description".
- Tablet: two-column widgets; mobile: single column, metric cards in a 2-column grid.

### 9.4 Job Descriptions list (`/jobs`)

```
Job Descriptions                                    [ Table | Cards ]  [+ Create New Job Description]
[🔍 Search JDs...] [Status ▾] [Department ▾] [Location ▾] [Type ▾] [Mine only ○]      Sort: Updated ▾
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Title / Dept          Location   Type      Created by      People      Pipeline            Status │
│ Senior Python Dev     Chennai    Full-time [av] Rahul      [av][av]+2  127·12·5·1·0       ● Open │
│ Engineering           Hybrid               11 Sep 2026                 cand short int sel onb     │
│ React Developer       Bengaluru  Full-time [av] Priya      [av][av]    64·9·3·0·0        ● Open │
│ ...                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                     ‹ 1 2 3 ›   20 per page
```

- Toolbar: search (title, department, skills), filter popovers with checkbox lists and counts, "Mine only" toggle, sort menu (Updated, Created, Title, Candidates).
- Table columns: Title with department underneath, Location with work mode, Employment type, Created by (`UserChip` with created date), People (`AvatarGroup`), Pipeline (five small numbers with caption labels: candidates, shortlisted, interviewed, selected, onboarded; rendered as a mini segmented bar on hover), Status badge, and a `⋯` row menu.
- Row menu: View, Edit, Duplicate, Open timeline, Search candidates, Archive or Unarchive, Delete (opens `ConfirmDialog` requiring the title to be typed).
- Card view: 3-column grid of cards with title, department, location and type chips, `AvatarGroup`, pipeline mini bar, status badge, and primary "Open" button.
- Clicking a row opens the JD detail. Last updated shows as relative time with a tooltip of the exact timestamp.
- Empty state: "No job descriptions yet" with the create button; filtered-empty state offers "Clear filters".
- Mobile: card view forced, filters in a bottom sheet.

### 9.5 Create and edit Job Description (`/jobs/new`, `/jobs/:id/edit`)

```
← Job Descriptions / New Job Description                   [Cancel] [Save as Draft] [Preview] [Create Job Description]
┌ left rail (sticky) ─┐ ┌ form (max 880px) ─────────────────────────────────────────────────────┐
│ ● Basics            │ │ BASICS                                                                 │
│ ○ Compensation      │ │ Job title*            [Senior Python Developer                    ]    │
│ ○ Skills            │ │ Department*  [Engineering ▾]   Location* [Chennai      ] Mode [Hybrid ▾]│
│ ○ Details           │ │ Employment type* [Full-time ▾]  Experience* [4] to [8] years  Openings [1]│
│ ○ People Involved   │ │ Domain [Fintech ▾]                                                     │
│                     │ │ COMPENSATION                                                           │
│ Completion 60%      │ │ Salary range  [₹ 18,00,000] – [₹ 28,00,000]  per year  Currency [INR ▾]│
│ ▓▓▓▓▓▓░░░░          │ │ SKILLS                                                                 │
│                     │ │ Required skills*  [Python ×] [Django ×] [PostgreSQL ×] [+ add]          │
│                     │ │ Preferred skills  [FastAPI ×] [AWS ×] [+ add]                           │
│                     │ │ Educational requirements  [textarea]                                   │
│                     │ │ DETAILS                                                                 │
│                     │ │ Job responsibilities (one per line)  [textarea]                        │
│                     │ │ Required qualifications              [textarea]                        │
│                     │ │ Additional requirements              [textarea]                        │
│                     │ │ Full job description                 [rich textarea, markdown preview] │
│                     │ │ PEOPLE INVOLVED IN THE RECRUITMENT                                     │
│                     │ │ ┌──────────────────────────────────────────────┐                       │
│                     │ │ │ 🔍 Search employees...                       │                       │
│                     │ │ └──────────────────────────────────────────────┘                       │
│                     │ │ Selected:                                                              │
│                     │ │ [av] Rahul    HR Manager             [Owner ▾]        (you)            │
│                     │ │ [av] Priya    HR Executive           [Recruiter ▾]      ×              │
│                     │ │ [av] Arun     Engineering Manager    [Hiring Manager ▾] ×              │
│                     │ │ [av] Divya    Technical Interviewer  [Interviewer ▾]    ×              │
└─────────────────────┘ └────────────────────────────────────────────────────────────────────────┘
```

- Left rail: section anchors with completion state and an overall completion meter. Sticky action bar at the top right.
- Skills inputs are tag inputs with autocomplete from a skill dictionary endpoint (derived from existing candidate skills) and the normaliser applied on blur.
- Section heading uses the exact text **People Involved in the Recruitment** and the `PeoplePicker` component. The creator is pre-added as Owner and cannot be removed.
- Preview opens a right-side sheet rendering the JD as candidates would read it, with the participants `AvatarGroup`.
- Save as Draft creates with `status=draft`; Create Job Description creates with `status=open`. Edit mode shows "Save changes" and asks for an optional change summary that becomes the version note.
- Validation: title, department, location, type, experience range (min ≤ max), at least one required skill, salary min ≤ max. Server errors map to fields.
- Unsaved changes prompt on navigation. Autosave of the draft to localStorage every 10 seconds as a safety net.
- Mobile: rail becomes a horizontal stepper; action bar becomes a bottom bar.

### 9.6 Job Description detail (`/jobs/:id`)

Header:

```
← Job Descriptions
Senior Python Developer                       ● Open   [Search Candidates] [Edit] [⋯ Duplicate · Archive · Delete]
Engineering • Chennai (Hybrid) • Full-time • 4–8 yrs • ₹18L–₹28L
Created by [av] Rahul on 11 Sep 2026 • Updated 2h ago • v3          People Involved: [av][av][av][av] +2
[ Overview ] [ People Involved ] [ Timeline ] [ Candidates (127) ] [ Kanban ] [ Versions (3) ]
```

**Metric row (always visible under the header)**: seven `MetricCard`s in compact mode: Total candidates found, Shortlisted, Contacted, In interview, Selected, Rejected, Onboarded.

**Overview tab**

```
┌ About the role (2/3) ──────────────────────────────┐ ┌ Snapshot (1/3) ───────────────────┐
│ Full description (rendered markdown)               │ │ Department     Engineering         │
│                                                    │ │ Location       Chennai • Hybrid    │
│ Responsibilities   • ...  • ...                    │ │ Experience     4–8 years           │
│ Qualifications     • ...                           │ │ Salary         ₹18L – ₹28L         │
│ Additional requirements                            │ │ Openings       1                   │
│ Education          B.Tech / B.E in CS or related   │ │ Domain         Fintech             │
│                                                    │ │ Status         ● Open              │
│ Required skills   [Python] [Django] [PostgreSQL]   │ │ Created by     [av] Rahul          │
│ Preferred skills  [FastAPI] [AWS]                  │ │ Created        11 Sep 2026 09:30   │
│                                                    │ │ Last modified  11 Sep 2026 14:10   │
└────────────────────────────────────────────────────┘ └────────────────────────────────────┘
```

**People Involved tab**

```
People Involved in the Recruitment                                   [+ Add people]
┌───────────────────────────────────────────────────────────────────────────────┐
│ [av lg] Rahul Venkat        HR Manager • Human Resources        Owner          │
│ [av lg] Priya Sharma        HR Executive • Human Resources      Recruiter   ⋯  │
│ [av lg] Arun Kumar          Engineering Manager • Engineering   Hiring Manager │
│ [av lg] Divya Raman         Senior Engineer • Engineering       Interviewer    │
└───────────────────────────────────────────────────────────────────────────────┘
```
Cards show avatar, name, designation and department, role-in-recruitment badge, and a per-person line "3 interviews • 12 activities". Row menu: change role, remove (confirm). Add opens the `PeoplePicker` in a dialog.

**Timeline tab**

```
Timeline Filters   [● Job Description 4] [● Candidate Search 2] [● Candidate Shortlisted 3] [● Candidate Contact 9]
                   [● Interview 6] [● Interview Feedback 5] [● Candidate Selected 1] [● Offer 2] [● Onboarding 1]
                   [● Rejected / On Hold 3]                                                      All · None
[🔍 Filter by candidate or person]   [Person ▾]   Showing 36 of 36 events

Thu, 11 Sep 2026
 ●  09:30 AM  [av] Rahul created the Job Description.                               ▾
 ●  10:15 AM  [av] Priya searched for candidates.   [Naukri][LinkedIn]  127 candidates found • 12 AI shortlisted
 ●  11:00 AM  [av] Rahul shortlisted:  [av John Doe] [av Jane Smith] [av Alex Kumar]
 ●  02:30 PM  [av] Priya contacted John Doe.   Status: Connected   Next: Schedule technical interview
Fri, 12 Sep 2026
 ●  03:00 PM  Technical Interview scheduled for John Doe.   Interviewer: [av] Arun   [Join link]
 ●  05:00 PM  [av] Arun submitted interview feedback for John Doe.   Score 8.5/10   Proceed        ▾
...
                                   [ Load older events ]
```

- Chips are the `TimelineFilterChips` with per-category counts. All nine prompt categories start selected; "Rejected / On Hold" starts selected too. Toggling filters the already-loaded list in memory, so the update is instant, with items animating out and in. Selection is mirrored to `?cat=` in the URL.
- Secondary filters: text filter and an actor filter. "Showing X of Y events" updates live.
- Initial load fetches the latest 200 events for the JD; "Load older events" appends the next 200.
- Each item follows the `TimelineItem` rules in 8.4. Candidate names link to the candidate detail with `?jd=` context.

**Candidates tab**

Same ranked table as the Search results (9.8) scoped to this JD, with a status group filter (All, Shortlisted, In progress, Interview, Selected, Closed), bulk selection with "Shortlist selected" and "Reject selected", and a "Run new search" button linking to `/search?jd=`.

**Kanban tab** (section 9.7)

**Versions tab**

```
Versions
┌───────────────────────────────────────────────────────────────────────────────┐
│ v3  Current   [av] Priya   11 Sep 2026 14:10   Raised experience to 4–8 yrs   [View] │
│ v2            [av] Rahul   11 Sep 2026 11:40   Added AWS to preferred skills  [View] [Compare with v3] │
│ v1            [av] Rahul   11 Sep 2026 09:30   Created                        [View] │
└───────────────────────────────────────────────────────────────────────────────┘
```
"View" opens a sheet with the snapshot rendered like the Overview tab. "Compare" shows changed fields side by side with additions in emerald and removals in rose (field-level, not word diff).

- Responsive: metric row scrolls horizontally on mobile; tabs become a scrollable tab strip.

### 9.7 Kanban tab (`/jobs/:id?tab=kanban`)

```
[🔍 Search candidates]  [Source ▾]  [Match ≥ ▾]  [Owner ▾]                       Rejected / On hold (3) ▸
┌ New 12 ─────┐ ┌ Shortlisted 9 ┐ ┌ Contacted 6 ┐ ┌ Screening 3 ┐ ┌ Interview 5 ┐ ┌ Selected 1 ┐ ┌ Offer 1 ┐ ┌ Onboarding 0 ┐
│┌───────────┐│ │┌───────────┐  │ │             │ │             │ │             │ │            │ │         │ │  (empty)     │
││[av] John  ││ ││[av] Meera │  │ │             │ │             │ │             │ │            │ │         │ │  Drop here   │
││Doe   ◔95  ││ ││Nair  ◔91  │  │ │             │ │             │ │             │ │            │ │         │ │              │
││Sr Backend ││ ││ML Eng     │  │ │             │ │             │ │             │ │            │ │         │ │              │
││6y [LI][IN]││ ││7y [Ref]   │  │ │             │ │             │ │             │ │            │ │         │ │              │
││● New   ⋯  ││ ││● AI Short.│  │ │             │ │             │ │             │ │            │ │         │ │              │
│└───────────┘│ │└───────────┘  │ │             │ │             │ │             │ │            │ │         │ │              │
└─────────────┘ └───────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ └─────────┘ └──────────────┘
```

- Eight columns in a horizontally scrollable board, each 280px wide with a header (label, count pill, "+" to add an existing candidate). Column group → statuses mapping is in 6.4.
- `KanbanCard`: `Avatar md`, name, `MatchRing sm`, current title and company, experience years, `SourceBadge`s, `StatusBadge sm` (the exact status inside the group), and a `⋯` menu with `StatusTransitionMenu`, "Log contact", "Schedule interview", "Open profile". Cards show a small owner avatar bottom right. Overdue next-action shows a tiny amber clock.
- Drag with dnd-kit (pointer and keyboard sensors). A `DragOverlay` renders the lifted card with a shadow and slight tilt. Dropping in a column applies the column's entry status (Interview → `interview_scheduled`, Offer → `offer_sent`, Onboarding → `onboarding`). Dropping into a column that requires data opens the matching dialog first: Interview → `ScheduleInterviewDialog`, Offer → `OfferDialog`, Onboarding → `StartOnboardingDialog`. Cancelling the dialog snaps the card back.
- Backward drops beyond one column, and drops into Rejected / On hold, open `TransitionDialog` for the required note or reason.
- Optimistic update: the card moves immediately, the transition request runs, a toast confirms "Moved John Doe to Interview Scheduled", and on error the card returns with an error toast.
- The tray on the right expands to show Rejected, Withdrawn, and On Hold cards with "Resume" or "Reopen" actions.
- Every move creates an activity ("Rahul moved John Doe from HR Review to Interview Scheduled"), which appears on the Timeline tab.
- Column search and filters narrow cards without changing counts in the header (header shows "3 of 12" when filtered).
- Mobile: columns become a horizontal snap-scroll with one column per screen and a column switcher.

### 9.8 Search Candidates (`/search`)

```
Search Candidates
┌ Step 1: Selected Job Description ───────────────────────────────────────────────────────────────┐
│ [Senior Python Developer ▾]   Engineering • Chennai • 4–8 yrs • Python, Django, PostgreSQL       │
│ Last search: 11 Sep 2026 10:15 by [av] Priya (127 found)                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Step 2: Candidate sources ───────────────────────────────────────────────────────────────────────┐
│ [✓ Internal Database  42 profiles]  [✓ Referral Email  18]  [✓ Naukri  ~60]  [✓ LinkedIn  ~60]   │
│ [ Search All Sources ]                                                          [ Search ▸ ]      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
Results  127 candidates • 12 AI shortlisted • 9 new                      [Table | Cards]  Sort: Match ▾
[🔍 Filter results] [Status ▾] [Source ▾] [Experience ▾] [Location ▾] [Match ≥ 70 ─●───]
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ #  Candidate                       Match   Experience  Skills                      Source     Status         │
│ 1  [av] John Doe                   ◔ 95%   6 yrs       Python Django FastAPI +3   [LI][IN]   AI Shortlisted │
│    Sr Backend Engineer • Zoho                                                                     ⋯ │
│ 2  [av] Jane Smith                 ◔ 92%   5 yrs       Python Django AWS +2       [NK]       New            │
│ 3  [av] Alex Kumar                 ◔ 89%   7 yrs       Python Flask PostgreSQL    [Ref]      Contacted      │
│ 4  [av] David Raj                  ◔ 85%   4 yrs       ...                        [IN]       New            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
[ 3 selected ]  [Shortlist]  [Reject]  [Assign owner ▾]
```

- Step 1: a searchable JD selector (open JDs first), showing a one-line summary and the last search run.
- Step 2: source cards with icon, name, and available profile count from the provider health endpoint. "Search All Sources" selects all four. The Search button shows a progress state ("Searching Naukri… LinkedIn…") for the duration of the request, then results animate in.
- Results table: rank, `Avatar md` + name + headline, `MatchRing sm`, experience, `SkillChips` with matched required skills highlighted, `SourceBadge`s, `StatusBadge`, row menu (Open profile, Shortlist, Log contact, Schedule interview, Reject). Sorted by match descending by default.
- Card view for a visual scan: `Avatar lg`, name, `MatchRing md`, skills line "Python • Django • FastAPI • PostgreSQL • AWS", "6 years experience", "Sources: Internal + LinkedIn", "Status: Technical Interview".
- Bulk actions bar appears on selection; Shortlist creates one grouped activity.
- Empty results: "No candidates matched. Try adding Naukri or LinkedIn or widening experience".
- Mobile: steps stack, results forced to card view.

### 9.9 Candidates list (`/candidates`)

Same table pattern as 9.8 without the search steps. Columns: Candidate, Skills, Experience, Location, Sources, Active applications (`StatusBadge`s per JD, max 2 + count), Last activity. Filters: search, skills, source, location, experience range, status, JD. Row click opens the candidate detail (first active application as context). Header action "+ Add candidate" opens a dialog for manual entry (internal source).

### 9.10 Candidate detail (`/candidates/:id?jd=`)

Header:

```
← Candidates
[av 2xl] John Doe                                   Context: [Senior Python Developer ▾]   ◔ 95% Match
         Sr Backend Engineer at Zoho • Chennai • 6 yrs                   Status ● Technical Interview  [Change status ▾]
         ✉ john.doe@gmail.com  ☎ +91 98765 43210  in LinkedIn  ⌂ GitHub  📄 Resume
         Sources: [Internal] [LinkedIn]   Owner: [av] Priya   Last activity 2h ago
         [Log Contact] [Schedule Interview] [Shortlist] [Reject]  ⋯
[ Profile ] [ AI Match Analysis ] [ Timeline (14) ] [ Interviews (2) ] [ Communications (3) ]
```

- The JD context selector switches which application drives the match, status, and timeline when the candidate is attached to more than one JD.
- Contact details are masked for interviewer and employee roles, with a lock icon tooltip.

**Profile tab**: two columns. Left: Summary, Experience timeline (company, title, dates, domain chip, description), Education, Certifications, Resume (rendered text in a scroll box with "Open resume" placeholder link). Right: Skills grouped by proficiency with small five-dot meters, Details card (notice period, current and expected CTC, location, phone, email), Professional profiles.

**AI Match Analysis tab**

```
┌ Overall Match ────────────────────┐ ┌ Breakdown ───────────────────────────────────────┐
│          ◔ 95%                    │ │ Skills Match            ████████████████░  92  ×45│
│   Strong match for this role      │ │ Experience Match        █████████████████ 100  ×20│
│   Engine: rule_based v1 • 2h ago  │ │ Education Match         █████████████████ 100  ×10│
│   [Recompute]                     │ │ Domain Match            ██████████░░░░░░░  60  ×10│
└───────────────────────────────────┘ │ Responsibility Match    █████████████░░░░  80  ×15│
                                      └─────────────────────────────────────────────────┘
┌ Strengths ─────────────────────────┐ ┌ Gaps ────────────────────────────────────────────┐
│ ✓ Strong Python experience (6 yrs) │ │ ! Limited Kubernetes experience                  │
│ ✓ Good backend development exp.    │ │ ! No direct healthcare domain experience         │
│ ✓ Relevant AWS experience          │ │                                                  │
└────────────────────────────────────┘ └──────────────────────────────────────────────────┘
┌ Skill coverage ─────────────────────────────────────────────────────────────────────────┐
│ Required   [✓ Python] [✓ Django] [✓ PostgreSQL] [✗ Kubernetes]                            │
│ Preferred  [✓ FastAPI] [✓ AWS] [– Redis]                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Timeline tab**: the `Timeline` component scoped to this application, rendered as the vertical stage flow from the prompt. Above the event list, a horizontal stage stepper shows the pipeline stages (Candidate Added → AI Matched → Shortlisted → HR First Contact → Phone Screening → Interview Scheduled → Technical → HR → Final → Selected → Offer Released → Offer Accepted → Onboarding → Onboarded) with completed stages in emerald, the current stage in primary, and future stages muted. Each event shows date, time, status badge, actor `UserChip`, notes, comments, and next action.

**Interviews tab**: cards per interview with round badge, interviewer `UserChip`, date and time, mode and meeting link, status, and when completed the score "8.5/10", recommendation badge, and feedback text. Actions: Schedule, Reschedule, Cancel, Submit feedback (for the interviewer or HR).

**Communications tab**: list of contact entries: `[av] Priya contacted John Doe`, channel icon, outcome badge, notes, next action with due date, plus a "Log contact" form at the top (channel, direction, outcome, summary, notes, next action, date).

- Mobile: header collapses to avatar, name, match ring, status; tabs scroll.

### 9.11 Interviews (`/interviews`)

```
Interviews                                                                   [+ Schedule interview]
[ Upcoming ] [ Today ] [ Completed ] [ All ]      [JD ▾] [Interviewer ▾] [Round ▾] [Mine ○]   [List | Calendar]
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Date & time         Candidate            JD                     Round      Interviewer   Status     Score │
│ Today 3:00 PM (60m) [av] John Doe        Senior Python Dev      Technical  [av] Arun     Scheduled  [Join] │
│ Tomorrow 11:00 AM   [av] Jane Smith      Senior Python Dev      HR         [av] Priya    Scheduled         │
│ 10 Sep 5:00 PM      [av] Meera Nair      AI Engineer            Technical  [av] Divya    Completed  8.5    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Rows expand to show meeting link, mode, feedback, and recommendation. Interviewers see a "Submit feedback" button on their completed-but-unscored interviews.
- Calendar view: a simple week grid with interview chips, no drag.
- `ScheduleInterviewDialog`: application (prefilled when opened from a candidate), round, interviewer (`PeoplePicker` single-select limited to participants and interviewers), date and time, duration, mode, meeting link.
- `FeedbackDialog`: score slider 0 to 10 with 0.5 steps, recommendation segmented control, feedback textarea.

### 9.12 Notifications (`/notifications`)

List grouped by day with unread rows in `primary-soft`, `[Avatar sm] actor`, title, message, relative time, and a link. Filters: All, Unread. "Mark all as read". Empty state "You're all caught up".

### 9.13 Profile and Settings (`/settings`)

Tabs: Profile (large avatar with URL field and initials preview, name, designation, department read-only, phone, timezone), Security (change password), Preferences (sidebar collapsed default, page size, timeline default categories). Admin-only tab Users: list of users with role editing.

---

## 10. Seed data specification

`python manage.py seed_demo [--reset]`, deterministic with `SEED_RANDOM_SEED=42` and dates anchored to `SEED_ANCHOR_DATE` (2026-09-11), so timelines always end "today".

**Users (10)**, all with `randomuser.me` portrait URLs and password `Demo@1234`:

| Name | Email | Role | Designation | Department |
|---|---|---|---|---|
| Rahul Venkat | rahul@aimious.demo | hr_admin | HR Manager | Human Resources |
| Priya Sharma | priya@aimious.demo | hr | HR Executive | Human Resources |
| Karthik Iyer | karthik@aimious.demo | hr | Talent Acquisition Specialist | Human Resources |
| Anitha Rajan | anitha@aimious.demo | hr | HR Business Partner | Human Resources |
| Arun Kumar | arun@aimious.demo | interviewer | Engineering Manager | Engineering |
| Divya Raman | divya@aimious.demo | interviewer | Senior Software Engineer | Engineering |
| Suresh Menon | suresh@aimious.demo | interviewer | Lead Data Scientist | Data |
| Nisha Patel | nisha@aimious.demo | interviewer | DevOps Lead | Platform |
| Vikram Shah | vikram@aimious.demo | employee | Product Manager | Product |
| Lakshmi Narayanan | lakshmi@aimious.demo | employee | Frontend Lead | Engineering |

One user (Vikram) has no avatar to exercise the initials fallback.

**Job descriptions (6)**

| Title | Dept | Location | Exp | Status | Participants |
|---|---|---|---|---|---|
| Senior Python Developer | Engineering | Chennai, Hybrid | 4 to 8 | open | Rahul (owner), Priya (recruiter), Arun (hiring manager), Divya (interviewer) |
| React Developer | Engineering | Bengaluru, Onsite | 2 to 5 | open | Priya (owner), Karthik, Lakshmi (hiring manager), Divya |
| AI Engineer | Data | Remote | 3 to 7 | open | Rahul, Anitha, Suresh (hiring manager) |
| Data Scientist | Data | Hyderabad, Hybrid | 2 to 6 | open | Karthik (owner), Suresh |
| DevOps Engineer | Platform | Chennai, Onsite | 3 to 6 | open | Anitha (owner), Nisha (hiring manager), Arun |
| QA Automation Engineer | Engineering | Pune, Hybrid | 2 to 5 | archived | Priya (owner) |

Each JD has 3 versions with realistic change summaries, a domain (fintech, ecommerce, healthcare, saas, fintech, ecommerce), and full descriptive text.

**Candidates (about 180)**: Indian names and cities, realistic company histories (Zoho, Freshworks, Infosys, TCS, Razorpay, Swiggy, Flipkart, startups), skills drawn from role-specific pools so matches vary from roughly 40% to 97%, one or two sources each (40% single, 60% two sources), education mixes, some certifications (AWS SAA, CKA, GCP PDE, PMP), summaries and resume text generated from templates. Roughly 130 are attached to JDs as applications; about 50 remain unattached in the source pool so a fresh search discovers "new" candidates.

**Applications (about 120)** spread so every one of the 18 statuses appears at least twice, with the Senior Python Developer JD carrying the richest pipeline (about 40 applications, including a complete journey for "John Doe" that ends `onboarded` with the exact sample timeline from the prompt). Owners assigned among HR users.

**History generation**: for each application, generate a coherent event chain from `search.completed` at its added date through its current status, with realistic gaps (hours to days), the right actors (recruiters contact, interviewers give feedback, hiring managers select), and matching child rows: interviews (about 60, with scores 5.5 to 9.5 and recommendations consistent with what happened next), communications (about 90), offers (about 10), onboardings (about 5 with checklists). JD-level events (`jd.created`, `jd.updated` ×2, `jd.participant_added`) are backdated before the first search. Totals: around 600 activities across six weeks, around 30 notifications (a mix of read and unread for Rahul and Priya), and audit rows for the seeded mutations.

The seeder runs inside one transaction, is idempotent (skips if the demo marker exists unless `--reset`), and prints a summary table.

---

## 11. Testing strategy

Work is test-first: a failing test precedes each behaviour.

**Backend (pytest-django, target ≥ 85% on services and engine)**

- `matching`: normaliser and synonyms; each component formula at boundaries; weights sum to 100; strengths and gaps text; threshold behaviour.
- `sourcing`: provider contract test run against all four providers (yield `NormalizedCandidate`, respect limit, filter by skills); registry lazy loading and unknown key error; `SearchService.run` end to end (dedupe by email, upsert, application creation, activity written, run counts).
- `pipeline`: transition matrix table test (every from → to pair allowed or refused); side effects (activity category, notification, timestamps); interview schedule and feedback effects; communication auto-transition; offer and onboarding flows; bulk transition creates one activity.
- `jobs`: create with participants inserts owner; update writes a version only when content changes; duplicate; delete guard; metrics counts.
- `activity`: category mapping for every event type; cursor pagination; category filter.
- `accounts`: login sets cookie, refresh rotates, logout blacklists, remember-me lifetimes, throttling; permission matrix per role (parametrised); PII masking.
- `seed`: command runs in under 60 seconds, is idempotent, every status present, John Doe's timeline matches the prompt's sample.
- API flow test: login → create JD with people → search → shortlist → contact → schedule → feedback → select → offer → accept → onboard → complete, asserting the JD timeline contains every category.

**Frontend (Vitest + Testing Library)**

- `Avatar` fallback initials and hue determinism; `AvatarGroup` overflow and tooltip.
- `StatusBadge`, `SourceBadge`, `MatchRing` colour thresholds.
- `TimelineFilterChips` and `Timeline`: toggling a category hides those items immediately; URL sync.
- `PeoplePicker`: search, select, remove, role default.
- `StatusTransitionMenu`: only allowed statuses shown; note required flows.
- `KanbanBoard`: drop calls transition with the column's entry status; dialog-first columns; rollback on error (mocked API).
- Login form validation and error display.
- `make typecheck` and `make lint` pass with zero warnings.

**Manual QA checklist** (phase 10): walk the prompt's section 40 flow end to end in the seeded demo, on a 1440px desktop, a 1024px tablet, and a 400px phone.

---

## 12. Build phases

Each phase ends with its tests green, `make lint` clean, and a short demo of the visible result. No phase starts before the previous one's checks pass.

| Phase | Scope | Done when |
|---|---|---|
| **0. Scaffold** | Repo files, `.gitignore`, Makefile, docker-compose (Postgres 5434), Django project with settings split, DRF, spectacular, CORS, custom User stub, health endpoint; Vite + React + TS + Tailwind v4 + shadcn init with brand tokens, Geist, router, providers, `AppShell` skeleton, axios client | `make dev` serves the shell at 5175 with a live `/api/v1/health` call; `make test` runs an empty suite |
| **1. Data model and seed v1** | All models, migrations, admin registration, enums endpoint, `seed_demo` for users, JDs, participants, versions, candidates with children and sources | Migrations apply cleanly on an empty DB; seed creates users, 6 JDs, ~180 candidates in under 30 s; model tests pass |
| **2. Auth and shell** | SimpleJWT with cookie refresh, login/logout/me/forgot-password, throttling, permissions module, audit middleware; Login page, `RequireAuth`, session restore, Sidebar, TopBar, NotificationBell placeholder, Settings profile tab | Login as Rahul works with remember me; refresh survives reload; wrong password and throttle states render; permission matrix tests pass |
| **3. Job descriptions** | JD list, detail, create, update with versioning, duplicate, archive, delete, participants, metrics, versions APIs; JD list page (table and cards, filters, row menu), JD form with `PeoplePicker`, JD detail with Overview, People Involved, Versions tabs, metric row | Create a JD with four people and see them on the detail page; versions appear after edits; delete requires typing the title |
| **4. Activity and timeline** | `Activity` model, `record_activity`, hooks in JobService, activities API with cursor pagination and category filter; `Timeline`, `TimelineFilterChips`, JD Timeline tab; seed v2 generates JD-level history | Toggling "Job Description" off removes those events instantly; URL reflects filters; load older works |
| **5. Matching and sourcing** | Skill normaliser, `RuleBasedEngine`, explanations; provider ABC, registry, four providers, `SearchService`, searches and applications list APIs; Search Candidates page with source cards and ranked results (table and cards), JD Candidates tab; seed v3 attaches applications with matches | Searching all sources for Senior Python Developer returns a ranked list with match rings, AI shortlist activity appears on the JD timeline |
| **6. Candidate pages** | Candidates list and detail APIs (masking by role); Candidates list page, Candidate detail with Profile, AI Match Analysis, Timeline tabs and the stage stepper | John Doe shows 95% with breakdown, strengths, gaps; interviewer login sees masked contact details |
| **7. Pipeline actions** | `PipelineService.transition`, bulk transition, communications, interviews with feedback, offers, onboardings APIs and notifications; `StatusTransitionMenu`, `TransitionDialog`, `LogContactDialog`, `ScheduleInterviewDialog`, `FeedbackDialog`, `OfferDialog`, `StartOnboardingDialog`, Interviews page, candidate Interviews and Communications tabs; seed v4 generates full histories, interviews, comms, offers, onboardings | Full flow from contact to onboarded works in the UI and every step appears on both timelines; notifications arrive for the owner |
| **8. Kanban** | Kanban aggregation API; `KanbanBoard` with dnd-kit, dialog-first columns, tray, filters, optimistic updates | Dragging John Doe to Interview opens the schedule dialog, then moves the card and writes the activity |
| **9. Dashboard and notifications** | Dashboard endpoints; Dashboard page with metric cards, funnel, recent activity, top candidates, upcoming interviews; Notifications page and bell polling; global ⌘K search | Dashboard numbers match the seeded data; unread badge updates after marking read |
| **10. Polish and release** | Skeletons, empty and error states on every list, responsive pass, motion and reduced-motion, accessibility pass (labels, focus order, contrast), Docker images and nginx, README with screenshots and demo accounts, ARCHITECTURE.md, final QA against section 21 | `make demo` brings up the stack on 8201 and the section 40 journey completes on desktop, tablet, and phone widths |

Estimated effort: phases 0 to 4 about 40% of the work, 5 to 8 about 40%, 9 to 10 about 20%.

---

## 13. Security checklist

- Argon2 password hashing, Django password validators, login throttling.
- Access token in memory only; refresh token `httpOnly`, `SameSite=Lax`, path-scoped, rotated and blacklisted.
- Role and object-level permissions on every endpoint, tested per role.
- PII masking by role; resume text only on detail; no PII in logs.
- All input validated by serializers and zod; array and JSON fields size-limited.
- Audit log for every mutation and auth event.
- Secrets from environment only; `.env` git-ignored; Docker image runs with `DEBUG=false`, non-root user.
- Security headers, HTTPS-only cookie flag in production settings.
- Dependency pinning and `pip-audit` / `npm audit` in `make lint`.

## 14. Performance

- Every list endpoint paginated, filtered, and sorted in SQL with `select_related` and `prefetch_related`; N+1 checked with `django-debug-toolbar` in dev and `assertNumQueries` in tests for list endpoints.
- Counts on the JD list come from one annotated query.
- Activities use cursor pagination on `(job_description, occurred_at)`.
- Frontend: TanStack Query caching with 30 s stale time, prefetch JD detail on row hover, code-split routes, skeletons everywhere, optimistic Kanban.
- Search run is synchronous now; `SearchRun.status` and the response shape allow moving it behind a worker with polling later.

## 15. Future integration path

1. Implement `NaukriProvider(CandidateSourceProvider)` reusing the sibling POC's Playwright code; register it under the `naukri` key. No schema change.
2. Implement `ReferralEmailProvider` reading a mailbox and parsing attachments into `NormalizedCandidate`; store the raw payload in `CandidateSource.raw_payload`.
3. Implement `ClaudeMatchEngine(MatchEngine)` that prompts Claude with `JDProfile` and `CandidateProfile` and returns the same `MatchResult`; switch `MATCH_ENGINE`.
4. Add a worker (Celery or Django-Q) that runs `SearchService.run` steps 2 to 7; the API returns `status=pending` and the UI polls.
5. Add dark theme by populating the token set under `[data-theme="dark"]`.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| SimpleJWT lags behind Django releases | Target Django 5.2 LTS, isolate JWT views so the library can be swapped |
| Tailwind v4 and shadcn components drift | Pin exact versions at scaffold time, keep custom tokens in one file |
| Seed data looks fake | Curated name, company, and skill pools per role; deterministic but varied; hand-written John Doe journey |
| Kanban drag on touch devices | dnd-kit pointer sensor with activation distance, plus the card menu as a non-drag path |
| Scope creep in dialogs | Each dialog has a fixed field list (section 9); anything more goes to the future list |
| Timeline volume on large JDs | Cursor pagination and in-memory filtering of loaded pages; category counts from one grouped query |

## 17. Out of scope (explicit)

Real Naukri or LinkedIn calls, email sending, resume file upload and parsing, calendar integrations, offer letter PDF generation, multi-organisation tenancy, SSO, dark mode toggle, background workers, mobile-first layouts (mobile is supported but desktop is primary).

---

## 18. Demo accounts

All passwords `Demo@1234`. Rahul (HR Manager, admin), Priya (HR Executive), Karthik (Talent Acquisition), Anitha (HR Business Partner), Arun (Engineering Manager, interviewer), Divya (Senior Engineer, interviewer), Suresh (Lead Data Scientist, interviewer), Nisha (DevOps Lead, interviewer), Vikram (Product Manager, employee), Lakshmi (Frontend Lead, employee). Emails are `<firstname>@aimious.demo`.

## 19. Glossary

- **JD**: Job Description.
- **Application**: one candidate's progress on one JD; carries the pipeline status.
- **Participant**: a user listed under "People Involved in the Recruitment" for a JD.
- **Activity**: a timeline event with a category, actor, and time.
- **Provider**: a pluggable candidate source that returns normalised candidates.
- **Match**: the rule-based score of an application, with sub-scores and explanations.

## 20. Open questions

None blocking. Two defaults I chose that you can override at any phase: a tenth timeline chip "Rejected / On Hold" so "Candidate Selected" only shows selections, and Django 5.2 LTS over 6.1 because of SimpleJWT's declared support.

## 21. Prompt coverage map

| Prompt section | Covered in |
|---|---|
| 1 Overview, MVP scope | 1, 2, 6.7, 15 |
| 2 Core user flow | 7.1, 12 phases 2 to 8 |
| 3 Login page | 9.1 |
| 4 Profile pictures | 8.4 Avatar, AvatarGroup, UserChip; 10 users |
| 5 Navigation | 8.4 Sidebar, TopBar; 7.1 |
| 6 JD management page | 9.4, 6.10 job-descriptions list with counts |
| 7 Create new JD | 9.5, 6.3 JobDescription |
| 8 People Involved in the Recruitment | 8.4 PeoplePicker, 9.5, 9.6 People tab, 6.3 RecruitmentParticipant |
| 9 JD list actions | 9.4 row menu, 6.10 duplicate/archive/delete |
| 10 JD detail page | 9.6 Overview and People tabs |
| 11 Recruitment summary | 9.6 metric row, 6.10 metrics |
| 12 Timeline filters and dynamic behaviour | 9.6 Timeline tab, 8.4 TimelineFilterChips, 6.4 categories |
| 13 Timeline example | 10 John Doe journey, 8.4 TimelineItem details |
| 14 Timeline UI | 8.4 Timeline, 8.3 motion |
| 15 Search Candidates page | 9.8 |
| 16 Candidate sources | 6.7 providers, 9.8 step 2 |
| 17 Fake candidate data | 6.3 Candidate tables, 10 |
| 18 Candidate matching | 6.6 |
| 19 Candidate ranking | 9.8 results table, 6.10 applications ordering |
| 20 Candidate profile UI | 9.8 card view, 8.4 MatchRing, SkillChips |
| 21 Candidate detail page | 9.10 Profile tab |
| 22 AI match analysis | 9.10 AI Match Analysis tab, 6.6 explanations |
| 23 Candidate recruitment timeline | 9.10 Timeline tab with stage stepper |
| 24 Recruitment statuses | 6.4, 8.1 status colours |
| 25 Interview tracking | 6.3 Interview, 9.11, 9.10 Interviews tab |
| 26 Communication tracking | 6.3 Communication, 9.10 Communications tab |
| 27 Kanban | 9.7, 6.4 column mapping |
| 28 Dashboard | 9.3 |
| 29 PostgreSQL schema | 6.3 |
| 30 Seed data | 10 |
| 31 Database-first | 12 phase order |
| 32 Future integration architecture | 6.7, 15 |
| 33 Security | 6.9, 13 |
| 34 UI/UX | 8, 9 |
| 35 Avatar sizes | 8.4 Avatar sizes and usage |
| 36 Responsive | per-page notes in 9, 8.3 layout |
| 37 Performance | 14 |
| 38 Final MVP architecture | 6, 7, 12 |
| 39 Implementation rule | 2 non-goals, 17 |
| 40 Final product goal and priorities | 2 goals, 12 phase 10 QA |
