CREATE TABLE IF NOT EXISTS crm_customers (
  id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  phone TEXT NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes)<=4000),
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_slug,id), UNIQUE(tenant_slug,phone)
);
CREATE TABLE IF NOT EXISTS crm_migration_previews (
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  preview_hash TEXT NOT NULL,
  actor TEXT NOT NULL,
  source_tenant_slug TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 90),
  payload JSONB NOT NULL,
  baseline_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 minutes',
  PRIMARY KEY(tenant_slug,preview_hash)
);
CREATE TABLE IF NOT EXISTS crm_migrations (
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  preview_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  source_tenant_slug TEXT NOT NULL,
  result JSONB NOT NULL,
  recovery_snapshot JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_slug,preview_hash), UNIQUE(tenant_slug,version)
);
CREATE TABLE IF NOT EXISTS tenant_table_states (
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  table_number INTEGER NOT NULL CHECK(table_number BETWEEN 1 AND 1000),
  bill_requested BOOLEAN NOT NULL DEFAULT false,
  served_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_slug,table_number)
);
