# Architecture

How the Aimious AI Recruitment Platform is put together, which rules keep it that way, and where to plug in real integrations. The full specification (data model, API surface, page designs) is in [plan.md](plan.md); this document is the map you read before changing code.

## 1. Shape of the system

```
browser ──► Vite (5175, dev) or nginx (8201, docker) ──► /api/v1/* ──► Django + DRF (8200) ──► PostgreSQL 16 (5434)
              serves the React SPA                       same-origin proxy
```

- **Two deployables.** A Django REST API and a React single-page app. The SPA always calls `/api/v1/...` on its own origin; Vite proxies it in development and nginx proxies it in the Docker image, so CORS is only a fallback.
- **One database.** PostgreSQL holds every entity, every timeline event, every notification and every audit row. No queue, no cache, no background worker in the MVP.
- **Mock integrations.** Naukri, LinkedIn and referral email are providers that read a seeded pool from PostgreSQL. They implement the same interface a real provider will.

## 2. Backend

### 2.1 Apps

| App | Owns |
|---|---|
| `common` | `UUIDTimestampedModel`, every enum and its label (`enums.py`), pagination, the error envelope (`exceptions.py`), role and object permissions (`permissions.py`), PII masking, throttles, `/health` and `/meta/enums` |
| `accounts` | Custom `User` (email login, role, avatar), JWT login/refresh/logout with an httpOnly refresh cookie, `/auth/me`, password change, forgot-password request, users list for the people picker |
| `jobs` | `JobDescription`, `JobDescriptionVersion`, `RecruitmentParticipant`; `JobService` for create/update-with-versioning/duplicate/archive/delete/participants/metrics |
| `candidates` | `Candidate` and its child tables (skills, experience, education, certifications, sources); `CandidateRepository.upsert_from_dto()` is the only writer from provider output |
| `pipeline` | `Application` (the status that drives everything), `CandidateMatch`, `SearchRun`, `Interview`, `Communication`, `Offer`, `Onboarding`; `services/` package with one module per workflow |
| `sourcing` | `CandidateSourceProvider` ABC, DTOs, provider registry, the four database-backed providers, `SearchService.run()` |
| `matching` | `MatchEngine` protocol, `RuleBasedEngine`, skill normaliser and synonyms, strengths/gaps text, ORM adapters |
| `activity` | `Activity` rows and `record_activity()`, the only writer of timeline events |
| `notifications` | `Notification` rows, `notify()` / `notify_all()`, unread count |
| `audit` | `AuditLog` rows and `AuditMiddleware` |
| `dashboard` | Read-only aggregates (summary, funnel, recent activity, top candidates, upcoming interviews) |
| `seed` | `manage.py seed_demo`, curated pools and generators; history is replayed through the real services |

### 2.2 Layering rule

```
urls / views / serializers / filters / admin / management
        │
        ▼
      services                 (workflow logic, transactions, activities, notifications)
        │
        ▼
repositories / providers / engines / adapters / registry / middleware
        │
        ▼
models / managers / enums / dtos / permissions / pagination / exceptions
```

The rule is enforced by import-linter (`backend/pyproject.toml`, run by `make lint`). Two contracts: the layering above within and across apps, and "no app imports `config`". In practice:

- **Views never contain workflow logic.** A view validates input with a serializer, checks permissions, calls one service function, and serialises the result.
- **Services own transactions and side effects.** A transition in `pipeline/services/pipeline.py` updates the row, writes the activity, sends notifications, all inside one `transaction.atomic()`.
- **Providers never import the ORM directly for writes.** They yield `NormalizedCandidate` DTOs; `CandidateRepository` turns those into rows.
- **The match engine never imports Django.** `matching/engine.py` is pure Python over dataclasses; `matching/adapters.py` is the only place that knows the ORM.

### 2.3 Request flow: moving a Kanban card

1. `POST /api/v1/applications/{id}/transition/ {"status": "interview_scheduled", "note": "..."}`.
2. `ApplicationViewSet.transition` validates the body and runs the `CanManageApplication` object permission (creator, participant, or HR admin of the JD).
3. `PipelineService.transition(application, new_status, actor, note)` checks the move against the rules in plan.md 6.5, updates `status`, `stage_entered_at` and `last_activity_at`, records the activity under the entry category of the target status, and notifies the application owner and JD owner (never the actor).
4. `AuditMiddleware` writes an `AuditLog` row for the request and stamps `X-Request-ID` on the response.
5. The response carries the updated application plus the new activity so the UI appends it without refetching.

### 2.4 Timeline events

`activity.services.record_activity()` is the single entry point. Every call names an `event_type` (fine-grained, e.g. `interview.feedback_submitted`) and a `category` (one of the ten filter chips). The pair is validated against `EVENT_TYPE_CATEGORY`, so an event can never appear under the wrong chip. `application.status_changed` is the one event that spans categories: it lands under the entry category of the status the application moved into (`common.enums.STATUS_ENTRY_CATEGORY`).

Every activity carries `job_description`, so the JD timeline is one indexed query; `application` and `candidate` are denormalised for the candidate timeline.

### 2.5 Search and matching

`SearchService.run(jd, sources, actor)`:

1. Opens a `SearchRun` and builds `SearchCriteria` from the JD.
2. Asks each requested provider for candidates; duplicates within the run are dropped by lowercase email or normalised phone.
3. `CandidateRepository.upsert_from_dto()` creates or refreshes the candidate and its child rows, and records the `CandidateSource`.
4. `Application.get_or_create(candidate, jd)`. New applications get `entry_source`, `search_run` and a status by threshold; existing ones keep theirs.
5. The configured `MatchEngine` scores the pair; the result is upserted into `CandidateMatch`.
6. Records `search.completed` and, when anything crossed the threshold, `application.ai_shortlisted`.
7. Finalises the run with counts and duration.

The run is synchronous today. Moving it behind a worker means enqueueing steps 2 to 7 and letting the UI poll `GET /searches/{id}`; `SearchRun.status` already has the `pending` and `running` values for that.

### 2.6 Authentication and authorisation

- Login returns a 15-minute access token in the body and sets the refresh token as an httpOnly, `SameSite=Lax` cookie scoped to `/api/v1/auth/`. Refresh rotates the cookie and blacklists the old token. The SPA keeps the access token in memory only.
- Roles: `hr_admin`, `hr`, `interviewer`, `employee`. The capability matrix is written out at the top of `common/permissions.py`; predicates take `(user, job_description)` and the DRF permission classes resolve any object to its JD through `job_description_of()`.
- PII: interviewer and employee roles receive masked phone and email from serializers (`common/masking.py`). Resume text is only on the candidate detail endpoint.
- Login throttling, Argon2 hashing, security headers and cookie flags are configured in `config/settings/base.py` and `prod.py`.

### 2.7 Error envelope

Every API error has one shape, produced by `common.exceptions.api_exception_handler` (and the non-DRF handlers in `common.views` for 404/500):

```json
{ "error": { "code": "validation_error", "message": "Invalid input.", "details": { "title": ["This field is required."] } } }
```

The frontend's `lib/api.ts` parses this envelope; `ErrorState` and form error mapping rely on it.

## 3. Frontend

### 3.1 Layout

```
src/
├── app/            router, providers, RequireAuth, AuthBootstrap, layout/ (AppShell, Sidebar + MobileNav, TopBar)
├── lib/            api client, auth store, UI store, query keys, enums catalogue, formatting, hooks
├── types/          api.d.ts generated from the OpenAPI schema (make openapi), domain.ts helpers
├── components/ui/  shadcn components (Radix primitives, brand tokens applied through CSS variables)
├── components/shared/  Avatar, AvatarGroup, StatusBadge, MatchRing, Timeline, DataTable, EmptyState, ErrorState, Skeletons, ...
└── features/       one folder per domain; each has api.ts (queries and mutations) plus its pages, tabs and dialogs
```

### 3.2 Data layer

- `lib/api.ts` is an axios instance with a bearer interceptor and a single-flight refresh on 401. On refresh failure it clears the session.
- `lib/auth-store.ts` (zustand) holds `user`, `accessToken` and `status`. `AuthBootstrap` calls refresh once on load to restore a session from the cookie.
- TanStack Query owns server state. `lib/query-keys.ts` is the only place keys are built, so mutations can invalidate precisely: a transition invalidates applications, the kanban board, the JD timeline, the JD detail and the dashboard.
- `lib/enums.ts` loads `/meta/enums` once per session so labels and badge colours come from the API, with a typed fallback for tests.
- Tab and filter state lives in the URL through `useUrlState`, so every view is linkable.
- `lib/history-store.ts` records every in-app navigation (`useTrackHistory` in the AppShell). A page's Back control (`PageHeader`) steps back through the browser history to the last entry on a different path, so Interviews → Candidate → Back returns to Interviews; a direct load falls back to the breadcrumb parent.

### 3.3 UI conventions

- Every list has a skeleton, an empty state and, when filters can hide rows, a filtered-empty state with a clear-filters action.
- Query errors inside a section render an inline `ErrorState` with a retry; only page-level failures use the block variant.
- Mutations report through toasts. Destructive actions confirm through `ConfirmDialog`; deleting a JD requires typing its title.
- Motion follows plan.md 8.3: 400ms page enter, 250ms dialogs, 150ms hovers, `cubic-bezier(.22,1,.36,1)`. `prefers-reduced-motion` turns it all off at the CSS level and through `useReducedMotion` for JS-driven animation.
- Brand: Buro Happold black, white and lime (`--color-accent`) on warm stone neutrals, Manrope for headings over Geist for UI text (`index.css`). The sidebar and the login panel are dark surfaces: `data-surface="dark"` re-points the colour tokens for that subtree, so every component inside keeps its classes. Logo assets live in `public/brand/` behind `components/shared/BrandLogo`.
- Every candidate status change goes through `TransitionDialog`, which requires a reason; the API refuses a transition without one. Timeline events render through `TimelineChanges` (From → To, reason, who) plus the per-category details, and never show identifiers or raw field names (`lib/timeline.ts`).
- Below 768px the sidebar becomes a drawer opened from the top bar, tables switch to cards or scroll inside their own container, and the Kanban board snaps one column per screen.

## 4. Extension points

| Want to | Change |
|---|---|
| Add a real Naukri or LinkedIn source | Implement `CandidateSourceProvider` in `sourcing/providers/`, map its key in `sourcing/registry.py`, list it in `CANDIDATE_SOURCE_PROVIDERS`. Store the raw payload in `CandidateSource.raw_payload`. No schema change. |
| Parse referral emails | Same as above with a provider that reads a mailbox and yields `NormalizedCandidate`. |
| Use Claude for matching | Implement `MatchEngine` (`matching/engine.py`) returning `MatchResult`; register it in `matching/registry.py`; set `MATCH_ENGINE=claude`. `matching/adapters.py` already builds the profiles. |
| Run searches in the background | Enqueue `SearchService.run` steps 2 to 7; return `SearchRun(status="pending")`; the UI polls `GET /searches/{id}`. |
| Add a new timeline event | Add the `event_type` to `EVENT_TYPE_CATEGORY` in `activity/services.py`; call `record_activity()` from the service that owns the behaviour; add a renderer case in `components/shared/TimelineItemDetails.tsx` if it carries extra details. Put `from` / `to` (or a `changes` map of `{field: {from, to}}`) and `reason` in the metadata and the change block renders itself. |
| Add a job description action | Follow `JobService.force_close` / `add_comment` (`jobs/services.py`) and their `POST .../force-close/` and `.../comments/` actions in `jobs/views.py`; gate them with a predicate in `common/permissions.py` and mirror it in `features/jobs/job-permissions.ts`. |
| Add a pipeline status | Add it to `ApplicationStatus` and the order, Kanban group and entry-category maps in `common/enums.py`; the transition rules and the frontend `pipeline-target.ts` read those maps. |
| Add a dark theme | Populate the token set under `[data-theme="dark"]` in `frontend/src/index.css`; every colour in the app comes from those tokens. |

## 5. Seed data

`manage.py seed_demo` (idempotent; `--reset` wipes the demo data first) builds the demo world deterministically from `SEED_RANDOM_SEED` and anchors every date to `SEED_ANCHOR_DATE` so timelines always end "today". Users, JDs and candidates come from curated pools in `seed/pools/`. Applications and their histories are replayed through the real pipeline services (`seed/generators/history.py`), so seeded data has the same activities, notifications and audit rows a live session would produce. John Doe's journey on the Senior Python Developer JD follows `seed/pools/journey.py` and ends `onboarded`.

## 6. Quality gates

| Command | Checks |
|---|---|
| `make lint` | ruff (lint and format), import-linter contracts, ESLint with zero warnings, Prettier |
| `make typecheck` | `tsc -b --noEmit` |
| `make test-api` | pytest with `config.settings.test` (matching formulas, provider contract, transition matrix, permissions per role, seed idempotency, API flows) |
| `make test-web` | Vitest and Testing Library component tests |
| `make openapi` | Regenerates `frontend/src/types/api.d.ts` from the DRF schema; commit the result when the API changes |

## 7. Runtime and deployment

- **Development**: `make dev` starts Postgres in Docker, applies migrations, and runs Django on 8200 and Vite on 5175 from one `.env`.
- **Demo**: `make demo` builds two images (gunicorn + whitenoise for the API, nginx for the SPA), starts the stack with `config.settings.prod` and `DEBUG=false`, migrates, seeds, and prints the accounts. The SPA is served on 8201 and proxies `/api` to the API container by service name.
- Configuration comes only from the environment (`.env.example` lists every variable). The API image runs as a non-root user and serves its own admin and docs static files.
