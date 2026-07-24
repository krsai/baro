# BARO

BARO is a garment factory production management SaaS project.
The main product areas are AT estimation and the scheduler.

Detailed domain rules, operations notes, and current source-of-truth guidance live in [AGENTS.md](./AGENTS.md).

## Docs Policy

- `AGENTS.md`: single source of truth for domain and operations rules
- `todo.md`: only active implementation and production-verification work
- `CLAUDE.md`: minimal pointer file for AI tooling
- `INVENTORY_PROFITABILITY_PLAN.md`: paused future roadmap; do not implement until the user explicitly starts the BOM/inventory phase

For normal work, read only `AGENTS.md` and `todo.md`.
`INVENTORY_PROFITABILITY_PLAN.md` is reference material and must not override either current document.

## Setup

Create local env files:

```powershell
npm run setup:env
```

Start the app:

```powershell
npm run dev
```

Run regression tests:

```powershell
npm run test:regression
```

## Main Paths

- Frontend: `frontend`
- Backend: `backend`
- Main project guide: `AGENTS.md`
- Baseline reset script: `backend/scripts/reset-to-baseline.js`

## Stack

- Frontend: `Vite + React 19`
- Backend: `Express + TypeScript + Prisma + PostgreSQL`

When README and AGENTS differ, follow `AGENTS.md`.
