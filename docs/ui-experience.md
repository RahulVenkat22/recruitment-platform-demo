# TalentOS UI experience

The redesigned workspace uses a deep navy navigation panel, teal actions, cool white surfaces, and the existing Buro Happold lime accents and logo assets. Geist remains the interface font; Manrope supplies the heading and metric hierarchy.

## Shared system

- `frontend/src/index.css`: palette, type scale, radii, surface themes, and elevation.
- `frontend/src/experience.css`: shared interaction styles, responsive refinements, modal and tab transitions, ambient illustration, and CSS reduced-motion support.
- `frontend/src/components/shared/PageHeader.tsx`: route-specific context, titles, actions, page metadata, and breadcrumbs. Headers remain sticky on desktop and scroll normally on phones.
- `frontend/src/app/layout/`: responsive navigation, moving active indicator, search, account controls, route entrances, and scroll/focus reset on page navigation.
- `frontend/src/lib/hooks/useMotionPreference.ts`: combines the saved animation setting with a live subscription to the system preference. The system setting takes precedence.

## Page coverage

The homepage combines live job-status counts, shortcuts and the existing hiring table. Dashboard charts and figures animate while retaining their accessible table alternatives. Job, candidate, interview and support workflows share the refreshed tables, controls, status treatments and dialogs. Candidate stages, Kanban columns, the interview calendar, notifications and timelines have updated spacing and interaction feedback.

Search, resume uploads and email templates include compact workflow guidance. Settings uses a vertical section navigator on desktop and a horizontal strip on phones. Login pairs an animated talent illustration with a light form; the brief welcome transition opens the workspace after 900 ms and is skipped when reduced motion is enabled. The not-found page offers a clear route back home.

Existing API contracts, permission checks, form validation, filtering, routing and mutations remain in place. The homepage's summary counts come from the accessible-job facets and explicitly describe that scope; filters below apply to the work table.

## Motion

- Route entrances: 450 ms.
- List entrances: 450 ms, staggered by 45 ms, with the delay capped at eight items.
- Tabs: 350 ms; dialogs and drawers: 280 ms.
- Charts and progress: approximately 600–900 ms.
- Number transitions: 850 ms, with the final value available immediately to assistive technology.
- **Settings → Preferences → Interface animations** saves the choice in this browser. Device reduced-motion changes take effect immediately, including CSS effects, charts, counters and background video.

Animations use the existing Motion dependency and lightweight CSS. No new runtime dependency or generated bitmap asset is required.

## Verification

From `frontend/`:

```bash
npm run build
npm run lint
npm test -- --maxWorkers=4
node scripts/verify-experience.mjs
```

The browser script requires the running frontend/API and seeded demo data. It opens the main pages and detail tabs at 1440 px and 390 px, checks page and content overflow, verifies API-backed rendering, and exercises mobile navigation, modal closing, the command palette, sidebar collapse and persisted/system motion preferences. It does not submit hiring, email, call or support mutations. Screenshots are written to the ignored `frontend/.screenshots/redesign/` folder.

Use `node scripts/verify-experience.mjs --interactions-only` to rerun only the interaction checks. `SHOTS_BASE_URL`, `SHOTS_USER` and `SHOTS_PASSWORD` can override the local demo defaults.
