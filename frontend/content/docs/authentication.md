---
title: Authentication & keys
description: Create, rotate and revoke API keys; how the free credits work.
section: Introduction
order: 2
---

# Authentication & keys

## API keys

Keys start with `bd_live_`. The plaintext is shown once; we store only a SHA-256 hash.
Send it as `X-API-Key` (or `?api_key=` for a quick test).

```bash
curl -H "X-API-Key: bd_live_..." https://api.bangladatahub.com/v1/usage
```

Revoke a key from the dashboard at any time; revoked keys fail immediately.

## Free plan

The free plan includes **500 request credits per calendar month**, refilled on the first
of the month. At zero, requests return `402 credits_exhausted` until the balance refills or
you upgrade. Paid plans are not credit-metered; they use generous daily fair-use ceilings.

## Sessions

The dashboard uses an httpOnly session cookie, not an API key. Sign in at [/login](/login).
Google sign-in is enabled when the deployment has OAuth credentials configured.
