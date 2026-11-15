-- Additive and repeatable. No tenant is released automatically.
CREATE TABLE IF NOT EXISTS intelligence_settings (
 tenant_slug VARCHAR(100) PRIMARY KEY REFERENCES tenants(slug) ON DELETE CASCADE,
 monthly_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_budget_cents BETWEEN 0 AND 100000000),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS intelligence_features (
 tenant_slug VARCHAR(100) NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
 feature TEXT NOT NULL CHECK(feature IN ('menu_import','analytics','upsell','feedback')),
 released BOOLEAN NOT NULL DEFAULT false,
 enabled BOOLEAN NOT NULL DEFAULT false,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_slug,feature), CHECK(NOT enabled OR released)
);
CREATE TABLE IF NOT EXISTS intelligence_usage (
 tenant_slug VARCHAR(100) NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
 month DATE NOT NULL,
 reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK(reserved_cents>=0),
 PRIMARY KEY(tenant_slug,month)
);
CREATE TABLE IF NOT EXISTS intelligence_reservations (
 tenant_slug VARCHAR(100) NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
 request_id TEXT NOT NULL, feature TEXT NOT NULL, month DATE NOT NULL,
 reserved_cents INTEGER NOT NULL CHECK(reserved_cents>=0),
 actual_cents INTEGER CHECK(actual_cents>=0 AND actual_cents<=reserved_cents),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_slug,request_id)
);
CREATE TABLE IF NOT EXISTS intelligence_audit (
 id BIGSERIAL PRIMARY KEY, tenant_slug VARCHAR(100) NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
 actor TEXT NOT NULL, action TEXT NOT NULL, details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
