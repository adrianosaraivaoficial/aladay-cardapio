import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transaction } from './database';

export const FEATURES = ['menu_import', 'analytics', 'upsell', 'feedback'] as const;
export type Feature = typeof FEATURES[number];
export async function requireFeature(client: Pick<PoolClient, 'query'>, slug: string, feature: Feature) {
  const result = await client.query('SELECT released,enabled FROM intelligence_features WHERE tenant_slug=$1 AND feature=$2', [slug, feature]);
  if (!result.rows[0]?.released || !result.rows[0]?.enabled) throw new HttpError(403, 'Recurso não liberado ou desativado.');
}
export const requireIntelligenceOwner: RequestHandler = (req, _res, next) => {
  const user = (req as any).user;
  if (!user || !['SUPER_ADMIN', 'TENANT_OWNER'].includes(user.role)) return next(new HttpError(403, 'Recurso reservado ao proprietário.'));
  next();
};

// Call inside a transaction. Settings row serializes concurrent monthly reservations.
// Reserve an upper bound before sending anything to a provider; ambiguous failures keep it reserved.
export async function reserveAiBudget(client: PoolClient, slug: string, feature: Feature, requestId: string, upperBoundCents: number) {
  if (!requestId || requestId.length > 100 || !Number.isSafeInteger(upperBoundCents) || upperBoundCents < 1) throw new HttpError(400, 'Reserva inválida.');
  await requireFeature(client, slug, feature);
  const settings = await client.query('SELECT monthly_budget_cents FROM intelligence_settings WHERE tenant_slug=$1 FOR UPDATE', [slug]);
  if (!settings.rows[0]) throw new HttpError(402, 'Orçamento de IA indisponível.');
  const existing = await client.query('SELECT * FROM intelligence_reservations WHERE tenant_slug=$1 AND request_id=$2', [slug, requestId]);
  if (existing.rows[0]) {
    if (existing.rows[0].feature !== feature || existing.rows[0].reserved_cents !== upperBoundCents) throw new HttpError(409, 'Chave de reserva reutilizada com outros dados.');
    return { reservation: existing.rows[0], reused: true };
  }
  const month = new Date().toISOString().slice(0, 7) + '-01';
  await client.query('INSERT INTO intelligence_usage(tenant_slug,month) VALUES($1,$2) ON CONFLICT DO NOTHING', [slug, month]);
  const usage = await client.query(`UPDATE intelligence_usage SET reserved_cents=reserved_cents+$3 WHERE tenant_slug=$1 AND month=$2 AND reserved_cents+$3<=$4 RETURNING *`, [slug, month, upperBoundCents, settings.rows[0].monthly_budget_cents]);
  if (!usage.rows.length) throw new HttpError(402, 'Orçamento mensal de IA esgotado.');
  const reservation = await client.query('INSERT INTO intelligence_reservations(tenant_slug,request_id,feature,month,reserved_cents) VALUES($1,$2,$3,$4,$5) RETURNING *', [slug, requestId, feature, month, upperBoundCents]);
  return { reservation: reservation.rows[0], reused: false };
}
export async function settleAiBudget(client: PoolClient, slug: string, requestId: string, actualCents: number) {
  await client.query('SELECT 1 FROM intelligence_settings WHERE tenant_slug=$1 FOR UPDATE', [slug]);
  const result = await client.query('SELECT * FROM intelligence_reservations WHERE tenant_slug=$1 AND request_id=$2 FOR UPDATE', [slug, requestId]);
  const reservation = result.rows[0];
  if (!reservation || !Number.isSafeInteger(actualCents) || actualCents < 0 || actualCents > reservation.reserved_cents) throw new HttpError(400, 'Liquidação inválida.');
  if (reservation.actual_cents !== null) {
    if (reservation.actual_cents !== actualCents) throw new HttpError(409, 'Reserva já liquidada.');
    return;
  }
  await client.query('UPDATE intelligence_usage SET reserved_cents=reserved_cents-$3 WHERE tenant_slug=$1 AND month=$2', [slug, reservation.month, reservation.reserved_cents - actualCents]);
  await client.query('UPDATE intelligence_reservations SET actual_cents=$3 WHERE tenant_slug=$1 AND request_id=$2', [slug, requestId, actualCents]);
}
async function readSettings(pool: Pick<Pool, 'query'>, slug: string) {
  const settings = await pool.query('SELECT monthly_budget_cents FROM intelligence_settings WHERE tenant_slug=$1', [slug]);
  const rows = await pool.query('SELECT feature,released,enabled FROM intelligence_features WHERE tenant_slug=$1', [slug]);
  return { features: Object.fromEntries(FEATURES.map(feature => [feature, rows.rows.find(row => row.feature === feature) || { released: false, enabled: false }])), monthlyBudgetCents: settings.rows[0]?.monthly_budget_cents || 0 };
}
export function mountIntelligence(app: Express, pool: Pool, guard: RequestHandler) {
  const base = '/api/v1/tenants/:slug/intelligence';
  app.get(`${base}/availability`, async (req, res) => {
    const rows = await pool.query('SELECT feature FROM intelligence_features WHERE tenant_slug=$1 AND released AND enabled', [req.params.slug]);
    res.json(Object.fromEntries(['analytics', 'upsell', 'feedback'].map(feature => [feature, rows.rows.some(row => row.feature === feature)])));
  });
  app.get(base, guard, requireIntelligenceOwner, async (req, res) => res.json(await readSettings(pool, req.params.slug)));
  app.put(base, guard, requireIntelligenceOwner, async (req, res) => {
    if ((req as any).user.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Somente superadmin pode liberar recursos e orçamento.');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !['features', 'monthlyBudgetCents'].includes(key))) throw new HttpError(400, 'Configuração inválida.');
    const { features, monthlyBudgetCents } = req.body || {};
    if (monthlyBudgetCents !== undefined && (!Number.isSafeInteger(monthlyBudgetCents) || monthlyBudgetCents < 0 || monthlyBudgetCents > 100000000)) throw new HttpError(400, 'Orçamento inválido.');
    if (features !== undefined && (!features || typeof features !== 'object' || Array.isArray(features) || Object.keys(features).some(f => !FEATURES.includes(f as Feature)))) throw new HttpError(400, 'Features inválidas.');
    await transaction(pool, async client => {
      await client.query('INSERT INTO intelligence_settings(tenant_slug) VALUES($1) ON CONFLICT DO NOTHING', [req.params.slug]);
      await client.query('SELECT 1 FROM intelligence_settings WHERE tenant_slug=$1 FOR UPDATE', [req.params.slug]);
      if (monthlyBudgetCents !== undefined) await client.query('UPDATE intelligence_settings SET monthly_budget_cents=$2,updated_at=NOW() WHERE tenant_slug=$1', [req.params.slug, monthlyBudgetCents]);
      for (const [feature, value] of Object.entries(features || {})) {
        const flag = value as any;
        if (!flag || typeof flag.released !== 'boolean' || typeof flag.enabled !== 'boolean' || (flag.enabled && !flag.released)) throw new HttpError(400, 'Liberação inválida.');
        await client.query('INSERT INTO intelligence_features(tenant_slug,feature,released,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_slug,feature) DO UPDATE SET released=$3,enabled=$4,updated_at=NOW()', [req.params.slug, feature, flag.released, flag.enabled]);
      }
      await client.query('INSERT INTO intelligence_audit(tenant_slug,actor,action,details) VALUES($1,$2,$3,$4)', [req.params.slug, (req as any).user.sub, 'settings', JSON.stringify(req.body)]);
    });
    res.json(await readSettings(pool, req.params.slug));
  });
  app.patch(base, guard, requireIntelligenceOwner, async (req, res) => {
    if (!FEATURES.includes(req.body?.feature) || req.body?.enabled !== false) throw new HttpError(400, 'O proprietário pode apenas desativar um recurso.');
    await transaction(pool, async client => {
      await client.query('UPDATE intelligence_features SET enabled=false,updated_at=NOW() WHERE tenant_slug=$1 AND feature=$2', [req.params.slug, req.body.feature]);
      await client.query('INSERT INTO intelligence_audit(tenant_slug,actor,action,details) VALUES($1,$2,$3,$4)', [req.params.slug, (req as any).user.sub, 'disable', JSON.stringify({ feature: req.body.feature })]);
    });
    res.json(await readSettings(pool, req.params.slug));
  });
}
