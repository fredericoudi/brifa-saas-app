# Routing Architecture

## Canonical application surfaces

- Landing: separate project outside this repo
- Agency app: `/app/[slug]/...`
- Platform app: `/app/platform/...`
- Platform login: `/app/platform-login`

## Legacy aliases kept for compatibility

These routes still exist only to preserve old links and should redirect or re-export canonical routes.

- Agency legacy aliases: `/dashboard`, `/jobs`, `/tasks`, `/archived`, `/clients`, `/team`, `/workload`, `/settings`
- Platform legacy aliases: `/platform`, `/master`, `/master-panel`, `/admin`, `/plataform`
- Agency slug shortcut: `/{slug}` redirects to `/app/{slug}`

## Current implementation policy

- Canonical platform pages live under `app/app/platform/...`
- Canonical agency routes live under `app/app/[slug]/(panel)/...`
- This repo no longer serves the landing fallback for `/`; `brifa.app` root is owned by the separate landing project
- Agency page implementations now live in `features/agency-panel/pages/...`; route folders should stay thin
- Agency shell access logic now lives in `features/agency-panel/server/agency-shell.tsx`
- Legacy top-level agency routes under `app/(app)/...` now only redirect to canonical `/app/[slug]/...` paths
- Legacy platform routes under `app/platform/...` now only redirect to canonical `/app/platform/...` paths
- Legacy aliases should stay thin and never contain business logic
- Shared UI and domain logic should move out of route folders over time
