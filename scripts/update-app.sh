#!/usr/bin/env bash
# Update only the application, keeping the existing database and account settings.
set -Eeuo pipefail
umask 077
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
no_build=0
if [[ "${1:-}" == "--no-build" ]]; then
  no_build=1
  shift
fi
# Remaining arguments are Docker Compose global options, e.g. --env-file /srv/.../.env.
compose=(docker compose -f "$project_dir/docker-compose.yml" "$@")
for executable in docker python3 gzip; do
  command -v "$executable" >/dev/null || { echo "Chybí příkaz: $executable" >&2; exit 1; }
done
previous_container=$("${compose[@]}" ps -q app)
if [[ -z "$previous_container" ]]; then
  echo 'Aplikace musí být spuštěná. První instalaci proveďte přes docker compose up -d --build.' >&2
  exit 1
fi
previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
backup_root=${CATALOGUE_BACKUP_DIR:-"$project_dir/catalogue-data/backups"}
mkdir -p "$backup_root"
backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
printf '%s\n' "$previous_image" > "$backup_dir/previous-image.txt"
rollback_file=$(mktemp /tmp/catalogue-rollback-XXXXXX.yml)
printf 'services:\n  app:\n    image: "%s"\n    pull_policy: never\n' "$previous_image" > "$rollback_file"
app_stopped=0
replacement_attempted=0
finish() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    echo "Aktualizace selhala. Složka zálohy: $backup_dir" >&2
    if (( replacement_attempted )); then
      echo 'Obnovuji předchozí image aplikace; databáze zůstává na místě.' >&2
      "${compose[@]}" -f "$rollback_file" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 app || echo 'Automatický návrat selhal. Zkontrolujte docker compose logs app.' >&2
    elif (( app_stopped )); then
      "${compose[@]}" start app || echo 'Původní aplikaci se nepodařilo spustit.' >&2
    fi
  fi
  rm -f -- "$rollback_file" "$backup_dir/database.archive.gz.partial"
  exit "$result"
}
trap finish EXIT
# Build while the existing application is serving requests. A failed build leaves it running.
if (( ! no_build )); then
  "${compose[@]}" build app
fi
# Freeze application writes while taking a complete backup (includes admin accounts).
"${compose[@]}" stop app
app_stopped=1
"${compose[@]}" exec -T mongo mongodump --archive --gzip > "$backup_dir/database.archive.gz.partial"
gzip -t "$backup_dir/database.archive.gz.partial"
mv -- "$backup_dir/database.archive.gz.partial" "$backup_dir/database.archive.gz"
replacement_attempted=1
"${compose[@]}" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 app
printf 'Aplikace aktualizována. Úplná záloha databáze: %s/database.archive.gz\n' "$backup_dir"
printf 'Databázový kontejner, weby, účty a nastavení zůstaly zachované. Uchovejte také původní .env.\n'
