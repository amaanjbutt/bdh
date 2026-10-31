#!/usr/bin/env bash
# deploy_from_pc.sh — deploy main from the owner's PC. GitHub Actions only runs CI (tests,
# lint, build, secret scan); deploys run here so they spend no Actions minutes.
#
#   ops/deploy/deploy_from_pc.sh [all|vps|web|relay ...] [--force] [--dry-run] [--no-ci]
#
#   vps     SSH (forced-command key) -> ops/deploy/deploy.sh <sha> on the VPS (rebuild,
#           health check, automatic rollback)
#   web     npm ci + build in frontend/ -> wrangler deploy (this PC's `wrangler login`)
#   relay   ops/relay/ -> wrangler deploy of the bangladata-relay Worker
#
# "all" (the default) deploys each part only when its files changed since the commit that is
# live there; --force deploys the named parts anyway. --dry-run shows what would happen.
# Refuses unless HEAD is origin/main with a clean tree and CI passed on that commit
# (--no-ci skips that check, for emergencies only). Run from Git Bash at the repo root.
#
# Required env / files (gitignored, never committed):
#   VPS_HOST            hostname or IP of the API VPS
#   BDH_CD_KEY          default local/secrets/bangladata_cd
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
VPS_HOST=${VPS_HOST:?set VPS_HOST to the API server}
CD_KEY=${BDH_CD_KEY:-$ROOT/local/secrets/bangladata_cd}
REPO=amaanjbutt/bdh
WRANGLER="npx --yes wrangler@4.151.3"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

parts=() force=0 dry=0 ci=1
for a in "$@"; do
  case "$a" in
    all|vps|web|relay) parts+=("$a") ;;
    --force) force=1 ;;
    --dry-run) dry=1 ;;
    --no-ci) ci=0 ;;
    *) echo "usage: $0 [all|vps|web|relay ...] [--force] [--dry-run] [--no-ci]" >&2; exit 2 ;;
  esac
done
[ ${#parts[@]} -eq 0 ] && parts=(all)
[[ " ${parts[*]} " == *" all "* ]] && parts=(vps web relay)

say() { printf '\n== %s\n' "$*"; }

# ---- what are we deploying ---------------------------------------------------------------------
git fetch --quiet origin main
SHA=$(git rev-parse HEAD)
if [ "$SHA" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD is not origin/main — check out main and pull first" >&2; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "working tree has changes — commit or stash them first" >&2; exit 1
fi
say "deploying ${SHA:0:7}: $(git log -1 --format=%s)"

if [ "$ci" = 1 ]; then
  # every check run on this commit must finish green (skipped jobs are fine); wait up to 25 min
  for i in $(seq 1 75); do
    read -r total pending bad < <(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" --jq '
      "\(.check_runs | length) \([.check_runs[] | select(.status != "completed")] | length) \([.check_runs[]
       | select(.status == "completed" and ((.conclusion // "") as $c | ["success","skipped","neutral"]
       | index($c) | not))] | length)"')
    if [ "$bad" -gt 0 ]; then echo "CI failed on ${SHA:0:7} — not deploying" >&2; exit 1; fi
    if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then echo "CI green ($total checks)"; break; fi
    [ "$i" = 75 ] && { echo "CI still running after 25 min — try again later" >&2; exit 1; }
    [ "$i" = 1 ] && echo "waiting for CI on ${SHA:0:7} …"
    sleep 20
  done
fi

# changed <since-sha> <paths…>: true when any path differs (or the live commit is unknown here)
changed() {
  local since=$1; shift
  [ "$force" = 1 ] && return 0
  [ -z "$since" ] && return 0
  git cat-file -e "$since^{commit}" 2>/dev/null || return 0
  ! git diff --quiet "$since" "$SHA" -- "$@"
}

vps_ssh() { ssh -i "$CD_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=8 "root@$VPS_HOST" "$1"; }

# ---- vps: deploy.sh on the VPS (rebuild api + scheduler, health check, rollback) ----------------
deploy_vps() {
  local live rc=0
  live=$(vps_ssh current 2>/dev/null | tr -d '\r' | grep -E '^[0-9a-f]{40}$' || true)
  if ! changed "$live" backend docker-compose.server.yml ops/deploy ops/caddy; then
    say "vps: already at ${live:0:7}, nothing changed"; return
  fi
  say "vps: deploying (live ${live:0:7} -> ${SHA:0:7}; ~5-10 min, rolls back by itself on failure)"
  [ "$dry" = 1 ] && { echo "(dry run: not deployed)"; return; }
  vps_ssh "$SHA" || rc=$?
  # 255 = the SSH connection dropped; the deploy keeps running on the VPS — poll its status
  for _ in $(seq 1 60); do
    [ "$rc" = 255 ] || [ "$rc" = 3 ] || break
    sleep 20; rc=0; vps_ssh "status $SHA" || rc=$?
  done
  [ "$rc" = 0 ] || { echo "vps deploy failed (rc=$rc) — see /var/log/bangladata-deploy.log on the VPS" >&2; return 1; }
  say "vps: live at ${SHA:0:7}"
}

# worker_live <name>: the commit a Worker was last deployed from (its deploy message bdh@<sha>)
worker_live() {
  $WRANGLER deployments list --name "$1" --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);const m=(d.at(-1)?.annotations?.["workers/message"]||"").match(/bdh@([0-9a-f]{40})/);console.log(m?m[1]:"")}catch{console.log("")}})' || true
}

# ---- web: build the site and wrangler deploy it ------------------------------------------------
deploy_web() {
  local live
  live=$(cd frontend && worker_live bangladatahub)
  if ! changed "$live" frontend; then say "web: already at ${live:0:7}, nothing changed"; return; fi
  say "web: building and deploying (live ${live:0:7} -> ${SHA:0:7})"
  [ "$dry" = 1 ] && { echo "(dry run: not deployed)"; return; }
  (
    cd frontend
    npm ci --no-audit --no-fund
    npm run build
    # nitro writes the worker config here; anything but the live worker's name would create a new worker
    grep -q '"name": "bangladatahub"' .output/server/wrangler.json || { echo "worker name is not bangladatahub" >&2; exit 1; }
    $WRANGLER deploy --message "bdh@$SHA"
  )
  say "web: live at ${SHA:0:7}"
}

# ---- relay: the bangladata-relay Worker (ops/relay/) --------------------------------------------
deploy_relay() {
  local live
  live=$(cd ops/relay && worker_live bangladata-relay)
  if ! changed "$live" ops/relay; then say "relay: already at ${live:0:7}, nothing changed"; return; fi
  say "relay: deploying the bangladata-relay Worker (live ${live:0:7} -> ${SHA:0:7})"
  [ "$dry" = 1 ] && { echo "(dry run: not deployed)"; return; }
  (cd ops/relay && $WRANGLER deploy --message "bdh@$SHA")
  say "relay: live at ${SHA:0:7}"
}

for p in "${parts[@]}"; do
  case "$p" in
    vps) deploy_vps ;;
    web) deploy_web ;;
    relay) deploy_relay ;;
  esac
done
say "done"
