#!/usr/bin/env bash
# Regenerate the catalog-driven sitemaps: series (with <lastmod>) and the static core.
# Run from the repo root, then deploy the frontend and run ops/seo/indexnow_submit.sh.
#
#   ops/seo/gen_sitemap.sh                    # local dev DB (docker compose)
#   SITEMAP_DB=prod VPS_HOST=... ops/seo/gen_sitemap.sh   # production DB over SSH
#
# Series: active + canonical + has data. <lastmod> = the series' last observation date.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash would otherwise rewrite "/" arguments into Windows paths
PUB="frontend/public"

if [ "${SITEMAP_DB:-local}" = "prod" ]; then
  : "${VPS_HOST:?set VPS_HOST for the production database}"
  psql_q() {
    ssh -i "${BDH_CD_KEY:-$HOME/.ssh/bangladata_deploy}" -o BatchMode=yes "root@$VPS_HOST" \
      "cd /opt/bangladata && docker compose -f docker-compose.server.yml exec -T db psql -U bangladata -d bangladata -t -A -F '|' -c \"$1\""
  }
else
  psql_q() { docker compose exec -T db psql -U bangladata -d bangladata -t -A -F '|' -c "$1"; }
fi

xml_escape() { sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'; }

# ---- series
OUT="$PUB/sitemap-series.xml"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  psql_q "SELECT id, last_date FROM series WHERE is_active AND canonical_id IS NULL AND last_date IS NOT NULL ORDER BY id;" \
    | sed 's/\r$//' | grep -v '^$' | xml_escape \
    | sed 's#^\([^|]*\)|\(.*\)$#  <url><loc>https://bangladatahub.com/series/\1</loc><lastmod>\2</lastmod></url>#'
  echo '</urlset>'
} > "$OUT"
echo "wrote $OUT ($(grep -c '<url>' "$OUT") urls)"

# ---- static core
OUT="$PUB/sitemap-core.xml"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  for path in "" pricing coverage market districts topics derived calendar status about changelog docs \
              data/forex data/inflation data/rates data/monetary data/external data/fiscal data/real \
              data/industry data/payments data/telecom data/energy data/commodities data/agri data/social data/regional; do
    echo "  <url><loc>https://bangladatahub.com/${path}</loc><priority>0.8</priority></url>"
  done
  echo '</urlset>'
} > "$OUT"
echo "wrote $OUT ($(grep -c '<url>' "$OUT") urls)"
