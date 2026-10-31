#!/usr/bin/env bash
# Submit all sitemap URLs to IndexNow (Bing / DuckDuckGo / Yandex — NOT Google).
# Free, official bulk submission. Re-run after big content changes / new series.
# Ownership is verified via the key file hosted at https://<host>/<key>.txt.
set -euo pipefail

KEY="330ad0ec44a194f9505e064e70fafabb"
HOST="bangladatahub.com"
KEYLOC="https://${HOST}/${KEY}.txt"
SITEMAPS=("sitemap-series.xml" "sitemap-core.xml" "sitemap-docs.xml" "sitemap-explorers.xml" "sitemap-topics.xml")
ENDPOINT="https://api.indexnow.org/indexnow"

tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp".chunk.*' EXIT

for sm in "${SITEMAPS[@]}"; do
  curl -s --compressed "https://${HOST}/${sm}" \
    | grep -oE '<loc>[^<]+</loc>' \
    | sed -E 's#</?loc>##g; s/&amp;/\&/g' \
    || true
done | sort -u | grep '^https://' > "$tmp"

total="$(wc -l < "$tmp" | tr -d ' ')"
echo "collected ${total} urls"

# IndexNow caps a request at 10,000 URLs; batch. Build each JSON body in a file
# (a 10k-URL body is too large to pass on the command line).
split -l 10000 "$tmp" "$tmp".chunk.
for chunk in "$tmp".chunk.*; do
  n="$(wc -l < "$chunk" | tr -d ' ')"
  body="${chunk}.json"
  awk -v host="$HOST" -v key="$KEY" -v kl="$KEYLOC" '
    BEGIN{printf "{\"host\":\"%s\",\"key\":\"%s\",\"keyLocation\":\"%s\",\"urlList\":[", host, key, kl}
    {printf "%s\"%s\"", (NR>1?",":""), $0}
    END{printf "]}"}' "$chunk" > "$body"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${ENDPOINT}" \
    -H 'Content-Type: application/json' --data-binary @"${body}")"
  echo "submitted ${n} urls -> HTTP ${code}"
  rm -f "$body"
done
echo "done."
