#!/usr/bin/env bash
set -euo pipefail

# Isolated local run: no existing database, .env file or external API credentials are used.
command -v docker >/dev/null || { echo 'Docker é necessário para o banco descartável.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'OpenSSL é necessário para gerar credenciais temporárias.' >&2; exit 1; }
if [[ -e .env ]]; then echo 'Remova ou isole o .env antes de executar esta tarefa local; ele pode carregar integrações externas.' >&2; exit 1; fi

db_container="aladay-local-v2-$$"
db_password="$(openssl rand -hex 24)"
jwt_secret="$(openssl rand -hex 32)"
admin_password="$(openssl rand -hex 20)"
db_url="postgresql://aladay_local:${db_password}@127.0.0.1:55433/aladay_local"

docker run --rm -d --name "$db_container" \
  -p 127.0.0.1:55433:5432 \
  -e POSTGRES_USER=aladay_local \
  -e POSTGRES_DB=aladay_local \
  -e POSTGRES_PASSWORD="$db_password" \
  postgres:17-alpine >/dev/null

cleanup() { docker stop "$db_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

ready=false
for _attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -U aladay_local -d aladay_local >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'PostgreSQL local não ficou pronto.' >&2; exit 1; fi

env -i PATH="$PATH" MIGRATION_DATABASE_URL="$db_url" \
  node scripts/migrate.mjs --apply --confirm-database=aladay_local

echo 'Aladay local: http://127.0.0.1:32200'
env -i PATH="$PATH" \
  DATABASE_URL="$db_url" JWT_SECRET="$jwt_secret" ADMIN_PASSWORD="$admin_password" \
  ADMIN_EMAIL=admin@localhost.invalid APP_URL=http://127.0.0.1:32200 PORT=32200 \
  NODE_ENV=development DEPLOY_ENV=local PGSSLMODE=disable \
  OUTBOX_WORKER_ENABLED=false ASAAS_ENVIRONMENT=sandbox SEO_NOINDEX=true \
  npm run dev
