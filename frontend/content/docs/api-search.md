---
title: Search
description: One ranked search over series, districts, DSE instruments and curated topics.
section: API reference
order: 3
---

# Search

```bash
curl -H "X-API-Key: bd_live_..." \
  "https://api.bangladatahub.com/v1/search?q=remittance&limit=20"
```

The response contains ranked hits with `kind`, `id`, `title`, `subtitle`, `url` and a score.
`kinds` filters the result: `series` or `district` (`all` includes both).

Search is trigram-backed (`pg_trgm`) and tolerant of typos; the default kind is `series` so
existing spreadsheet integrations keep working.
