## Summary

<!-- What mandatory product capability does this PR deliver? -->

## Two-minute reviewer tour

<!-- Exact steps against the deployed final-SHA application. -->

## Live endpoints

- Web: `{{WEB_URL}}`
- API docs: `{{API_DOCS_URL}}`
- Final Git SHA: `{{GIT_SHA}}`

## Architecture and boundaries

- [ ] React/Vite remains UI-only.
- [ ] NestJS is the sole application backend and authorization authority.
- [ ] Prisma is the sole application-table data path.
- [ ] Storage is private and browser access is limited to signed capabilities.

## Required functionality

<!-- Link each assignment row to code, test, and deployed evidence. -->

## Edge cases deliberately handled

<!-- Same-name race, mixed uploads, stale revision, delete-while-viewed, revoke, cleanup failure. -->

## Security model

<!-- Identity, policy, storage, token, quotas, headers, RLS/grants, shutdown. -->

## Verification evidence

| Gate | Command / scenario | Result | Evidence |
|---|---|---:|---|
| Local verification | `pnpm verify` | `{{PASS}}` | `{{EVIDENCE}}` |
| Deployed E2E | `pnpm e2e:deployed` | `{{PASS}}` | `{{EVIDENCE}}` |
| Owner/viewer/public smoke | browser profiles | `{{PASS}}` | `{{EVIDENCE}}` |
| Same SHA | web + API `/v1/health/version` | `{{PASS}}` | `{{EVIDENCE}}` |

## Visual evidence

<!-- Add only production screenshots/GIF with synthetic data and redacted identities/tokens. -->

## Scale decisions

<!-- Subtree totals; 100k listing/pagination/indexes; viewer/editor extension. -->

## AI usage and human judgement

<!-- State where AI helped and which architecture/scope/review decisions the candidate owned. -->

## Trade-offs / intentionally excluded scope

<!-- Do not claim optional or production capabilities that are absent. -->

## Shutdown instructions

```bash
pnpm ops:lockdown -- --confirm
pnpm ops:maintenance:on -- --confirm
```

## Reviewer checklist

- [ ] No placeholders, secrets, dead UI, or unsupported claims.
- [ ] Every mandatory requirement has final-SHA evidence.
- [ ] Known residual risks are disclosed.
- [ ] README, deployed behavior, tests, and PR agree.
