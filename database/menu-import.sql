CREATE TABLE IF NOT EXISTS menu_import_jobs (
  id text PRIMARY KEY,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  version integer NOT NULL DEFAULT 1,
  filename text,
  mime_type text,
  candidates jsonb NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(tenant_slug,checksum)
);
CREATE TABLE IF NOT EXISTS menu_import_audit (
  id bigserial PRIMARY KEY,
  job_id text NOT NULL REFERENCES menu_import_jobs(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL CHECK(action IN ('created','reviewed','published')),
  version integer NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_import_audit_tenant_idx ON menu_import_audit(tenant_slug,created_at);
