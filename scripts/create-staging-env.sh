#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
command -v openssl >/dev/null || { echo 'OpenSSL é necessário.' >&2; exit 1; }
if [[ -e .env.staging ]]; then
  echo '.env.staging já existe; nenhuma credencial foi alterada.' >&2
  exit 1
fi

umask 077
postgres_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 32)"
admin_password="$(openssl rand -hex 24)"
pix_webhook_secret="$(openssl rand -hex 32)"
cat > .env.staging <<EOF
# Credenciais exclusivas de staging. Arquivo local ignorado pelo Git.
APP_URL=http://127.0.0.1:3001
PGSSLMODE=disable
POSTGRES_PASSWORD=${postgres_password}
JWT_SECRET=${jwt_secret}
ADMIN_EMAIL=admin@staging.invalid
ADMIN_PASSWORD=${admin_password}
PIX_WEBHOOK_SECRET=${pix_webhook_secret}
TRUST_PROXY_HOPS=0
OUTBOX_WORKER_ENABLED=false
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_DEFAULT_INSTANCE=
N8N_WEBHOOK_URL=
N8N_WORKER_TOKEN=
IFOOD_CLIENT_ID=
IFOOD_CLIENT_SECRET=
GEMINI_API_KEY=
DEPLOY_ENV=staging
SEO_NOINDEX=true
EOF
echo 'Credenciais de staging criadas em .env.staging (modo 600).'
