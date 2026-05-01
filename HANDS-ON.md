# Hands-on guide for Slate

This file is the kickoff guide for the build session. Read it top to bottom before pasting any prompt.

## Screenshots

When you hit a UI milestone (auth screen done, bookings list working, calendar week view live, etc.), capture a screenshot and save it to `/screenshots/` at the repo root. Use descriptive filenames like `01-auth-signup.png`, `02-org-switcher.png`, `03-bookings-dashboard.png`, `04-calendar-week.png`, `05-analytics-home.png`, `06-public-book.png`.

**Embed every screenshot in README.md** via relative markdown image refs: `![Bookings dashboard](screenshots/03-bookings-dashboard.png)`. A public repo with screenshots embedded in the README is a complete portfolio artifact. **A live deploy URL is optional, not required.** Most viewers who land on the GitHub page see the app in action through the README; that IS the demo.

`/screenshots/` is the one canonical location for source image files. Do not duplicate them into `/docs/` or `/public/`. The README and the portfolio site both reference them from `/screenshots/` (the portfolio-maintainer copies them to the site's public dir at promotion time).

The portfolio-maintainer at `~/projects/portfolio/.claude/agents/portfolio-maintainer.md` looks in `/screenshots/` when deciding whether to promote the project to atifali.pages.dev. No screenshots = the project does not qualify.

## Preflight

Before Phase 1, confirm:

- Node 20+ available (`node --version`). If `/usr/bin/node` is v12, prepend mise's bin to PATH per the Node PATH gotcha memory.
- Docker running for local Postgres (`docker ps` should not error).
- Ports free: 3000 (Next.js dev), 5432 (Postgres).
- pnpm available (`pnpm --version`); if not, `npm install -g pnpm` via mise's npm.
- gh CLI authenticated under `atifali-pm` (already verified during scaffold).

## Phase plan

- [ ] **Phase 1** — Multi-tenant scaffold + Auth.js + seed data
- [ ] **Phase 2** — Bookings CRUD + availability rules + conflict detection
- [ ] **Phase 3** — Admin dashboard with filters, inline actions, mobile-responsive (load-bearing)
- [ ] **Phase 4** — Calendar week view + day view + drag-to-reschedule
- [ ] **Phase 5** — Analytics cards on home page
- [ ] **Phase 6** — Public booking page + mobile polish

## Phase 1 kickoff prompt (paste this into Cursor or Claude in `~/projects/slate/`)

```
You are starting Phase 1 of Slate, a multi-tenant appointment booking admin dashboard.

Read these first:
- ./HANDS-ON.md (this file)
- ./README.md (product framing)
- ~/.claude/projects/-home-atif-projects-slate/memory/project_slate.md (scope and stack)
- ~/.claude/projects/-home-atif-projects-slate/memory/CLAUDE.md (per-project rules; load-bearing)

Stack: Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + Drizzle ORM + PostgreSQL + Auth.js. Package manager: pnpm.

Phase 1 deliverables:

1. Initialize Next.js 15 app with TypeScript, App Router, Tailwind. Use `pnpm create next-app@latest .` against the existing repo (the README, LICENSE, HANDS-ON, and screenshots/ directory must survive).

2. Install and configure shadcn/ui. Add at minimum: Button, Input, Label, Select, Dialog, Table, Badge, Card, Toast.

3. Install Drizzle ORM + drizzle-kit + postgres driver. Add a docker-compose.yml at the repo root that boots Postgres 16 on 5432 with a named volume.

4. Drizzle schema covering:
   - organizations (id, slug, name, created_at)
   - users (id, email, hashed_password, name, created_at)
   - memberships (user_id, org_id, role: owner|manager|stylist)
   - services (id, org_id, name, duration_minutes, price_cents)
   - customers (id, org_id, name, email, phone)
   - bookings (id, org_id, customer_id, service_id, staff_user_id, start_at, end_at, status: pending|confirmed|cancelled|completed, notes)
   - availability_rules (id, org_id, staff_user_id, weekday, start_minute, end_minute)

5. Auth.js with Credentials provider (email + bcrypt-hashed password). After login, the user picks an active org from their memberships; store active org_id in the session/JWT. Add a tiny org-switcher dropdown in the top nav.

6. App-level tenant guard helper: a server-side `requireOrgScope()` that pulls the active org_id off the session and throws if missing. Every server action and route handler that touches per-org tables must call it.

7. Seed script (`pnpm db:seed`) that creates:
   - Bella's Salon org (slug: bellas-salon)
   - 3 staff: Maria (owner), Jordan (manager), Priya (stylist) — all password "demo1234"
   - 5 services: Haircut 30min $40, Color 90min $120, Blowout 45min $50, Beard Trim 20min $25, Highlights 120min $180
   - 20 customers with realistic names, emails, phones
   - 60 bookings spread across the past 30 days and the next 30 days, mixed across staff and statuses
   - Default availability rules: M-F 9am-5pm for all staff

8. Minimal landing page at `/` (logged out) and `/dashboard` (logged in) showing org name + counts of bookings, customers, services. Phase 3 will replace the dashboard.

Hard rules to honor (per project memory):
- No Co-Authored-By in any commit message, ever.
- README content rules: do NOT add setup, license, ERD, or tech stack sections to README.md. Phases, features, screenshots only.
- Commit per logical chunk with imperative messages ("Add Drizzle schema", not "Added schema"). One Phase 1 final commit at minimum, more is fine.
- Take screenshots when the auth screen and the placeholder dashboard render; save to /screenshots/ and embed in README.

When Phase 1 is complete, save a phase-completion memory at `~/.claude/projects/-home-atif-projects-slate/memory/project_slate_phase1_complete.md` and propose Phase 2.

Begin.
```

## Known gotchas

- `/usr/bin/node` is v12 and shadows mise's Node 22. Per `reference_node_path_gotcha.md`, prepend mise's bin to PATH for any non-interactive npm or pnpm call.
- Docker stacks across all projects are stopped by default per `project_docker_stacks.md`. Bring up Slate's Postgres explicitly with `docker compose up -d` from the repo root.
- Auth.js v5 (NextAuth v5) has different API surface from v4. Pin to v5 from the start to avoid migration churn.
- Multi-tenant isolation is the riskiest correctness surface. Every per-org query must go through `requireOrgScope()` or pass `org_id` explicitly. App-level for now; Postgres RLS is a Phase 2+ option if appetite for complexity is there.
- `pnpm create next-app` will refuse to run in a non-empty directory. Either run with `--yes` against the repo root and let it skip the existing files, or scaffold into a temp dir and copy in.
