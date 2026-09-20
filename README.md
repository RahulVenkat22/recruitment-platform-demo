# Buro Happold Recruitment Platform

A demo-ready recruitment platform built for Buro Happold (the Aimious engine underneath) that walks the full hiring journey: sign in, create a Job Description with the people involved in the recruitment, search candidates across pluggable sources (internal pool, referrals, mock Naukri and LinkedIn), rank them with an explainable AI match percentage, and move each one through contact, interviews, selection, offer and onboarding on a Kanban board. Every important action is stored in PostgreSQL and shows up on a filterable timeline with who did it and when.

Django + Django REST Framework serve a JSON API under `/api/v1/`; a Vite + React + TypeScript SPA styled with Tailwind CSS v4 and shadcn/ui consumes it. External integrations are mock providers behind a stable interface, so real Naukri, LinkedIn, referral email and an LLM matcher can be plugged in without restructuring.

- [plan.md](plan.md): the full specification (decisions, data model, API, page designs, seed data, build phases).
- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is layered, the request flows, and where to plug in real integrations.

## Screenshots

| | |
|---|---|
| ![Login](docs/screenshots/login-1440.png) | ![Homepage](docs/screenshots/home-1440.png) |
| Login on the Buro Happold graphite panel, with one-click demo accounts | Homepage: every job description with status, interviewer, latest update, completion and the row actions |
| ![Dashboard](docs/screenshots/dashboard-1440.png) | ![Search candidates](docs/screenshots/search-1440.png) |
| Dashboard: metric cards, funnel, recent activity, top candidates, upcoming interviews | Search Candidates: the search panel, the AI loading experience and ranked results with match rings |
| ![Job description timeline](docs/screenshots/jd-timeline-1440.png) | ![Kanban](docs/screenshots/jd-kanban-1440.png) |
| Job Description timeline with category filter chips | Kanban board with drag and drop, dialog-first columns and the parked tray |
| ![AI match analysis](docs/screenshots/candidate-match-1440.png) | ![Candidate timeline on a phone](docs/screenshots/candidate-timeline-400.png) |
| Candidate detail: AI Match Analysis with breakdown, strengths and gaps | Candidate timeline with the stage stepper at 400px |
| ![Jobs on a phone](docs/screenshots/jobs-400.png) | |
| Job Descriptions as cards at 400px, navigation in a drawer | |

## Quick start (local development)

Requirements: Python 3.12, Node 24, Docker (for PostgreSQL).

```bash
make setup      # copies .env, creates backend/.venv, installs Python and npm deps
make db-up      # starts PostgreSQL 16 + pgvector in Docker on host port 5434
make migrate    # applies Django migrations
make seed       # loads the deterministic demo data set (about 20 seconds)
make dev        # Django API on 8200 + Vite dev server on 5175 (Ctrl-C stops both)
```

Open <http://localhost:5175> and sign in with a demo account below. `make help` lists every target.

### Resume library (OpenAI or Gemini)

Resume PDFs are parsed, embedded and searched through the provider named by `LLM_PROVIDER` in `.env`: `gemini` (`GEMINI_API_KEY`, `GEMINI_MODEL`) or `openai` (`OPENAI_API_KEY`, `OPENAI_MODEL`). The whole PDF -- every page, as it looks -- goes to that vendor, along with the job brief and the candidate excerpts at search time.

```bash
# set LLM_PROVIDER and the matching *_API_KEY in .env, point RESUME_STORAGE_PATH at a folder of PDFs, then:
cd backend && .venv/bin/python manage.py ingest_resumes               # everything in the folder (already-ingested files are skipped by hash)
cd backend && .venv/bin/python manage.py ingest_resumes --reprocess   # re-send everything, e.g. after changing the provider or embedding model
cd backend && .venv/bin/python manage.py upload_resumes               # once the S3 credentials are in .env
```

The **PDF itself is sent** to the model, which returns the whole structured profile, so a scanned resume -- which has no text for anything else to read -- parses as well as a typed one. The first `RESUME_LLM_PDF_MAX_PAGES` pages (12) go, which bounds what a page-billed provider can cost on a document that turns out to be a portfolio; over the cap the extra pages are dropped and the document says so. The extracted text layer is never used for a field; it is only the candidate's searchable text, and a scan with no text layer is indexed on text rebuilt from the model's answer. When the model is busy (a 5xx or rate limit that outlives the retries) the parse falls back once to `GEMINI_FALLBACK_MODEL` / `OPENAI_FALLBACK_MODEL`, and the document records which model answered. A PDF the model cannot read, or that cannot be sent, is flagged `needs_review` with the reason and retried automatically the next time `ingest_resumes` runs over the same folder, while everything already parsed is skipped by hash, so nothing is paid for twice. **Embeddings run on the same provider** (`text-embedding-3-small` on OpenAI, `gemini-embedding-001` on Gemini, both at the 768-dimension width baked into the pgvector column), so a change of provider or embedding model is followed by `ingest_resumes --reprocess`.

HR staff can also upload PDFs from the browser: **Candidates → Upload resumes** (`POST /api/v1/resumes/uploads/`, any number of files) validates and de-duplicates them, queues them through the same pipeline on a server worker thread, and shows each file's live status. Every PDF becomes a candidate (or refreshes an existing one, matched by email or phone), its text lands on the profile, and its sections are embedded into pgvector -- and when the PDF is a scan, that text is rebuilt from the model's structured answer, so the candidate is searchable like any other instead of sitting in the library with no vectors. The Search page then offers a "Resume Library" source: the job description is analysed by the LLM, searched semantically, filtered by the structured requirements, and the top candidates are reviewed by the LLM with a grounded explanation. Runs execute in the background and the page shows live progress. Ingestion is one model call per PDF plus the embeddings; a search runs a few LLM reviews (`SEMANTIC_RERANK_LIMIT`) on top of the vector query.

## One-command demo (Docker)

```bash
make demo
```

Builds the API image (gunicorn + whitenoise, `DEBUG=false`, non-root) and the web image (nginx serving the Vite build and proxying `/api`), starts PostgreSQL, API and web, applies migrations, seeds the demo data and prints the accounts. The UI is at <http://localhost:8201>, the API docs at <http://localhost:8200/api/docs/>. `make docker-down` stops the stack (`KEEP_DATA=0 make docker-down` also drops the database volume).

## Demo accounts

Every password is `Demo@1234`. Emails are `<firstname>@aimious.demo`.

| Name | Role | Designation |
|---|---|---|
| Rahul Venkat | HR admin | HR Manager |
| Priya Sharma | HR | HR Executive |
| Karthik Iyer | HR | Talent Acquisition Specialist |
| Anitha Rajan | HR | HR Business Partner |
| Arun Kumar | Interviewer | Engineering Manager |
| Divya Raman | Interviewer | Senior Software Engineer |
| Suresh Menon | Interviewer | Lead Data Scientist |
| Nisha Patel | Interviewer | DevOps Lead |
| Vikram Shah | Employee | Product Manager |
| Lakshmi Narayanan | Employee | Frontend Lead |

Sign in as Rahul for the full experience. Arun sees masked candidate contact details and can submit feedback on his own interviews. The login page lists these accounts with one-click fill (the demo accounts keep their `@aimious.demo` addresses).

## The demo walk-through

The sidebar runs Homepage, Job Descriptions, Search Candidates, Interviews, Candidates, Dashboard, Notifications; signing in lands on the Homepage.

1. **Homepage**: your job descriptions as a work table (JD, status, interviewer, latest update, % completed). HR admins and HR toggle **Mine** off to see everyone's work, filter by **User level**, and use the row menu to **Add comment** (lands on the JD timeline) or **Force close** (with a confirmation; the JD becomes *Force Closed*).
2. **Dashboard**: eight metric cards with 7-day deltas, the recruitment funnel, recent activity, top candidates and upcoming interviews.
3. **Job Descriptions**: table or card view with filters. Open **Senior Python Developer**, the richest pipeline.
4. **Create a Job Description**: skills as tag inputs, and the **People Involved in the Recruitment** picker that adds colleagues with a role in the recruitment.
5. **Timeline tab**: toggle the category chips (Job Description, Candidate Search, Candidate Shortlisted, Candidate Contact, Interview, Interview Feedback, Candidate Selected, Offer, Onboarding, Rejected / On Hold). Every event reads in plain language: changes show **From → To**, the reason given, and who made the change.
6. **Search Candidates**: pick the JD, choose sources, run the search. While it runs, the AI loading experience rotates through what the system is doing; results are ranked by match with skill chips that highlight matched and missing required skills. Shortlist in bulk.
7. **Candidate detail**: profile, **AI Match Analysis** (five weighted components, strengths, gaps, skill coverage), the stage stepper timeline, interviews and communications. **John Doe** carries the complete journey that ends onboarded. Every status change confirms the current and new status and requires a reason.
8. **Kanban tab**: drag a card forward. Interview, Offer and Onboarding columns open their dialog first; every other drop opens the status confirmation. Every move lands on the timeline.
9. **Interviews**, **Notifications** (bell with unread count), **Settings** (profile, security, preferences; users list for admins). The **Back** control on every detail page returns to the page you came from.

## Ports

| Service | Dev (host) | Docker demo (host) |
|---|---|---|
| PostgreSQL | 5434 | 5434 |
| Django API | 8200 | 8200 |
| Vite dev server | 5175 | not used |
| nginx serving the built SPA | not used | 8201 |

Vite proxies `/api` to the Django API in dev; nginx does the same in Docker, so the SPA always calls a same-origin `/api/v1/...`.

## Configuration

Everything comes from the repo-root `.env` (copied from [.env.example](.env.example) by `make setup`). The variables you are most likely to change:

| Variable | Default | Effect |
|---|---|---|
| `AI_SHORTLIST_THRESHOLD` | `80` | Overall match at or above this becomes "AI Shortlisted" |
| `CANDIDATE_SOURCE_PROVIDERS` | `internal,referral,naukri,linkedin,resume` | Which providers the Search page offers |
| `RESUME_STORAGE_PATH` | `<repo>/resumes` | Folder `ingest_resumes` scans for PDFs |
| `LLM_PROVIDER` | `gemini` | Which provider parses, analyses, evaluates and embeds: `gemini` or `openai`. The PDF itself is sent, so scans parse too |
| `RESUME_LLM_PDF_MAX_PAGES` | `12` | Pages of a PDF sent to the model; over the cap the first 12 go and the document records a warning |
| `RESUME_LLM_PDF_MAX_MB` | `14` | Size ceiling for that request once the page cap is applied, set from Gemini's 20 MB inline-data limit less the base64 expansion (14 MiB → 18.7 MiB on the wire); over it the document is `needs_review` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | empty | The key for the chosen `LLM_PROVIDER`; `OPENAI_MODEL` / `GEMINI_MODEL` pick the chat model |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | per provider / `768` | `text-embedding-3-small` on OpenAI, `gemini-embedding-001` on Gemini; the width is baked into the pgvector column, and changing the model means `ingest_resumes --reprocess` |
| `SEMANTIC_RERANK_LIMIT` | `4` | Top candidates the LLM reviews per search (each costs one LLM call) |
| `SEARCH_RUN_ASYNC` | `true` | Searches run in a background thread; the UI polls the run |
| `RESUME_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | empty | S3 for the PDFs; empty = uploads deferred, "Open resume" explains why |
| `MATCH_ENGINE` | `rule_based` | Engine key; a Claude-backed engine is the planned next step |
| `SEED_ANCHOR_DATE` | `2026-09-11` | The day seeded timelines end on |
| `JWT_REFRESH_REMEMBER_DAYS` | `14` | Refresh cookie lifetime with "Remember me" |

## Quality checks

```bash
make lint        # ruff, import-linter layering contracts, ESLint (zero warnings), Prettier
make typecheck   # tsc
make test        # pytest (backend) and Vitest (frontend)
make openapi     # regenerate frontend/src/types/api.d.ts from the DRF schema
make audit       # pip-audit and npm audit
```

The backend layering rule (views → services → repositories/providers/engines → models) is enforced by import-linter in `make lint`.

## Repository layout

```
backend/    Django project: config/, common/, accounts/, jobs/, candidates/, pipeline/,
            sourcing/, matching/, resumes/, activity/, notifications/, audit/, dashboard/, seed/, tests/
frontend/   Vite + React + TypeScript SPA: src/app, src/lib, src/components, src/features
scripts/    dev.sh (runs Postgres + API + Vite together)
docs/       screenshots used above
```

## What is deliberately mocked

Naukri, LinkedIn and referral email are providers that read a seeded pool from PostgreSQL. No email is sent (forgot-password records a request and returns 202). Seeded candidates carry resume text with a placeholder link; ingested PDFs are real, parsed and embedded by the configured `LLM_PROVIDER`, and open from S3 once the credentials are configured. See ARCHITECTURE.md section 4 for how each of these becomes real.
