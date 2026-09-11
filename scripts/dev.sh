#!/usr/bin/env bash
###############################################################################
# Run the whole stack locally, without containers for the app code.
#
#   scripts/dev.sh            postgres (docker, 5434) + Django API (8200) + Vite (5175)
#   scripts/dev.sh --no-web   backend only
#   scripts/dev.sh --no-api   frontend only (expects an API already running)
#
# Ctrl-C stops every child process; the Postgres container is deliberately
# LEFT RUNNING so the next `scripts/dev.sh` starts instantly.  Stop it with
# `make db-down`.
#
# Environment overrides:
#   API_HOST=127.0.0.1  API_PORT=8200  WEB_PORT=5175  DB_PORT=5434
#   SKIP_MIGRATIONS=1   do not run `manage.py migrate`
#   SKIP_DB=1           do not touch docker at all (external Postgres)
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BACKEND="${ROOT}/backend"
FRONTEND="${ROOT}/frontend"
VENV="${BACKEND}/.venv"
COMPOSE_FILE="${ROOT}/docker-compose.yml"

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8200}"
WEB_PORT="${WEB_PORT:-5175}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="recruit"
DB_NAME="recruitment_demo"

RUN_API=1
RUN_WEB=1

for arg in "$@"; do
  case "${arg}" in
    --no-web)  RUN_WEB=0 ;;
    --no-api)  RUN_API=0 ;;
    -h|--help)
      # Print the leading comment block (everything between the shebang and the
      # first line of real code) as the usage text.
      awk 'NR > 1 && /^#/ { sub(/^#+ ?/, ""); print; next } NR > 1 { exit }' \
        "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      printf 'unknown argument: %s (try --help)\n' "${arg}" >&2
      exit 2
      ;;
  esac
done

# ------------------------------------------------------------------ helpers --
if [[ -t 1 ]]; then
  C_INFO=$'\033[1;36m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_OFF=$'\033[0m'
else
  C_INFO=''; C_WARN=''; C_ERR=''; C_OFF=''
fi

info() { printf '%s[dev]%s %s\n' "${C_INFO}" "${C_OFF}" "$*"; }
warn() { printf '%s[dev]%s %s\n' "${C_WARN}" "${C_OFF}" "$*" >&2; }
die()  { printf '%s[dev]%s %s\n' "${C_ERR}"  "${C_OFF}" "$*" >&2; exit 1; }

port_busy() {
  # Returns 0 when something is already listening on $1.
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$1" 2>/dev/null | tail -n +2 | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

# --------------------------------------------------------------- preflight ---
if (( RUN_API )); then
  [[ -x "${VENV}/bin/python" ]] || die "no virtualenv at ${VENV} -- run 'make setup' first"
fi

if [[ ! -f "${ROOT}/.env" ]]; then
  warn ".env not found; copying .env.example (defaults work out of the box)"
  cp "${ROOT}/.env.example" "${ROOT}/.env"
fi

# Export the repo-root .env into the environment, exactly as docker-compose's
# `env_file:` does, so Django (started from backend/) and Vite (started from
# frontend/) both see it.  Anything the caller exported explicitly is restored
# afterwards, so `MATCH_ENGINE=claude scripts/dev.sh` still wins over the file.
declare -A PRESET_ENV=()
while IFS= read -r key; do
  if [[ -n "${!key+isset}" ]]; then
    PRESET_ENV["${key}"]="${!key}"
  fi
done < <(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=.*/\2/p' "${ROOT}/.env")

set -a
# shellcheck source=/dev/null  -- the path is computed, not a literal
. "${ROOT}/.env"
set +a

for key in "${!PRESET_ENV[@]}"; do
  export "${key}=${PRESET_ENV[${key}]}"
done
unset key PRESET_ENV

if (( RUN_WEB )) && [[ ! -d "${FRONTEND}/node_modules" ]]; then
  die "frontend dependencies are missing -- run 'make setup' (or 'npm install' in frontend/)"
fi

# ---------------------------------------------------------------- database ---
if [[ "${SKIP_DB:-0}" != "1" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker is required to start PostgreSQL (or set SKIP_DB=1)"
  info "starting PostgreSQL (container aimious-recruit-postgres, host port ${DB_PORT})"
  docker compose -f "${COMPOSE_FILE}" up -d postgres >/dev/null

  printf '%s[dev]%s waiting for PostgreSQL ' "${C_INFO}" "${C_OFF}"
  ready=0
  for _ in $(seq 1 60); do
    if docker compose -f "${COMPOSE_FILE}" exec -T postgres \
         pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
      ready=1
      break
    fi
    printf '.'
    sleep 1
  done
  printf '\n'
  (( ready )) || die "PostgreSQL did not become ready within 60s (docker compose logs postgres)"
fi

# -------------------------------------------------------------- migrations ---
if (( RUN_API )) && [[ "${SKIP_MIGRATIONS:-0}" != "1" ]]; then
  info "applying migrations (manage.py migrate)"
  (cd "${BACKEND}" && "${VENV}/bin/python" manage.py migrate --noinput)
fi

# ------------------------------------------------------------------- start ---
PIDS=()

cleanup() {
  trap - INT TERM EXIT
  info "shutting down"
  for pid in "${PIDS[@]:-}"; do
    [[ -n "${pid}" ]] || continue
    # Kill the whole process group: Django's autoreloader and Vite both fork.
    kill -TERM -- "-${pid}" 2>/dev/null || kill -TERM "${pid}" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  info "PostgreSQL is still running -- 'make db-down' stops it"
}
trap cleanup INT TERM EXIT

if (( RUN_API )); then
  if port_busy "${API_PORT}"; then
    die "port ${API_PORT} is already in use -- stop the other process or set API_PORT=..."
  fi
  info "API      http://localhost:${API_PORT}/api/v1/      (docs: /api/docs/)"
  (
    cd "${BACKEND}"
    exec setsid "${VENV}/bin/python" manage.py runserver "${API_HOST}:${API_PORT}"
  ) &
  PIDS+=("$!")
fi

if (( RUN_WEB )); then
  if port_busy "${WEB_PORT}"; then
    die "port ${WEB_PORT} is already in use -- stop the other process or set WEB_PORT=..."
  fi
  info "Frontend http://localhost:${WEB_PORT}"
  (
    cd "${FRONTEND}"
    exec setsid npm run dev -- --port "${WEB_PORT}" --strictPort
  ) &
  PIDS+=("$!")
fi

(( ${#PIDS[@]} )) || die "nothing to run (--no-api and --no-web were both given)"

info "press Ctrl-C to stop"
# Exit as soon as ANY child dies, so a crashed backend does not look healthy.
wait -n "${PIDS[@]}"
status=$?
warn "a process exited (status ${status})"
exit "${status}"
