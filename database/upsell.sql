CREATE TABLE IF NOT EXISTS upsell_rules (
  id uuid PRIMARY KEY,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  config jsonb NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upsell_rules_tenant_idx ON upsell_rules(tenant_slug,priority DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS upsell_requests (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  checkout_id uuid NOT NULL,
  cart_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,request_id)
);
CREATE TABLE IF NOT EXISTS upsell_offers (
  id uuid PRIMARY KEY,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  rule_id uuid NOT NULL REFERENCES upsell_rules(id),
  rule_version integer NOT NULL,
  session_id uuid NOT NULL,
  checkout_id uuid NOT NULL,
  product_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug,request_id,rule_id,product_id),
  FOREIGN KEY(tenant_slug,request_id) REFERENCES upsell_requests(tenant_slug,request_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS upsell_offers_repeat_idx ON upsell_offers(tenant_slug,session_id,rule_id);
CREATE INDEX IF NOT EXISTS upsell_requests_day_idx ON upsell_requests(tenant_slug,created_at);
CREATE TABLE IF NOT EXISTS upsell_events (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES upsell_offers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('impression','add_to_cart')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,event_id),
  UNIQUE(tenant_slug,offer_id,kind)
);
CREATE TABLE IF NOT EXISTS upsell_rule_audit (
  id bigserial PRIMARY KEY,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES upsell_rules(id),
  version integer NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS upsell_order_attributions (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES upsell_offers(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,offer_id,order_id),
  UNIQUE(tenant_slug,offer_id),
  FOREIGN KEY(order_id,tenant_slug) REFERENCES orders(id,tenant_slug) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS upsell_events_period_idx ON upsell_events(tenant_slug,created_at);
CREATE INDEX IF NOT EXISTS upsell_attribution_period_idx ON upsell_order_attributions(tenant_slug,created_at);
