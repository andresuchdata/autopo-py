#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_BIN="${COMPOSE_BIN:-docker compose}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "docker-compose file '$COMPOSE_FILE' not found in $PROJECT_ROOT" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
else
  echo "warning: .env file '$ENV_FILE' not found - relying on current shell env" >&2
fi

compose_args=()
if [ -f "$ENV_FILE" ]; then
  compose_args+=(--env-file "$ENV_FILE")
fi
compose_args+=(-f "$COMPOSE_FILE")

docker_compose() {
  "$COMPOSE_BIN" "${compose_args[@]}" "$@"
}

build_db_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "$DATABASE_URL"
  else
    printf 'postgres://%s:%s@%s:%s/%s?sslmode=%s' \
      "${DB_USER:-postgres}" \
      "${DB_PASSWORD:-postgres}" \
      "${DB_HOST:-localhost}" \
      "${DB_PORT:-5432}" \
      "${DB_NAME:-autopo}" \
      "${DB_SSLMODE:-disable}"
  fi
}

require_env() {
  local var_name="$1"
  if [ -z "${!var_name:-}" ]; then
    echo "error: required env var '$var_name' is not set (check $ENV_FILE)" >&2
    exit 1
  fi
}

run_stock_pipeline() {
  local snapshot="${1:-${STOCK_HEALTH_SNAPSHOT_DATE:-}}"
  local env_flags=()
  if [ -n "$snapshot" ]; then
    env_flags+=(-e "STOCK_HEALTH_SNAPSHOT_DATE=$snapshot")
  fi

  docker_compose run --rm "${env_flags[@]}" stock-pipeline
}

run_po_pipeline() {
  require_env PO_SNAPSHOT_DRIVE_FOLDER_ID
  require_env GOOGLE_DRIVE_CREDENTIALS_JSON

  local snapshot="${1:-${PO_SNAPSHOT_SNAPSHOT_DATE:-}}"
  local env_flags=(
    -e "PO_SNAPSHOT_DRIVE_FOLDER_ID=$PO_SNAPSHOT_DRIVE_FOLDER_ID"
    -e "GOOGLE_DRIVE_CREDENTIALS_JSON=$GOOGLE_DRIVE_CREDENTIALS_JSON"
  )
  if [ -n "$snapshot" ]; then
    env_flags+=(-e "PO_SNAPSHOT_SNAPSHOT_DATE=$snapshot")
  fi

  local db_url
  db_url="$(build_db_url)"

  docker_compose run --rm "${env_flags[@]}" seeder \
    /app/bin/seed pipeline-po-snapshots \
    --db-url "$db_url"
}

prepare_master_subset() {
  local files_arg="$1"
  local source_dir="$PROJECT_ROOT/data/seeds/master_data"
  local subset_host_dir="$PROJECT_ROOT/data/seeds/.master_subset"

  rm -rf "$subset_host_dir"
  mkdir -p "$subset_host_dir"

  local normalized="${files_arg//,/ }"
  local -a file_list=()
  for token in $normalized; do
    local file="${token##*/}"
    if [ -z "$file" ]; then
      continue
    fi
    file_list+=("$file")
  done

  if [ "${#file_list[@]}" -eq 0 ]; then
    echo "error: --files provided but no valid filenames parsed" >&2
    exit 1
  fi

  for file in "${file_list[@]}"; do
    if [ ! -f "$source_dir/$file" ]; then
      echo "error: master seed file '$file' not found under $source_dir" >&2
      exit 1
    fi
    cp "$source_dir/$file" "$subset_host_dir/"
  done

  printf '%s' "/app/data/seeds/.master_subset"
}

run_master_seed() {
  local include_mappings=false
  local reset_master=false
  local files_arg=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --include-mappings)
        include_mappings=true
        shift
        ;;
      --reset-master)
        reset_master=true
        shift
        ;;
      --files)
        files_arg="$2"
        shift 2
        ;;
      --files=*)
        files_arg="${1#*=}"
        shift
        ;;
      *)
        echo "Unknown master option: $1" >&2
        exit 1
        ;;
    esac
  done

  local data_dir="/app/data/seeds/master_data"
  if [ -n "$files_arg" ]; then
    data_dir="$(prepare_master_subset "$files_arg")"
  fi

  local db_url
  db_url="$(build_db_url)"

  local cmd=(/app/bin/seed master --db-url "$db_url" --data-dir "$data_dir")
  if $include_mappings; then
    cmd+=(--include-mappings)
  fi
  if $reset_master; then
    cmd+=(--reset-master)
  fi

  docker_compose run --rm seeder "${cmd[@]}"

  if [ -n "${files_arg:-}" ]; then
    rm -rf "$PROJECT_ROOT/data/seeds/.master_subset"
  fi
}

show_help() {
  cat <<'EOF'
Usage:
  scripts/run-docker-seeds.sh stock-health [YYYYMMDD]
  scripts/run-docker-seeds.sh po [YYYYMMDD]
  scripts/run-docker-seeds.sh master [--files list] [--include-mappings] [--reset-master]

Commands:
  stock-health        Runs docker compose stock-pipeline service. Optional snapshot date overrides STOCK_HEALTH_SNAPSHOT_DATE.
  po                  Runs PO snapshot pipeline through the seeder service. Optional snapshot date overrides PO_SNAPSHOT_SNAPSHOT_DATE.
  master              Seeds master data. Use --files "suppliers.csv,supplier_brand_mappings.csv" to target specific CSVs.
                      --include-mappings toggles supplier/product mappings, --reset-master truncates tables first.

Environment:
  Reads docker-compose variables from .env by default. Override via ENV_FILE, COMPOSE_FILE, COMPOSE_BIN if needed.
EOF
}

command="${1:-}"
if [ -z "$command" ]; then
  show_help
  exit 1
fi
shift

case "$command" in
  stock-health)
    run_stock_pipeline "${1:-}"
    ;;
  po)
    run_po_pipeline "${1:-}"
    ;;
  master)
    run_master_seed "$@"
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "Unknown command: $command" >&2
    show_help
    exit 1
    ;;
esac
