# Aimious Recruit frontend

Vite + React 19 + TypeScript 5.9, Tailwind CSS v4 and shadcn/ui (Radix). See `../plan.md` sections 3.2, 7 and 8 for the architecture and design system.

## Commands

| Command                           | Does                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                     | Vite on http://localhost:5175, proxies `/api` to Django on 8200 |
| `npm run build`                   | `tsc -b` then `vite build` into `dist/`                         |
| `npm run preview`                 | Serves `dist/` on 5175                                          |
| `npm run typecheck`               | Project-wide `tsc -b --noEmit`                                  |
| `npm run lint`                    | ESLint, zero warnings allowed                                   |
| `npm run format`                  | Prettier                                                        |
| `npm test` / `npm run test:watch` | Vitest with jsdom and Testing Library                           |

## Layout

- `src/app/` router, providers, `layout/` (AppShell, Sidebar, TopBar)
- `src/lib/` axios client with refresh interceptor, auth store, query keys, formatters
- `src/components/ui/` shadcn output (do not hand-edit; re-run `npx shadcn add <name> --overwrite`)
- `src/components/shared/` project components (PageHeader, HealthPill, ...)
- `src/features/<domain>/` pages
- `public/brand/` Aimious marks

Copy `.env.example` to `.env` if the API is not on the same origin.

The dev proxy targets `http://127.0.0.1:8200` rather than `localhost` on purpose: `make api` binds IPv4 only and Node may resolve `localhost` to `::1`.
