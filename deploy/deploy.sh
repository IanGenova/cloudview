#!/usr/bin/env bash
#
# Deploy CloudView.
#
# Every guard below exists because its absence caused a real outage:
#
#   * The database is resolved with Next.js's own env precedence. `.env` on this
#     server points at a local decoy database while the app reads
#     `.env.production.local`. A bare `prisma migrate deploy` migrated the decoy
#     and reported success, which is how a migration "ran" for weeks without
#     ever touching production.
#
#   * `migrate deploy` runs on every deploy, unconditionally. Skipping it
#     because "this commit has no migration" is only safe if every earlier
#     commit was deployed, and that assumption failed: a pull spanning two
#     commits left the schema a migration behind and took out three modules.
#
#   * The steps are chained so a failure stops the deploy. If the migration
#     fails, nothing is built and nothing is reloaded, and the old working
#     release keeps serving. Half-deploying is worse than not deploying.
#
#   * The database being targeted is printed before anything is written, with
#     the password stripped. Deciding which database you are on afterwards is
#     too late.
#
# Usage:
#   ./deploy/deploy.sh              pull, migrate, build, reload
#   ./deploy/deploy.sh --dry-run    show what would happen, change nothing
#   ./deploy/deploy.sh --no-pull    deploy what is already checked out
#
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="${PM2_APP_NAME:-cloudview-nextjs}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/dashboard/login}"

DRY_RUN=0
DO_PULL=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-pull) DO_PULL=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then echo "[dry-run] $*"; else eval "$@"; fi; }

# ---------------------------------------------------------------------------
# Resolve DATABASE_URL exactly the way Next.js does in production, so this
# script and the running app can never disagree about which database is live.
# ---------------------------------------------------------------------------
# Walk the files in that order and take the first DATABASE_URL. Assigning
# inside a $(...) subshell would lose which file it came from, so this stays
# inline -- knowing the source file is half the diagnostic.
step "Resolving the target database"

DATABASE_URL_SOURCE=""
RESOLVED_URL=""

for env_file in .env.production.local .env.local .env.production .env; do
  [ -f "$env_file" ] || continue
  line="$(grep -m1 '^DATABASE_URL=' "$env_file" 2>/dev/null || true)"
  [ -n "$line" ] || continue
  RESOLVED_URL="$(printf '%s' "$line" | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')"
  DATABASE_URL_SOURCE="$env_file"
  break
done

if [ -z "$RESOLVED_URL" ]; then
  echo "No DATABASE_URL found in any env file. Refusing to continue." >&2
  exit 1
fi

export DATABASE_URL="$RESOLVED_URL"

# Everything before '@' is credentials. Never print it.
SAFE_TARGET="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*@#@#')"
echo "  source : ${DATABASE_URL_SOURCE}"
echo "  target : ${SAFE_TARGET}"

case "$SAFE_TARGET" in
  *localhost*|*127.0.0.1*)
    echo
    echo "  WARNING: this resolves to a database on this machine." >&2
    echo "  On this deployment the live database is remote, and a local one" >&2
    echo "  has previously been a decoy that silently absorbed migrations." >&2
    echo "  Confirm this is intended before continuing." >&2
    if [ "$DRY_RUN" -eq 0 ]; then
      read -r -p "  Continue anyway? [y/N] " reply
      case "$reply" in [yY]*) ;; *) echo "Aborted."; exit 1 ;; esac
    fi
    ;;
esac

if [ "$DO_PULL" -eq 1 ]; then
  step "Pulling latest"
  LOCK_BEFORE="$(md5sum package-lock.json 2>/dev/null || echo none)"
  run "git pull --ff-only"
  LOCK_AFTER="$(md5sum package-lock.json 2>/dev/null || echo none)"

  if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
    step "Dependencies changed - installing"
    run "npm ci"
  fi
fi

# ---------------------------------------------------------------------------
# Migrate before building. The build generates a Prisma client for the CURRENT
# schema; if the database is behind it, every query against the new columns
# throws P2022 at runtime and the affected pages return 500.
# ---------------------------------------------------------------------------
step "Applying migrations"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] npx prisma migrate deploy"
else
  if ! npx prisma migrate deploy; then
    cat >&2 <<'ENDHELP'

Migration failed, so nothing was built or reloaded. The previous release is
still serving.

P3009 or P3018 usually means the schema is correct but the migration history
disagrees -- the symptom of a fix applied by hand. Do not force it. Get the
full picture first:

  node scripts/migration-drift-report.cjs

That is read-only. It reports which pending migrations are already fully
present in this database (safe to mark applied), which are genuinely new, and
which need a human.
ENDHELP
    exit 1
  fi
fi

step "Building"
run "npm run build"

step "Reloading ${APP_NAME}"
run "pm2 reload ${APP_NAME} --update-env"

# ---------------------------------------------------------------------------
# Confirm the app actually came back. A reload that starts a process which then
# crashes on boot still reports success to pm2.
# ---------------------------------------------------------------------------
step "Health check"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] curl ${HEALTH_URL}"
else
  sleep 4
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || echo 000)"
  echo "  ${HEALTH_URL} -> ${CODE}"

  case "$CODE" in
    2*|3*)
      echo "  OK"
      ;;
    *)
      echo >&2
      echo "  Unhealthy. Recent errors:" >&2
      pm2 logs "$APP_NAME" --err --lines 20 --nostream >&2 || true
      exit 1
      ;;
  esac
fi

step "Done"
echo "  ${DATABASE_URL_SOURCE} -> ${SAFE_TARGET}"
echo "  $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
