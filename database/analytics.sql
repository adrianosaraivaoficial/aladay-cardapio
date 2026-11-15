CREATE TABLE IF NOT EXISTS analytics_events (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('menu_view','product_view','product_click','checkout_start')),
  product_id text,
  category_id text,
  session_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN ('web','whatsapp','qr','unknown')),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,event_id)
);
CREATE INDEX IF NOT EXISTS analytics_events_period_idx ON analytics_events(tenant_slug,received_at);
CREATE INDEX IF NOT EXISTS analytics_orders_period_idx ON orders(tenant_slug,created_at);
CREATE INDEX IF NOT EXISTS analytics_pix_settlement_idx ON pix_transactions(tenant_slug,paid_at) WHERE status='PAID';
CREATE INDEX IF NOT EXISTS analytics_pix_period_idx ON pix_transactions(tenant_slug,paid_at);
CREATE TABLE IF NOT EXISTS analytics_rebuilds (
  id uuid PRIMARY KEY,
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  timezone text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  version integer NOT NULL,
  actor text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK(status='completed'),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_rebuilds_scope_idx ON analytics_rebuilds(tenant_slug,timezone,computed_at);
CREATE TABLE IF NOT EXISTS analytics_daily (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  timezone text NOT NULL,
  day date NOT NULL,
  channel text NOT NULL,
  orders_count bigint NOT NULL DEFAULT 0,
  cancelled_orders_count bigint NOT NULL DEFAULT 0,
  total_order_value_cents bigint NOT NULL DEFAULT 0,
  paid_orders_count bigint NOT NULL DEFAULT 0,
  confirmed_revenue_cents bigint NOT NULL DEFAULT 0,
  menu_views bigint NOT NULL DEFAULT 0,
  product_views bigint NOT NULL DEFAULT 0,
  product_clicks bigint NOT NULL DEFAULT 0,
  checkout_starts bigint NOT NULL DEFAULT 0,
  version integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,timezone,day,channel)
);
CREATE TABLE IF NOT EXISTS analytics_product_daily (
  tenant_slug text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  timezone text NOT NULL,
  day date NOT NULL,
  channel text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  category_id text,
  units_ordered bigint NOT NULL DEFAULT 0,
  units_confirmed bigint NOT NULL DEFAULT 0,
  confirmed_item_value_cents bigint NOT NULL DEFAULT 0,
  views bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  version integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_slug,timezone,day,channel,product_id)
);
