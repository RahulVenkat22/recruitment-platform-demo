# Aimious AI Recruitment Platform

A demo-ready recruitment platform that walks the full hiring journey: log in,
create a Job Description with the people involved in the recruitment, search
candidates across pluggable sources (internal pool, referrals, mock Naukri and
LinkedIn), rank them with an explainable AI match percentage, and move each one
through contact, interviews, selection, offer and onboarding on a Kanban board.
Every important action is stored in PostgreSQL and shows up on a filterable
timeline with who did it and when. Django + Django REST Framework serve a JSON
API under `/api/v1/`; a Vite + React + TypeScript SPA styled with Tailwind CSS v4
and shadcn/ui consumes it.

The full specification lives in [plan.md](plan.md); it is the single source of
truth for scope, data model, API surface, pages and build phases.

## Quick start

```bash
make setup      # copies .env, creates backend/.venv, installs Python and npm deps
make db-up      # starts PostgreSQL 16 in Docker on host port 5434
make migrate    # applies Django migrations
make seed       # loads the deterministic demo data set
make dev        # Django API on 8200 + Vite dev server on 5175 (Ctrl-C stops both)
```

Then open <http://localhost:5175>. Run `make help` for every available target,
and `make demo` to bring the whole stack up in containers and seed it.

## Ports

| Service                     | Dev (host) | Docker demo (host) |
| --------------------------- | ---------- | ------------------ |
| PostgreSQL                  | 5434       | 5434               |
| Django API                  | 8200       | 8200               |
| Vite dev server             | 5175       | not used           |
| nginx serving the built SPA | not used   | 8201               |

Vite proxies `/api` to the Django API in dev; nginx does the same in Docker, so
the SPA always calls a same-origin `/api/v1/...`.

## Demo accounts

All passwords `Demo@1234`. Rahul (HR Manager, admin), Priya (HR Executive),
Karthik (Talent Acquisition), Anitha (HR Business Partner), Arun (Engineering
Manager, interviewer), Divya (Senior Engineer, interviewer), Suresh (Lead Data
Scientist, interviewer), Nisha (DevOps Lead, interviewer), Vikram (Product
Manager, employee), Lakshmi (Frontend Lead, employee). Emails are
`<firstname>@aimious.demo`.

## Further reading

- [plan.md](plan.md): decisions, architecture, data model, API, pages, seed
  data, testing strategy and build phases.
