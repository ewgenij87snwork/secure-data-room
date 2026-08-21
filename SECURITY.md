# Security policy

This is a time-boxed portfolio application, not a production data-room service. Do not upload
confidential, regulated, or irreplaceable documents to the public demo.

## Reporting

Report a suspected vulnerability privately to the repository owner. Do not include access tokens,
signed URLs, personal data, or uploaded document contents in a public issue.

## Intended controls

- private object bucket;
- short-lived signed reads;
- one-object signed uploads;
- server-side authorization;
- application and provider quotas;
- hashed public-link tokens;
- registration/upload/public-link kill switches;
- secret scanning and least-privilege environment separation.

Already issued signed URLs remain valid for at most their 60-second lifetime. The public demo is not
approved for confidential, regulated, or irreplaceable data.
