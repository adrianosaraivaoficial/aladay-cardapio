CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID PRIMARY KEY,
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_slug,order_id), UNIQUE(tenant_slug,id),
  FOREIGN KEY(order_id,tenant_slug) REFERENCES orders(id,tenant_slug) ON DELETE CASCADE,
  CHECK(token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS feedback_requests_expiry ON feedback_requests(tenant_slug,expires_at);
CREATE TABLE IF NOT EXISTS customer_feedback (
  id UUID PRIMARY KEY,
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK(length(comment)<=2000),
  public_consent BOOLEAN NOT NULL DEFAULT false,
  moderation TEXT NOT NULL DEFAULT 'pending' CHECK(moderation IN ('pending','approved','rejected')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(tenant_slug,request_id), UNIQUE(tenant_slug,id),
  FOREIGN KEY(tenant_slug,request_id) REFERENCES feedback_requests(tenant_slug,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS customer_feedback_listing ON customer_feedback(tenant_slug,moderation,created_at);
CREATE TABLE IF NOT EXISTS feedback_moderation_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_slug TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  feedback_id UUID,
  action TEXT NOT NULL CHECK(action IN ('invited','reissued','submitted','approved','rejected','deleted')),
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY(tenant_slug,feedback_id) REFERENCES customer_feedback(tenant_slug,id) ON DELETE CASCADE
);
