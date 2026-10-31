#!/usr/bin/env bash
# deploy.sh — deploy a commit of main to the VPS (/opt/bangladata is a git checkout of amaanjbutt/bdh).
#
#   ops/deploy/deploy.sh <sha|origin/main>     deploy, wait, print the log; exit 0 = live + healthy
#   ops/deploy/deploy.sh status <sha>          exit 0 ok · 3 still running · 1 failed (rolled back)
#   ops/deploy/deploy.sh current               print the live commit
#
# ops/deploy/deploy_from_pc.sh calls it over SSH with a key that authorized_keys pins to this script
# (forced command, see authorized_keys.example); the argument arrives in SSH_ORIGINAL_COMMAND. Steps:
#   fetch → refuse anything not on main → tag the running images :prev → checkout → build api +
#   scheduler → up -d → health checks (/health, /v1/status, scheduler stays up) → on failure, put the
#   :prev images and the previous commit back. The work runs detached (nohup) from a copy of this
#   script, so an SSH drop or the checkout rewriting this file can't kill a deploy half-way.
#
# Log: /var/log/bangladata-deploy.log · state: /opt/bangladata/.deploy_state · live commit: .deployed_sha
# Schema changes, catalog seeding and cache busting are NOT done here (docs/operations.md).
main() {
  set -euo pipefail
  local ROOT=/opt/bangladata LOG=/var/log/bangladata-deploy.log STATE=/opt/bangladata/.deploy_state
  local DC="docker compose -f docker-compose.server.yml"
  cd "$ROOT"
  local req="${SSH_ORIGINAL_COMMAND:-$*}" mode=deploy target
  if [ "$req" = current ]; then cat .deployed_sha 2>/dev/null || git rev-parse HEAD; return 0; fi
  case "$req" in
    "status "*) mode=status; target="${req#status }" ;;
    "__work "*) mode=work; target="${req#__work }" ;;
    *) target="$req" ;;
  esac
  if ! [[ "$target" =~ ^[0-9a-f]{40}$ || "$target" == "origin/main" ]]; then
    echo "usage: deploy.sh <40-char sha|origin/main> | status <sha> | current" >&2; return 2
  fi

  if [ "$mode" = status ]; then
    local line; line=$(grep -E "^$target " "$STATE" 2>/dev/null | tail -1 || true)
    echo "${line:-$target unknown}"
    case "$line" in *" ok "*) return 0 ;; *" running "*) return 3 ;; *) return 1 ;; esac
  fi

  if [ "$mode" = deploy ]; then
    git fetch --quiet origin main
    local sha; sha=$(git rev-parse "$target^{commit}")
    git merge-base --is-ancestor "$sha" origin/main || { echo "refusing $sha: not on main" >&2; return 2; }
    if [ "$(cat .deployed_sha 2>/dev/null || true)" = "$sha" ]; then
      echo "$sha already deployed"; return 0
    fi
    echo "$sha running $(date -u +%FT%TZ)" >> "$STATE"
    local copy; copy=$(mktemp /tmp/bangladata-deploy.XXXXXX.sh)
    cp "$ROOT/ops/deploy/deploy.sh" "$copy"
    SSH_ORIGINAL_COMMAND="__work $sha" nohup bash "$copy" >> "$LOG" 2>&1 < /dev/null &
    # follow the log until the worker records a result (or ~25 min)
    local i rc=3
    for i in $(seq 1 300); do
      sleep 5
      rc=0; main_status "$sha" || rc=$?
      [ "$rc" -ne 3 ] && break
    done
    tail -n 60 "$LOG"
    return "$rc"
  fi

  # ---- worker (detached) -------------------------------------------------------------------
  local sha="$target" prev ts
  exec 9>/var/lock/bangladata-deploy.lock
  flock -w 900 9 || { echo "$sha failed $(date -u +%FT%TZ) lock" >> "$STATE"; return 1; }
  ts=$(date -u +%Y%m%d_%H%M%S)
  prev=$(cat .deployed_sha 2>/dev/null || git rev-parse HEAD)
  echo "=== $ts deploy $sha (previous $prev)"
  for svc in api scheduler; do
    docker image inspect "bangladata-$svc:latest" >/dev/null 2>&1 && docker tag "bangladata-$svc:latest" "bangladata-$svc:prev"
  done
  local caddy_changed=0
  git diff --quiet "$prev" "$sha" -- ops/caddy 2>/dev/null || caddy_changed=1

  # (no --remove-orphans: it would kill long `docker compose run -d` backfills)
  if git checkout --quiet --force "$sha" && $DC build api scheduler && $DC up -d && healthy; then
    [ "$caddy_changed" = 1 ] && $DC exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
    echo "$sha" > .deployed_sha
    echo "$sha ok $(date -u +%FT%TZ)" >> "$STATE"
    docker image prune -f >/dev/null 2>&1 || true
    docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
    echo "=== deployed $sha"
    return 0
  fi

  echo "=== deploy of $sha FAILED — rolling back to $prev"
  git checkout --quiet --force "$prev" || true
  for svc in api scheduler; do
    docker image inspect "bangladata-$svc:prev" >/dev/null 2>&1 && docker tag "bangladata-$svc:prev" "bangladata-$svc:latest"
  done
  $DC up -d --no-build api scheduler || true
  if healthy; then echo "=== rolled back to $prev (healthy)"; else echo "=== ROLLBACK UNHEALTHY — check now"; fi
  echo "$sha failed $(date -u +%FT%TZ) rolled-back-to-$prev" >> "$STATE"
  return 1
}

main_status() { SSH_ORIGINAL_COMMAND="status $1" main >/dev/null 2>&1; }

# API answers /health and /v1/status (DB reachable), and the scheduler stays up without restarting.
healthy() {
  local DC="docker compose -f docker-compose.server.yml" i r0 r1
  for i in $(seq 1 40); do
    if $DC exec -T api python -c "import urllib.request as u; [u.urlopen('http://127.0.0.1:8000'+p, timeout=10) for p in ('/health', '/v1/status')]" 2>/dev/null; then
      break
    fi
    [ "$i" = 40 ] && { echo "health: api not answering"; return 1; }
    sleep 3
  done
  r0=$(docker inspect -f '{{.RestartCount}}' bangladata-scheduler-1 2>/dev/null || echo x)
  sleep 30
  r1=$(docker inspect -f '{{.RestartCount}}' bangladata-scheduler-1 2>/dev/null || echo y)
  if [ "$r0" != "$r1" ] || [ "$(docker inspect -f '{{.State.Running}}' bangladata-scheduler-1 2>/dev/null)" != true ]; then
    echo "health: scheduler restarting"; $DC logs --tail 30 scheduler; return 1
  fi
  echo "health: ok"
}

main "$@"
exit $?
