# Secure Data Room — implementation workspace

> **Current repository state:** contract-first foundation. The application must not be submitted from
> this state. The integrator promotes the verified reviewer README only after all mandatory flows,
> deployments, and final-SHA smoke evidence are complete.

This monorepo implements a secure virtual Data Room for organizing and sharing due-diligence PDFs.
The approved architecture deliberately uses a React/Vite SPA and one NestJS application backend,
with Prisma/PostgreSQL plus Supabase Auth and private Storage.

## Start here

1. Read [`AGENTS.md`](AGENTS.md).
2. Read the repository acceptance registries under [`docs/execution/`](docs/execution/), beginning
   with the architecture audit and requirement traceability matrix.
3. Execute the owner-shared approved foundation task contract supplied by the integrator; working
   specs and plans are deliberately not duplicated inside the repository.
4. Freeze the contract commit and create the isolated worktrees described in
   [`docs/execution/PARALLEL-EXECUTION.md`](docs/execution/PARALLEL-EXECUTION.md).
5. Use `pnpm progress` after every verified task.

The finished reviewer-facing README is drafted at
[`docs/reviewer/README-DRAFT.md`](docs/reviewer/README-DRAFT.md). It may replace this file only when
its implementation claims and links are supported by final evidence.

## Architecture boundary

```text
Browser (React/Vite)
  ├─ Supabase Auth
  ├─ signed one-object TUS upload / short-lived PDF read
  └─ NestJS REST API
       ├─ Prisma → PostgreSQL
       └─ service client → private Supabase Storage
```

- NestJS is the sole application backend and authorization authority.
- Prisma is the sole application-table data path.
- User filenames never become Storage keys.
- PDF bodies never pass through NestJS request bodies.
- Optional search cannot start before the required production smoke is green.
- File versioning is outside the deadline scope.

## Foundation commands

```bash
corepack enable
pnpm install
pnpm prisma:generate
pnpm contracts:check
pnpm architecture:check
pnpm progress
```

After an integrator creates and verifies the lockfile, all other sessions and CI use
`pnpm install --frozen-lockfile`.

## Evidence rule

AI output, local mocks, file counts, and a successful build are not deployment evidence. Completion
requires a fresh `pnpm verify` on the final commit plus deployed owner, recipient, and public-link
journeys bound to the same Git SHA.
