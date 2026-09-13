# Aimious AI Recruitment Platform

A demo-ready recruitment platform that walks the full hiring journey: sign in, create a Job Description with the people involved in the recruitment, search candidates across pluggable sources (internal pool, referrals, mock Naukri and LinkedIn), rank them with an explainable AI match percentage, and move each one through contact, interviews, selection, offer and onboarding on a Kanban board. Every important action is stored in PostgreSQL and shows up on a filterable timeline with who did it and when.

Django + Django REST Framework serve a JSON API under `/api/v1/`; a Vite + React + TypeScript SPA styled with Tailwind CSS v4 and shadcn/ui consumes it. External integrations are mock providers behind a stable interface, so real Naukri, LinkedIn, referral email and an LLM matcher can be plugged in without restructuring.

- [plan.md](plan.md): the full specification (decisions, data model, API, page designs, seed data, build phases).
- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is layered, the request flows, and where to plug in real integrations.

## Screenshots

| | |
|---|---|
| ![Login](docs/screenshots/login-1440.png) | ![Dashboard](docs/screenshots/dashboard-1440.png) |
| Login, with the AI recruitment showcase and one-click demo accounts | Dashboard: metric cards, funnel, recent activity, top candidates, upcoming interviews |
| ![Job description timeline](docs/screenshots/jd-timeline-1440.png) | ![Kanban](docs/screenshots/jd-kanban-1440.png) |
| Job Description timeline with category filter chips | Kanban board with drag and drop, dialog-first columns and the parked tray |
| ![Search candidates](docs/screenshots/search-1440.png) | ![AI match analysis](docs/screenshots/candidate-match-1440.png) |
| Search Candidates: sources, ranked results with match rings | Candidate detail: AI Match Analysis with breakdown, strengths and gaps |
| ![Candidate timeline on a phone](docs/screenshots/candidate-timeline-400.png) | ![Jobs on a phone](docs/screenshots/jobs-400.png) |
| Candidate timeline with the stage stepper at 400px | Job Descriptions as cards at 400px, navigation in a drawer |

## Quick start (local development)

Requirements: Python 3.12, Node 24, Docker (for PostgreSQL).

```bash
make setup      # copies .env, creates backend/.venv, installs Python and npm deps
make db-up      # starts PostgreSQL 16 in Docker on host port 5434
make migrate    # applies Django migrations
make seed       # loads the deterministic demo data set (about 20 seconds)
make dev        # Django API on 8200 + Vite dev server on 5175 (Ctrl-C stops both)
```

Open <http://localhost:5175> and sign in with a demo account below. `make help` lists every target.

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

Sign in as Rahul for the full experience. Arun sees masked candidate contact details and can submit feedback on his own interviews. The login page lists these accounts with one-click fill.

## The demo walk-through

1. **Dashboard**: eight metric cards with 7-day deltas, the recruitment funnel, recent activity, top candidates and upcoming interviews.
2. **Job Descriptions**: table or card view with filters. Open **Senior Python Developer**, the richest pipeline.
3. **Create a Job Description**: skills as tag inputs, and the **People Involved in the Recruitment** picker that adds colleagues with a role in the recruitment.
4. **Timeline tab**: toggle the category chips (Job Description, Candidate Search, Candidate Shortlisted, Candidate Contact, Interview, Interview Feedback, Candidate Selected, Offer, Onboarding, Rejected / On Hold). Filtering is instant and mirrored to the URL.
5. **Search Candidates**: pick the JD, choose sources, run the search. Results are ranked by match with skill chips that highlight matched and missing required skills. Shortlist in bulk.
6. **Candidate detail**: profile, **AI Match Analysis** (five weighted components, strengths, gaps, skill coverage), the stage stepper timeline, interviews and communications. **John Doe** carries the complete journey that ends onboarded.
7. **Kanban tab**: drag a card forward. Interview, Offer and Onboarding columns open their dialog first; backward moves and the tray ask for a note or reason. Every move lands on the timeline.
8. **Interviews**, **Notifications** (bell with unread count), **Settings** (profile, security, preferences; users list for admins).

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
| `CANDIDATE_SOURCE_PROVIDERS` | `internal,referral,naukri,linkedin` | Which providers the Search page offers |
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
            sourcing/, matching/, activity/, notifications/, audit/, dashboard/, seed/, tests/
frontend/   Vite + React + TypeScript SPA: src/app, src/lib, src/components, src/features
scripts/    dev.sh (runs Postgres + API + Vite together)
docs/       screenshots used above
```

## What is deliberately mocked

Naukri, LinkedIn and referral email are providers that read a seeded pool from PostgreSQL. No email is sent (forgot-password records a request and returns 202). Resumes are stored as text with a placeholder link. Search runs synchronously. See ARCHITECTURE.md section 4 for how each of these becomes real.
