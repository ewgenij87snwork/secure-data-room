# Secure Data Room

> A production-minded Data Room MVP for organizing and deliberately sharing due-diligence PDFs.

[![GitHub](https://img.shields.io/badge/GitHub-ewgenij87snwork-111827?logo=github&logoColor=white)](https://github.com/ewgenij87snwork)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Yevgeniy%20Sorokin-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/yevgeniy-sorokin-829b7b18a/)

## See it live

- **Web:** [secure-data-room-web.vercel.app](https://secure-data-room-web.vercel.app)
- **API health:** [secure-data-room-api.vercel.app/v1/health](https://secure-data-room-api.vercel.app/v1/health)
- **Repository:** [github.com/ewgenij87snwork/secure-data-room](https://github.com/ewgenij87snwork/secure-data-room)

The Web and API expose their build identity and are promoted from one verified commit.

## A two-minute reviewer tour

1. Sign in with Google. A private default Data Room is created for the owner.
2. Create nested folders and follow breadcrumbs; use the PDF drop zone to upload one or more files.
3. Open the file menu to rename, move, or delete a document.
4. Select **Share** on a room or folder. Create a public read-only link, or grant a verified email view-only access.
5. Open the link in a private window to see the read-only view. Revoke it from the owner’s Share dialog.

<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: no-preference)" srcset="assets/readme/secure-data-room-demo.gif">
    <img src="assets/readme/secure-data-room-demo.svg" alt="Secure Data Room reviewer tour: private workspace, upload, and read-only sharing" width="900">
  </picture>
</p>

> The animation is a compact reviewer tour; a static storyboard is used when reduced motion is preferred.

## What is implemented

| Capability                                                                   | Status            | Evidence                                                  |
| ---------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| Google authentication and private owner boundary                             | Implemented       | `apps/api/src/auth/`, `apps/api/src/access-control/`      |
| Nested folders, breadcrumbs, rename, and move                                | Implemented       | `apps/api/src/nodes/`, `apps/web/src/features/data-room/` |
| Multi-PDF drag/drop with per-file progress, retry, cancel, and validation    | Implemented       | `apps/web/src/features/uploads/`, `apps/api/src/uploads/` |
| PDF view and delete flows                                                    | Implemented       | Web node features and API node tests                      |
| Public-link subtree access and revoke                                        | Implemented       | `apps/api/src/shares/`, public-token tests                |
| Permissioned read-only sharing and Shared with me                            | Implemented       | Share/access-control services and tests                   |
| Loading, empty, offline, conflict, quota, gone, revoked, invalid-link states | Implemented       | Web feature tests and stable API error contracts          |
| Responsive and keyboard-accessible flows                                     | Implemented       | Web component tests and UI contracts                      |
| Filename search and file versioning                                          | Excluded from MVP | Intentionally not implemented or claimed                  |

## Architecture

```mermaid
flowchart LR
  W[React + Vite web] -->|Bearer JWT and REST| A[NestJS API]
  W -->|OAuth and session| AU[Supabase Auth]
  A -->|Prisma through pooled connection| DB[(PostgreSQL)]
  A -->|short-lived signed capabilities| S[Private Supabase Storage]
  W -->|signed TUS upload and short-lived read URL| S
```

NestJS is the only application backend and authorization authority. Prisma is the only application-table access path. The browser uses Supabase directly only for identity and narrowly scoped signed Storage operations; it never queries application tables. PDF bytes never pass through a NestJS request body. Storage keys are immutable random identifiers, not user filenames.

### Data model

```mermaid
erDiagram
  USER_PROFILE ||--o{ DATA_ROOM : owns
  DATA_ROOM ||--o{ NODE : contains
  NODE ||--o{ NODE : parent_of
  USER_PROFILE ||--o{ UPLOAD_SESSION : starts
  NODE ||--o{ UPLOAD_SESSION : receives
  NODE ||--o| SHARE : targets
  USER_PROFILE ||--o{ SHARE : grants
  USER_PROFILE o|--o{ SHARE : receives
  NODE ||--o| STORAGE_CLEANUP_JOB : cleans
```

Source of truth: [`prisma/schema.prisma`](prisma/schema.prisma).

## Security posture and honest limits

- Server-side auth checks issuer, audience, expiry, subject, and JWKS signature; protected reads and mutations pass through `AccessPolicyService`.
- The bucket is private, object keys are random, and public-link secrets are 256-bit random values stored only as SHA-256 digests. Tokens begin in the URL fragment and are removed after capture.
- Public sharing is read-only and scoped to the selected subtree. Revocation blocks new access; an already-issued signed PDF URL has a disclosed maximum residual TTL of 60 seconds.
- PostgreSQL RLS, quotas, runtime kill switches, tombstones, and an idempotent storage cleanup job provide defense in depth.
- This is a take-home MVP, not a compliance certification. Malware scanning, immutable audit logging, retention/backups, enterprise identity, WAF policy, and incident response remain outside this submission.

## Scale decisions

- Recursive PostgreSQL CTEs compute bounded subtree impact and total size; they are also the rebuild/audit path.
- A 100,000-file room lists one parent at a time with keyset pagination over `(kind, normalizedName, id)` and a hard page limit; the whole tree is never rendered.
- `Share` targets a room root, folder, or file and stores `VIEWER`/`EDITOR`; the MVP exposes only view-only sharing.

## Local setup

Prerequisites: Node.js 24.x, Corepack, pnpm 11.17.0, and a disposable PostgreSQL/Supabase development database.

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill .env.local with local values; never commit it.
set -a && source ./.env.local && set +a
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm dev
```

Local Web is `http://localhost:5173`, API is `http://localhost:3000/v1`, and Swagger is `http://localhost:3000/docs`. Keep server-only credentials out of `VITE_*`.

## Verification

```bash
pnpm architecture:check
pnpm placeholders:check
pnpm format:check
git diff --check
pnpm verify
```

The deployed release identity can be checked with:

```bash
pnpm deployment:sha:check -- \
  --web-url https://secure-data-room-web.vercel.app \
  --api-url https://secure-data-room-api.vercel.app
```

## Deliberate trade-offs

- One default room per owner keeps the deadline model small; multiple rooms would need an explicit default-room choice.
- Tombstones and cleanup-job records are the recoverable deadline-build boundary; production needs a reviewed retention and purge policy.
- Search and file versioning are optional assignment extras and intentionally excluded from this MVP.
- AI helped with requirement extraction, architecture review, traceability, and prose drafting. The engineer selected the scope, inspected the implementation, made the security decisions, and owns the accepted changes; AI output is not evidence.

## Creator

Built and submitted by **Yevgeniy Sorokin**.

<a href="https://github.com/ewgenij87snwork" aria-label="Yevgeniy Sorokin on GitHub"><img src="https://img.shields.io/badge/GitHub-ewgenij87snwork-111827?logo=github&logoColor=white" alt="GitHub: ewgenij87snwork"></a>
<a href="https://www.linkedin.com/in/yevgeniy-sorokin-829b7b18a/" aria-label="Yevgeniy Sorokin on LinkedIn"><img src="https://img.shields.io/badge/LinkedIn-Yevgeniy%20Sorokin-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn: Yevgeniy Sorokin"></a>

## License

No public reuse license is granted until the take-home owner confirms that publication is permitted.
